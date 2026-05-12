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

  if (!["parent", "teacher", "admin"].includes(role)) {
    return json({ message: "Forbidden" }, 403);
  }

  // ── GET /chat/conversations ───────────────────────────────────
  if (path === "/chat/conversations" && method === "GET") {
    try {
      let query = db
        .from("chat_conversations")
        .select("*")
        .eq("school_id", schoolId)
        .order("last_message_at", { ascending: false });

      if (role === "parent") {
        query = query.eq("parent_id", userId);
      } else {
        query = query
          .eq("participant_id", userId)
          .eq("participant_type", role);
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

      if (role === "parent") {
        // Parent initiates: provide participant_id + participant_type
        const { participant_id, participant_type } = body;
        if (!participant_id || !["teacher", "admin"].includes(participant_type)) {
          return json({ message: "participant_id and participant_type (teacher|admin) are required" }, 400);
        }
        // Verify participant belongs to same school
        const table = participant_type === "teacher" ? "teachers" : "admins";
        const { data: participant } = await db
          .from(table)
          .select("id")
          .eq("id", participant_id)
          .eq("school_id", schoolId)
          .single();
        if (!participant) return json({ message: "Participant not found in this school" }, 404);
        parentId = userId;
        participantId = participant_id;
        participantType = participant_type;
      } else {
        // Teacher/admin initiates: provide parent_id
        const { parent_id } = body;
        if (!parent_id) return json({ message: "parent_id is required" }, 400);
        // Verify parent belongs to same school
        const { data: parent } = await db
          .from("parents")
          .select("id")
          .eq("id", parent_id)
          .eq("school_id", schoolId)
          .single();
        if (!parent) return json({ message: "Parent not found in this school" }, 404);
        parentId = parent_id;
        participantId = userId;
        participantType = role;
      }

      // Return existing conversation if present
      const { data: existing } = await db
        .from("chat_conversations")
        .select("*")
        .eq("parent_id", parentId)
        .eq("participant_id", participantId)
        .eq("participant_type", participantType)
        .single();

      if (existing) return json(existing);

      const { data: conv, error } = await db
        .from("chat_conversations")
        .insert({
          school_id: schoolId,
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
      // Verify access
      const { data: conv } = await db
        .from("chat_conversations")
        .select("*")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && conv.parent_id === userId) ||
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
      const { content } = await req.json();
      if (!content?.trim()) return json({ message: "content is required" }, 400);

      const { data: conv } = await db
        .from("chat_conversations")
        .select("*")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && conv.parent_id === userId) ||
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
      await db.from("chat_message_reads").insert({
        message_id: msg.id,
        reader_id: userId,
        reader_type: role,
      }).onConflict("message_id, reader_id, reader_type").merge();

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
      const { data: conv } = await db
        .from("chat_conversations")
        .select("*")
        .eq("id", convId)
        .single();

      if (!conv) return json({ message: "Conversation not found" }, 404);

      const hasAccess =
        (role === "parent" && conv.parent_id === userId) ||
        (role !== "parent" && conv.participant_id === userId && conv.participant_type === role);

      if (!hasAccess) return json({ message: "Forbidden" }, 403);

      // Get all messages in this conversation NOT sent by the viewer
      const { data: msgs } = await db
        .from("chat_messages")
        .select("id")
        .eq("conversation_id", convId)
        .not("sender_id", "eq", userId)
        .not("sender_type", "eq", role)
        .is("deleted_at", null);

      if (!msgs || !msgs.length) return json({ marked: 0 });

      const msgIds = msgs.map((m: { id: number }) => m.id);

      // Upsert read receipts
      const inserts = msgIds.map((mid: number) => ({
        message_id: mid,
        reader_id: userId,
        reader_type: role,
      }));

      await db
        .from("chat_message_reads")
        .upsert(inserts, { onConflict: "message_id, reader_id, reader_type", ignoreDuplicates: true });

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

  // ── GET /chat/teachers — parent lists teachers for their children ─
  if (path === "/chat/teachers" && method === "GET") {
    if (role !== "parent") return json({ message: "Forbidden" }, 403);
    try {
      // Get children of this parent
      const { data: links } = await db
        .from("parent_student")
        .select("student_id, students(class_id, section_id)")
        .eq("parent_id", userId);

      if (!links?.length) return json([]);

      const classIds = [...new Set((links as Record<string, unknown>[]).map((l) => {
        const s = l.students as Record<string, unknown> | null;
        return s?.class_id as number;
      }).filter(Boolean))];

      const sectionIds = [...new Set((links as Record<string, unknown>[]).map((l) => {
        const s = l.students as Record<string, unknown> | null;
        return s?.section_id as number;
      }).filter(Boolean))];

      // Find teachers assigned to these class/section combos
      const { data: tcRows } = await db
        .from("teacher_classes")
        .select("teacher_id, class_id, section_id")
        .in("class_id", classIds)
        .in("section_id", sectionIds);

      const teacherIds = [...new Set((tcRows || []).map((r: { teacher_id: number }) => r.teacher_id))];
      if (!teacherIds.length) return json([]);

      const { data: teachers } = await db
        .from("teachers")
        .select("id, first_name, last_name, email")
        .in("id", teacherIds)
        .eq("school_id", schoolId);

      return json(teachers || []);
    } catch (err) {
      console.error("[chat/teachers GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /chat/admins — parent lists admins for their school ──
  if (path === "/chat/admins" && method === "GET") {
    if (role !== "parent") return json({ message: "Forbidden" }, 403);
    try {
      const { data: admins } = await db
        .from("admins")
        .select("id, first_name, last_name, email")
        .eq("school_id", schoolId);

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

  return json({ message: "Not found" }, 404);
}
