// handlers/lectures.ts — upload, list, delete, file serving
import {
  json,
  getDb,
  verifyToken,
  sendPush,
  tokensForClassStudents,
  SUPABASE_URL,
} from "../_shared.ts";

const BUCKET = "lectures";

function publicUrl(path: string): string {
  return `${SUPABASE_URL()}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function handleLectures(
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

  const schoolId = user.school_id as number;

  // ── GET /lectures/classes ────────────────────────────────────
  if (path === "/lectures/classes" && method === "GET") {
    try {
      const { data: classes } = await db
        .from("classes")
        .select("id, class_name")
        .eq("school_id", schoolId)
        .order("class_name");

      const { data: sections } = await db
        .from("sections")
        .select("id, class_id, section_name")
        .in("class_id", (classes || []).map((c: Record<string, unknown>) => c.id));

      const secMap: Record<number, unknown[]> = {};
      for (const s of sections || []) {
        const r = s as Record<string, unknown>;
        const cid = r.class_id as number;
        if (!secMap[cid]) secMap[cid] = [];
        secMap[cid].push(r);
      }

      return json(
        (classes || []).map((c: Record<string, unknown>) => ({
          ...c,
          sections: secMap[c.id as number] || [],
        })),
      );
    } catch (err) {
      console.error("[lectures/classes GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /lectures/subjects ───────────────────────────────────
  if (path === "/lectures/subjects" && method === "GET") {
    try {
      const { data } = await db
        .from("subjects")
        .select("name")
        .eq("school_id", schoolId)
        .order("name");
      return json((data || []).map((s: Record<string, unknown>) => s.name));
    } catch (err) {
      console.error("[lectures/subjects GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /lectures/check-duplicate ───────────────────────────
  if (path === "/lectures/check-duplicate" && method === "GET") {
    try {
      const subject_name = url.searchParams.get("subject_name");
      const date = url.searchParams.get("date");
      const class_id = url.searchParams.get("class_id");
      const section_id = url.searchParams.get("section_id") || null;

      let q = db
        .from("lectures")
        .select("id, lecture_name")
        .eq("school_id", schoolId)
        .eq("subject_name", subject_name!)
        .eq("date", date!)
        .eq("class_id", class_id!);

      if (section_id) q = q.eq("section_id", section_id);
      else q = q.is("section_id", null);

      const { data } = await q;
      if (data?.length) return json({ exists: true, lecture: data[0] });
      return json({ exists: false, lecture: null });
    } catch (err) {
      console.error("[lectures/check-duplicate]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /lectures ────────────────────────────────────────────
  if (path === "/lectures" && method === "GET") {
    try {
      let q = db
        .from("lectures")
        .select(`id, teacher_id, subject_name, lecture_name, type, date, file_path, uploaded_by, created_at, class_id, section_id,
                 classes!inner(class_name), sections(section_name)`)
        .eq("school_id", schoolId)
        .order("date", { ascending: false });

      // Students only see their own class/section lectures
      if (user.role === "student") {
        const cid = user.class_id as number;
        const sid = user.section_id as number;
        q = q.eq("class_id", cid).or(`section_id.eq.${sid},section_id.is.null`);
      }

      const { data } = await q;
      const result = (data || []).map((l: Record<string, unknown>) => ({
        ...l,
        class_name: (l.classes as Record<string, unknown>).class_name,
        section_name: l.section_id
          ? (l.sections as Record<string, unknown>)?.section_name
          : "All Sections",
        file_url: publicUrl(l.file_path as string),
      }));
      return json(result);
    } catch (err) {
      console.error("[lectures GET]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /lectures (multipart upload) ────────────────────────
  if (path === "/lectures" && method === "POST") {
    if (user.role === "student")
      return json({ message: "Forbidden" }, 403);
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const lecture_name = formData.get("lecture_name") as string;
      const subject_name = formData.get("subject_name") as string;
      const type = (formData.get("type") as string) || "classwork";
      const date = formData.get("date") as string;
      const class_id = parseInt(formData.get("class_id") as string);
      const sectionRaw = formData.get("section_id") as string;
      const section_id = sectionRaw && sectionRaw !== "" ? parseInt(sectionRaw) : null;

      if (!file || !lecture_name || !subject_name || !date || !class_id)
        return json({ message: "Missing required fields" }, 400);

      // Upload to Supabase Storage
      const ext = file.name.split(".").pop() || "pdf";
      const storagePath = `${schoolId}/${Date.now()}_${lecture_name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      const fileBuffer = await file.arrayBuffer();

      const { error: storageError } = await db.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });

      if (storageError) throw storageError;

      const teacherId = user.role === "teacher" ? (user.id as number) : null;
      const uploaderName = `${user.first_name} ${user.last_name}`;

      const { data: lecture, error: dbError } = await db
        .from("lectures")
        .insert({
          school_id: schoolId,
          teacher_id: teacherId,
          class_id,
          section_id,
          subject_name,
          lecture_name,
          type,
          date,
          file_path: storagePath,
          uploaded_by: uploaderName,
        })
        .select()
        .single();

      if (dbError) {
        // Cleanup orphaned storage file on DB error
        await db.storage.from(BUCKET).remove([storagePath]);
        throw dbError;
      }

      // Push to students (non-blocking)
      tokensForClassStudents(db, schoolId, class_id, section_id).then((tokens) =>
        sendPush(tokens, "New Lecture", `${subject_name}: ${lecture_name}`, { type: "lecture" })
      );

      return json({ ...lecture, file_url: publicUrl(storagePath) }, 201);
    } catch (err) {
      console.error("[lectures POST]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── DELETE /lectures/:id ─────────────────────────────────────
  const deleteMatch = path.match(/^\/lectures\/(\d+)$/);
  if (deleteMatch && method === "DELETE") {
    const id = parseInt(deleteMatch[1]);
    try {
      const { data } = await db
        .from("lectures")
        .select("file_path, school_id")
        .eq("id", id)
        .single();

      if (!data) return json({ message: "Lecture not found" }, 404);
      if (data.school_id !== schoolId)
        return json({ message: "Forbidden" }, 403);

      await db.storage.from(BUCKET).remove([data.file_path]);
      await db.from("lectures").delete().eq("id", id);
      return json({ message: "Lecture deleted" });
    } catch (err) {
      console.error("[lectures DELETE]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /lectures/:id/file — redirect to Supabase Storage ────
  const fileMatch = path.match(/^\/lectures\/(\d+)\/file$/);
  if (fileMatch && method === "GET") {
    const id = parseInt(fileMatch[1]);
    try {
      const { data } = await db
        .from("lectures")
        .select("file_path, school_id")
        .eq("id", id)
        .single();

      if (!data) return json({ message: "Lecture not found" }, 404);
      if (data.school_id !== schoolId)
        return json({ message: "Forbidden" }, 403);

      const fileUrl = publicUrl(data.file_path);
      return Response.redirect(fileUrl, 302);
    } catch (err) {
      console.error("[lectures/:id/file]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}
