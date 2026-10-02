import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CreateTenantBody = {
  tenant_name: string;
  tenant_code?: string;
  admin_email: string;
  admin_password: string;
};

const OWNER_EMAIL = "octo.inteligenciaimobiliaria@gmail.com";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Connection": "keep-alive" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...corsHeaders } });
    }
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ ok: false, error: "Missing env vars" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "Missing bearer token" }, 401);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: callerData, error: callerError } = await anonClient.auth.getUser();
    if (callerError || !callerData.user) {
      return json({ ok: false, error: `Unauthorized: ${callerError?.message || 'no user'}` }, 401);
    }

    const callerEmail = (callerData.user.email || "").toLowerCase();
    if (callerEmail !== OWNER_EMAIL.toLowerCase()) {
      return json({ ok: false, error: `Forbidden: ${callerEmail} is not owner` }, 403);
    }

    const body = (await req.json()) as CreateTenantBody;
    const tenantName = (body.tenant_name || "").trim();
    const tenantCode = (body.tenant_code || "").trim().toUpperCase();
    const adminEmail = (body.admin_email || "").trim().toLowerCase();
    const adminPassword = body.admin_password || "";

    if (!tenantName) return json({ ok: false, error: "tenant_name is required" }, 400);
    if (!adminEmail) return json({ ok: false, error: "admin_email is required" }, 400);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // A regra da senha mora só no banco (kit de segurança, problema_da_senha):
    // a mesma que vale para membro novo, troca pelo admin e troca da própria.
    const { data: problemaDaSenha, error: regraError } = await adminClient.rpc("problema_da_senha", {
      p_senha: adminPassword,
      p_email: adminEmail,
    });
    if (regraError) {
      return json({ ok: false, error: `Password check failed: ${regraError.message}` }, 500);
    }
    if (problemaDaSenha) return json({ ok: false, error: problemaDaSenha }, 400);

    const finalCode = tenantCode || crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

    const { data: insertedTenant, error: tenantError } = await adminClient
      .from("tenants")
      .insert({ name: tenantName, code: finalCode })
      .select("id, code, name, created_at")
      .single();

    if (tenantError) {
      return json({ ok: false, error: `Tenant creation failed: ${tenantError.message}` }, 400);
    }

    let adminUserId: string | null = null;
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === adminEmail);

    if (existingUser) {
      adminUserId = existingUser.id;
    } else {
      const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });

      if (createUserError || !createdUser.user) {
        await adminClient.from("tenants").delete().eq("id", insertedTenant.id);
        return json({ ok: false, error: `Admin user creation failed: ${createUserError?.message || 'unknown'}` }, 400);
      }
      adminUserId = createdUser.user.id;
    }

    const { error: membershipError } = await adminClient
      .from("tenant_memberships")
      .insert({ tenant_id: insertedTenant.id, user_id: adminUserId, role: "admin" });

    if (membershipError) {
      return json({ ok: false, error: `Membership creation failed: ${membershipError.message}` }, 400);
    }

    return json({
      ok: true,
      tenant: insertedTenant,
      admin_user_id: adminUserId,
      admin_email: adminEmail,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
