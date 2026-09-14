-- Corrige leads da Santa Ângela cujo assigned_agent_name é de uma pessoa e o
-- assigned_agent_id de outra (incidente 13/09, lead CELMA REGINA: visível para o
-- Fábio com o nome da Flavia). O sync gravava o corretor da origem só no NOME;
-- quem vê o lead é o dono do ID, então o nome passa a ser o do dono do ID.
--
-- RODAR SÓ DEPOIS DO DEPLOY do sync que não grava mais o corretor
-- (server/santaAngela/santaAngelaSyncService.js). Antes disso, o ciclo de 60s
-- reescreve o nome da origem.
--
-- Medido em 14/09/2026: 300 leads (tenant Lotus Brokers).

BEGIN;

-- Sem triggers: é correção de dado, não reatribuição. Não gera lead.assigned no
-- histórico, não reinicia assigned_at (countdown do bolsão) nem updated_at.
SET LOCAL session_replication_role = replica;

WITH dono AS (
  SELECT l.id,
         -- mesmo nome que a roleta grava; sem participante, o nome do usuário
         COALESCE(NULLIF(trim(rp.broker_name), ''), u.raw_user_meta_data->>'name') AS nome
  FROM public.leads l
  JOIN public.tenant_memberships tm
    ON tm.tenant_id = l.tenant_id AND tm.user_id::text = l.assigned_agent_id
  JOIN auth.users u ON u.id = tm.user_id
  LEFT JOIN LATERAL (
    SELECT broker_name FROM public.roleta_participantes rp
    WHERE rp.tenant_id = l.tenant_id AND lower(rp.broker_id) = l.assigned_agent_id
    LIMIT 1
  ) rp ON true
  WHERE l.source = 'Santa Angela' AND l.assigned_agent_name IS NOT NULL
)
UPDATE public.leads l
SET assigned_agent_name = d.nome
FROM dono d
WHERE l.id = d.id
  AND d.nome IS NOT NULL
  -- só descasamento real; "FABIO GONCALVES" x "Fábio Gonçalves" fica como está
  AND translate(lower(regexp_replace(trim(l.assigned_agent_name), '\s+', ' ', 'g')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')
   <> translate(lower(regexp_replace(trim(d.nome), '\s+', ' ', 'g')), 'áàâãéêíóôõúç', 'aaaaeeiooouc');

COMMIT;
