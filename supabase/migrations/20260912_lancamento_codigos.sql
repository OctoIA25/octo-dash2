-- =============================================================================
-- `lancamentos.codigos`: os códigos do empreendimento na planilha da equipe.
--
-- POR QUE
-- O lead de lançamento chega com o código do anúncio, não com referência do
-- catálogo: do Meta vem o NOME ('RESERVA CASTANHEIRA'), do ZAP vem o L0NN, que
-- só existia em `lancamento_anuncios` (de-para anúncio -> código). Como
-- `lancamentos` não guardava esses códigos, o lookup da tela
-- (src/features/imoveis/services/lancamentosLookup.ts) só casava pelo nome —
-- 'L014' não virava "Gioviale" em lugar nenhum. Era o gap marcado com
-- `ponytail:` naquele arquivo; esta coluna o fecha.
--
-- PLURAL: a planilha "Links anúncios Lançamentos" dá um código por ANÚNCIO, e o
-- mesmo empreendimento é anunciado em várias tipologias — Reserva Castanheira
-- tem cinco (L012, L023, L025, L028, L029). Um `codigo` no singular obrigaria a
-- escolher um e deixar os outros quatro anúncios sem dono.
--
-- ARRAY, NÃO TABELA FILHA: são ~30 códigos no tenant inteiro, lidos junto do
-- lançamento e casados em memória pela tela. Uma tabela `lancamento_codigos`
-- daria a PK (tenant_id, codigo) — a garantia de que um código pertence a um
-- único lançamento, que o array não tem como dar no banco. Em troca, salvar
-- viraria delete+insert sem transação a partir do navegador.
--
-- ponytail: a garantia de unicidade ficou fora do banco. Quem segura são duas
-- peças: a tela recusa código que já está em outro lançamento, e o lookup
-- devolve "não achei" quando dois cadastros reivindicam o mesmo código — falha
-- fechada, nunca aponta para o empreendimento errado. Se um dia outro escritor
-- (import, API) passar a preencher isto, vira tabela filha com PK.
-- =============================================================================

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS codigos TEXT[];

COMMENT ON COLUMN public.lancamentos.codigos IS
  'Códigos deste empreendimento na planilha da equipe (L001, L023, ...), um por anúncio no portal. É por eles que o lead de lançamento vindo do ZAP acha este cadastro.';

-- ---------- A `codigo` no singular, que existiu por algumas horas ----------
-- A primeira versão deste arquivo criou `codigo TEXT` + índice único e chegou a
-- rodar em produção antes de a planilha mostrar que um empreendimento tem
-- vários códigos. Ninguém chegou a preencher (conferido em 12/set/2026), então
-- ela sai daqui — junto do índice único, que só fazia sentido com um código por
-- cadastro. Quem nunca rodou a versão antiga não sente nada: os DROPs são IF
-- EXISTS.
--
-- Antes de dropar, a checagem: se em algum ambiente alguém digitou um código
-- ali, o arquivo para e avisa em vez de apagar o dado em silêncio. EXECUTE
-- porque plpgsql planeja o comando inteiro de uma vez e não dá para citar uma
-- coluna que pode não existir.
DO $$
DECLARE v_preenchido boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lancamentos' AND column_name = 'codigo'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.lancamentos WHERE codigo IS NOT NULL)'
       INTO v_preenchido;
    IF v_preenchido THEN
      RAISE EXCEPTION 'lancamentos.codigo tem valor preenchido: copie para codigos antes de rodar este arquivo';
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS public.lancamentos_codigo_por_tenant_idx;
ALTER TABLE public.lancamentos DROP COLUMN IF EXISTS codigo;

-- =============================================================================
-- ROLLBACK
--   ALTER TABLE public.lancamentos DROP COLUMN IF EXISTS codigos;
-- =============================================================================
