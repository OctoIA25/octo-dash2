-- Debug do tempo médio de processo

-- 1. Verificar todos os candidatos em Onboard com suas datas
SELECT 
  id,
  nome,
  status,
  created_at,
  updated_at,
  -- Cálculo exato como o TypeScript faz
  EXTRACT(DAY FROM (NOW() - created_at)) as dias_calculado_sql,
  -- Outro método para comparação
  DATE_PART('day', AGE(NOW(), created_at)) as dias_age_sql
FROM recruitment_candidates
WHERE status = 'Onboard'
ORDER BY created_at DESC;

-- 2. Verificar se há candidatos Onboard
SELECT 
  COUNT(*) as total_onboard,
  'Sim' as tem_candidatos_onboard
FROM recruitment_candidates
WHERE status = 'Onboard';

-- 3. Verificar o cálculo da média exatamente como o código TypeScript
WITH onboard_times AS (
  SELECT 
    EXTRACT(DAY FROM (NOW() - created_at)) as dias
  FROM recruitment_candidates
  WHERE status = 'Onboard'
    AND created_at IS NOT NULL
)
SELECT 
  COUNT(*) as total_candidatos,
  ROUND(AVG(dias)) as media_sql,
  ROUND(SUM(dias) / COUNT(*)) as soma_dividida_total,
  ARRAY_AGG(dias) as todos_os_dias
FROM onboard_times;

-- 4. Verificar se os candidatos que você atualizaram realmente estão em Onboard
SELECT 
  id,
  nome,
  status,
  created_at,
  EXTRACT(DAY FROM (NOW() - created_at)) as dias_desde_criacao
FROM recruitment_candidates
WHERE id IN ('ID1', 'ID2') -- Substitua pelos IDs que você atualizou
ORDER BY id;

-- 5. Limpar cache do React (não é SQL, mas instrução)
-- No navegador: F12 > Application > Local Storage > Limpar tudo
-- Ou recarregar a página com Ctrl+Shift+R
