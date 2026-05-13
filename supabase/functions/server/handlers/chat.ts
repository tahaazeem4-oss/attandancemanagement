// handlers/chat.ts — parent ↔ teacher/admin messaging
import { json, getDb, verifyToken, sendPush } from "../_shared.ts";

// ─────────────────────────────────────────────────────────────
//  Push helper: tokens for a single user by role + id
// ─────────────────────────────────────────────────────────────
async function tokensForUser(
  db: ReturnType<typeof getDb>,
  role: string,
  userId: number,
): Promise<string[]> {
  const { data } = await db
    .from("push_tokens")
    .select("token")
    .eq("user_role", role)
    .eq("user_id", userId);
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
//  Conversation list enricher — adds participant name + unread
// ─────────────────────────────────────────────────────────────
async function enrichConversations(
  db: ReturnType<typeof getDb>,
  convs: Record<string, unknown>[],
  viewerRole: string,
  viewerId: number,
) {
  if (!convs.length) return [];

  // Collect participant ids by type so we can batch-fetch names
  const teacherIds = convs
    .filter((c) => c.participant_type === "teacher")
    .map((c) => c.participant_id as number);
  const adminIds = convs
    .filter((c) => c.participant_type === "admin")
    .map((c) => c.participant_id as number);
  const parentIds = convs.map((c) => c.parent_id as number);

  const [teacherRows, adminRows, parentRows] = await Promise.all([
    teacherIds.length
      ? db.from("teachers").select("id, first_name, last_name").in("id", teacherIds)
      : { data: [] },
    adminIds.length
      ? db.from("admins").select("id, first_name, last_name").in("id", adminIds)
      : { data: [] },
    parentIds.length
      ? db.from("parents").select("id, first_name, last_name").in("id", parentIds)
      : { data: [] },
  ]);

  const teacherMap: Record<number, string> = {};
  for (const t of (teacherRows.data || []) as { id: number; first_name: string; last_name: string }[])
    teacherMap[t.id] = `${t.first_name} ${t.last_name}`;
  const adminMap: Record<number, string> = {};
  for (const a of (adminRows.data || []) as { id: number; first_name: string; last_name: string }[])
    adminMap[a.id] = `${a.first_name} ${a.last_name}`;
  const parentMap: Record<number, string> = {};
  for (const p of (parentRows.data || []) as { id: number; first_name: string; last_name: string }[])
    parentMap[p.id] = `${p.first_name} ${p.last_name}`;

  // Fetch unread counts for the viewer
  const convIds = convs.map((c) => c.id as number);
  const { data: allMessages } = await db
    .from("chat_messages")
    .select("id, conversation_id, sender_id, sender_type, deleted_at")
    .in("conversation_id", convIds)
    .is("deleted_at", null);

  // Messages NOT sent by viewer
  const foreignMsgIds = (allMessages || [])
    .filter((m: Record<string, unknown>) => !(m.sender_type === viewerRole && m.sender_id === viewerId))
    .map((m: Record<string, unknown>) => m.id as number);

  const { data: readRows } = foreignMsgIds.length
    ? await db
        .from("chat_message_reads")
        .select("message_id")
        .eq("reader_type", viewerRole)
        .eq("reader_id", viewerId)
        .in("message_id", foreignMsgIds)
    : { data: [] };

  const readSet = new Set(
    (readRows || []).map((r: { message_id: number }) => r.message_id),
  );

  // Build unread count per conversation
  const msgsByConv: Record<number, number[]> = {};
  for (const m of allMessages || []) {
    const mm = m as Record<string, unknown>;
    if (mm.sender_type === viewerRole && (mm.sender_id as number) === viewerId) continue;
    const cid = mm.conversation_id as number;
    if (!msgsByConv[cid]) msgsByConv[cid] = [];
    if (!readSet.has(mm.id as number)) msgsByConv[cid].push(mm.id as number);
  }

  return convs.map((c) => {
    const isParentViewer = viewerRole === "parent";
    let participantName = "";
    let participantRole = "";

    if (isParentViewer) {
      // Viewer is parent — show teacher/admin name
      const pid = c.participant_id as number;
      const ptype = c.participant_type as string;
      participantName = ptype === "teacher" ? (teacherMap[pid] || "Teacher") : (adminMap[pid] || "Admin");
      participantRole = ptype;
    } else {
      // Viewer is teacher/admin — show parent name
      participantName = parentMap[c.parent_id as number] || "Parent";
      participantRole = "parent";
    }

    return {
      ...c,
      participant_name: participantName,
      participant_role: participantRole,
      unread_count: msgsByConv[c.id as number]?.length || 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────
//  Main handler
// ─────────────────────────────────────────────────────────────
export async function handleChat(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;
  const db = getDb();

  let user: Record<string, unknown>;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }

  const role = user.role as string;
  const userId = user.id as number;
  const schoolId = user.school_id as number;
  const userEmail = String(user.email || "").trim().toLowerCase();
  const userPhone = String(user.phone || "").trim();
  const userFirst = String(user.first_name || "").trim();
  const userLast = String(user.last_name || "").trim();

  const resolveParentIdsByEmail = async (): Promise<number[]> => {
    if (role !== "parent") return [userId];
    const ids = new Set<number>([userId]);
    if (!userEmail) return [...ids];

    const { data: sameEmailParents } = await db
      .from("parents")
      .select("id")
      .ilike("email", userEmail);

    for (const row of (sameEmailParents || []) as { id: number }[]) {
      if (Number.isFinite(row.id)) ids.add(row.id);
    }

    // Fallback cluster by phone or name (helps after migration-created duplicates).
    if (userPhone) {
      const { data: samePhoneParents } = await db
        .from("parents")
        .select("id")
        .eq("phone", userPhone);
      for (const row of (samePhoneParents || []) as { id: number }[]) {
        if (Number.isFinite(row.id)) ids.add(row.id);
      }
    }

    if (userFirst && userLast) {
      let nameQuery = db
        .from("parents")
        .select("id")
        .ilike("first_name", userFirst)
        .ilike("last_name", userLast);
      if (Number.isFinite(schoolId)) {
        nameQuery = nameQuery.eq("school_id", schoolId);
      }
      const { data: sameNameParents } = await nameQuery;
      for (const row of (sameNameParents || []) as { id: number }[]) {
        if (Number.isFinite(row.id)) ids.add(row.id);
      }
    }

    // Also include parent rows attached to the same students.
    // This handles data states where duplicate parent records exist for one family.
    const seedIds = [...ids];
    const { data: myLinks } = await db
      .from("parent_student")
      .select("student_id")
      .in("parent_id", seedIds);

    const studentIds = [
      ...new Set(
        (myLinks || [])
          .map((r: { student_id: number }) => Number(r.student_id))
          .filter((id) => Number.isFinite(id)),
      ),
    ];

    if (studentIds.length) {
      const { data: relatedLinks } = await db
        .from("parent_student")
        .select("parent_id")
        .in("student_id", studentIds);

      for (const row of (relatedLinks || []) as { parent_id: number }[]) {
        if (Number.isFinite(row.parent_id)) ids.add(row.parent_id);
      }
    }

    return [...ids];
  };

  const resolveParentSchoolIds = async (parentIds: number[]): Promise<number[]> => {
    if (role !== "parent") {
      return Number.isFinite(schoolId) ? [schoolId] : [];
    }

    const ids = [...new Set(parentIds.filter((id) => Number.isFinite(id)))];
    const schoolIds = new Set<number>();

    if (Number.isFinite(schoolId)) schoolIds.add(schoolId);

    if (!ids.length) return [...schoolIds];

    const [{ data: parentRows }, { data: accessRows }, { data: linkRows }] = await Promise.all([
      db.from("parents").select("school_id").in("id", ids),
      db.from("parent_school_access").select("school_id").in("parent_id", ids),
      db
        .from("parent_student")
        .select("students(school_id)")
        .in("parent_id", ids),
    ]);

    for (const row of (parentRows || []) as { school_id: number | null }[]) {
      const sid = Number(row.school_id);
      if (Number.isFinite(sid)) schoolIds.add(sid);
    }

    for (const row of (accessRows || []) as { school_id: number | null }[]) {
      const sid = Number(row.school_id);
      if (Number.isFinite(sid)) schoolIds.add(sid);
    }

    for (const row of (linkRows || []) as { students: { school_id: number | null } | null }[]) {
      const sid = Number(row.students?.school_id);
      if (Number.isFinite(sid)) schoolIds.add(sid);
    }

    return [...schoolIds];
  };

  if (!["parent", "teacher", "admin"].includes(role)) {
    return json({ message: "Forbidden" }, 403);
  }

  // ── GET /chat/conversations ───────────────────────────────────
  if (path === "/chat/conversations" && method === "GET") {
    try {
      let query;
      if (role === "parent") {
        const parentIds = await resolveParentIdsByEmail();
        // Parent inbox should not depend on JWT school_id, which can be stale/incomplete.
        query = db
          .from("chat_conversations")
          .select("*")
          .in("parent_id", parentIds)
          .order("last_message_at", { ascending: false });
      } else {
        query = db
          .from("chat_conversations")
          .select("*")
          .eq("school_id", schoolId)
          .eq("participant_id", userId)
          .eq("participant_type", role)
          .order("last_message_at", { ascending: false });
      }

      const { data: convs, error } = await query;
      if (error) throw error;

      const enriched = await enrichConversations(db, convs || [], role, userId);
      return json(enriched);
    } catch (err) {
      console.error("[chat/conversations GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /chat/conversations — create or get existing ──────────
  if (path === "/chat/conversations" && method === "POST") {
    try {
      const body = await req.json();

      let parentId: number;
      let participantId: number;
      let participantType: string;
      let conversationSchoolId: number;
      let parentIdsForUser: number[] = [userId];

      if (role === "parent") {
        // Parent initiates: provide participant_id + participant_type
        const { participant_id, participant_type } = body;
        if (!participant_id || !["teacher", "admin"].includes(participant_type)) {
          return json({ message: "participant_id and participant_type (teacher|admin) are required" }, 400);
        }
        const parentIds = await resolveParentIdsByEmail();
        parentIdsForUser = parentIds.length ? parentIds : [userId];
        const allowedSchoolIds = await resolveParentSchoolIds(parentIdsForUser);

        // Verify participant belongs to one of the parent's schools.
        const table = participant_type === "teacher" ? "teachers" : "admins";
        let participantQuery = db
          .from(table)
          .select("id, school_id")
          .eq("id", participant_id);

        if (allowedSchoolIds.length) {
          participantQuery = participantQuery.in("school_id", allowedSchoolIds);
        } else if (Number.isFinite(schoolId)) {
          participantQuery = participantQuery.eq("school_id", schoolId);
        }

        const { data: participant } = await participantQuery.single();
        if (!participant) return json({ message: "Participant not found in this school" }, 404);

        parentId = parentIdsForUser.includes(userId) ? userId : parentIdsForUser[0];
        participantId = participant_id;
        participantType = participant_type;
        conversationSchoolId = Number(participant.school_id);
      } else {
        // Teacher/admin initiates: provide parent_id or student_id.
        const { parent_id, student_id } = body;
        if (!parent_id && !student_id) {
          return json({ message: "parent_id or student_id is required" }, 400);
        }

        let resolvedParentId: number | null = null;

        // If student_id is provided, resolve an eligible parent for that student in this school.
        if (student_id) {
          const { data: student } = await db
            .from("students")
            .select("id")
            .eq("id", student_id)
            .eq("school_id", schoolId)
            .single();

          if (!student) {
            return json({ message: "Student not found in this school" }, 404);
          }

          const { data: parentLinks, error: linkError } = await db
            .from("parent_student")
            .select("parent_id")
            .eq("student_id", student_id);

          if (linkError) throw linkError;

          const linkedParentIds = [...new Set((parentLinks || [])
            .map((r: any) => Number(r.parent_id))
            .filter((id: number) => Number.isFinite(id)))];

          if (!linkedParentIds.length) {
            return json({ message: "No parent account found for this student" }, 404);
          }

          const [{ data: parentsRows }, { data: accessRows }] = await Promise.all([
            db
              .from("parents")
              .select("id, school_id")
              .in("id", linkedParentIds),
            db
              .from("parent_school_access")
              .select("parent_id")
              .eq("school_id", schoolId)
              .in("parent_id", linkedParentIds),
          ]);

          const accessSet = new Set((accessRows || []).map((r: any) => Number(r.parent_id)));
          const eligible = (parentsRows || []).find((p: any) =>
            Number(p.school_id) === Number(schoolId) || accessSet.has(Number(p.id)),
          );

          if (!eligible) {
            return json({ message: "Parent not found in this school" }, 404);
          }

          resolvedParentId = Number(eligible.id);
        }

        // If parent_id is provided, validate it through multiple school-access paths.
        if (!resolvedParentId && parent_id) {
          const { data: parent } = await db
            .from("parents")
            .select("id, school_id")
            .eq("id", parent_id)
            .single();

          if (!parent) return json({ message: "Parent not found" }, 404);

          let allowed = Number((parent as any).school_id) === Number(schoolId);

          if (!allowed) {
            const { data: accessRow } = await db
              .from("parent_school_access")
              .select("parent_id")
              .eq("parent_id", parent_id)
              .eq("school_id", schoolId)
              .maybeSingle();
            allowed = !!accessRow;
          }

          // Fallback: if parent is linked to any student in this school, allow.
          if (!allowed) {
            const { data: links, error: pLinkError } = await db
              .from("parent_student")
              .select("student_id")
              .eq("parent_id", parent_id);

            if (pLinkError) throw pLinkError;

            const studentIds = (links || [])
              .map((r: any) => Number(r.student_id))
              .filter((id: number) => Number.isFinite(id));

            if (studentIds.length) {
              const { data: studentMatch } = await db
                .from("students")
                .select("id")
                .in("id", studentIds)
                .eq("school_id", schoolId)
                .limit(1);
              allowed = !!(studentMatch && studentMatch.length > 0);
            }
          }

          if (!allowed) return json({ message: "Parent not found in this school" }, 404);
          resolvedParentId = Number(parent_id);
        }

        if (!resolvedParentId) return json({ message: "Parent not found in this school" }, 404);

        parentId = resolvedParentId;
        participantId = userId;
        participantType = role;
        conversationSchoolId = schoolId;
      }

      // Return existing conversation if present
      let existingQuery = db
        .from("chat_conversations")
        .select("*")
        .eq("participant_id", participantId)
        .eq("participant_type", participantType);

      if (role === "parent") {
        existingQuery = existingQuery.in("parent_id", parentIdsForUser);
      } else {
        existingQuery = existingQuery.eq("parent_id", parentId);
      }

      const { data: existingRows } = await existingQuery
        .order("id", { ascending: true })
        .limit(1);

      const existing = (existingRows || [])[0];

      if (existing) return json(existing);

      const { data: conv, error } = await db
        .from("chat_conversations")
        .insert({
          school_id: conversationSchoolId,
          parent_id: parentId,
          participant_id: participantId,
          participant_type: participantType,
        })
        .select()
        .single();

      if (error) throw error;
      return json(conv, 201);
    } catch (err) {
      console.error("[chat/conversations POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /chat/conversations/:id/messages ─────────────────────
  const msgListMatch = path.match(/^\/chat\/conversations\/(\d+)\/messages$/);
  if (msgListMatch && method === "GET") {
    const convId = parseInt(msgListMatch[1]);
    try {
      const parentIds = role === "parent" ? await resolveParentIdsByEmail() : [userId];

      // Verify access
      const { data: conv } = await db
        .from("chat_conversations")
        .select("*")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && parentIds.includes(Number(conv.parent_id))) ||
        (role !== "parent" && conv.participant_id === userId && conv.participant_type === role);

      if (!hasAccess) return json({ message: "Forbidden" }, 403);

      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 50);
      const offset = (page - 1) * limit;

      const { data: msgs, error } = await db
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Fetch read receipts for messages visible to viewer
      const msgIds = (msgs || []).map((m: Record<string, unknown>) => m.id as number);
      const { data: reads } = msgIds.length
        ? await db
            .from("chat_message_reads")
            .select("message_id, reader_id, reader_type, read_at")
            .in("message_id", msgIds)
        : { data: [] };

      const readsByMsg: Record<number, { reader_id: number; reader_type: string; read_at: string }[]> = {};
      for (const r of reads || []) {
        const rr = r as { message_id: number; reader_id: number; reader_type: string; read_at: string };
        if (!readsByMsg[rr.message_id]) readsByMsg[rr.message_id] = [];
        readsByMsg[rr.message_id].push({ reader_id: rr.reader_id, reader_type: rr.reader_type, read_at: rr.read_at });
      }

      const result = (msgs || []).map((m: Record<string, unknown>) => ({
        ...m,
        reads: readsByMsg[m.id as number] || [],
      }));

      // Return oldest-first for rendering
      result.reverse();

      return json({ messages: result, conversation: conv });
    } catch (err) {
      console.error("[chat/conversations/:id/messages GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /chat/conversations/:id/messages ─────────────────────
  const sendMsgMatch = path.match(/^\/chat\/conversations\/(\d+)\/messages$/);
  if (sendMsgMatch && method === "POST") {
    const convId = parseInt(sendMsgMatch[1]);
    try {
      const parentIds = role === "parent" ? await resolveParentIdsByEmail() : [userId];

      const { content } = await req.json();
      if (!content?.trim()) return json({ message: "content is required" }, 400);

      const { data: conv } = await db
        .from("chat_conversations")
        .select("*")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && parentIds.includes(Number(conv.parent_id))) ||
        (role !== "parent" && conv.participant_id === userId && conv.participant_type === role);

      if (!hasAccess) return json({ message: "Forbidden" }, 403);

      const trimmed = content.trim().slice(0, 2000);

      const { data: msg, error } = await db
        .from("chat_messages")
        .insert({
          conversation_id: convId,
          sender_id: userId,
          sender_type: role,
          content: trimmed,
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation last_message
      await db
        .from("chat_conversations")
        .update({
          last_message_at: msg.created_at,
          last_message_text: trimmed.slice(0, 500),
        })
        .eq("id", convId);

      // Mark own message as read (sender always reads their own message)
      await db
        .from("chat_message_reads")
        .upsert(
          {
            message_id: msg.id,
            reader_id: userId,
            reader_type: role,
          },
          { onConflict: "message_id,reader_id,reader_type", ignoreDuplicates: true },
        );

      // Push notification to recipient (non-blocking)
      (async () => {
        try {
          // Get sender name
          const senderTable = role === "parent" ? "parents" : role === "teacher" ? "teachers" : "admins";
          const { data: sender } = await db.from(senderTable).select("first_name, last_name").eq("id", userId).single();
          const senderName = sender ? `${sender.first_name} ${sender.last_name}` : role;

          let recipientRole: string;
          let recipientId: number;

          if (role === "parent") {
            recipientRole = conv.participant_type as string;
            recipientId = conv.participant_id as number;
          } else {
            recipientRole = "parent";
            recipientId = conv.parent_id as number;
          }

          const tokens = await tokensForUser(db, recipientRole, recipientId);
          if (tokens.length) {
            await sendPush(
              tokens,
              `Message from ${senderName}`,
              trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed,
              { type: "chat", conversation_id: convId },
            );
          }
        } catch {
          // push failure is non-fatal
        }
      })();

      return json(msg, 201);
    } catch (err) {
      console.error("[chat/conversations/:id/messages POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /chat/conversations/:id/read ────────────────────────
  const readMatch = path.match(/^\/chat\/conversations\/(\d+)\/read$/);
  if (readMatch && method === "POST") {
    const convId = parseInt(readMatch[1]);
    try {
      const parentIds = role === "parent" ? await resolveParentIdsByEmail() : [userId];

      const { data: conv } = await db
        .from("chat_conversations")
        .select("*")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && parentIds.includes(Number(conv.parent_id))) ||
        (role !== "parent" && conv.participant_id === userId && conv.participant_type === role);

      if (!hasAccess) return json({ message: "Forbidden" }, 403);

      // Get all messages and filter out viewer's own messages safely in code.
      // We must compare sender_type + sender_id together because numeric ids can overlap across roles.
      const { data: msgs } = await db
        .from("chat_messages")
        .select("id, sender_id, sender_type")
        .eq("conversation_id", convId)
        .is("deleted_at", null);

      if (!msgs || !msgs.length) return json({ marked: 0 });

      const msgIds = (msgs as { id: number; sender_id: number; sender_type: string }[])
        .filter((m) => !(m.sender_id === userId && m.sender_type === role))
        .map((m) => m.id);

      if (!msgIds.length) return json({ marked: 0 });

      // Upsert read receipts
      const inserts = msgIds.map((mid: number) => ({
        message_id: mid,
        reader_id: userId,
        reader_type: role,
      }));

      await db
        .from("chat_message_reads")
        .upsert(inserts, { onConflict: "message_id,reader_id,reader_type", ignoreDuplicates: true });

      return json({ marked: msgIds.length });
    } catch (err) {
      console.error("[chat/conversations/:id/read POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /chat/messages/:id ─────────────────────────────────────
  const editMatch = path.match(/^\/chat\/messages\/(\d+)$/);
  if (editMatch && method === "PUT") {
    const msgId = parseInt(editMatch[1]);
    try {
      const { content } = await req.json();
      if (!content?.trim()) return json({ message: "content is required" }, 400);

      const { data: msg } = await db
        .from("chat_messages")
        .select("*")
        .eq("id", msgId)
        .single();

      if (!msg) return json({ message: "Message not found" }, 404);
      if (msg.deleted_at) return json({ message: "Cannot edit a deleted message" }, 400);
      if (msg.sender_id !== userId || msg.sender_type !== role)
        return json({ message: "You can only edit your own messages" }, 403);

      const { data: updated, error } = await db
        .from("chat_messages")
        .update({ content: content.trim().slice(0, 2000), is_edited: true, updated_at: new Date().toISOString() })
        .eq("id", msgId)
        .select()
        .single();

      if (error) throw error;
      return json(updated);
    } catch (err) {
      console.error("[chat/messages/:id PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /chat/messages/:id (soft delete) ───────────────────
  const deleteMatch = path.match(/^\/chat\/messages\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    const msgId = parseInt(deleteMatch[1]);
    try {
      const { data: msg } = await db
        .from("chat_messages")
        .select("*")
        .eq("id", msgId)
        .single();

      if (!msg) return json({ message: "Message not found" }, 404);
      if (msg.sender_id !== userId || msg.sender_type !== role)
        return json({ message: "You can only delete your own messages" }, 403);

      const { error } = await db
        .from("chat_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", msgId);

      if (error) throw error;
      return json({ message: "Message deleted" });
    } catch (err) {
      console.error("[chat/messages/:id DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /chat/conversations/:id (hard delete) ───────────────
  const convDeleteMatch = path.match(/^\/chat\/conversations\/(\d+)$/);
  if (convDeleteMatch && method === "DELETE") {
    const convId = parseInt(convDeleteMatch[1], 10);
    try {
      const parentIds = role === "parent" ? await resolveParentIdsByEmail() : [userId];

      const { data: conv } = await db
        .from("chat_conversations")
        .select("id, parent_id, participant_id, participant_type")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && parentIds.includes(Number(conv.parent_id))) ||
        (role !== "parent" && conv.participant_id === userId && conv.participant_type === role);

      if (!hasAccess) return json({ message: "Forbidden" }, 403);

      const { error } = await db
        .from("chat_conversations")
        .delete()
        .eq("id", convId);

      if (error) throw error;
      return json({ message: "Conversation deleted" });
    } catch (err) {
      console.error("[chat/conversations/:id DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /chat/teachers — parent lists teachers for their children ─
  if (path === "/chat/teachers" && method === "GET") {
    if (role !== "parent") return json({ message: "Forbidden" }, 403);
    try {
      const parentIds = await resolveParentIdsByEmail();

      // Get children of this parent
      const { data: links } = await db
        .from("parent_student")
        .select("student_id, students(school_id, class_id, section_id)")
        .in("parent_id", parentIds);

      if (!links?.length) return json([]);

      const studentSchools = [
        ...new Set(
          (links as Record<string, unknown>[])
            .map((l) => l.students as Record<string, unknown> | null)
            .filter(Boolean)
            .map((s) => Number(s?.school_id))
            .filter((id) => Number.isFinite(id)),
        ),
      ];

      const fetchSchoolTeachers = async () => {
        if (!studentSchools.length) return [];
        const { data: teachers } = await db
          .from("teachers")
          .select("id, first_name, last_name, email")
          .in("school_id", studentSchools)
          .order("first_name");
        return teachers || [];
      };

      const childCombos = (links as Record<string, unknown>[])
        .map((l) => l.students as Record<string, unknown> | null)
        .filter(Boolean)
        .map((s) => ({
          class_id: Number(s?.class_id),
          section_id: Number(s?.section_id),
        }))
        .filter((x) => Number.isFinite(x.class_id) && Number.isFinite(x.section_id));

      if (!childCombos.length) {
        // Child exists but class/section mapping is incomplete; still allow parent to message school teachers.
        return json(await fetchSchoolTeachers());
      }

      const classIds = [...new Set(childCombos.map((x) => x.class_id))];
      const sectionIds = [...new Set(childCombos.map((x) => x.section_id))];
      const comboKeySet = new Set(childCombos.map((x) => `${x.class_id}:${x.section_id}`));

      // Fetch candidate assignments, then keep only exact class-section matches.
      const { data: tcRows } = await db
        .from("teacher_classes")
        .select("teacher_id, class_id, section_id, classes!inner(school_id)")
        .in("class_id", classIds)
        .in("section_id", sectionIds);

      const teacherIds = [...new Set(
        (tcRows || [])
          .filter((r: { class_id: number; section_id: number; classes?: { school_id?: number } }) => {
            const inCombo = comboKeySet.has(`${r.class_id}:${r.section_id}`);
            const teacherSchoolId = Number(r.classes?.school_id);
            const inStudentSchool = studentSchools.includes(teacherSchoolId);
            return inCombo && inStudentSchool;
          })
          .map((r: { teacher_id: number }) => r.teacher_id),
      )];

      if (teacherIds.length) {
        const { data: teachers } = await db
          .from("teachers")
          .select("id, first_name, last_name, email")
          .in("id", teacherIds)
          .order("first_name");

        return json(teachers || []);
      }

      // Fallback: if assignments are missing, still allow parent to contact school teachers.
      return json(await fetchSchoolTeachers());
    } catch (err) {
      console.error("[chat/teachers GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /chat/admins — parent lists admins for their school ──
  if (path === "/chat/admins" && method === "GET") {
    if (role !== "parent") return json({ message: "Forbidden" }, 403);
    try {
      const parentIds = await resolveParentIdsByEmail();
      const schoolIds = await resolveParentSchoolIds(parentIds);

      if (!schoolIds.length) return json([]);

      const { data: admins } = await db
        .from("admins")
        .select("id, first_name, last_name, email")
        .in("school_id", schoolIds)
        .order("first_name");

      return json(admins || []);
    } catch (err) {
      console.error("[chat/admins GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /chat/parents — teacher/admin lists parents in their school ─
  if (path === "/chat/parents" && method === "GET") {
    if (role === "parent") return json({ message: "Forbidden" }, 403);
    try {
      const search = url.searchParams.get("q") || "";
      let query = db
        .from("parents")
        .select("id, first_name, last_name, email, phone")
        .eq("school_id", schoolId)
        .order("first_name");

      if (search.trim()) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
        );
      }

      const { data: parents, error } = await query.limit(50);
      if (error) throw error;
      return json(parents || []);
    } catch (err) {
      console.error("[chat/parents GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /chat/student/:id/parents — get all parents for a specific student ─
  if (path.match(/^\/chat\/student\/(\d+)\/parents$/i) && method === "GET") {
    if (role === "parent") return json({ message: "Forbidden" }, 403);
    try {
      const studentId = parseInt(path.split('/')[3], 10);
      if (!studentId) return json({ message: "Invalid student ID" }, 400);

      // Verify student belongs to this school
      const { data: student, error: studentError } = await db
        .from("students")
        .select("id, school_id")
        .eq("id", studentId)
        .single();

      if (studentError || !student) return json({ message: "Student not found" }, 404);
      if ((student as any).school_id !== schoolId) return json({ message: "Forbidden" }, 403);

      // Get all parents for this student
      const { data: parentStudentLinks, error: linkError } = await db
        .from("parent_student")
        .select(`
          parent_id,
          parents!inner(id, first_name, last_name, email, phone, school_id)
        `)
        .eq("student_id", studentId);

      if (linkError) throw linkError;

      if (!parentStudentLinks || parentStudentLinks.length === 0) {
        return json([]);
      }

      // Get parent IDs and filter those that have access to this school
      const parentIds = (parentStudentLinks || []).map((ps: any) => ps.parents.id);
      
      const { data: schoolAccessList, error: accessError } = await db
        .from("parent_school_access")
        .select("parent_id")
        .eq("school_id", schoolId)
        .in("parent_id", parentIds);

      if (accessError) throw accessError;

      // Filter parents: must have school_id set to this school OR be in parent_school_access
      const allowedParentIds = new Set<number>();
      const accessParentIds = new Set((schoolAccessList || []).map((a: any) => a.parent_id));

      const parentList = (parentStudentLinks || [])
        .filter((ps: any) => {
          const parentId = ps.parents.id;
          // Include if parent.school_id matches OR if they're in parent_school_access
          return ps.parents.school_id === schoolId || accessParentIds.has(parentId);
        })
        .map((ps: any) => ({
          id: ps.parents.id,
          first_name: ps.parents.first_name,
          last_name: ps.parents.last_name,
          email: ps.parents.email,
          phone: ps.parents.phone,
        }));

      return json(parentList);
    } catch (err) {
      console.error("[chat/student/:id/parents GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}
