-- ============================================================
-- Construtora como cadastro (P0.3 do plano).
--
-- Hoje a construtora é TEXTO livre em `lancamentos.construtora` e
-- `condominios.construtora`, e a aba Construtoras nem lê o banco: ela baixa um
-- CSV público do Google Sheets. Medido em 18/09/2026:
--
--   banco ....... 19 textos distintos (57 lançamentos + 9 condomínios)
--   planilha .... 19 textos distintos, e SEIS nomes escritos diferente das duas
--                 pontas: APLAUSI/Applausi · SANTA ANGELA/Santa Ângela ·
--                 MAC LUCER/Mac Lucer · Manducca/Manduca Empreendimentos ·
--                 GRUPO ZARIN/Zarin · REM Construtora e Incorporadora/REM
--
-- As duplicatas que o plano cita ("Tebas" × "tebas", "Sebel" × "SEBEL
-- EMPREENDIMENTOS") estão na PLANILHA, não no banco. Por decisão do chefe em
-- 18/09, o CRM passa a ser a fonte da verdade e a planilha vira exportação.
--
-- A COMISSÃO é o ponto sensível: o critério de pronto do item diz que ela não
-- pode chegar à LIA. Aqui ela nasce protegida no BANCO, não só na tela —
-- mesmo molde de `proprietario_*` em `imoveis_locais` (20260915): a coluna
-- fica fora do GRANT de `authenticated`, e quem pode ver lê por RPC.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. As construtoras que a imobiliária reconhece
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.construtoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identificador estável que as integrações usam: o nome pode mudar sem
  -- quebrar relatório nem vínculo.
  codigo text NOT NULL,
  nome text NOT NULL,
  razao_social text,

  responsavel_nome text,
  responsavel_telefone text,
  responsavel_email text,

  -- COMERCIAL INTERNO. Ver o bloco de GRANTs no fim: esta coluna fica fora do
  -- SELECT do navegador e só sai pela RPC `construtoras_comissao`.
  comissao_padrao_pct numeric(5,2),
  prazo_pagamento_dias integer,
  dados_nota text,

  -- Construtora avulsa: parceria pontual, não faz parte do portfólio fixo.
  e_avulso boolean NOT NULL DEFAULT false,
  ativa boolean NOT NULL DEFAULT true,
  observacao text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT construtoras_codigo_uk UNIQUE (tenant_id, codigo),
  CONSTRAINT construtoras_codigo_ck CHECK (codigo ~ '^[a-z0-9_]+$'),
  CONSTRAINT construtoras_comissao_ck CHECK (comissao_padrao_pct IS NULL
                                             OR (comissao_padrao_pct >= 0 AND comissao_padrao_pct <= 100)),
  CONSTRAINT construtoras_prazo_ck CHECK (prazo_pagamento_dias IS NULL OR prazo_pagamento_dias >= 0)
);

-- "Não existe mais construtora duplicada por grafia" é o primeiro critério de
-- pronto. A trava mora aqui, não na tela: mesma imobiliária não cadastra duas
-- vezes o mesmo nome com outra caixa, outro acento ou espaço a mais.
-- `normalizar_texto` já existe (20260815) e é a gêmea SQL do `chaveOrigem` do
-- front: minúscula, sem acento, espaços colapsados. Reusar em vez de criar
-- outra é a mesma regra de "uma fonte por dado" aplicada a código.
CREATE UNIQUE INDEX IF NOT EXISTS construtoras_nome_normalizado_uk
  ON public.construtoras (tenant_id, public.normalizar_texto(nome));

CREATE INDEX IF NOT EXISTS construtoras_tenant_idx ON public.construtoras (tenant_id, ativa);

-- ------------------------------------------------------------
-- 2. Os CNPJs de cada construtora (uma empresa emite por mais de um)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.construtora_cnpjs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  construtora_id uuid NOT NULL REFERENCES public.construtoras(id) ON DELETE CASCADE,

  -- Só dígitos: a máscara é da tela. Assim "12.345.678/0001-90" e
  -- "12345678000190" não viram duas linhas.
  cnpj text NOT NULL,
  principal boolean NOT NULL DEFAULT false,
  descricao text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT construtora_cnpjs_uk UNIQUE (tenant_id, cnpj),
  CONSTRAINT construtora_cnpjs_formato_ck CHECK (cnpj ~ '^[0-9]{14}$')
);

-- Um principal por construtora, no máximo.
CREATE UNIQUE INDEX IF NOT EXISTS construtora_cnpjs_principal_uk
  ON public.construtora_cnpjs (construtora_id) WHERE principal;

CREATE INDEX IF NOT EXISTS construtora_cnpjs_construtora_idx
  ON public.construtora_cnpjs (construtora_id);

-- ------------------------------------------------------------
-- 3. O vínculo, nas duas tabelas que hoje guardam texto
--
-- NULLABLE de propósito: hoje 2 lançamentos e 80 condomínios não têm
-- construtora preenchida. Exigir o vínculo agora deixaria 82 linhas órfãs.
-- A coluna de TEXTO fica onde está — o Portal público lê `construtora` hoje
-- (20260717_create_portal_lancamentos_view), e dropar quebraria o site.
-- Renomeia antes de dropar.
-- ------------------------------------------------------------
ALTER TABLE public.lancamentos  ADD COLUMN IF NOT EXISTS construtora_id uuid REFERENCES public.construtoras(id) ON DELETE SET NULL;
ALTER TABLE public.condominios  ADD COLUMN IF NOT EXISTS construtora_id uuid REFERENCES public.construtoras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lancamentos_construtora_idx ON public.lancamentos (construtora_id);
CREATE INDEX IF NOT EXISTS condominios_construtora_idx ON public.condominios (construtora_id);

COMMIT;
BEGIN;

-- ============================================================
-- 4. Quem enxerga o quê
--
-- O pg_default_acl deste Postgres concede arwdDxtm a anon e authenticated em
-- TODA relação nova de public — uma tabela nasce aberta para a chave que vai
-- no bundle do navegador. O REVOKE abaixo não é zelo: sem ele, GRANT nenhum
-- restringe coisa alguma.
-- ============================================================
REVOKE ALL ON public.construtoras      FROM anon, authenticated;
REVOKE ALL ON public.construtora_cnpjs FROM anon, authenticated;

-- A COMISSÃO fica FORA do SELECT do navegador. Mesmo molde de `proprietario_*`
-- em imoveis_locais (20260915): GRANT coluna a coluna, pulando a protegida.
-- Assim nenhum `select('*')` de corretor traz o percentual — e o front não
-- precisa acertar a projeção para a coluna ficar escondida.
DO $$
DECLARE v_colunas text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_colunas
    FROM pg_attribute
   WHERE attrelid = 'public.construtoras'::regclass
     AND attnum > 0 AND NOT attisdropped
     AND attname <> 'comissao_padrao_pct';
  EXECUTE format('GRANT SELECT (%s) ON public.construtoras TO authenticated', v_colunas);
END $$;

GRANT INSERT, UPDATE, DELETE ON public.construtoras      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.construtora_cnpjs TO authenticated;
GRANT ALL ON public.construtoras, public.construtora_cnpjs TO service_role;

ALTER TABLE public.construtoras      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construtora_cnpjs ENABLE ROW LEVEL SECURITY;

-- Qualquer membro LÊ: a tela de lançamento precisa listar para escolher.
CREATE POLICY construtoras_select ON public.construtoras
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Só quem administra ESCREVE.
CREATE POLICY construtoras_write ON public.construtoras
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                        WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
         OR public.is_platform_owner());

CREATE POLICY construtora_cnpjs_select ON public.construtora_cnpjs
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

CREATE POLICY construtora_cnpjs_write ON public.construtora_cnpjs
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                        WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
         OR public.is_platform_owner());

-- ============================================================
-- 5. A comissão só sai por aqui
--
-- SECURITY DEFINER porque a coluna não tem GRANT para `authenticated`. Quem
-- decide se a pessoa pode ver é o BANCO, não a tela — a mesma escolha de
-- `imoveis_proprietarios`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.construtoras_comissao(p_tenant_id uuid)
RETURNS TABLE (construtora_id uuid, codigo text, nome text,
               comissao_padrao_pct numeric, prazo_pagamento_dias integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.codigo, c.nome, c.comissao_padrao_pct, c.prazo_pagamento_dias
    FROM public.construtoras c
   WHERE c.tenant_id = p_tenant_id
     AND (
       public.is_platform_owner()
       OR EXISTS (
         SELECT 1 FROM public.tenant_memberships m
          WHERE m.user_id = auth.uid()
            AND m.tenant_id = p_tenant_id
            AND m.role IN ('admin','team_leader','owner')
       )
     )
   ORDER BY c.nome;
$$;

REVOKE ALL ON FUNCTION public.construtoras_comissao(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.construtoras_comissao(uuid) TO authenticated, service_role;

-- O PostgREST guarda um cache do esquema. Sem este aviso, TODA coluna
-- acrescentada acima fica invisível para o aplicativo — e o sintoma é o pior
-- possível: nenhum erro, só o campo vindo vazio para sempre. Custou meia hora
-- para ser achado no P4.1, e ali era uma coluna só.
NOTIFY pgrst, 'reload schema';

COMMIT;
