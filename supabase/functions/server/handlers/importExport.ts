// handlers/importExport.ts — Excel import/export using npm:xlsx
import { json, getDb, verifyToken, hashPassword, resolveTeacherRole } from "../_shared.ts";
// deno-lint-ignore-file no-explicit-any
import * as XLSX from "npm:xlsx";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toXlsx(data: Record<string, unknown>[], sheetName = "Sheet1"): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}

function xlsxResponse(buffer: Uint8Array, filename: string): Response {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows?.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\n");
}

function exportResponse(
  rows: Record<string, unknown>[],
  sheetName: string,
  xlsxFilename: string,
  url: URL,
): Response {
  const format = String(url.searchParams.get("format") || "xlsx").toLowerCase();
  if (format === "csv") {
    const csvFilename = xlsxFilename.replace(/\.xlsx$/i, ".csv");
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  return xlsxResponse(toXlsx(rows, sheetName), xlsxFilename);
}

function parseUpload(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
}

/**
 * Validates a phone number for import rows.
 * Accepted formats (Pakistan):
 *   03XXXXXXXXX  — exactly 11 characters
 *   92XXXXXXXXXX — exactly 12 digits
 *   +92XXXXXXXXXX — exactly 13 characters
 * Returns an error string if invalid, or null if valid/absent.
 */
function validateImportPhone(raw: unknown, rowNum: number): string | null {
  if (!raw || String(raw).trim() === "") return null; // phone is optional
  const p = String(raw).trim();
  if (p.startsWith("+92")) {
    if (p.length !== 13 || !/^\+92\d{10}$/.test(p))
      return `Row ${rowNum}: Phone "${p}" starting with +92 must be exactly 13 characters (+92 followed by 10 digits)`;
  } else if (p.startsWith("92")) {
    if (p.length !== 12 || !/^92\d{10}$/.test(p))
      return `Row ${rowNum}: Phone "${p}" starting with 92 must be exactly 12 digits (92 followed by 10 digits)`;
  } else if (p.startsWith("03")) {
    if (p.length !== 11 || !/^03\d{9}$/.test(p))
      return `Row ${rowNum}: Phone "${p}" starting with 03 must be exactly 11 digits (03 followed by 9 digits)`;
  } else {
    return `Row ${rowNum}: Phone "${p}" is not a valid Pakistan number — must start with 03 (11 digits), 92 (12 digits), or +92 (13 characters)`;
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function handleImportExport(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;

  let user: Record<string, unknown>;
  try {
    user = await verifyToken(req);
  } catch {
    return json({ message: "Unauthorized" }, 401);
  }

  if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "teacher" && user.role !== "org_admin")
    return json({ message: "Forbidden" }, 403);

  // Attendance and leave report exports are open to teachers; all other import/export routes require admin+
  const isTeacherAllowed = path.startsWith("/import-export/attendance") || path === "/import-export/leaves/export";
  const isAdminOnly = !isTeacherAllowed;
  if (isAdminOnly && user.role === "teacher")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const campusParamRaw = url.searchParams.get("campus_id") || url.searchParams.get("school_id");
  const campusParam = campusParamRaw ? Number(campusParamRaw) : null;
  const schoolId = (user.role === "super_admin" || user.role === "org_admin")
    ? campusParam
    : (user.school_id as number);

  if (!schoolId) {
    return json({ message: "campus_id is required" }, 400);
  }

  if (user.role === "teacher" && isTeacherAllowed) {
    const teacherRole = await resolveTeacherRole(db, user.id as number);
    if (teacherRole === "subject_teacher") {
      return json({ message: "Subject teachers cannot export attendance or leave reports" }, 403);
    }
  }

  // ── TEACHERS ──────────────────────────────────────────────────

  if (path === "/import-export/teachers/template" && method === "GET") {
    const sample = [
      { first_name: "Ali", last_name: "Khan", email: "ali@school.com", password: "Pass@123", phone: "03001234567" },
    ];
    return xlsxResponse(toXlsx(sample, "Teachers"), "teachers_template.xlsx");
  }

  if (path === "/import-export/teachers/export" && method === "GET") {
    try {
      const { data } = await db
        .from("teachers")
        .select("first_name, last_name, email, phone, created_at")
        .eq("school_id", schoolId)
        .order("last_name");
      return exportResponse((data || []) as Record<string, unknown>[], "Teachers", "teachers_export.xlsx", url);
    } catch (err) {
      console.error("[import-export/teachers/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/teachers/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);

      const rows = parseUpload(await file.arrayBuffer());
      const errors: string[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        if (!r.first_name || !r.last_name || !r.email || !r.password) {
          errors.push(`Row ${rowNum}: first_name, last_name, email, password are required`);
          continue;
        }
        if (r.phone) {
          const phoneErr = validateImportPhone(r.phone, rowNum);
          if (phoneErr) { errors.push(phoneErr); continue; }
        }
        const email = String(r.email).trim().toLowerCase();
        const { data: ex } = await db.from("teachers").select("id").eq("email", email).maybeSingle();
        if (ex) {
          errors.push(`Row ${rowNum}: email "${email}" already exists — skipped`);
          continue;
        }
        const hashed = await hashPassword(String(r.password));
        const { error: insertErr } = await db.from("teachers").insert({
          school_id: schoolId,
          first_name: r.first_name,
          last_name: r.last_name,
          email,
          password: hashed,
          phone: r.phone || null,
          teacher_role: "subject_teacher",
        });
        if (insertErr) { errors.push(`Row ${rowNum}: ${insertErr.message}`); continue; }
        created++;
      }

      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) {
      console.error("[import-export/teachers/import]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── STUDENTS ──────────────────────────────────────────────────

  if (path === "/import-export/students/template" && method === "GET") {
    try {
      const { data: classes } = await db
        .from("classes")
        .select("id, class_name, sections(id, section_name)")
        .eq("school_id", schoolId)
        .order("class_name");

      const rows: Record<string, unknown>[] = [];
      for (const cls of (classes || []) as any[]) {
        for (const sec of (cls.sections || []) as any[]) {
          rows.push({
            first_name: "Student",
            last_name: "1",
            age: 10,
            student_id: `${cls.class_name}${sec.section_name}-01`,
            class_name: cls.class_name,
            section_name: sec.section_name,
          });
          if (rows.length >= 2) break;
        }
        if (rows.length >= 2) break;
      }

      if (!rows.length)
        rows.push({ first_name: "", last_name: "", age: "", student_id: "", class_name: "", section_name: "" });

      return xlsxResponse(toXlsx(rows, "Students"), "students_template.xlsx");
    } catch (err) {
      console.error("[import-export/students/template]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/students/export" && method === "GET") {
    try {
      const { data } = await db
        .from("students")
        .select("first_name, last_name, age, roll_no, class_id, section_id, classes(class_name), sections(section_name)")
        .eq("school_id", schoolId)
        .order("last_name");

      const rows = (data || []).map((s: any) => ({
        first_name: s.first_name,
        last_name: s.last_name,
        age: s.age,
        student_id: s.roll_no || "",
        class_name: s.classes?.class_name,
        section_name: s.sections?.section_name,
        class_id: s.class_id,
        section_id: s.section_id,
      }));
      return exportResponse(rows as Record<string, unknown>[], "Students", "students_export.xlsx", url);
    } catch (err) {
      console.error("[import-export/students/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/students/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);

      const rows = parseUpload(await file.arrayBuffer());
      const errors: string[] = [];
      let created = 0;

      // Pre-fetch all classes + sections for this school in ONE query (avoids N×3 DB calls per row)
      const { data: allClasses } = await db
        .from("classes")
        .select("id, class_name, sections(id, section_name)")
        .eq("school_id", schoolId);

      const classByName = new Map<string, number>();
      const classById = new Set<number>();
      const sectionByKey = new Map<string, number>(); // `${classId}:${name_lower}` → sectionId
      const sectionById = new Set<number>();
      for (const cls of (allClasses || []) as any[]) {
        classByName.set(String(cls.class_name || "").trim().toLowerCase(), Number(cls.id));
        classById.add(Number(cls.id));
        for (const sec of (cls.sections || []) as any[]) {
          sectionByKey.set(`${cls.id}:${String(sec.section_name || "").trim().toLowerCase()}`, Number(sec.id));
          sectionById.add(Number(sec.id));
        }
      }

      // Validate all rows using in-memory maps (zero DB calls per row)
      const validRows: Array<{ insert: Record<string, unknown>; rowNum: number }> = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        if (!r.first_name || !r.last_name) {
          errors.push(`Row ${rowNum}: first_name and last_name are required`);
          continue;
        }
        let classId: number | null = r.class_id ? Number(r.class_id) : null;
        if (classId && !classById.has(classId)) { errors.push(`Row ${rowNum}: class not found in this school`); continue; }
        if (!classId && r.class_name) {
          classId = classByName.get(String(r.class_name).trim().toLowerCase()) ?? null;
          if (!classId) { errors.push(`Row ${rowNum}: class "${r.class_name}" not found`); continue; }
        }
        if (!classId) { errors.push(`Row ${rowNum}: class_name is required`); continue; }
        let sectionId: number | null = r.section_id ? Number(r.section_id) : null;
        if (sectionId && !sectionById.has(sectionId)) { errors.push(`Row ${rowNum}: section not found`); continue; }
        if (!sectionId && r.section_name) {
          sectionId = sectionByKey.get(`${classId}:${String(r.section_name).trim().toLowerCase()}`) ?? null;
          if (!sectionId) { errors.push(`Row ${rowNum}: section "${r.section_name}" not found in class`); continue; }
        }
        if (!sectionId) { errors.push(`Row ${rowNum}: section_name is required`); continue; }
        validRows.push({
          rowNum,
          insert: {
            school_id: schoolId,
            first_name: r.first_name,
            last_name: r.last_name,
            age: r.age ? parseInt(String(r.age), 10) : null,
            roll_no: (r.student_id || r.roll_no) ? String(r.student_id || r.roll_no).trim() : null,
            class_id: classId,
            section_id: sectionId,
          },
        });
      }

      // Bulk insert in batches of 100 (avoids individual inserts for large files)
      const BATCH = 100;
      for (let i = 0; i < validRows.length; i += BATCH) {
        const batch = validRows.slice(i, i + BATCH);
        const { error: bulkErr } = await db.from("students").insert(batch.map(r => r.insert));
        if (bulkErr) {
          // Batch failed (e.g. duplicate roll_no) — retry one-by-one to isolate bad rows
          for (const { insert, rowNum } of batch) {
            const { error: rowErr } = await db.from("students").insert(insert);
            if (rowErr) { errors.push(`Row ${rowNum}: ${rowErr.message}`); }
            else { created++; }
          }
        } else {
          created += batch.length;
        }
      }

      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) {
      console.error("[import-export/students/import]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── CLASSES ───────────────────────────────────────────────────

  // ── SUBJECTS ──────────────────────────────────────────────────

  if (path === "/import-export/subjects/template" && method === "GET") {
    const sample = [
      { name: "Mathematics" },
      { name: "English" },
      { name: "Computer Science" },
    ];
    return xlsxResponse(toXlsx(sample, "Subjects"), "subjects_template.xlsx");
  }

  if (path === "/import-export/subjects/export" && method === "GET") {
    try {
      const { data } = await db
        .from("subjects")
        .select("name, created_at")
        .eq("school_id", schoolId)
        .order("name");
      return exportResponse((data || []) as Record<string, unknown>[], "Subjects", "subjects_export.xlsx", url);
    } catch (err) {
      console.error("[import-export/subjects/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/subjects/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);

      const rows = parseUpload(await file.arrayBuffer());
      const errors: string[] = [];
      let created = 0;

      const { data: existing } = await db
        .from("subjects")
        .select("name")
        .eq("school_id", schoolId);
      const existingNames = new Set(
        (existing || []).map((s: Record<string, unknown>) => String(s.name || "").trim().toLowerCase()).filter(Boolean),
      );

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        const nameRaw = String(r.name || "").trim();
        if (!nameRaw) {
          errors.push(`Row ${rowNum}: name is required`);
          continue;
        }

        const key = nameRaw.toLowerCase();
        if (existingNames.has(key)) {
          errors.push(`Row ${rowNum}: subject "${nameRaw}" already exists — skipped`);
          continue;
        }

        await db.from("subjects").insert({ school_id: schoolId, name: nameRaw });
        existingNames.add(key);
        created++;
      }

      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) {
      console.error("[import-export/subjects/import]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/classes/template" && method === "GET") {
    const sample = [
      { class_name: "Grade 1", section_name: "A" },
      { class_name: "Grade 1", section_name: "B" },
      { class_name: "Grade 2", section_name: "A" },
    ];
    return xlsxResponse(toXlsx(sample, "Classes"), "classes_template.xlsx");
  }

  if (path === "/import-export/classes/export" && method === "GET") {
    try {
      const { data: classes } = await db
        .from("classes")
        .select("id, class_name, sections(id, section_name)")
        .eq("school_id", schoolId)
        .order("class_name");

      const rows: Record<string, unknown>[] = [];
      for (const cls of (classes || []) as any[]) {
        for (const sec of (cls.sections || []) as any[]) {
          rows.push({ class_id: cls.id, class_name: cls.class_name, section_id: sec.id, section_name: sec.section_name });
        }
      }
      return exportResponse(rows, "Classes", "classes_export.xlsx", url);
    } catch (err) {
      console.error("[import-export/classes/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/classes/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);

      const rows = parseUpload(await file.arrayBuffer());
      const errors: string[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        if (!r.class_name || !r.section_name) {
          errors.push(`Row ${rowNum}: class_name and section_name are required`);
          continue;
        }

        // Class must already exist — do NOT auto-create
        const { data: cls } = await db
          .from("classes")
          .select("id")
          .eq("class_name", r.class_name)
          .eq("school_id", schoolId)
          .maybeSingle();

        if (!cls) {
          errors.push(`Row ${rowNum}: class "${r.class_name}" not found — create the class first`);
          continue;
        }
        const classId: number = cls.id;

        // Section must not already exist in this class
        const { data: sec } = await db
          .from("sections")
          .select("id")
          .eq("class_id", classId)
          .eq("section_name", r.section_name)
          .maybeSingle();

        if (sec) {
          errors.push(`Row ${rowNum}: ${r.class_name} - ${r.section_name} already exists — skipped`);
          continue;
        }
        await db.from("sections").insert({ class_id: classId, section_name: r.section_name });
        created++;
      }

      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) {
      console.error("[import-export/classes/import]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PARENTS ───────────────────────────────────────────────────

  if (path === "/import-export/parents/template" && method === "GET") {
    const sample = [
      { first_name: "Sara", last_name: "Ali", email: "sara@parent.com", password: "Pass@123", phone: "03001234567", student_roll_no: "" },
      { first_name: "Usman", last_name: "Khan", email: "usman@parent.com", password: "Pass@123", phone: "03009876543", student_roll_no: "Grade1A-01" },
    ];
    return xlsxResponse(toXlsx(sample, "Parents"), "parents_template.xlsx");
  }

  if (path === "/import-export/parents/export" && method === "GET") {
    try {
      const { data: parents } = await db
        .from("parents")
        .select("id, first_name, last_name, email, phone")
        .eq("school_id", schoolId)
        .order("last_name");

      const parentIds = (parents || []).map((p: any) => p.id as number);
      const { data: links } = parentIds.length
        ? await db.from("parent_student").select("parent_id, student_id, students(roll_no)").in("parent_id", parentIds)
        : { data: [] };

      const firstStudentByParent = new Map<number, string>();
      for (const link of (links || []) as any[]) {
        if (!firstStudentByParent.has(link.parent_id) && link.students?.roll_no) {
          firstStudentByParent.set(link.parent_id, link.students.roll_no);
        }
      }

      const rows = (parents || []).map((p: any) => ({
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        email: p.email,
        phone: p.phone || "",
        student_roll_no: firstStudentByParent.get(p.id) || "",
      }));
      return exportResponse(rows as Record<string, unknown>[], "Parents", "parents_export.xlsx", url);
    } catch (err) {
      console.error("[import-export/parents/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  if (path === "/import-export/parents/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return json({ message: "No file uploaded" }, 400);

      const rows = parseUpload(await file.arrayBuffer());
      const errors: string[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        if (!r.email || !r.password) {
          errors.push(`Row ${rowNum}: email and password are required`);
          continue;
        }
        if (r.phone) {
          const phoneErr = validateImportPhone(r.phone, rowNum);
          if (phoneErr) { errors.push(phoneErr); continue; }
        }
        const emailLower = String(r.email).trim().toLowerCase();
        // Check for duplicate email
        const { data: dup } = await db.from("parents").select("id").eq("email", emailLower).maybeSingle();
        if (dup) { errors.push(`Row ${rowNum}: email "${emailLower}" already exists — skipped`); continue; }

        const hashed = await hashPassword(String(r.password));
        const { data: parent, error: insertErr } = await db.from("parents").insert({
          school_id: schoolId,
          email: emailLower,
          password: hashed,
          first_name: r.first_name ? String(r.first_name).trim() : null,
          last_name: r.last_name ? String(r.last_name).trim() : null,
          phone: r.phone ? String(r.phone).trim() : null,
        }).select("id").single();
        if (insertErr) { errors.push(`Row ${rowNum}: ${insertErr.message}`); continue; }

        // Register campus access
        await db.from("parent_school_access")
          .insert({ parent_id: parent.id, school_id: schoolId })
          .then(() => {}).catch(() => {});

        // Optionally link to student by roll_no
        if (r.student_roll_no && String(r.student_roll_no).trim()) {
          const rollNo = String(r.student_roll_no).trim();
          const { data: student } = await db.from("students").select("id")
            .eq("school_id", schoolId).eq("roll_no", rollNo).maybeSingle();
          if (!student) {
            errors.push(`Row ${rowNum}: parent created but student with roll_no "${rollNo}" not found — not linked`);
          } else {
            const { data: existingLink } = await db.from("parent_student").select("id")
              .eq("student_id", student.id).maybeSingle();
            if (existingLink) {
              errors.push(`Row ${rowNum}: parent created but student "${rollNo}" is already linked to another parent`);
            } else {
              await db.from("parent_student").insert({
                parent_id: parent.id, student_id: student.id, relationship: "parent", verified: true,
              }).then(() => {}).catch(() => {});
            }
          }
        }
        created++;
      }

      return json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
    } catch (err) {
      console.error("[import-export/parents/import]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── ATTENDANCE EXPORT ─────────────────────────────────────────

  if (path === "/import-export/attendance/export" && method === "GET") {
    const classId = url.searchParams.get("class_id");
    const sectionId = url.searchParams.get("section_id");
    const studentIdParam = url.searchParams.get("student_id"); // optional — single student
    const dateSingle = url.searchParams.get("date");
    const fromDate = url.searchParams.get("from") || dateSingle || new Date().toISOString().slice(0, 10);
    const toDate = url.searchParams.get("to") || fromDate;

    if (!classId || !sectionId)
      return json({ message: "class_id and section_id are required" }, 400);

    const dates: string[] = [];
    const cur = new Date(fromDate);
    const end = new Date(toDate);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length > 31)
      return json({ message: "Date range cannot exceed 31 days" }, 400);

    try {
      const { data: clsData } = await db
        .from("classes")
        .select("class_name, sections(section_name)")
        .eq("id", classId)
        .eq("school_id", schoolId)
        .single();

      let studentsQuery = db
        .from("students")
        .select("id, roll_no, first_name, last_name")
        .eq("class_id", classId)
        .eq("section_id", sectionId)
        .eq("school_id", schoolId)
        .order("last_name");

      // If filtering by single student, scope the query
      if (studentIdParam) studentsQuery = studentsQuery.eq("id", studentIdParam);

      const { data: students } = await studentsQuery;

      if (!students?.length)
        return json({ message: "No students found for this class/section" }, 404);

      const studentIds = (students as any[]).map((s: any) => s.id);
      const { data: attendance } = await db
        .from("student_attendance")
        .select("student_id, date, status")
        .in("student_id", studentIds)
        .gte("date", fromDate)
        .lte("date", toDate);

      const lookup: Record<number, Record<string, string>> = {};
      for (const a of (attendance || []) as any[]) {
        if (!lookup[a.student_id]) lookup[a.student_id] = {};
        lookup[a.student_id][a.date] = a.status;
      }

      const ABBR: Record<string, string> = { present: "P", absent: "A", leave: "L", not_marked: "–" };
      const clsName = (clsData as any)?.class_name || classId;
      const secName = (clsData as any)?.sections?.[0]?.section_name || sectionId;

      if (dates.length === 1) {
        const d = dates[0];
        const data = (students as any[]).map((s: any) => ({
          "Roll No": s.roll_no || "",
          "First Name": s.first_name,
          "Last Name": s.last_name,
          Status: ABBR[lookup[s.id]?.[d] || "not_marked"] || "–",
          Date: d,
        }));
        return exportResponse(
          data as Record<string, unknown>[],
          "Attendance",
          `attendance_${clsName}_${secName}_${d}.xlsx`,
          url,
        );
      }

      const data = (students as any[]).map((s: any) => {
        const row: Record<string, unknown> = {
          "Roll No": s.roll_no || "",
          "First Name": s.first_name,
          "Last Name": s.last_name,
        };
        let present = 0, absent = 0, leave = 0;
        for (const d of dates) {
          const status = lookup[s.id]?.[d] || "not_marked";
          row[d] = ABBR[status] || "–";
          if (status === "present") present++;
          else if (status === "absent") absent++;
          else if (status === "leave") leave++;
        }
        row["Present"] = present;
        row["Absent"] = absent;
        row["Leave"] = leave;
        return row;
      });

      return exportResponse(
        data as Record<string, unknown>[],
        "Attendance",
        `attendance_${clsName}_${secName}_${fromDate}_to_${toDate}.xlsx`,
        url,
      );
    } catch (err) {
      console.error("[import-export/attendance/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── LEAVE REPORT EXPORT ───────────────────────────────────────

  if (path === "/import-export/leaves/export" && method === "GET") {
    try {
      const status = url.searchParams.get("status");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      let q = db
        .from("leave_applications")
        .select(
          `id, date, reason, status, created_at,
           students!inner(id, first_name, last_name, roll_no, school_id, classes(class_name), sections(section_name))`,
        )
        .order("date", { ascending: false });

      if (status) q = q.eq("status", status);
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);

      const { data } = await q;

      // Filter by school
      const rows = ((data || []) as any[])
        .filter((r: any) => r.students?.school_id === schoolId)
        .map((r: any) => ({
          ID: r.id,
          "First Name": r.students.first_name,
          "Last Name": r.students.last_name,
          "Roll No": r.students.roll_no || "",
          Class: r.students.classes?.class_name || "",
          Section: r.students.sections?.section_name || "",
          Date: r.date,
          Reason: r.reason,
          Status: r.status,
          "Applied On": r.created_at,
        }));

      return exportResponse(rows as Record<string, unknown>[], "Leaves", "leaves_report.xlsx", url);
    } catch (err) {
      console.error("[import-export/leaves/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}
