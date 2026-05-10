// _shared.ts — utilities shared by all route handlers
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import * as bcrypt from "npm:bcryptjs";
import { createClient } from "npm:@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  if (!tokens.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title, body, data, sound: "default" })),
      ),
    });
  } catch {
    // Never fail the main request because push failed
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
