-- ============================================================
-- "LOTUS LEADS" não é pessoa — os 17 leads voltam para a fila.
--
-- Decidido pelo chefe em 18/09/2026, depois de medir. O item do plano fala em
-- 488 leads com o corretor gravado só como texto; a medição achou 44, em seis
-- nomes, todos de uma imobiliária. Cinco casam com gente cadastrada:
--
--   FERNANDA SOUZA(12) · GABRIELE FÁVARO(8) · FABIO GONCALVES(4)
--   HUMBERTO MARTINEZ(2) · ERICK CESAR FERRIGATTI MAMEDE(1)
--
-- O sexto, "LOTUS LEADS" (17), é uma conta genérica. A decisão: sem corretor,
-- de volta à fila — não inventa vínculo com ninguém.
--
-- O que muda em cada um dos 17 (medido em 18/09: todos ativos, nenhum com
-- vínculo, 6 já participavam do bolsão e 11 não):
--   assigned_agent_name  'LOTUS LEADS' -> NULL
--   participa_bolsao     -> true
--
-- Por que NULL e não manter o texto: as telas leem `assigned_agent_name`, e
-- com ele preenchido elas contam esses 17 como "encaminhados a um corretor" —
-- o mesmo defeito que já custou o card "Encaminhados Aos Corretores". Com
-- NULL, o mapeamento do front mostra "Não atribuído", que é a verdade. O texto
-- original fica registrado AQUI, nesta migration, e no histórico do git.
--
-- Os outros cinco nomes NÃO são tocados: eles esperam o "confere" do Erick
-- sobre quem é quem, como o plano manda. Não adivinhar.
-- ============================================================

BEGIN;

UPDATE public.leads
   SET assigned_agent_name = NULL,
       participa_bolsao    = true,
       updated_at          = now()
 WHERE assigned_agent_name = 'LOTUS LEADS';

COMMIT;

SELECT count(*) AS ainda_com_lotus_leads
  FROM public.leads WHERE assigned_agent_name = 'LOTUS LEADS';
