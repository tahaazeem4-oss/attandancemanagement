// _shared.ts — utilities shared by all route handlers
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import * as bcrypt from "npm:bcryptjs";
import { createClient } from "npm:@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-token",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, PATCH, OPTIONS",
};

// ── Response helpers ──────────────────────────────────────────
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function binaryResponse(
  buffer: Uint8Array,
  filename: string,
  mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
): Response {
  return new Response(buffer, {
    headers: {
      ...CORS,
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ── Supabase service client (bypasses RLS) ────────────────────
export function getDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export const SUPABASE_URL = () => Deno.env.get("SUPABASE_URL")!;

// ── JWT ───────────────────────────────────────────────────────
async function getJwtKey(usage: KeyUsage): Promise<CryptoKey> {
  const secret =
    Deno.env.get("SUPABASE_JWT_SECRET") ||
    Deno.env.get("JWT_SECRET") ||
    "fallback_secret";
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signJwt(
  payload: Record<string, unknown>,
): Promise<string> {
  const key = await getJwtKey("sign");
  return await create(
    { alg: "HS256", typ: "JWT" },
    {
      ...payload,
      iat: getNumericDate(0),
      exp: getNumericDate(365 * 24 * 60 * 60),
    },
    key,
  );
}

export async function verifyToken(
  req: Request,
): Promise<Record<string, unknown>> {
  // User JWT is sent in X-User-Token (Authorization always carries the anon key for gateway auth)
  const userTokenRaw =
    req.headers.get("X-User-Token") || req.headers.get("x-user-token");
  if (userTokenRaw) {
    // Strip "Bearer " prefix if present — the header value may be "Bearer <jwt>" or raw "<jwt>"
    const userToken = userTokenRaw.startsWith("Bearer ")
      ? userTokenRaw.slice(7)
      : userTokenRaw;
    const key = await getJwtKey("verify");
    return (await verify(userToken, key)) as Record<string, unknown>;
  }
  // Fallback: check Authorization for backwards compatibility
  const auth =
    req.headers.get("Authorization") || req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice(7);
  const key = await getJwtKey("verify");
  return (await verify(token, key)) as Record<string, unknown>;
}

export async function verifyTokenString(
  token: string,
): Promise<Record<string, unknown>> {
  const key = await getJwtKey("verify");
  return (await verify(token, key)) as Record<string, unknown>;
}

// ── Password utilities ────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// ── Push notifications (Expo) ─────────────────────────────────
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!tokens.length) {
    console.log("[sendPush] No tokens to send to — skipping");
    return;
  }
  console.log(`[sendPush] Sending "${title}" to ${tokens.length} token(s):`, tokens);
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title,
          body,
          data,
          sound: "default",
          channelId: "default",
          priority: "high",
        })),
      ),
    });
    const json = await res.json().catch(() => null);
    console.log(`[sendPush] Expo response (${res.status}):`, JSON.stringify(json));
  } catch (err) {
    console.error("[sendPush] fetch error:", err);
  }
}

// Push token helpers that query the DB
export async function tokensForStudents(
  db: ReturnType<typeof getDb>,
  studentIds: number[],
): Promise<string[]> {
  if (!studentIds.length) return [];
  const { data } = await db
    .from("push_tokens")
    .select("token")
    .eq("user_role", "student")
    .in("user_id", studentIds);
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

export async function tokensForSchoolAdmins(
  db: ReturnType<typeof getDb>,
  schoolId: number,
): Promise<string[]> {
  const { data } = await db
    .from("push_tokens")
    .select("token, admins!inner(school_id)")
    .eq("user_role", "admin")
    .eq("admins.school_id", schoolId);
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

export async function tokensForClassTeachers(
  db: ReturnType<typeof getDb>,
  classId: number,
  sectionId: number | null,
): Promise<string[]> {
  let q = db
    .from("push_tokens")
    .select("token, teacher_classes!inner(class_id, section_id)")
    .eq("user_role", "teacher")
    .eq("teacher_classes.class_id", classId);
  if (sectionId) q = q.eq("teacher_classes.section_id", sectionId);
  const { data } = await q;
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

export async function tokensForClassStudents(
  db: ReturnType<typeof getDb>,
  schoolId: number,
  classId: number,
  sectionId: number | null,
): Promise<string[]> {
  let q = db
    .from("push_tokens")
    .select("token, students!inner(school_id, class_id, section_id)")
    .eq("user_role", "student")
    .eq("students.school_id", schoolId)
    .eq("students.class_id", classId);
  if (sectionId) q = q.eq("students.section_id", sectionId);
  const { data } = await q;
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

export async function tokensForSchoolStudents(
  db: ReturnType<typeof getDb>,
  schoolId: number,
): Promise<string[]> {
  const { data } = await db
    .from("push_tokens")
    .select("token, students!inner(school_id)")
    .eq("user_role", "student")
    .eq("students.school_id", schoolId);
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

export async function tokensForSchoolTeachers(
  db: ReturnType<typeof getDb>,
  schoolId: number,
): Promise<string[]> {
  const { data } = await db
    .from("push_tokens")
    .select("token, teachers!inner(school_id)")
    .eq("user_role", "teacher")
    .eq("teachers.school_id", schoolId);
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

// Returns push tokens for all parents linked to the given student IDs.
export async function tokensForParents(
  db: ReturnType<typeof getDb>,
  studentIds: number[],
): Promise<string[]> {
  if (!studentIds.length) return [];
  const { data: ps } = await db
    .from("parent_student")
    .select("parent_id")
    .in("student_id", studentIds);
  const parentIds = [...new Set((ps || []).map((r: { parent_id: number }) => r.parent_id))];
  if (!parentIds.length) return [];
  const { data } = await db
    .from("push_tokens")
    .select("token")
    .eq("user_role", "parent")
    .in("user_id", parentIds);
  return (data || []).map((r: { token: string }) => r.token).filter(Boolean);
}

// Push a student and their parent(s) at once — used for leave-decision events
// (approve/reject/withdraw) so both audiences stay in sync with each other,
// matching the attendance and lecture notification flows.
export async function notifyStudentAndParents(
  db: ReturnType<typeof getDb>,
  studentId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const [studentTokens, parentTokens] = await Promise.all([
    tokensForStudents(db, [studentId]),
    tokensForParents(db, [studentId]),
  ]);
  await sendPush([...new Set([...studentTokens, ...parentTokens])], title, body, data);
}

// Returns push tokens for parents of all students in a given class (and optionally section).
export async function tokensForClassParents(
  db: ReturnType<typeof getDb>,
  schoolId: number,
  classId: number,
  sectionId: number | null,
): Promise<string[]> {
  let q = db.from("students").select("id").eq("school_id", schoolId).eq("class_id", classId);
  if (sectionId) q = q.eq("section_id", sectionId);
  const { data: students } = await q;
  const studentIds = (students || []).map((s: { id: number }) => s.id);
  return tokensForParents(db, studentIds);
}

// Returns push tokens for all parents in an entire school.
export async function tokensForSchoolParents(
  db: ReturnType<typeof getDb>,
  schoolId: number,
): Promise<string[]> {
  const { data: students } = await db.from("students").select("id").eq("school_id", schoolId);
  const studentIds = (students || []).map((s: { id: number }) => s.id);
  return tokensForParents(db, studentIds);
}

export type TeacherRole = "class_teacher" | "floor_incharge" | "subject_teacher";

export async function resolveTeacherRole(
  db: ReturnType<typeof getDb>,
  teacherId: number,
): Promise<TeacherRole> {
  const { data: teacher } = await db
    .from("teachers")
    .select("teacher_role")
    .eq("id", teacherId)
    .maybeSingle();

  const explicitRole = (teacher as { teacher_role?: string } | null)?.teacher_role;
  if (explicitRole === "class_teacher" || explicitRole === "floor_incharge" || explicitRole === "subject_teacher") {
    return explicitRole;
  }

  // Backward-compatible fallback for older rows without teacher_role.
  const { count } = await db
    .from("teacher_classes")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacherId);

  const n = Number(count || 0);
  if (n === 0) return "subject_teacher";
  if (n === 1) return "class_teacher";
  return "floor_incharge";
}

// ── Email (SMTP via nodemailer) ───────────────────────────────
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  // Uses nodemailer via npm specifier. Requires SMTP_* env vars.
  try {
    // deno-lint-ignore no-explicit-any
    const nodemailer = (await import("npm:nodemailer")) as any;
    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: parseInt(Deno.env.get("SMTP_PORT") || "587"),
      secure: Deno.env.get("SMTP_SECURE") === "true",
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Attendance Management";
    const fromEmail =
      Deno.env.get("SMTP_FROM_EMAIL") || Deno.env.get("SMTP_USER");
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      ...opts,
    });
  } catch (err) {
    console.error("[Email] Failed:", err);
  }
}

// ── Misc helpers ──────────────────────────────────────────────
export function randomCode(length = 6): string {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, "0");
}
