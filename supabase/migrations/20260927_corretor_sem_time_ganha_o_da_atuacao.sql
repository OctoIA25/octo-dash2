-- ============================================================
-- O time do corretor sai da Atuação
--
-- O recorte por equipe do plantão expôs que 6 dos 14 corretores da Lotus
-- estavam sem `team_id` e sem `leader_user_id` — nenhum gestor os alcançava.
--
-- O chefe respondeu (27/09) que isso é dado faltando, não realidade: **todo
-- corretor tem time**, e o campo que diz qual é a **Atuação** ("Imóveis
-- prontos" / "Lançamentos"), na ficha do corretor.
--
-- Conferimos, e ele está certo: nos 8 que JÁ têm time, a Atuação bate com o
-- nome do time em 8 de 8. Não é palpite — é a mesma informação gravada em
-- dois lugares, e um deles ficou para trás.
--
-- UMA FONTE POR DADO: em vez de a regra do plantão passar a ler Atuação — o
-- que criaria uma segunda definição de "minha equipe", divergindo da de
-- `get_tenant_members` — o time é preenchido a partir dela. A regra continua
-- uma só.
--
-- O QUE ESTA MIGRATION NÃO FAZ, de propósito:
--
-- `leader_user_id` (líder DIRETO) fica como está. O time já responde a
-- pergunta do plantão, via `teams.leader_user_ids`, e ninguém disse quem é o
-- líder direto de cada um. Preencher por dedução seria inventar hierarquia.
--
-- RISCO MEDIDO ANTES: `team_id` é lido em 20 lugares (Bolsão, Central de
-- Leads, comissão, métricas de equipe, eNPS). Na Lotus,
-- `auto_distribution_enabled` e `roleta_enabled` estão AMBOS desligados —
-- conferido —, então isto não muda quem recebe lead. O efeito é de
-- relatório: essas pessoas passam a aparecer no time a que já pertencem.
--
-- Fica de fora quem tem Atuação vazia: na Lotus é só a conta `Lia`, que é o
-- robô, não uma pessoa.
-- ============================================================

BEGIN;

UPDATE tenant_memberships tm
   SET team_id = t.id
  FROM teams t
 WHERE t.tenant_id = tm.tenant_id
   AND tm.role = 'corretor'
   AND tm.team_id IS NULL
   AND (
     (tm.permissions -> 'atuacao' @> '["prontos"]'::jsonb      AND t.name = 'Prontos')
     OR (tm.permissions -> 'atuacao' @> '["lancamentos"]'::jsonb AND t.name = 'Lançamentos')
   )
   -- Atuação dupla não decide sozinha em qual time a pessoa entra. Hoje só um
   -- admin tem mais de uma, e admin vê tudo de qualquer jeito.
   AND jsonb_array_length(COALESCE(tm.permissions -> 'atuacao', '[]'::jsonb)) = 1;

COMMIT;
