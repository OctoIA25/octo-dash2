-- Query para filtrar candidatos dos últimos 6 meses
-- Baseado em data_inscricao

-- Opção 1: Usando INTERVAL (mais simples)
SELECT 
  id,
  nome,
  email,
  status,
  data_inscricao,
  created_at
FROM recruitment_candidates
WHERE data_inscricao >= NOW() - INTERVAL '6 months'
ORDER BY data_inscricao DESC;

-- Opção 2: Usando DATE_TRUNC para filtrar por mês exato
SELECT 
  id,
  nome,
  email,
  status,
  data_inscricao,
  created_at
FROM recruitment_candidates
WHERE DATE_TRUNC('month', data_inscricao) >= DATE_TRUNC('month', NOW() - INTERVAL '6 months')
ORDER BY data_inscricao DESC;

-- Opção 3: Para cálculo de métricas dos últimos 6 meses
SELECT 
  COUNT(*) as total_candidatos,
  COUNT(*) FILTER (WHERE status = 'Lead') as leads,
  COUNT(*) FILTER (WHERE status = 'Interação') as interacao,
  COUNT(*) FILTER (WHERE status = 'Reunião') as reuniao,
  COUNT(*) FILTER (WHERE status = 'Onboard') as onboard,
  COUNT(*) FILTER (WHERE status = 'Aprovado') as aprovado,
  COUNT(*) FILTER (WHERE status = 'Rejeitado') as rejeitado
FROM recruitment_candidates
WHERE data_inscricao >= NOW() - INTERVAL '6 months';

-- Opção 4: Agrupado por mês dos últimos 6 meses
SELECT 
  DATE_TRUNC('month', data_inscricao) as mes,
  COUNT(*) as total_candidatos,
  COUNT(*) FILTER (WHERE status = 'Onboard') as onboard,
  COUNT(*) FILTER (WHERE status = 'Aprovado') as aprovado
FROM recruitment_candidates
WHERE data_inscricao >= NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', data_inscricao)
ORDER BY mes DESC;
