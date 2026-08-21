-- Migration: controle de chaves do imóvel
-- Data: 2026-08-19
-- Descrição: estado atual da chave em imoveis_locais — onde ela fica, com quem
-- está agora e desde quando. Colunas na própria linha do imóvel em vez de uma
-- tabela de movimentos porque o histórico de retiradas já sai de graça:
-- log_imoveis_locais audita qualquer coluna nova (de → para, autor, data).

-- Mesma ordem de lock da migration do log: pega imoveis_locais primeiro, e o
-- lock_timeout troca "deadlock detected" por um erro limpo de espera.
SET lock_timeout = '10s';

ALTER TABLE public.imoveis_locais
  ADD COLUMN IF NOT EXISTS chave_status      TEXT,
  ADD COLUMN IF NOT EXISTS chave_local       TEXT,
  ADD COLUMN IF NOT EXISTS chave_com         UUID,
  ADD COLUMN IF NOT EXISTS chave_retirada_em TIMESTAMPTZ;

-- NULL = ninguém preencheu ainda (é o estado das linhas que já existem).
ALTER TABLE public.imoveis_locais DROP CONSTRAINT IF EXISTS imoveis_locais_chave_status_chk;
ALTER TABLE public.imoveis_locais ADD CONSTRAINT imoveis_locais_chave_status_chk
  CHECK (chave_status IS NULL OR chave_status IN ('imobiliaria', 'portaria', 'proprietario', 'nao_temos'));

-- chave_com é auth.uid() de um membro do tenant. Sem FK: a coluna aponta para
-- auth.users, que fica em outro schema, e captador_id (mesmo tipo de dado) já
-- segue essa convenção aqui.
COMMENT ON COLUMN public.imoveis_locais.chave_status
  IS 'Onde a chave mora: imobiliaria | portaria | proprietario | nao_temos. NULL = não informado.';
COMMENT ON COLUMN public.imoveis_locais.chave_local
  IS 'Etiqueta/lugar físico da chave quando está na imobiliária (ex.: "gaveta 2, tag A-14").';
COMMENT ON COLUMN public.imoveis_locais.chave_com
  IS 'user_id de quem está com a chave agora. NULL = a chave está no lugar dela.';
COMMENT ON COLUMN public.imoveis_locais.chave_retirada_em
  IS 'Quando a chave saiu. Carimbado pelo trigger tg_imoveis_locais_chave, não pelo caller.';

-- ------------------------------------------------------------
-- Carimbo da retirada
-- ------------------------------------------------------------
-- No banco e não no formulário porque imoveis_locais é escrita de vários
-- lugares (CriarImovelForm, aprovação em MeusImoveisTab, api-server, jobs) —
-- mesma razão que fez o log de alterações virar trigger. Assim "desde quando"
-- nunca depende de o caller lembrar de mandar a data.
CREATE OR REPLACE FUNCTION public.imoveis_locais_carimbar_chave()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- OLD não existe no INSERT; comparar com ele ali dispararia
  -- "record old is not assigned yet".
  IF TG_OP = 'INSERT' OR NEW.chave_com IS DISTINCT FROM OLD.chave_com THEN
    NEW.chave_retirada_em := CASE WHEN NEW.chave_com IS NULL THEN NULL ELSE NOW() END;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE: o AFTER de log_imoveis_locais roda depois e já enxerga a data carimbada.
DROP TRIGGER IF EXISTS tg_imoveis_locais_chave ON public.imoveis_locais;
CREATE TRIGGER tg_imoveis_locais_chave
  BEFORE INSERT OR UPDATE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.imoveis_locais_carimbar_chave();
