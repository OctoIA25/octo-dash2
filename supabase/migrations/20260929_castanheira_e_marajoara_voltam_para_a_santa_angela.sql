-- As 12 vendas orfas voltam para a Santa Angela -- 29/09, autorizado pelo chefe.
--
-- O QUE ACONTECEU. `forecast_empreendimento` e texto livre digitado na planilha
-- de forecast, e e ele que amarra a venda a construtora: o gatilho
-- `proposta_assinada_cria_venda` casa esse texto com `lancamentos.nome` por
-- IGUALDADE (sem acento, sem caixa). A campanha da Meta se chama
-- "[CAST] Reserva Castanheira" e cada um encurtou de um jeito -- 16 propostas
-- dizem "Reserva Castanheira" e 11 dizem so "Castanheira". As 11 nao casaram.
-- Uma decima segunda, "RESERVA MARAJOARA II", e a fase II da "Reserva
-- Marajoara" (confirmado pelo chefe em 29/09) e perdeu o encaixe pelo " II".
--
-- Sem construtora nao ha percentual, sem percentual a comissao fica zerada, e
-- venda com comissao zerada nao vira nota fiscal. Eram R$ 7.064.137,96 de VGV
-- parados por duas palavras.
--
-- O LIMITE. So estas duas grafias, e so onde a construtora esta nula. O CASE
-- devolve NULL para qualquer outro nome, e comparacao com NULL nao casa nada --
-- entao rodar isto de novo nao alcanca venda que ninguem combinou.
--
-- O QUE NAO MUDA. O texto que a pessoa digitou fica como esta: o vinculo agora
-- e por id, que e mais forte que o nome, e reescrever o que alguem escreveu
-- apagaria o rastro de como o erro aconteceu. `comissao_pct` tambem nao e
-- tocado -- ele e travado por gatilho e so o owner muda, com justificativa.
--
-- O DESFAZER e exato: UPDATE vendas SET lancamento_id = NULL,
-- construtora_id = NULL, tipo = 'terceiros' nas 12 linhas abaixo.
--   Castanheira: 9171d4c0 b233e118 9c486065 2e8b7215 f4b98d8f 180880ff
--                2f35dfbd 05916d67 972c3365 ea12165e abbae981
--   Marajoara II: 9902df09

DO $$
DECLARE
  v_mexidas int;
BEGIN
  UPDATE public.vendas v
     SET lancamento_id  = l.id,
         construtora_id = l.construtora_id,
         -- A mesma regra do gatilho: com lancamento casado, a venda e de
         -- lancamento. Importa no repasse -- lancamento nao tem ponta de
         -- captacao, porque a captacao e direta com a construtora.
         tipo           = 'lancamento'
    FROM public.lancamentos l
   WHERE l.tenant_id = v.tenant_id
     AND v.construtora_id IS NULL
     AND l.construtora_id IS NOT NULL
     AND upper(public.sem_acento(btrim(l.nome))) = CASE upper(public.sem_acento(btrim(COALESCE(v.empreendimento, ''))))
           WHEN 'CASTANHEIRA'           THEN 'RESERVA CASTANHEIRA'
           WHEN 'RESERVA MARAJOARA II'  THEN 'RESERVA MARAJOARA'
         END;

  GET DIAGNOSTICS v_mexidas = ROW_COUNT;

  -- Um UPDATE que nao acha nada termina com sucesso e em silencio. Se o numero
  -- nao for 12, alguma coisa mudou desde a medicao e a transacao volta inteira
  -- em vez de deixar metade religada.
  IF v_mexidas <> 12 THEN
    RAISE EXCEPTION 'esperava religar 12 vendas, religuei % -- nada foi gravado', v_mexidas;
  END IF;
END $$;
