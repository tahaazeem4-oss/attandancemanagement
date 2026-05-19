// handlers/notifications.ts — send, inbox, student feed, read tracking
import {
  json,
  getDb,
  verifyToken,
  sendPush,
  tokensForStudents,
  tokensForParents,
  tokensForClassStudents,
  tokensForClassParents,
  tokensForClassTeachers,
  tokensForSchoolAdmins,
  tokensForSchoolStudents,
  tokensForSchoolTeachers,
  tokensForSchoolParents,
} from "../_shared.ts";

export async function handleNotifications(
  req: Request,
  path: string,
  _url: URL,
): Promise<Response> {
  const method = req.method;

  let user: Record<string, unknown>;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }

  const db = getDb();
  const schoolId = user.school_id as number;
  const userId = user.id as number;
  const role = user.role as string;

  const canManageNotification = async (notification: Record<string, unknown>) => {
    const notifSchoolId = Number(notification.school_id || 0);
    const notifSenderId = Number(notification.sender_id || 0);

    if (role === "super_admin") return true;

    if (role === "org_admin") {
      const orgId = user.org_id as number;
      if (!orgId || !notifSchoolId) return false;
      const { data: school } = await db
        .from("schools")
        .select("id")
        .eq("id", notifSchoolId)
        .eq("org_id", orgId)
        .maybeSingle();
      return !!school;
    }

    if (role === "admin") {
      return !!schoolId && !!notifSchoolId && notifSchoolId === schoolId;
    }

    if (role === "teacher") {
      return notifSenderId === userId;
    }

    return false;
  };

  // ── GET /notifications/inbox (teacher/admin) ─────────────────
  if (path === "/notifications/inbox" && method === "GET") {
    if (role !== "teacher" && role !== "admin" && role !== "super_admin")
      return json({ message: "Forbidden" }, 403);
    // super_admin has no school_id — return empty inbox
    if (!schoolId) return json([]);
    try {
      const specificType = role === "admin" ? "specific_admin" : "specific_teacher";
      const { data: notifs } = await db
        .from("notifications")
        .select("*")
        .eq("school_id", schoolId)
        .or(`target_type.not.in.(specific_admin,specific_teacher),and(target_type.eq.${specificType},target_user_id.eq.${userId})`)
        .order("created_at", { ascending: false });

      const notifIds = (notifs || []).map((n: Record<string, unknown>) => n.id);
      const { data: reads } = notifIds.length
        ? await db
            .from("staff_notification_reads")
            .select("notification_id")
            .eq("user_id", userId)
            .eq("user_role", role)
            .in("notification_id", notifIds)
        : { data: [] };

      const readSet = new Set((reads || []).map((r: Record<string, unknown>) => r.notification_id));
      const result = (notifs || []).map((n: Record<string, unknown>) => ({
        ...n,
        is_read: readSet.has(n.id),
      }));
      return json(result);
    } catch (err) {
      console.error("[notifications/inbox GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /notifications/inbox/read-all ───────────────────────
  if (path === "/notifications/inbox/read-all" && method === "POST") {
    if (role !== "teacher" && role !== "admin" && role !== "super_admin")
      return json({ message: "Forbidden" }, 403);
    try {
      const { data: notifs } = await db
        .from("notifications")
        .select("id")
        .eq("school_id", schoolId);

      if (notifs?.length) {
        const rows = (notifs as Record<string, unknown>[]).map((n) => ({
          notification_id: n.id,
          user_id: userId,
          user_role: role,
        }));
        await db
          .from("staff_notification_reads")
          .upsert(rows, { onConflict: "notification_id,user_id,user_role" });
      }
      return json({ message: "All marked as read" });
    } catch (err) {
      console.error("[notifications/inbox/read-all]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /notifications/inbox/unread-count ────────────────────
  if (path === "/notifications/inbox/unread-count" && method === "GET") {
    if (role !== "teacher" && role !== "admin" && role !== "super_admin")
      return json({ message: "Forbidden" }, 403);
    if (!schoolId) return json({ count: 0 });
    try {
      const specificType = role === "admin" ? "specific_admin" : "specific_teacher";
      const { data: notifs } = await db
        .from("notifications")
        .select("id")
        .eq("school_id", schoolId)
        .or(`target_type.not.in.(specific_admin,specific_teacher),and(target_type.eq.${specificType},target_user_id.eq.${userId})`);
      const notifIds = (notifs || []).map((n: Record<string, unknown>) => n.id);
      if (!notifIds.length) return json({ count: 0 });

      const { count: readCount } = await db
        .from("staff_notification_reads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("user_role", role)
        .in("notification_id", notifIds);

      return json({ count: notifIds.length - (readCount || 0) });
    } catch (err) {
      console.error("[notifications/inbox/unread-count]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /notifications/inbox/:id/read ───────────────────────
  const inboxReadMatch = path.match(/^\/notifications\/inbox\/(\d+)\/read$/);
  if (inboxReadMatch && method === "POST") {
    const notifId = parseInt(inboxReadMatch[1]);
    try {
      await db.from("staff_notification_reads").upsert(
        { notification_id: notifId, user_id: userId, user_role: role },
        { onConflict: "notification_id,user_id,user_role" },
      );
      return json({ message: "Marked as read" });
    } catch (err) {
      console.error("[notifications/inbox/:id/read]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /notifications/me (student feed) ─────────────────────
  if (path === "/notifications/me" && method === "GET") {
    if (role !== "student") return json({ message: "Forbidden" }, 403);
    try {
      const studentId = user.student_id as number;
      const classId = user.class_id as number;
      const sectionId = user.section_id as number;

      const { data: notifs } = await db
        .from("notifications")
        .select("*")
        .eq("school_id", schoolId)
        .or(
          `target_type.eq.school,` +
          `and(target_type.eq.class,class_id.eq.${classId}),` +
          `and(target_type.eq.section,class_id.eq.${classId},section_id.eq.${sectionId}),` +
          `and(target_type.eq.student,student_id.eq.${studentId})`,
        )
        .order("created_at", { ascending: false });

      const notifIds = (notifs || []).map((n: Record<string, unknown>) => n.id);
      const { data: reads } = notifIds.length
        ? await db
            .from("notification_reads")
            .select("notification_id")
            .eq("student_id", studentId)
            .in("notification_id", notifIds)
        : { data: [] };

      const readSet = new Set((reads || []).map((r: Record<string, unknown>) => r.notification_id));
      const result = (notifs || []).map((n: Record<string, unknown>) => ({
        ...n,
        is_read: readSet.has(n.id),
      }));
      return json(result);
    } catch (err) {
      console.error("[notifications/me GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /notifications/me/unread-count ───────────────────────
  if (path === "/notifications/me/unread-count" && method === "GET") {
    if (role !== "student") return json({ message: "Forbidden" }, 403);
    try {
      const studentId = user.student_id as number;
      const classId = user.class_id as number;
      const sectionId = user.section_id as number;

      const { data: notifs } = await db
        .from("notifications")
        .select("id")
        .eq("school_id", schoolId)
        .or(
          `target_type.eq.school,` +
          `and(target_type.eq.class,class_id.eq.${classId}),` +
          `and(target_type.eq.section,class_id.eq.${classId},section_id.eq.${sectionId}),` +
          `and(target_type.eq.student,student_id.eq.${studentId})`,
        );

      const notifIds = (notifs || []).map((n: Record<string, unknown>) => n.id);
      if (!notifIds.length) return json({ count: 0 });

      const { count: readCount } = await db
        .from("notification_reads")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentId)
        .in("notification_id", notifIds);

      return json({ count: notifIds.length - (readCount || 0) });
    } catch (err) {
      console.error("[notifications/me/unread-count]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /notifications/read-all (student) ───────────────────
  if (path === "/notifications/read-all" && method === "POST") {
    if (role !== "student") return json({ message: "Forbidden" }, 403);
    try {
      const studentId = user.student_id as number;
      const classId = user.class_id as number;
      const sectionId = user.section_id as number;

      const { data: notifs } = await db
        .from("notifications")
        .select("id")
        .eq("school_id", schoolId)
        .or(
          `target_type.eq.school,` +
          `and(target_type.eq.class,class_id.eq.${classId}),` +
          `and(target_type.eq.section,class_id.eq.${classId},section_id.eq.${sectionId}),` +
          `and(target_type.eq.student,student_id.eq.${studentId})`,
        );

      if (notifs?.length) {
        const rows = (notifs as Record<string, unknown>[]).map((n) => ({
          notification_id: n.id,
          student_id: studentId,
        }));
        await db
          .from("notification_reads")
          .upsert(rows, { onConflict: "notification_id,student_id" });
      }
      return json({ message: "All marked as read" });
    } catch (err) {
      console.error("[notifications/read-all]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /notifications/:id/read ─────────────────────────────
  const readMatch = path.match(/^\/notifications\/(\d+)\/read$/);
  if (readMatch && method === "POST") {
    const notifId = parseInt(readMatch[1]);
    try {
      if (role === "student") {
        const studentId = user.student_id as number;
        await db.from("notification_reads").upsert(
          { notification_id: notifId, student_id: studentId },
          { onConflict: "notification_id,student_id" },
        );
      } else {
        await db.from("staff_notification_reads").upsert(
          { notification_id: notifId, user_id: userId, user_role: role },
          { onConflict: "notification_id,user_id,user_role" },
        );
      }
      return json({ message: "Marked as read" });
    } catch (err) {
      console.error("[notifications/:id/read]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /notifications/students ──────────────────────────────
  if (path === "/notifications/students" && method === "GET") {
    const classId = _url.searchParams.get("class_id");
    const sectionId = _url.searchParams.get("section_id");
    try {
      let q = db
        .from("students")
        .select("id, first_name, last_name, roll_no")
        .eq("school_id", schoolId)
        .order("last_name");
      if (classId) q = q.eq("class_id", classId);
      if (sectionId) q = q.eq("section_id", sectionId);
      const { data } = await q;
      return json(data || []);
    } catch (err) {
      console.error("[notifications/students]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /notifications/sent ──────────────────────────────────
  if (path === "/notifications/sent" && method === "GET") {
    try {
      // Step 1: fetch raw notifications (no relational join — avoids FK resolution issues)
      let q = db
        .from("notifications")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (role === "teacher") q = q.eq("sender_id", userId);
      const { data: notifs, error: notifErr } = await q;
      if (notifErr) throw notifErr;

      const rows = notifs || [];

      // Step 2: batch-fetch related names
      const classIds   = [...new Set(rows.map((n: Record<string, unknown>) => n.class_id).filter(Boolean))];
      const sectionIds = [...new Set(rows.map((n: Record<string, unknown>) => n.section_id).filter(Boolean))];
      const studentIds = [...new Set(rows.map((n: Record<string, unknown>) => n.student_id).filter(Boolean))];

      const [classRes, sectionRes, studentRes] = await Promise.all([
        classIds.length   ? db.from("classes").select("id, class_name").in("id", classIds)     : { data: [] },
        sectionIds.length ? db.from("sections").select("id, section_name").in("id", sectionIds) : { data: [] },
        studentIds.length ? db.from("students").select("id, first_name, last_name").in("id", studentIds) : { data: [] },
      ]);

      const classMap   = Object.fromEntries(((classRes.data   || []) as Record<string, unknown>[]).map((c) => [c.id, c.class_name]));
      const sectionMap = Object.fromEntries(((sectionRes.data || []) as Record<string, unknown>[]).map((s) => [s.id, s.section_name]));
      const studentMap = Object.fromEntries(((studentRes.data || []) as Record<string, unknown>[]).map((s) => [s.id, s]));

      // Step 3: merge into flat response matching frontend field names
      const result = rows.map((n: Record<string, unknown>) => ({
        ...n,
        class_name:   n.class_id   ? classMap[n.class_id as number]                              : null,
        section_name: n.section_id ? sectionMap[n.section_id as number]                          : null,
        st_first:     n.student_id ? (studentMap[n.student_id as number] as Record<string, unknown>)?.first_name : null,
        st_last:      n.student_id ? (studentMap[n.student_id as number] as Record<string, unknown>)?.last_name  : null,
      }));

      return json(result);
    } catch (err) {
      console.error("[notifications/sent]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /notifications ──────────────────────────────────────
  if (path === "/notifications" && method === "POST") {
    if (role !== "teacher" && role !== "admin" && role !== "super_admin" && role !== "org_admin")
      return json({ message: "Forbidden" }, 403);
    try {
      const { target_type, class_id, section_id, student_id, category, title, message, school_id: bodySchoolId } =
        await req.json();

      // org_admin must supply a school_id in the request body
      const resolvedSchoolId = (role === "org_admin" ? bodySchoolId : schoolId) as number;
      if (!resolvedSchoolId)
        return json({ message: "school_id is required for this role" }, 400);

      const VALID_TARGETS = ["school", "class", "section", "student"];
      const VALID_CATS = ["general", "holiday", "complaint", "announcement", "homework", "exam"];
      if (!VALID_TARGETS.includes(target_type))
        return json({ message: "Invalid target_type" }, 400);
      if (!title?.trim() || !message?.trim())
        return json({ message: "title and message are required" }, 400);

      const cat = VALID_CATS.includes(category) ? category : "general";
      const senderName = `${user.first_name} ${user.last_name}`;

      const { data: notif, error } = await db
        .from("notifications")
        .insert({
          school_id: resolvedSchoolId,
          sender_id: userId,
          sender_name: senderName,
          sender_role: role,
          target_type,
          class_id: class_id || null,
          section_id: section_id || null,
          student_id: student_id || null,
          category: cat,
          title: title.trim(),
          message: message.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Push (non-blocking)
      const pushData = { type: "notification", sender: senderName };
      if (target_type === "student" && student_id) {
        Promise.all([
          tokensForStudents(db, [student_id]),
          tokensForParents(db, [student_id]),
        ]).then(([stuTokens, parentTokens]) =>
          sendPush([...new Set([...stuTokens, ...parentTokens])], title.trim(), message.trim(), pushData)
        );
      } else if (target_type === "section" && class_id && section_id) {
        Promise.all([
          tokensForClassStudents(db, resolvedSchoolId, class_id, section_id),
          tokensForClassTeachers(db, class_id, section_id),
          tokensForClassParents(db, resolvedSchoolId, class_id, section_id),
        ]).then(([s, t, p]) =>
          sendPush([...new Set([...s, ...t, ...p])], title.trim(), message.trim(), pushData)
        );
      } else if (target_type === "class" && class_id) {
        Promise.all([
          tokensForClassStudents(db, resolvedSchoolId, class_id, null),
          tokensForSchoolAdmins(db, resolvedSchoolId),
          tokensForClassParents(db, resolvedSchoolId, class_id, null),
        ]).then(([s, a, p]) =>
          sendPush([...new Set([...s, ...a, ...p])], title.trim(), message.trim(), pushData)
        );
      } else if (target_type === "school") {
        Promise.all([
          tokensForSchoolStudents(db, resolvedSchoolId),
          tokensForSchoolAdmins(db, resolvedSchoolId),
          tokensForSchoolTeachers(db, resolvedSchoolId),
          tokensForSchoolParents(db, resolvedSchoolId),
        ]).then(([s, a, t, p]) =>
          sendPush([...new Set([...s, ...a, ...t, ...p])], title.trim(), message.trim(), pushData)
        );
      }

      return json(notif, 201);
    } catch (err) {
      console.error("[notifications POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /notifications/:id ────────────────────────────────
  const deleteMatch = path.match(/^\/notifications\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    const id = parseInt(deleteMatch[1]);
    try {
      const { data } = await db
        .from("notifications")
        .select("sender_id, school_id")
        .eq("id", id)
        .single();

      if (!data) return json({ message: "Not found" }, 404);
      if (!(await canManageNotification(data as Record<string, unknown>)))
        return json({ message: "Forbidden" }, 403);

      await db.from("notifications").delete().eq("id", id);
      return json({ message: "Notification deleted" });
    } catch (err) {
      console.error("[notifications DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /notifications/:id ───────────────────────────────────
  const updateMatch = path.match(/^\/notifications\/(\d+)$/);
  if (updateMatch && method === "PUT") {
    const id = parseInt(updateMatch[1]);
    try {
      const {
        title,
        message,
        category,
      } = await req.json();

      const { data: notif } = await db
        .from("notifications")
        .select("id, sender_id, school_id")
        .eq("id", id)
        .single();

      if (!notif) return json({ message: "Not found" }, 404);
      if (!(await canManageNotification(notif as Record<string, unknown>)))
        return json({ message: "Forbidden" }, 403);

      const updates: Record<string, unknown> = {};
      if (typeof title === "string") {
        const t = title.trim();
        if (!t) return json({ message: "title cannot be empty" }, 400);
        updates.title = t;
      }
      if (typeof message === "string") {
        const m = message.trim();
        if (!m) return json({ message: "message cannot be empty" }, 400);
        updates.message = m;
      }
      if (typeof category === "string") {
        const VALID_CATS = ["general", "holiday", "complaint", "announcement", "homework", "exam"];
        if (!VALID_CATS.includes(category)) {
          return json({ message: "Invalid category" }, 400);
        }
        updates.category = category;
      }

      if (!Object.keys(updates).length) {
        return json({ message: "No changes provided" }, 400);
      }

      const { data: updated, error: updateErr } = await db
        .from("notifications")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return json(updated);
    } catch (err) {
      console.error("[notifications PUT]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}
