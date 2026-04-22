import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CorretorInput {
  nome: string;
  email?: string;
  telefone?: string;
  foto?: string;
  codigosImoveis?: string[]; // Códigos dos imóveis que o corretor é responsável
}

interface RequestBody {
  tenantId: string;
  corretores: CorretorInput[];
}

interface ResultItem {
  nome: string;
  email?: string;
  status: "created" | "exists" | "skipped" | "error";
  reason?: string;
  broker_id?: string;
  auth_user_id?: string;
  properties_assigned?: number; // Quantidade de imóveis atribuídos
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight - MUST return 200 for OPTIONS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: RequestBody = await req.json();
    const { tenantId, corretores } = body;

    if (!tenantId || !Array.isArray(corretores) || corretores.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "tenantId e corretores são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ ok: false, error: `Tenant não encontrado: ${tenantId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing brokers for this tenant
    const { data: existingBrokers } = await supabase
      .from("tenant_brokers")
      .select("id, name, email, phone")
      .eq("tenant_id", tenantId);

    const existingEmails = new Set(
      (existingBrokers || [])
        .filter((b: any) => b.email)
        .map((b: any) => b.email!.toLowerCase().trim())
    );
    const existingNames = new Set(
      (existingBrokers || [])
        .filter((b: any) => b.name)
        .map((b: any) => b.name.toLowerCase().trim())
    );

    const results: ResultItem[] = [];
    const summary = { created: 0, exists: 0, skipped: 0, error: 0 };

    for (const corretor of corretores) {
      const nome = (corretor.nome || "").trim();
      const email = (corretor.email || "").trim().toLowerCase();
      const telefone = (corretor.telefone || "").replace(/\D/g, "");
      const foto = (corretor.foto || "").trim();

      // Skip if no name
      if (!nome) {
        results.push({ nome: "(sem nome)", status: "skipped", reason: "Nome não informado" });
        summary.skipped++;
        continue;
      }

      // Check if already exists by email or name
      const emailExists = email && existingEmails.has(email);
      const nameExists = existingNames.has(nome.toLowerCase());

      if (emailExists || nameExists) {
        // Broker already exists - but we should still assign their properties from XML
        let propertiesAssigned = 0;
        const codigosImoveis = corretor.codigosImoveis || [];
        
        // Find the existing broker to get their ID
        const existingBroker = (existingBrokers || []).find((b: any) => 
          (email && b.email?.toLowerCase() === email) || 
          (b.name?.toLowerCase() === nome.toLowerCase())
        );
        
        const brokerId = existingBroker?.auth_user_id || existingBroker?.id;
        
        if (codigosImoveis.length > 0 && brokerId) {
          for (const codigoImovel of codigosImoveis) {
            const codigo = (codigoImovel || "").trim().toUpperCase();
            if (!codigo) continue;

            // Check if property is already assigned
            const { data: existingAssign } = await supabase
              .from("imoveis_corretores")
              .select("id, corretor_id")
              .eq("tenant_id", tenantId)
              .eq("codigo_imovel", codigo)
              .maybeSingle();

            if (existingAssign) {
              // Only update if assigned to same broker or not assigned
              if (!existingAssign.corretor_id || existingAssign.corretor_id === brokerId) {
                await supabase
                  .from("imoveis_corretores")
                  .update({
                    corretor_id: brokerId,
                    corretor_nome: nome,
                    corretor_telefone: telefone || null,
                    corretor_email: email || null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingAssign.id);
                propertiesAssigned++;
              }
            } else {
              // Create new assignment
              const { error: assignError } = await supabase
                .from("imoveis_corretores")
                .insert({
                  tenant_id: tenantId,
                  codigo_imovel: codigo,
                  corretor_id: brokerId,
                  corretor_nome: nome,
                  corretor_telefone: telefone || null,
                  corretor_email: email || null,
                });

              if (!assignError) {
                propertiesAssigned++;
              }
            }
          }
          
          console.log(`📦 ${nome} (exists): ${propertiesAssigned}/${codigosImoveis.length} properties assigned`);
        }

        results.push({
          nome,
          email: email || undefined,
          status: "exists",
          reason: emailExists ? "Email já cadastrado" : "Nome já cadastrado",
          properties_assigned: propertiesAssigned,
        });
        summary.exists++;
        continue;
      }

      try {
        // Generate password from last 4 digits of phone, or default
        const password = telefone.length >= 4 ? telefone.slice(-4) : "0000";

        let authUserId: string | undefined;

        // Only create auth user if email is provided
        if (email) {
          // Try to create auth user
          const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              name: nome,
              phone: telefone,
              tenant_id: tenantId,
              role: "corretor",
            },
          });

          if (authError) {
            // User might already exist in auth, try to get them
            if (authError.message?.includes("already been registered")) {
              const { data: existingUsers } = await supabase.auth.admin.listUsers();
              const existingUser = existingUsers?.users?.find(
                (u: any) => u.email?.toLowerCase() === email
              );
              if (existingUser) {
                authUserId = existingUser.id;
              }
            } else {
              console.error(`Auth error for ${email}:`, authError.message);
            }
          } else if (authUser?.user) {
            authUserId = authUser.user.id;
          }
        }

        // Create broker in tenant_brokers table
        const { data: newBroker, error: brokerError } = await supabase
          .from("tenant_brokers")
          .insert({
            tenant_id: tenantId,
            name: nome,
            email: email || null,
            phone: telefone || null,
            photo_url: foto || null,
            source: "xml",
            auth_user_id: authUserId || null,
            status: "active",
          })
          .select("id")
          .single();

        if (brokerError) {
          console.error(`Broker insert error for ${nome}:`, brokerError.message);
          results.push({
            nome,
            email: email || undefined,
            status: "error",
            reason: brokerError.message,
          });
          summary.error++;
          continue;
        }

        // If auth user created, create tenant_membership
        if (authUserId) {
          await supabase.from("tenant_memberships").upsert(
            {
              tenant_id: tenantId,
              user_id: authUserId,
              role: "corretor",
            },
            { onConflict: "tenant_id,user_id" }
          );
        }

        // Create imoveis_corretores entries for each property code from XML
        let propertiesAssigned = 0;
        const codigosImoveis = corretor.codigosImoveis || [];
        
        if (codigosImoveis.length > 0 && (authUserId || newBroker?.id)) {
          for (const codigoImovel of codigosImoveis) {
            const codigo = (codigoImovel || "").trim().toUpperCase();
            if (!codigo) continue;

            // Check if property is already assigned
            const { data: existingAssign } = await supabase
              .from("imoveis_corretores")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("codigo_imovel", codigo)
              .maybeSingle();

            if (existingAssign) {
              // Update existing assignment to this broker
              await supabase
                .from("imoveis_corretores")
                .update({
                  corretor_id: authUserId || newBroker?.id,
                  corretor_nome: nome,
                  corretor_telefone: telefone || null,
                  corretor_email: email || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingAssign.id);
              propertiesAssigned++;
            } else {
              // Create new assignment
              const { error: assignError } = await supabase
                .from("imoveis_corretores")
                .insert({
                  tenant_id: tenantId,
                  codigo_imovel: codigo,
                  corretor_id: authUserId || newBroker?.id,
                  corretor_nome: nome,
                  corretor_telefone: telefone || null,
                  corretor_email: email || null,
                });

              if (!assignError) {
                propertiesAssigned++;
              } else {
                console.error(`Error assigning property ${codigo}:`, assignError.message);
              }
            }
          }
          
          console.log(`📦 ${nome}: ${propertiesAssigned}/${codigosImoveis.length} properties assigned`);
        }

        // Add to local sets to prevent duplicates in same batch
        if (email) existingEmails.add(email);
        existingNames.add(nome.toLowerCase());

        results.push({
          nome,
          email: email || undefined,
          status: "created",
          broker_id: newBroker?.id,
          auth_user_id: authUserId,
          properties_assigned: propertiesAssigned,
        });
        summary.created++;
      } catch (err) {
        console.error(`Error processing ${nome}:`, err);
        results.push({
          nome,
          email: email || undefined,
          status: "error",
          reason: err instanceof Error ? err.message : String(err),
        });
        summary.error++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, summary, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
