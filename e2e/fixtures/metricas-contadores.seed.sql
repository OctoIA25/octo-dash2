-- Fixture dos contadores da aba Métricas (e2e/metricas-contadores.spec.ts).
--
-- Cada card consertado em 18/09 precisa dar um número DIFERENTE do que o
-- código antigo dava — senão o teste passa nas duas versões e não prova nada:
--
--                          código antigo   código atual
--   Clientes Interessados        24             24
--   Pré-Atendimento               5             19
--   Visitas                       3              3
--   Encaminhados Aos Corretores  24              4
--   (funil, Fechamento)           0              2
--
-- Rodar contra o Supabase LOCAL (ver scripts/ambiente-local.sh), nunca em
-- produção. O usuário e2e.local@octo.dev precisa existir como admin do tenant.

INSERT INTO public.tenants (id, code, name) VALUES
  ('e2e00000-0000-4000-a000-00000000000a', 'e2e-local', 'Imobiliaria E2E')
ON CONFLICT (id) DO NOTHING;

-- Troque pelo id do usuário criado na sua instância local.
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions)
SELECT 'e2e00000-0000-4000-a000-00000000000a', u.id, 'admin', '{}'
FROM auth.users u WHERE u.email = 'e2e.local@octo.dev'
ON CONFLICT DO NOTHING;

DELETE FROM public.leads WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a';

-- `created_at` de 10 dias atrás: o trigger tr_enqueue_lead_created_webhook só
-- dispara para leads das últimas 48h, e não queremos enfileirar webhook.
INSERT INTO public.leads (tenant_id, name, status, lead_type, created_at, source)
SELECT 'e2e00000-0000-4000-a000-00000000000a', 'Novo '||g, 'Novos Leads', 1, now()-interval '10 days', 'Site' FROM generate_series(1,10) g;
INSERT INTO public.leads (tenant_id, name, status, lead_type, created_at, source)
SELECT 'e2e00000-0000-4000-a000-00000000000a', 'Interagindo '||g, 'Interação', 1, now()-interval '10 days', 'Site' FROM generate_series(1,5) g;
INSERT INTO public.leads (tenant_id, name, status, lead_type, created_at, source)
SELECT 'e2e00000-0000-4000-a000-00000000000a', 'Visita '||g, 'Visita Agendada', 1, now()-interval '10 days', 'Site' FROM generate_series(1,3) g;
INSERT INTO public.leads (tenant_id, name, status, lead_type, created_at, source)
SELECT 'e2e00000-0000-4000-a000-00000000000a', 'Assinou '||g, 'Proposta Assinada', 1, now()-interval '10 days', 'Site' FROM generate_series(1,2) g;

-- Os 4 ÚNICOS com corretor. O guard tr_leads_zz_assignee_guard exige que o
-- responsável seja membro do tenant, por isso reusamos o próprio usuário.
INSERT INTO public.leads (tenant_id, name, status, lead_type, created_at, source, assigned_agent_id, assigned_agent_name)
SELECT 'e2e00000-0000-4000-a000-00000000000a', 'Com corretor '||g, 'Novos Leads', 1, now()-interval '10 days', 'Site',
       u.id, 'Gestor Local'
FROM generate_series(1,4) g, auth.users u WHERE u.email = 'e2e.local@octo.dev';
