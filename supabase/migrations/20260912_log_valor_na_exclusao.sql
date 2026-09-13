-- Migration: log de exclusão de imóvel grava o valor de venda
-- Data: 2026-09-12
-- Descrição: a Evolução da Carteira (Relatórios → Imóveis) soma o valor de venda
-- do que estava em carteira em cada mês. Imóvel apagado só existe no log, e o
-- evento 'excluido' não guardava valor nenhum: a saída contava na quantidade mas
-- entrava com R$ 0, e os meses em que ele esteve na carteira ficavam subavaliados.
--
-- Único ajuste: o ramo DELETE passa a gravar `valor_venda` no mesmo formato do
-- diff ({ de: <valor>, para: null }), que o histórico do imóvel já renderiza
-- ("Valor de venda: R$ X → vazio"). O resto da função é idêntico a
-- 20260817_imoveis_locais_log.sql. Só CREATE OR REPLACE FUNCTION: o trigger
-- continua apontando para ela, sem lock em imoveis_locais.
--
-- Exclusões anteriores ficam sem valor (em 12/09/2026 eram 2, ambas criadas e
-- apagadas no mesmo mês — não mudam nenhum fim de mês).

CREATE OR REPLACE FUNCTION public.log_imoveis_locais_alteracoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alteracoes JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.imoveis_locais_log
      (tenant_id, imovel_id, codigo_imovel, acao, alteracoes, alterado_por)
    VALUES (OLD.tenant_id, OLD.id, OLD.codigo_imovel, 'excluido',
            jsonb_build_object('valor_venda', jsonb_build_object('de', OLD.valor_venda, 'para', NULL)),
            auth.uid());
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.imoveis_locais_log
      (tenant_id, imovel_id, codigo_imovel, acao, alterado_por)
    VALUES (NEW.tenant_id, NEW.id, NEW.codigo_imovel, 'criado',
            COALESCE(auth.uid(), NEW.criado_por));
    RETURN NEW;
  END IF;

  -- Diff coluna a coluna. `fotos` entra só como contagem: o array tem URLs longas
  -- (e o backfill de marca d'água reescreve todas), guardar o conteúdo inteiro
  -- encheria o log de ruído ilegível.
  SELECT jsonb_object_agg(
           campo.key,
           jsonb_build_object(
             'de',   imoveis_locais_log_resumo(campo.key, to_jsonb(OLD) -> campo.key),
             'para', imoveis_locais_log_resumo(campo.key, campo.value)
           )
         )
    INTO v_alteracoes
    FROM jsonb_each(to_jsonb(NEW)) AS campo
   WHERE campo.key NOT IN ('updated_at')
     AND campo.value IS DISTINCT FROM to_jsonb(OLD) -> campo.key;

  -- Upsert do formulário reenvia o payload inteiro a cada salvamento; sem
  -- mudança real não há o que logar.
  IF v_alteracoes IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.imoveis_locais_log
    (tenant_id, imovel_id, codigo_imovel, acao, alteracoes, alterado_por)
  VALUES (NEW.tenant_id, NEW.id, NEW.codigo_imovel, 'editado', v_alteracoes, auth.uid());

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.imoveis_locais_log.alteracoes
  IS 'Diff da edição: { coluna: { de, para } }. `fotos` guarda a contagem, não as URLs. Em excluido, só valor_venda: { de: <valor>, para: null }.';
