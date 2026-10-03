-- ============================================================
-- Classifica as contas a pagar "sem conta" da Lotus pela categoria que já está
-- escrita na descrição. ESPERA OK EXPLÍCITO. Depois da migration 20261028.
--
-- Só duas categorias importam para a projeção: Marketing (linha própria) e
-- Salários (base das provisões). O resto continua sem conta e cai em "Custos fixos".
--
-- Medido em produção em 03/10 (só leitura), entre os 198 "a pagar" manuais sem conta:
--   Marketing → 2.2 (papel midia) ..... 46 lançamentos, R$ 34.757,15
--   Salários  → 2.3 (papel pessoal) ... 45 lançamentos, R$ 113.527,00
--   o resto, sem conta ............... 107 lançamentos, R$ 99.846,92 (custos fixos)
-- ============================================================
\set lotus '65c69875-dc83-4062-90f6-6f6adc30df26'
BEGIN;
SELECT CASE WHEN descricao ~* '—\s*marketing\s*—' THEN 'midia'
            WHEN descricao ~* '—\s*sal[aá]rios\s*—' THEN 'pessoal' END AS vai_para,
       count(*), round(sum(valor), 2) AS total
  FROM lancamentos_financeiros
 WHERE tenant_id = :'lotus' AND origem = 'manual' AND tipo = 'pagar' AND conta_id IS NULL
 GROUP BY 1 ORDER BY 1;

UPDATE lancamentos_financeiros l
   SET conta_id = (SELECT id FROM plano_contas WHERE tenant_id = :'lotus' AND papel = 'midia')
 WHERE l.tenant_id = :'lotus' AND l.origem = 'manual' AND l.tipo = 'pagar' AND l.conta_id IS NULL
   AND l.descricao ~* '—\s*marketing\s*—';
UPDATE lancamentos_financeiros l
   SET conta_id = (SELECT id FROM plano_contas WHERE tenant_id = :'lotus' AND papel = 'pessoal')
 WHERE l.tenant_id = :'lotus' AND l.origem = 'manual' AND l.tipo = 'pagar' AND l.conta_id IS NULL
   AND l.descricao ~* '—\s*sal[aá]rios\s*—';
-- Para desfazer: conta_id = NULL nos mesmos filtros (as descrições não mudam).
ROLLBACK;  -- trocar por COMMIT só com OK
