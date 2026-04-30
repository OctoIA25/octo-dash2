-- Queries para testar e alterar o tempo médio de processo
-- O cálculo é baseado em candidatos com status 'Onboard' e suas datas de criação

-- 1. Verificar candidatos atuais em Onboard e suas datas
SELECT 
  id,
  nome,
  status,
  created_at,
  -- Calcular dias desde criação (igual ao código TypeScript)
  EXTRACT(DAY FROM (NOW() - created_at)) as dias_desde_criacao
FROM recruitment_candidates
WHERE status = 'Onboard'
ORDER BY created_at DESC;

-- 2. Atualizar data de criação de um candidato específico para testar
-- Substitua 'ID_DO_CANDIDATO' pelo ID real de um candidato em Onboard
UPDATE recruitment_candidates
SET created_at = NOW() - INTERVAL '15 days'
WHERE id = 'ID_DO_CANDIDATO'
AND status = 'Onboard';

-- 3. Criar candidato de teste com tempo específico
INSERT INTO recruitment_candidates (
  tenant_id,
  nome,
  email,
  telefone,
  cargo,
  experiencia,
  status,
  fonte,
  created_at,
  updated_at
) VALUES (
  'SEU_TENANT_ID', -- Substituir pelo tenant_id real
  'Teste 15 dias',
  'teste15@exemplo.com',
  '(11) 98765-4321',
  'Corretor Júnior',
  '0-2 anos',
  'Onboard',
  'LinkedIn',
  NOW() - INTERVAL '15 days',
  NOW()
);

-- 4. Criar múltiplos candidatos com tempos diferentes
INSERT INTO recruitment_candidates (
  tenant_id,
  nome,
  email,
  telefone,
  cargo,
  experiencia,
  status,
  fonte,
  created_at,
  updated_at
) VALUES 
  ('SEU_TENANT_ID', 'Teste 5 dias', 'teste5@exemplo.com', '(11) 98765-4322', 'Corretor Pleno', '2-3 anos', 'Onboard', 'Indicação', NOW() - INTERVAL '5 days', NOW()),
  ('SEU_TENANT_ID', 'Teste 10 dias', 'teste10@exemplo.com', '(11) 98765-4323', 'Corretor Sênior', '5 anos', 'Onboard', 'Site', NOW() - INTERVAL '10 days', NOW()),
  ('SEU_TENANT_ID', 'Teste 20 dias', 'teste20@exemplo.com', '(11) 98765-4324', 'Corretor Júnior', '1-3 anos', 'Onboard', 'Email', NOW() - INTERVAL '20 days', NOW()),
  ('SEU_TENANT_ID', 'Teste 30 dias', 'teste30@exemplo.com', '(11) 98765-4325', 'Corretor Pleno', '3-5 anos', 'Onboard', 'Meta', NOW() - INTERVAL '30 days', NOW());

-- 5. Verificar o tempo médio calculado (deve bater com o TypeScript)
SELECT 
  COUNT(*) as total_onboard,
  ROUND(AVG(EXTRACT(DAY FROM (NOW() - created_at)))) as tempo_medio_sql,
  MIN(EXTRACT(DAY FROM (NOW() - created_at))) as menor_tempo,
  MAX(EXTRACT(DAY FROM (NOW() - created_at))) as maior_tempo
FROM recruitment_candidates
WHERE status = 'Onboard';

-- 6. Limpar dados de teste (opcional)
-- DELETE FROM recruitment_candidates WHERE nome LIKE 'Teste%' OR nome LIKE 'teste%';
