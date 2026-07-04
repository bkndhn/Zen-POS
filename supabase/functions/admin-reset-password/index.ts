// Admin password reset edge function.
// Callable by super_admin (target: any) or admin (target: sub-user under them).
// Uses service role to update the target user's password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const targetProfileId: string | undefined = body.target_profile_id;
    const newPassword: string | undefined = body.new_password;
    if (!targetProfileId || !newPassword || newPassword.length < 6) {
      return json({ error: "target_profile_id and new_password (min 6 chars) required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Load caller and target profiles
    const { data: caller } = await admin
      .from("profiles").select("id, role, user_id, admin_id")
      .eq("user_id", userData.user.id).maybeSingle();
    if (!caller) return json({ error: "Caller profile missing" }, 403);

    const { data: target } = await admin
      .from("profiles").select("id, role, user_id, admin_id")
      .eq("id", targetProfileId).maybeSingle();
    if (!target) return json({ error: "Target not found" }, 404);

    // Authorization
    const isSuper = caller.role === "super_admin";
    const isAdminOverSub =
      caller.role === "admin" && target.role === "user" && target.admin_id === caller.id;
    const isSelf = caller.user_id === target.user_id;
    if (!isSuper && !isAdminOverSub && !isSelf) {
      return json({ error: "Not authorized to reset this user's password" }, 403);
    }
    // Admins may not reset another admin or super_admin
    if (caller.role === "admin" && target.role !== "user" && !isSelf) {
      return json({ error: "Admins can only reset their sub-users' passwords" }, 403);
    }

    const { error: upErr } = await admin.auth.admin.updateUserById(target.user_id, {
      password: newPassword,
    });
    if (upErr) return json({ error: upErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
