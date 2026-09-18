-- Migration: cadastro de ORIGEM de lead (P0.4 do plano)
-- Data: 2026-09-18
--
-- O PROBLEMA, medido em produção em 18/09 nas 5.235 linhas de `leads`: a
-- origem é o texto cru que a integração manda, e só. Daí 17 valores distintos
-- que misturam três coisas diferentes:
--
--   origem de verdade .. ZAP Imóveis (75) · Instagram (58) · Facebook (53)
--                        Site (5) · Imovelweb (5) · WhatsApp (2) · Email (2)
--   MÉTODO de entrada .. Excel (938) · Manual (40) · API (1)
--   CONSTRUTORA ........ Santa Angela (1.399)   <- o exemplo do plano
--
-- E a MESMA origem aparece cinco vezes, fragmentando todo relatório:
--   Lia (Japi Terceiros) 2.553 · Lia (Lotus Brokers) 97 ·
--   Lia (Japi Lançamentos) 4 · Lia · teste 2 · Lia · cadastro de Octo 1
--
-- Juntas são 2.657 leads — metade da base — espalhados por cinco linhas em
-- qualquer gráfico "por origem".
--
-- DUAS TABELAS, e não uma, porque são duas perguntas:
--
--   tenant_lead_origins ...... o CADASTRO: quais origens existem nesta
--                              imobiliária, com código estável, cor, ordem e
--                              as duas chaves (mídia paga / orgânica).
--   tenant_lead_origin_map ... a CONVERSÃO: qual texto cru vira qual origem.
--
-- Por que não reusar `tenant_lead_source_channels`: ela mapeia texto cru →
-- CANAL, e `canal` é NOT NULL. Reusá-la obrigaria quem só quer mapear origem
-- a escolher um canal junto, acoplando duas decisões independentes. Canal é
-- um agrupamento ACIMA de origem; as duas convivem.

CREATE TABLE IF NOT EXISTS public.tenant_lead_origins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- O identificador que as integrações usam. O NOME pode mudar sem quebrar
  -- relatório nenhum — é exatamente o que o plano pede com "código estável".
  codigo      text NOT NULL,
  nome        text NOT NULL,
  cor         text NOT NULL DEFAULT '#64748B',
  ordem       integer NOT NULL DEFAULT 0,
  -- Entra no cálculo de CAC: Meta sim, indicação não.
  midia_paga  boolean NOT NULL DEFAULT false,
  -- Lead gerado pelo próprio corretor ou por indicação — usado para bônus.
  organica    boolean NOT NULL DEFAULT false,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_lead_origins_codigo_uk UNIQUE (tenant_id, codigo),
  -- Código é chave de integração: sem espaço, sem acento, sem maiúscula. Uma
  -- chave que aceita "Meta Lead Ads" e "meta lead ads" não é estável.
  CONSTRAINT tenant_lead_origins_codigo_ck CHECK (codigo ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS public.tenant_lead_origin_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Guardado já normalizado (sem acento, minúsculo, espaço simples): é assim
  -- que `chaveOrigem` compara no front, e guardar cru faria "SANTA ÂNGELA" e
  -- "Santa Angela" virarem duas linhas para a mesma decisão.
  texto_bruto   text NOT NULL,
  origem_codigo text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_lead_origin_map_uk UNIQUE (tenant_id, texto_bruto),
  -- Apaga a conversão junto com a origem: conversão órfã aponta para um
  -- código que não existe mais, e o lead sumiria do relatório.
  CONSTRAINT tenant_lead_origin_map_fk
    FOREIGN KEY (tenant_id, origem_codigo)
    REFERENCES public.tenant_lead_origins (tenant_id, codigo) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_lead_origins_tenant_idx ON public.tenant_lead_origins (tenant_id, ordem);
CREATE INDEX IF NOT EXISTS tenant_lead_origin_map_tenant_idx ON public.tenant_lead_origin_map (tenant_id);

ALTER TABLE public.tenant_lead_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_lead_origin_map ENABLE ROW LEVEL SECURITY;

-- Políticas espelhadas de `tenant_lead_source_channels`: QUALQUER membro lê
-- (os gráficos precisam da cor e da ordem), mas só admin/líder/owner escreve.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_lead_origins', 'tenant_lead_origin_map'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_select ON public.%1$s;
      CREATE POLICY %1$s_select ON public.%1$s FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
      DROP POLICY IF EXISTS %1$s_write ON public.%1$s;
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL USING (
        tenant_id IN (
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND role = ANY (ARRAY['admin','team_leader','owner'])
        ) OR public.is_platform_owner()
      );
    $f$, t);
  END LOOP;
END $$;

-- O `pg_default_acl` concede `arwdDxtm` a anon e authenticated em TODA relação
-- nova. Sem o REVOKE, a chave que vai no bundle do browser nasce podendo
-- ESCREVER aqui — e a RLS de escrita acima seria a única barreira.
REVOKE ALL ON public.tenant_lead_origins, public.tenant_lead_origin_map FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_lead_origins, public.tenant_lead_origin_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_lead_origins, public.tenant_lead_origin_map TO service_role;
