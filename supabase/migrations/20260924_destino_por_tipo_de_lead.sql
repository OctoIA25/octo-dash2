-- ============================================================
-- Lead de recrutamento e lead de quem quer vender têm dono fixo
--
-- Pedido do chefe (item 1 da lista dele):
--
--   "colocar a opção de lead de recrutamento (devem vir pra mim) e de
--    vendedores (deve ir para a gestora de terceiros - Mariana)"
--
-- Hoje esses dois caem na roleta como qualquer outro lead: quem quer TRABALHAR
-- na imobiliária, e quem quer VENDER um imóvel, são distribuídos a um corretor
-- de plantão como se fossem comprador. Nenhum dos dois é.
--
-- ============================================================
-- POR QUE CONFIGURAÇÃO, E NÃO O NOME DAS PESSOAS NO CÓDIGO
-- ============================================================
--
-- "Devem vir pra mim" e "a gestora de terceiros, Mariana" são duas PESSOAS
-- desta imobiliária, hoje. No dia em que a Mariana mudar de função, quem for
-- procurar por "Mariana" vai procurar na tela — e se estiver no código, não
-- acha, e o lead continua indo para ela por meses.
--
-- Então vai em `tenant_bolsao_config`, ao lado do horário de funcionamento e
-- da ordem da fila, que é onde as outras decisões desta imobiliária já moram.
-- Coluna, e não tabela nova: é um par chave→pessoa por casa, e uma tabela com
-- RLS, policy e grant para guardar dois uuid seria peso sem ganho.
--
-- ============================================================
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ
-- ============================================================
--
-- Não muda a distribuição de nenhum lead que já existe, e não mexe no tipo de
-- lead nenhum. Ela só cria o lugar onde a resposta fica guardada, e escreve a
-- resposta da Lotus. Quem lê é a regra (`server/distribuicao/regra.js`), e a
-- regra é CONSULTA: a Lia é que atribui, decisão de 19/09.
-- ============================================================

BEGIN;

ALTER TABLE public.tenant_bolsao_config
  ADD COLUMN IF NOT EXISTS destino_por_tipo jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenant_bolsao_config.destino_por_tipo IS
  'Quem recebe cada tipo de lead que NÃO entra na roleta: {"recrutamento":"<user_id>","vendedores":"<user_id>"}. Vazio = o tipo cai em "ninguém", e a tela diz que falta configurar — nunca volta para a roleta por omissão.';

-- ------------------------------------------------------------
-- A resposta da Lotus, escrita pelo NOME e não pelo uuid colado à mão.
--
-- Buscar pelo nome aqui é de propósito: um uuid copiado numa migração é
-- impossível de conferir na revisão, e se estiver errado o lead vai para a
-- pessoa errada em silêncio. Pelo nome, quem lê vê a intenção — e se não
-- encontrar, a chave simplesmente não é escrita e a tela avisa que falta.
-- ------------------------------------------------------------
UPDATE public.tenant_bolsao_config c
   SET destino_por_tipo = c.destino_por_tipo
     || COALESCE((
          SELECT jsonb_build_object('recrutamento', tm.user_id)
            FROM public.tenant_memberships tm
            JOIN auth.users u ON u.id = tm.user_id
           WHERE tm.tenant_id = c.tenant_id
             AND lower(u.raw_user_meta_data ->> 'name') LIKE 'erick%'
           LIMIT 1), '{}'::jsonb)
     || COALESCE((
          SELECT jsonb_build_object('vendedores', tm.user_id)
            FROM public.tenant_memberships tm
            JOIN auth.users u ON u.id = tm.user_id
           WHERE tm.tenant_id = c.tenant_id
             AND lower(u.raw_user_meta_data ->> 'name') LIKE 'mariana%'
           LIMIT 1), '{}'::jsonb)
 WHERE c.tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid;

NOTIFY pgrst, 'reload schema';

COMMIT;
