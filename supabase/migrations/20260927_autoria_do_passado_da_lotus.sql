-- ============================================================
-- O passado da Lotus ganha autor (complementa F.1)
--
-- A migration de 22/09 deixou DE PROPÓSITO 2.823 mensagens enviadas sem
-- etiqueta, e escreveu o porquê: "seria inventar autoria para uma conversa
-- com cliente". Na época era a decisão certa — nós não sabíamos quem
-- escrevia aquelas linhas.
--
-- EM 27/09 A EQUIPE DA LIA RESPONDEU, e o que faltava era isso: no número da
-- Lotus, quem escreve `outbound` sem `sent_by_user_id` é só a LIA. Quem
-- confirmou foi o próprio escritor.
--
-- Conferido no banco antes de rodar, e os dois zeros são o que sustenta:
--
--   enviadas na Lotus sem etiqueta                 2.823
--   destas, notas do painel (metadata.lia.nota)       77
--   destas, conversa de verdade                    2.746
--   enviadas COM pessoa e sem etiqueta                 0   <-- não há outro autor
--   enviadas de outra casa sem etiqueta                0   <-- não vaza de tenant
--
-- O QUE CONTINUA ERRADO, e é de propósito: as 77 notas ("Fábio assumiu o
-- atendimento pelo painel") passam a dizer "LIA". Não é a LIA falando com
-- ninguém, é o painel registrando um evento. Um quarto valor no CHECK
-- consertaria — e não paga, em 77 linhas de 29 mil.
--
-- O CORTE POR DATA NÃO É ENFEITE. Sem ele, esta migration rodando num banco
-- novo (ou de novo) marcaria também as mensagens que a LIA passar a gravar
-- sozinha, e o desfazer deixaria de distinguir as nossas das delas. Com ele,
-- o alvo é sempre o mesmo conjunto, rode quando rodar.
-- ============================================================

BEGIN;

UPDATE public.whatsapp_messages m
   SET enviado_por = 'lia'
  FROM public.tenants t
 WHERE t.id = m.tenant_id
   AND t.name = 'Lotus Brokers'
   AND m.enviado_por IS NULL
   AND m.direction = 'outbound'
   AND m.sent_by_user_id IS NULL
   AND m.created_at <= '2026-09-26 23:53:27.341674+00';

COMMIT;

-- Para desfazer, o mesmo recorte:
--
--   UPDATE public.whatsapp_messages m SET enviado_por = NULL
--     FROM public.tenants t
--    WHERE t.id = m.tenant_id AND t.name = 'Lotus Brokers'
--      AND m.enviado_por = 'lia' AND m.sent_by_user_id IS NULL
--      AND m.metadata ->> 'role' IS DISTINCT FROM 'assistant'
--      AND m.created_at <= '2026-09-26 23:53:27.341674+00';
