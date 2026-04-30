-- Inserts para teste de cálculo de tempo médio de processo
-- Cria candidatos em diferentes datas para testar o cálculo

-- Limpar dados de teste anteriores (opcional)
-- DELETE FROM recruitment_stages WHERE candidate_id IN (SELECT id FROM recruitment_candidates WHERE nome LIKE 'Teste %');
-- DELETE FROM recruitment_candidates WHERE nome LIKE 'Teste %';

-- Candidato criado há 1 dia (deve mostrar 1 dia)
INSERT INTO recruitment_candidates (tenant_id, nome, email, telefone, cargo, experiencia, status, fonte, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Substituir por tenant_id válido
  'Teste 1 dia atrás',
  'teste1@exemplo.com',
  '(11) 98765-4321',
  'Corretor Júnior',
  '0-2 anos',
  'Onboard',
  'LinkedIn',
  NOW() - INTERVAL '1 day',
  NOW()
);

-- Candidato criado há 5 dias (deve mostrar 5 dias)
INSERT INTO recruitment_candidates (tenant_id, nome, email, telefone, cargo, experiencia, status, fonte, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Substituir por tenant_id válido
  'Teste 5 dias atrás',
  'teste5@exemplo.com',
  '(11) 98765-4322',
  'Corretor Pleno',
  '2-3 anos',
  'Onboard',
  'Indicação',
  NOW() - INTERVAL '5 days',
  NOW()
);

-- Candidato criado há 10 dias (deve mostrar 10 dias)
INSERT INTO recruitment_candidates (tenant_id, nome, email, telefone, cargo, experiencia, status, fonte, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Substituir por tenant_id válido
  'Teste 10 dias atrás',
  'teste10@exemplo.com',
  '(11) 98765-4323',
  'Corretor Sênior',
  '5 anos',
  'Onboard',
  'Site Institucional',
  NOW() - INTERVAL '10 days',
  NOW()
);

-- Candidato criado há 20 dias (deve mostrar 20 dias)
INSERT INTO recruitment_candidates (tenant_id, nome, email, telefone, cargo, experiencia, status, fonte, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Substituir por tenant_id válido
  'Teste 20 dias atrás',
  'teste20@exemplo.com',
  '(11) 98765-4324',
  'Corretor Júnior',
  '1-3 anos',
  'Onboard',
  'Email Marketing',
  NOW() - INTERVAL '20 days',
  NOW()
);

-- Candidato criado há 30 dias (deve mostrar 30 dias)
INSERT INTO recruitment_candidates (tenant_id, nome, email, telefone, cargo, experiencia, status, fonte, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Substituir por tenant_id válido
  'Teste 30 dias atrás',
  'teste30@exemplo.com',
  '(11) 98765-4325',
  'Corretor Pleno',
  '3-5 anos',
  'Onboard',
  'Meta',
  NOW() - INTERVAL '30 days',
  NOW()
);

-- Candidato com status diferente (não deve ser contado na média de Onboard)
INSERT INTO recruitment_candidates (tenant_id, nome, email, telefone, cargo, experiencia, status, fonte, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Substituir por tenant_id válido
  'Teste Lead (não contar)',
  'testelead@exemplo.com',
  '(11) 98765-4326',
  'Corretor Júnior',
  '0-2 anos',
  'Lead',
  'LinkedIn',
  NOW() - INTERVAL '15 days',
  NOW()
);

-- Após inserir, a média deve ser: (1 + 5 + 10 + 20 + 30) / 5 = 66 / 5 = 13.2 ≈ 13 dias
