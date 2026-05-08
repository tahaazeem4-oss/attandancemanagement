// handlers/auth.ts — login, signup, forgot-password, change-password
import {
  json,
  getDb,
  signJwt,
  comparePassword,
  hashPassword,
  verifyToken,
  sendEmail,
  randomCode,
} from "../_shared.ts";

async function getSchool(
  db: ReturnType<typeof getDb>,
  schoolId: number | null,
) {
  if (!schoolId) return null;
  const { data } = await db
    .from("schools")
    .select(
      "id, name, tagline, initials, logo_url, primary_color, accent_color",
    )
    .eq("id", schoolId)
    .single();
  if (!data) return null;
  // Ensure logo_url is always a full public URL
  if (data.logo_url && !String(data.logo_url).startsWith("http")) {
    data.logo_url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/logos/${data.logo_url}`;
  }
  return data;
}

export async function handleAuth(
  req: Request,
  path: string,
  url: URL,
): Promise<Response> {
  const method = req.method;
  const db = getDb();

  // ── POST /auth/login ─────────────────────────────────────────
  if (path === "/auth/login" && method === "POST") {
    try {
      const { email, password } = await req.json();
      if (!email || !password)
        return json({ message: "Email and password are required" }, 400);

      const e = email.trim().toLowerCase();

      // 1. Super Admin
      const { data: superAdmins } = await db
        .from("super_admins")
        .select("*")
        .eq("email", e);
      if (superAdmins?.length) {
        const sa = superAdmins[0];
        if (!(await comparePassword(password, sa.password)))
          return json({ message: "Invalid credentials" }, 401);
        const user = {
          id: sa.id,
          first_name: sa.first_name,
          last_name: sa.last_name,
          email: sa.email,
          role: "super_admin",
        };
        const token = await signJwt(user);
        return json({ token, role: "super_admin", user, school: null });
      }

      // 2. Admin
      const { data: admins } = await db
        .from("admins")
        .select("*")
        .eq("email", e);
      if (admins?.length) {
        const admin = admins[0];
        if (!(await comparePassword(password, admin.password)))
          return json({ message: "Invalid credentials" }, 401);
        const school = await getSchool(db, admin.school_id);
        const user = {
          id: admin.id,
          first_name: admin.first_name,
          last_name: admin.last_name,
          email: admin.email,
          role: "admin",
          school_id: admin.school_id,
        };
        const token = await signJwt(user);
        return json({ token, role: "admin", user, school });
      }

      // 3. Teacher
      const { data: teachers } = await db
        .from("teachers")
        .select("*")
        .eq("email", e);
      if (teachers?.length) {
        const t = teachers[0];
        if (!(await comparePassword(password, t.password)))
          return json({ message: "Invalid credentials" }, 401);
        const school = await getSchool(db, t.school_id);
        const user = {
          id: t.id,
          first_name: t.first_name,
          last_name: t.last_name,
          email: t.email,
          phone: t.phone,
          role: "teacher",
          school_id: t.school_id,
        };
        const token = await signJwt(user);
        return json({ token, role: "teacher", user, school, teacher: user });
      }

      // 4. Student account
      const { data: accs } = await db
        .from("student_accounts")
        .select(
          `id, student_id, email, password, phone,
           students!inner(first_name, last_name, class_id, section_id, roll_no, school_id,
             classes!inner(class_name),
             sections!inner(section_name)
           )`,
        )
        .eq("email", e);
      if (accs?.length) {
        const a = accs[0];
        const s = a.students;
        if (!(await comparePassword(password, a.password)))
          return json({ message: "Invalid credentials" }, 401);
        const school = await getSchool(db, s.school_id);
        const user = {
          id: a.id,
          student_id: a.student_id,
          first_name: s.first_name,
          last_name: s.last_name,
          email: a.email,
          phone: a.phone,
          role: "student",
          school_id: s.school_id,
          class_id: s.class_id,
          section_id: s.section_id,
          roll_no: s.roll_no,
          class_name: s.classes.class_name,
          section_name: s.sections.section_name,
        };
        const token = await signJwt(user);
        return json({ token, role: "student", user, school });
      }

      return json({ message: "Invalid credentials" }, 401);
    } catch (err) {
      console.error("[auth/login]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /auth/signup ────────────────────────────────────────
  if (path === "/auth/signup" && method === "POST") {
    try {
      const payload = await req.json();
      const { role } = payload;

      if (role === "teacher") {
        const { first_name, last_name, email, password, phone, school_id } =
          payload;
        if (!first_name || !last_name || !email || !password || !school_id)
          return json({ message: "Missing required fields" }, 400);

        const hashed = await hashPassword(password);
        const { data: inserted, error } = await db
          .from("teachers")
          .insert({
            school_id,
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            email: email.trim().toLowerCase(),
            password: hashed,
            phone: phone || null,
          })
          .select()
          .single();

        if (error) {
          if (error.code === "23505")
            return json({ message: "Email already registered" }, 409);
          throw error;
        }
        const school = await getSchool(db, school_id);
        const user = {
          id: inserted.id,
          first_name: inserted.first_name,
          last_name: inserted.last_name,
          email: inserted.email,
          phone: inserted.phone,
          role: "teacher",
          school_id,
        };
        const token = await signJwt(user);
        return json({ token, role: "teacher", user, school });
      }

      if (role === "student") {
        const { roll_no, email, password, phone } = payload;
        if (!roll_no || !email || !password)
          return json({ message: "roll_no, email and password are required" }, 400);

        const { data: students } = await db
          .from("students")
          .select("id, school_id, class_id, section_id")
          .eq("roll_no", roll_no);
        if (!students?.length)
          return json({ message: "No student found with that roll number" }, 404);
        const student = students[0];

        const { data: existing } = await db
          .from("student_accounts")
          .select("id")
          .eq("student_id", student.id);
        if (existing?.length)
          return json({ message: "Account already exists for this student" }, 409);

        const hashed = await hashPassword(password);
        const { data: acc, error } = await db
          .from("student_accounts")
          .insert({
            student_id: student.id,
            email: email.trim().toLowerCase(),
            password: hashed,
            phone: phone || null,
          })
          .select()
          .single();

        if (error) {
          if (error.code === "23505")
            return json({ message: "Email already registered" }, 409);
          throw error;
        }

        const { data: fullStudent } = await db
          .from("students")
          .select(
            `first_name, last_name, class_id, section_id, roll_no, school_id,
             classes!inner(class_name), sections!inner(section_name)`,
          )
          .eq("id", student.id)
          .single();

        const school = await getSchool(db, student.school_id);
        const user = {
          id: acc.id,
          student_id: student.id,
          first_name: fullStudent.first_name,
          last_name: fullStudent.last_name,
          email: acc.email,
          phone: acc.phone,
          role: "student",
          school_id: student.school_id,
          class_id: student.class_id,
          section_id: student.section_id,
          roll_no: fullStudent.roll_no,
          class_name: fullStudent.classes.class_name,
          section_name: fullStudent.sections.section_name,
        };
        const token = await signJwt(user);
        return json({ token, role: "student", user, school });
      }

      return json({ message: "Invalid role" }, 400);
    } catch (err) {
      console.error("[auth/signup]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── GET /auth/me ─────────────────────────────────────────────
  if (path === "/auth/me" && method === "GET") {
    try {
      const user = await verifyToken(req);
      return json({ user });
    } catch {
      return json({ message: "Unauthorized" }, 401);
    }
  }

  // ── POST /auth/forgot-password/request ───────────────────────
  if (path === "/auth/forgot-password/request" && method === "POST") {
    try {
      const { email } = await req.json();
      if (!email) return json({ message: "Email is required" }, 400);
      const e = email.trim().toLowerCase();

      // Find user in any table
      let found = false;
      for (const table of [
        "super_admins",
        "admins",
        "teachers",
        "student_accounts",
      ]) {
        const { data } = await db.from(table).select("id").eq("email", e);
        if (data?.length) { found = true; break; }
      }

      if (!found) {
        // Don't reveal if user exists
        return json({ message: "If that email exists, a code has been sent" });
      }

      const code = randomCode(6);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await db.from("password_reset_codes").upsert(
        { email: e, code, expires_at: expiresAt, used: false },
        { onConflict: "email" },
      );

      await sendEmail({
        to: e,
        subject: "Password Reset Code",
        html: `<p>Your password reset code is: <strong>${code}</strong></p><p>Expires in 15 minutes.</p>`,
        text: `Your password reset code is: ${code}. Expires in 15 minutes.`,
      });

      return json({ message: "If that email exists, a code has been sent" });
    } catch (err) {
      console.error("[auth/forgot-password/request]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /auth/forgot-password/verify ────────────────────────
  if (path === "/auth/forgot-password/verify" && method === "POST") {
    try {
      const { email, code } = await req.json();
      if (!email || !code)
        return json({ message: "email and code are required" }, 400);

      const { data: rows } = await db
        .from("password_reset_codes")
        .select("*")
        .eq("email", email.trim().toLowerCase())
        .eq("code", code)
        .eq("used", false);

      if (!rows?.length)
        return json({ message: "Invalid or expired code" }, 400);
      const row = rows[0];
      if (new Date(row.expires_at) < new Date())
        return json({ message: "Code has expired" }, 400);

      const reset_token = await signJwt({
        email: row.email,
        purpose: "password_reset",
        exp_ts: Date.now() + 15 * 60 * 1000,
      });

      return json({ reset_token });
    } catch (err) {
      console.error("[auth/forgot-password/verify]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── POST /auth/forgot-password/reset ─────────────────────────
  if (path === "/auth/forgot-password/reset" && method === "POST") {
    try {
      const { reset_token, new_password } = await req.json();
      if (!reset_token || !new_password)
        return json({ message: "reset_token and new_password are required" }, 400);

      let payload: Record<string, unknown>;
      try {
        payload = await verifyToken(
          new Request("", {
            headers: { Authorization: `Bearer ${reset_token}` },
          }),
        );
      } catch {
        return json({ message: "Invalid or expired reset token" }, 400);
      }

      if (payload.purpose !== "password_reset")
        return json({ message: "Invalid token" }, 400);

      const email = payload.email as string;
      const hashed = await hashPassword(new_password);

      for (const table of [
        "super_admins",
        "admins",
        "teachers",
        "student_accounts",
      ]) {
        const { data } = await db.from(table).select("id").eq("email", email);
        if (data?.length) {
          await db
            .from(table)
            .update({ password: hashed })
            .eq("email", email);
          break;
        }
      }

      await db
        .from("password_reset_codes")
        .update({ used: true })
        .eq("email", email);

      return json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("[auth/forgot-password/reset]", err);
      return json({ message: "Server error" }, 500);
    }
  }

  // ── PUT /auth/change-password ────────────────────────────────
  if (path === "/auth/change-password" && method === "PUT") {
    try {
      const user = await verifyToken(req);
      const { old_password, new_password } = await req.json();
      if (!old_password || !new_password)
        return json({ message: "old_password and new_password are required" }, 400);

      const { role, id, email } = user as {
        role: string;
        id: number;
        email: string;
      };
      const tableMap: Record<string, string> = {
        super_admin: "super_admins",
        admin: "admins",
        teacher: "teachers",
        student: "student_accounts",
      };
      const table = tableMap[role];
      if (!table) return json({ message: "Invalid role" }, 400);

      const { data: rows } = await db
        .from(table)
        .select("password")
        .eq("id", id);
      if (!rows?.length) return json({ message: "User not found" }, 404);
      if (!(await comparePassword(old_password, rows[0].password)))
        return json({ message: "Incorrect current password" }, 401);

      const hashed = await hashPassword(new_password);
      await db.from(table).update({ password: hashed }).eq("id", id);
      return json({ message: "Password changed successfully" });
    } catch {
      return json({ message: "Unauthorized" }, 401);
    }
  }

  return json({ message: "Not found" }, 404);
}
