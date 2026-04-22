-- Migração: Criar tabela admin_test_results
-- Descrição: Tabela para armazenar resultados de testes comportamentais de admins/owners
-- Data: 2026-03-30

-- Criar tabela admin_test_results
CREATE TABLE IF NOT EXISTS public.admin_test_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    user_email TEXT,
    user_name TEXT,
    
    -- DISC
    disc_tipo_principal TEXT,
    disc_percentual_d NUMERIC(5,4),
    disc_percentual_i NUMERIC(5,4),
    disc_percentual_s NUMERIC(5,4),
    disc_percentual_c NUMERIC(5,4),
    disc_perfis_dominantes TEXT[],
    disc_data_teste TIMESTAMPTZ,
    
    -- Eneagrama
    eneagrama_tipo_principal INTEGER,
    eneagrama_score_tipo_1 INTEGER DEFAULT 0,
    eneagrama_score_tipo_2 INTEGER DEFAULT 0,
    eneagrama_score_tipo_3 INTEGER DEFAULT 0,
    eneagrama_score_tipo_4 INTEGER DEFAULT 0,
    eneagrama_score_tipo_5 INTEGER DEFAULT 0,
    eneagrama_score_tipo_6 INTEGER DEFAULT 0,
    eneagrama_score_tipo_7 INTEGER DEFAULT 0,
    eneagrama_score_tipo_8 INTEGER DEFAULT 0,
    eneagrama_score_tipo_9 INTEGER DEFAULT 0,
    eneagrama_data_teste TIMESTAMPTZ,
    
    -- MBTI
    mbti_tipo TEXT,
    mbti_percent_mind NUMERIC(5,2),
    mbti_percent_energy NUMERIC(5,2),
    mbti_percent_nature NUMERIC(5,2),
    mbti_percent_tactics NUMERIC(5,2),
    mbti_percent_identity NUMERIC(5,2),
    mbti_data_teste TIMESTAMPTZ,
    
    -- Metadados
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar índice para busca por user_id
CREATE INDEX IF NOT EXISTS idx_admin_test_results_user_id ON public.admin_test_results(user_id);

-- Habilitar RLS
ALTER TABLE public.admin_test_results ENABLE ROW LEVEL SECURITY;

-- Política: Usuário pode ver apenas seus próprios resultados
CREATE POLICY "Users can view own admin test results"
    ON public.admin_test_results
    FOR SELECT
    USING (auth.uid() = user_id);

-- Política: Usuário pode inserir seus próprios resultados
CREATE POLICY "Users can insert own admin test results"
    ON public.admin_test_results
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Política: Usuário pode atualizar seus próprios resultados
CREATE POLICY "Users can update own admin test results"
    ON public.admin_test_results
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Política: Usuário pode deletar seus próprios resultados
CREATE POLICY "Users can delete own admin test results"
    ON public.admin_test_results
    FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_admin_test_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_admin_test_results_updated_at ON public.admin_test_results;
CREATE TRIGGER trigger_update_admin_test_results_updated_at
    BEFORE UPDATE ON public.admin_test_results
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_test_results_updated_at();

-- Comentários
COMMENT ON TABLE public.admin_test_results IS 'Resultados de testes comportamentais (DISC, Eneagrama, MBTI) para admins e owners';
COMMENT ON COLUMN public.admin_test_results.user_id IS 'ID do usuário admin/owner (auth.uid)';
COMMENT ON COLUMN public.admin_test_results.disc_tipo_principal IS 'Tipo principal DISC: D, I, S ou C';
COMMENT ON COLUMN public.admin_test_results.eneagrama_tipo_principal IS 'Tipo principal Eneagrama: 1 a 9';
COMMENT ON COLUMN public.admin_test_results.mbti_tipo IS 'Tipo MBTI completo: ex INTJ-A, ENFP-T';
