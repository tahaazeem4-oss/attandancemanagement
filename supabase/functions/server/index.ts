// supabase/functions/server/index.ts — main router
import { CORS } from "./_shared.ts";

import { handleAuth } from "./handlers/auth.ts";
import { handleTeachers } from "./handlers/teachers.ts";
import { handleAttendance } from "./handlers/attendance.ts";
import { handleStudents } from "./handlers/students.ts";
import { handleClasses } from "./handlers/classes.ts";
import { handleAdmin } from "./handlers/admin.ts";
import { handleSuperAdmin } from "./handlers/superAdmin.ts";
import { handleStudentPortal } from "./handlers/studentPortal.ts";
import { handleLectures } from "./handlers/lectures.ts";
import { handleNotifications } from "./handlers/notifications.ts";
import { handleSubjects } from "./handlers/subjects.ts";
import { handlePushToken } from "./handlers/pushToken.ts";
import { handleUpload } from "./handlers/upload.ts";
import { handleImportExport } from "./handlers/importExport.ts";
import { handleSchools } from "./handlers/schools.ts";
import { handleParent, handleAdminParents } from "./handlers/parents.ts";

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);

  // Strip the Supabase gateway prefix — gateway passes /server/<path> to the function
  const path = url.pathname
    .replace(/^\/functions\/v1\/server/, "")
    .replace(/^\/server/, "")
    .replace(/\/$/, "") || "/";

  try {
    // ── Route dispatch ───────────────────────────────────────────
    if (path.startsWith("/auth"))            return await handleAuth(req, path, url);
    if (path.startsWith("/teachers"))        return await handleTeachers(req, path, url);
    if (path.startsWith("/attendance"))      return await handleAttendance(req, path, url);
    if (path.startsWith("/students"))        return await handleStudents(req, path, url);
    if (path.startsWith("/classes") || path.startsWith("/sections"))
                                             return await handleClasses(req, path, url);
    if (path.startsWith("/admin/parents"))   return await handleAdminParents(req, path, url);
    if (path.startsWith("/admin"))           return await handleAdmin(req, path, url);
    if (path.startsWith("/super-admin"))     return await handleSuperAdmin(req, path, url);
    if (path.startsWith("/student-portal")) return await handleStudentPortal(req, path, url);
    if (path.startsWith("/lectures"))        return await handleLectures(req, path, url);
    if (path.startsWith("/notifications"))   return await handleNotifications(req, path, url);
    if (path.startsWith("/subjects"))        return await handleSubjects(req, path, url);
    if (path.startsWith("/push-token"))      return await handlePushToken(req, path, url);
    if (path.startsWith("/upload"))          return await handleUpload(req, path, url);
    if (path.startsWith("/import-export"))   return await handleImportExport(req, path, url);
    if (path.startsWith("/schools"))         return await handleSchools(req, path, url);
    if (path.startsWith("/parent"))          return await handleParent(req, path, url);

    // Health check
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[index] Unhandled error:", err);
    return new Response(JSON.stringify({ message: "Internal server error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
