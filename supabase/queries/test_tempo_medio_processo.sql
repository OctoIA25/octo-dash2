-- Query para testar o cálculo de tempo médio de processo
-- Equivalente ao cálculo feito no TypeScript com date-fns

SELECT 
  id,
  nome,
  status,
  created_at,
  updated_at,
  -- Diferença em dias entre a data atual e a data de criação
  EXTRACT(DAY FROM (NOW() - created_at)) as dias_desde_criacao,
  -- Alternativa usando DATE_PART
  DATE_PART('day', NOW() - created_at) as dias_desde_criacao_alt
FROM recruitment_candidates
WHERE status = 'Onboard'
  AND created_at IS NOT NULL
ORDER BY created_at DESC;

-- Query para calcular a média de dias (tempo médio de processo)
SELECT 
  COUNT(*) as total_onboard,
  ROUND(AVG(EXTRACT(DAY FROM (NOW() - created_at)))) as tempo_medio_dias,
  MIN(EXTRACT(DAY FROM (NOW() - created_at))) as menor_tempo_dias,
  MAX(EXTRACT(DAY FROM (NOW() - created_at))) as maior_tempo_dias
FROM recruitment_candidates
WHERE status = 'Onboard'
  AND created_at IS NOT NULL;

-- Query alternativa usando AGE (mais precisa para cálculo de dias)
SELECT 
  COUNT(*) as total_onboard,
  ROUND(AVG(DATE_PART('day', AGE(NOW(), created_at)))) as tempo_medio_dias
FROM recruitment_candidates
WHERE status = 'Onboard'
  AND created_at IS NOT NULL;

-- Query para ver todos os status e suas datas
SELECT 
  status,
  COUNT(*) as total,
  ROUND(AVG(DATE_PART('day', AGE(NOW(), created_at)))) as tempo_medio_dias,
  MIN(created_at) as data_mais_antiga,
  MAX(created_at) as data_mais_recente
FROM recruitment_candidates
WHERE created_at IS NOT NULL
GROUP BY status
ORDER BY status;

-- Query para simular o cálculo do TypeScript (filtro Onboard + cálculo individual)
WITH onboard_candidates AS (
  SELECT 
    id,
    nome,
    status,
    created_at,
    DATE_PART('day', AGE(NOW(), created_at)) as dias_desde_criacao
  FROM recruitment_candidates
  WHERE status = 'Onboard'
    AND created_at IS NOT NULL
)
SELECT 
  *,
  -- Simulação do array processTimes do TypeScript
  dias_desde_criacao as process_time
FROM onboard_candidates
ORDER BY dias_desde_criacao;

-- Query para calcular a média exata como o TypeScript faz
WITH onboard_times AS (
  SELECT 
    DATE_PART('day', AGE(NOW(), created_at)) as dias
  FROM recruitment_candidates
  WHERE status = 'Onboard'
    AND created_at IS NOT NULL
)
SELECT 
  COUNT(*) as total_candidatos,
  ROUND(AVG(dias)) as media_dias,
  ROUND(SUM(dias) / COUNT(*)) as soma_dividida_por_total,
  ARRAY_AGG(dias) as todos_os_dias
FROM onboard_times;
