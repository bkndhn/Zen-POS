// TEMPORARY: creates (or deletes) 3 isolated demo shops with one login per role.
// Super Admin only. Never touches existing clients — only *@zenpos.test emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Random per-run password: demo logins are never usable from public code.
const PASSWORD = crypto.randomUUID() + crypto.randomUUID();
const SHOPS = [
  { key: "bistro", name: "Demo Zen Bistro" },
  { key: "spice", name: "Demo Royal Spice" },
  { key: "coffee", name: "Demo Coffee Club" },
];
const ROLES: Record<string, string[]> = {
  manager: ["dashboard", "billing", "items", "expenses", "reports", "tables", "customers", "stock", "kitchen", "serviceArea", "onlineOrders", "waiterCompanion", "tableBilling"],
  cashier: ["billing", "calci_billing", "customers", "tables", "tableBilling"],
  waiter: ["waiterCompanion", "tables", "tableBilling"],
  kitchen: ["kitchen", "serviceArea"],
};
const ALL_PAGES = ["dashboard", "billing", "items", "expenses", "reports", "analytics", "settings", "users", "serviceArea", "kitchen", "customerDisplay", "tables", "customers", "qrMenu", "tableBilling", "suppliers", "purchases", "stock", "waiterCompanion", "bottomNavCustomize", "calci_billing", "onlineOrders"];
const email = (s: string, r: string) => `demo.${s}.${r}@zenpos.test`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Not authenticated" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: caller } = await admin.from("profiles").select("role").eq("user_id", u.user.id).maybeSingle();
    if (caller?.role !== "super_admin") return json({ error: "Super Admin only" }, 403);

    const { action = "create" } = await req.json().catch(() => ({}));

    // Look up existing demo users
    const existing = new Map<string, string>();
    for (let page = 1; page < 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      for (const x of data?.users ?? []) if (x.email?.endsWith("@zenpos.test")) existing.set(x.email, x.id);
      if (!data || data.users.length < 200) break;
    }

    if (action === "delete") {
      for (const id of existing.values()) await admin.auth.admin.deleteUser(id);
      return json({ ok: true, deleted: existing.size });
    }

    const ensure = async (em: string, meta: Record<string, unknown>) => {
      let id = existing.get(em);
      if (id) {
        await admin.auth.admin.updateUserById(id, { password: PASSWORD });
      } else {
        const { data, error } = await admin.auth.admin.createUser({ email: em, password: PASSWORD, email_confirm: true, user_metadata: meta });
        if (error) throw new Error(`${em}: ${error.message}`);
        id = data.user.id;
      }
      for (let i = 0; i < 10; i++) {
        const { data: p } = await admin.from("profiles").select("id").eq("user_id", id).maybeSingle();
        if (p) return p.id as string;
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(`${em}: profile not created`);
    };

    let created = 0;
    for (const s of SHOPS) {
      const adminProfileId = await ensure(email(s.key, "admin"), {
        name: `${s.name} Owner`, role: "admin", hotel_name: s.name, shop_name: s.name, business_type: "restaurant",
      });
      await admin.from("profiles").update({ status: "active", max_sub_users: 10 }).eq("id", adminProfileId);
      created++;
      for (const [role, pages] of Object.entries(ROLES)) {
        const pid = await ensure(email(s.key, role), {
          name: `${s.name} ${role[0].toUpperCase()}${role.slice(1)}`, role: "user", admin_id: adminProfileId,
        });
        await admin.from("user_permissions").upsert(
          ALL_PAGES.map((page_name) => ({ user_id: pid, page_name, has_access: pages.includes(page_name) })),
          { onConflict: "user_id,page_name" },
        );
        created++;
      }
    }
    return json({ ok: true, accounts: created });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
