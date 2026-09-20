-- ============================================================
-- Tipologias por empreendimento (P2.1).
--
-- Hoje o que seria tipologia mora em TEXTO, escrito à mão, num campo por
-- lançamento. Medido na Lotus em 20/09/2026, nos 59 lançamentos:
--
--   dormitorios: "2 e 3 dorms" (13) · "Lotes" (10) · "2 dorms" (4) ·
--                "Studio a 2 suítes" · "1 a 3 dorms" · "2 e 3 dorms (1 suíte)"
--   specs:       "131 e 164" — duas tipologias espremidas num campo só
--   preço:       só 30 dos 59 têm algum
--
-- A LIA lê esse texto e responde o que der. Com a tabela, ela consulta
-- "2 dorms, 64 m², a partir de R$ 389.000" em vez de interpretar prosa.
--
-- O "A PARTIR DE" DO EMPREENDIMENTO PASSA A SER CALCULADO: é o menor preço
-- entre as tipologias DISPONÍVEIS. Guardá-lo numa coluna criaria a segunda
-- verdade sobre o mesmo número — e seria a que envelhece.
--
-- DECIDIDO PELO CHEFE EM 20/09/2026: enquanto o lançamento não tiver
-- tipologia, o site continua mostrando o texto de hoje. Trocar tudo de uma vez
-- deixaria os 59 lançamentos sem dormitório e sem preço num site público.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tipologias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,

  /** Como a equipe chama: "2 dorms c/ suíte", "Studio", "Lote 250 m²". */
  nome text NOT NULL,

  dormitorios smallint,
  suites smallint,
  banheiros smallint,
  vagas smallint,
  area_privativa_m2 numeric(10, 2),

  /** O menor preço desta tipologia. Nulo = não divulgado. */
  preco_a_partir numeric(14, 2),
  /**
   * Quando o preço foi conferido pela última vez.
   *
   * Preço de lançamento envelhece, e a LIA cita valor para cliente. Sem a
   * data ninguém sabe se "a partir de R$ 389.000" é de hoje ou do ano
   * passado — e a frase "dados atualizados em…" que a LIA já usa precisa
   * sair de algum lugar.
   */
  preco_atualizado_em date,

  disponivel boolean NOT NULL DEFAULT true,
  unidades_disponiveis smallint,
  planta_url text,
  observacao text,
  /** Ordem de exibição, arrastável na tela. */
  ordem smallint NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Números negativos não existem no mundo, e um deles na tela é pior que a
  -- ausência: parece dado.
  CONSTRAINT tipologias_numeros_ck CHECK (
    (dormitorios IS NULL OR dormitorios BETWEEN 0 AND 20)
    AND (suites IS NULL OR suites BETWEEN 0 AND 20)
    AND (banheiros IS NULL OR banheiros BETWEEN 0 AND 20)
    AND (vagas IS NULL OR vagas BETWEEN 0 AND 20)
    AND (area_privativa_m2 IS NULL OR area_privativa_m2 > 0)
    AND (preco_a_partir IS NULL OR preco_a_partir > 0)
    AND (unidades_disponiveis IS NULL OR unidades_disponiveis >= 0)
  ),
  CONSTRAINT tipologias_nome_ck CHECK (btrim(nome) <> ''),
  -- Suíte é um dormitório. Mais suítes que dormitórios é erro de digitação, e
  -- a LIA repetiria o erro para o cliente.
  CONSTRAINT tipologias_suites_ck CHECK (
    dormitorios IS NULL OR suites IS NULL OR suites <= dormitorios
  )
);

CREATE INDEX IF NOT EXISTS tipologias_lancamento_idx
  ON public.tipologias (lancamento_id, ordem);

-- Duas tipologias com o mesmo nome no mesmo empreendimento são erro de
-- cadastro: a equipe fica sem saber qual editar, e a LIA cita uma das duas.
CREATE UNIQUE INDEX IF NOT EXISTS tipologias_nome_unico_idx
  ON public.tipologias (lancamento_id, public.normalizar_texto(nome));

-- ------------------------------------------------------------
-- Quem enxerga o quê
--
-- O pg_default_acl deste Postgres concede tudo a anon em toda relação nova de
-- public. Aqui anon PRECISA ler — o site público mostra as tipologias —, mas
-- só ler, e só o que estiver publicado.
-- ------------------------------------------------------------
REVOKE ALL ON public.tipologias FROM anon, authenticated;
GRANT SELECT ON public.tipologias TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipologias TO authenticated;
GRANT ALL ON public.tipologias TO service_role;

ALTER TABLE public.tipologias ENABLE ROW LEVEL SECURITY;

-- O site público lê só a tipologia de lançamento PUBLICADO. Sem o vínculo com
-- `publicar_site`, um lançamento em sigilo vazaria preço pela chave do
-- navegador — que é o mesmo furo que a política dos lançamentos já teve.
CREATE POLICY tipologias_anon_publicadas ON public.tipologias
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.lancamentos l
    WHERE l.id = tipologias.lancamento_id AND l.publicar_site = true
  ));

CREATE POLICY tipologias_membro_le ON public.tipologias
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Quem cadastra imóvel cadastra tipologia: mesma gente, mesma tela.
CREATE POLICY tipologias_membro_escreve ON public.tipologias
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner())
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
              OR public.is_platform_owner());

-- ------------------------------------------------------------
-- O "a partir de" do empreendimento, CALCULADO
--
-- Menor preço entre as tipologias disponíveis. Função, e não coluna: coluna
-- precisaria ser reescrita a cada tipologia editada, e a que ninguém
-- reescreve é a que mente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lancamento_preco_a_partir(p_lancamento_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT min(t.preco_a_partir)
  FROM tipologias t
  WHERE t.lancamento_id = p_lancamento_id
    AND t.disponivel = true
    AND t.preco_a_partir IS NOT NULL;
$function$;

COMMIT;
