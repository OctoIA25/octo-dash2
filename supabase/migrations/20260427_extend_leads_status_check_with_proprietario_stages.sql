-- Estende leads_status_check para aceitar tambem os 11 estagios de Proprietario.
-- Antes: so os 8 estagios de Interessado + 'Em Atendimento' + 'Arquivado'.
-- Apos: cobre todo o universo de status que o CriarLeadQuickModal e o
-- atualizarStatusLeadCRM podem gravar (interessado + proprietario).
--
-- Aplicada em producao em 2026-04-27 via supabase MCP.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY[
    -- Interessado
    'Novos Leads'::text,
    'Em Atendimento'::text,
    'Interação'::text,
    'Visita Agendada'::text,
    'Visita Realizada'::text,
    'Negociação'::text,
    'Proposta Criada'::text,
    'Proposta Enviada'::text,
    'Proposta Assinada'::text,
    -- Proprietario
    'Novos Proprietários'::text,
    'Primeira Visita'::text,
    'Criação do Estudo de Mercado'::text,
    'Apresentação do Estudo de Mercado'::text,
    'Não Exclusivo'::text,
    'Exclusivo'::text,
    'Cadastro'::text,
    'Plano de Marketing'::text,
    'Propostas Respondidas'::text,
    'Feitura de Contrato'::text,
    -- Comum
    'Arquivado'::text
  ]));
