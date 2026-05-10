// handlers/importExport.ts — Excel import/export using npm:xlsx
import { json, getDb, verifyToken, hashPassword } from "../_shared.ts";
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

function parseUpload(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
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

  if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "teacher")
    return json({ message: "Forbidden" }, 403);

  // Attendance export is open to teachers; all other import/export routes require admin+
  const isAdminOnly = !path.startsWith("/import-export/attendance");
  if (isAdminOnly && user.role === "teacher")
    return json({ message: "Forbidden" }, 403);

  const db = getDb();
  const schoolId = user.school_id as number;

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
      return xlsxResponse(toXlsx(data || [], "Teachers"), "teachers_export.xlsx");
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
        const email = String(r.email).trim().toLowerCase();
        const { data: ex } = await db.from("teachers").select("id").eq("email", email).maybeSingle();
        if (ex) {
          errors.push(`Row ${rowNum}: email "${email}" already exists — skipped`);
          continue;
        }
        const hashed = await hashPassword(String(r.password));
        await db.from("teachers").insert({
          school_id: schoolId,
          first_name: r.first_name,
          last_name: r.last_name,
          email,
          password: hashed,
          phone: r.phone || null,
        });
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
            roll_no: `${cls.class_name}${sec.section_name}-01`,
            class_id: cls.id,
            section_id: sec.id,
            class_name: cls.class_name,
            section_name: sec.section_name,
          });
          if (rows.length >= 2) break;
        }
        if (rows.length >= 2) break;
      }

      if (!rows.length)
        rows.push({ first_name: "", last_name: "", age: "", roll_no: "", class_id: "", section_id: "" });

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
        roll_no: s.roll_no || "",
        class_name: s.classes?.class_name,
        section_name: s.sections?.section_name,
        class_id: s.class_id,
        section_id: s.section_id,
      }));
      return xlsxResponse(toXlsx(rows, "Students"), "students_export.xlsx");
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

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        if (!r.first_name || !r.last_name || !r.class_id || !r.section_id) {
          errors.push(`Row ${rowNum}: first_name, last_name, class_id, section_id are required`);
          continue;
        }
        const { data: cls } = await db
          .from("classes")
          .select("id")
          .eq("id", r.class_id)
          .eq("school_id", schoolId)
          .maybeSingle();
        if (!cls) {
          errors.push(`Row ${rowNum}: class_id ${r.class_id} not found`);
          continue;
        }
        await db.from("students").insert({
          school_id: schoolId,
          first_name: r.first_name,
          last_name: r.last_name,
          age: r.age || null,
          roll_no: r.roll_no || null,
          class_id: r.class_id,
          section_id: r.section_id,
        });
        created++;
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
      return xlsxResponse(toXlsx(data || [], "Subjects"), "subjects_export.xlsx");
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
      return xlsxResponse(toXlsx(rows, "Classes"), "classes_export.xlsx");
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

        // Find or create class
        let { data: cls } = await db
          .from("classes")
          .select("id")
          .eq("class_name", r.class_name)
          .eq("school_id", schoolId)
          .maybeSingle();

        let classId: number;
        if (!cls) {
          const { data: newCls } = await db
            .from("classes")
            .insert({ school_id: schoolId, class_name: r.class_name })
            .select("id")
            .single();
          classId = newCls!.id;
        } else {
          classId = cls.id;
        }

        // Find or create section
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
        return xlsxResponse(toXlsx(data, "Attendance"), `attendance_${clsName}_${secName}_${d}.xlsx`);
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

      return xlsxResponse(
        toXlsx(data, "Attendance"),
        `attendance_${clsName}_${secName}_${fromDate}_to_${toDate}.xlsx`,
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

      return xlsxResponse(toXlsx(rows, "Leaves"), "leaves_report.xlsx");
    } catch (err) {
      console.error("[import-export/leaves/export]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  return json({ message: "Not found" }, 404);
}
