-- Migration: Criar tabela de condomínios
-- Data: 2026-02-26
-- Descrição: Tabela para armazenar condomínios, edifícios e lançamentos por tenant

CREATE TABLE IF NOT EXISTS public.condominios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Identificação
  codigo VARCHAR(50),
  nome VARCHAR(255) NOT NULL,
  
  -- Localização
  pais VARCHAR(100) DEFAULT 'Brasil',
  estado VARCHAR(100),
  cidade VARCHAR(255),
  bairro VARCHAR(255),
  logradouro VARCHAR(500),
  numero VARCHAR(50),
  cep VARCHAR(20),
  
  -- Sobre o Empreendimento
  tipo VARCHAR(100), -- Condomínio Residencial, Edifício, Loteamento, etc.
  status VARCHAR(100), -- Pré-lançamento, Lançamento, Em Construção, Pronto, etc.
  status_comercial VARCHAR(100), -- Condomínios (terceiros), Lançamentos (novos)
  construtora VARCHAR(255),
  incorporadora VARCHAR(255),
  ano_construcao INTEGER,
  imobiliaria_exclusiva VARCHAR(255),
  num_blocos_torres INTEGER,
  data_entrega DATE,
  
  -- Infraestrutura - Acessibilidade
  infra_acesso_pne BOOLEAN DEFAULT FALSE,
  infra_banheiro_pne BOOLEAN DEFAULT FALSE,
  infra_elevador BOOLEAN DEFAULT FALSE,
  infra_elevador_servico BOOLEAN DEFAULT FALSE,
  
  -- Infraestrutura - Ecológico
  infra_aquecedor_solar BOOLEAN DEFAULT FALSE,
  infra_coleta_reciclavel BOOLEAN DEFAULT FALSE,
  infra_reaprov_agua_chuva BOOLEAN DEFAULT FALSE,
  infra_energia_solar BOOLEAN DEFAULT FALSE,
  
  -- Infraestrutura - Básico
  infra_esgoto BOOLEAN DEFAULT FALSE,
  infra_guarita BOOLEAN DEFAULT FALSE,
  infra_praca_recreacao BOOLEAN DEFAULT FALSE,
  
  -- Infraestrutura - Esporte/Lazer
  infra_academia BOOLEAN DEFAULT FALSE,
  infra_bicicletario BOOLEAN DEFAULT FALSE,
  infra_brinquedoteca BOOLEAN DEFAULT FALSE,
  infra_campo_futebol BOOLEAN DEFAULT FALSE,
  infra_churrasqueira BOOLEAN DEFAULT FALSE,
  infra_deck_molhado BOOLEAN DEFAULT FALSE,
  infra_espaco_gourmet BOOLEAN DEFAULT FALSE,
  infra_espaco_zen BOOLEAN DEFAULT FALSE,
  infra_hidromassagem BOOLEAN DEFAULT FALSE,
  infra_lago BOOLEAN DEFAULT FALSE,
  infra_piscina BOOLEAN DEFAULT FALSE,
  infra_piscina_adulto BOOLEAN DEFAULT FALSE,
  infra_piscina_aquecida BOOLEAN DEFAULT FALSE,
  infra_piscina_coberta BOOLEAN DEFAULT FALSE,
  infra_piscina_infantil BOOLEAN DEFAULT FALSE,
  infra_playground BOOLEAN DEFAULT FALSE,
  infra_quadra_beach_tenis BOOLEAN DEFAULT FALSE,
  infra_quadra_squash BOOLEAN DEFAULT FALSE,
  infra_quadra_tenis BOOLEAN DEFAULT FALSE,
  infra_quadra_gramada INTEGER DEFAULT 0,
  infra_quadra_poliesportiva BOOLEAN DEFAULT FALSE,
  infra_sala_fitness BOOLEAN DEFAULT FALSE,
  infra_sala_ginastica INTEGER DEFAULT 0,
  infra_salao_festas BOOLEAN DEFAULT FALSE,
  infra_salao_jogos BOOLEAN DEFAULT FALSE,
  infra_salao_cinema BOOLEAN DEFAULT FALSE,
  infra_sauna_seca BOOLEAN DEFAULT FALSE,
  infra_sauna_umida BOOLEAN DEFAULT FALSE,
  infra_solarium BOOLEAN DEFAULT FALSE,
  infra_spa BOOLEAN DEFAULT FALSE,
  
  -- Infraestrutura - Segurança
  infra_cabine_primaria BOOLEAN DEFAULT FALSE,
  infra_catraca_eletronica BOOLEAN DEFAULT FALSE,
  infra_cerca_eletrica BOOLEAN DEFAULT FALSE,
  infra_circuito_tv BOOLEAN DEFAULT FALSE,
  infra_guarita_blindada BOOLEAN DEFAULT FALSE,
  infra_guarita_seguranca BOOLEAN DEFAULT FALSE,
  infra_portao_eletronico BOOLEAN DEFAULT FALSE,
  infra_portaria_24h BOOLEAN DEFAULT FALSE,
  infra_seguranca_interna BOOLEAN DEFAULT FALSE,
  infra_seguranca_patrimonial BOOLEAN DEFAULT FALSE,
  infra_sistema_incendio BOOLEAN DEFAULT FALSE,
  infra_sistema_seguranca BOOLEAN DEFAULT FALSE,
  infra_vigia_externo BOOLEAN DEFAULT FALSE,
  infra_vigilancia_24h BOOLEAN DEFAULT FALSE,
  
  -- Infraestrutura - Serviços
  infra_central_limpeza BOOLEAN DEFAULT FALSE,
  infra_escritorio_virtual BOOLEAN DEFAULT FALSE,
  infra_massagista BOOLEAN DEFAULT FALSE,
  infra_personal_training BOOLEAN DEFAULT FALSE,
  infra_restaurante BOOLEAN DEFAULT FALSE,
  infra_sala_massagem BOOLEAN DEFAULT FALSE,
  infra_tv_cabo BOOLEAN DEFAULT FALSE,
  infra_wifi BOOLEAN DEFAULT FALSE,
  
  -- Infraestrutura - Social
  infra_estacionamento_rotativo BOOLEAN DEFAULT FALSE,
  infra_lavanderia_coletiva BOOLEAN DEFAULT FALSE,
  infra_praca_convivencia BOOLEAN DEFAULT FALSE,
  infra_vaga_visita INTEGER DEFAULT 0,
  
  -- Publicação
  publicar_site BOOLEAN DEFAULT FALSE,
  destaque BOOLEAN DEFAULT FALSE,
  tour_virtual VARCHAR(500),
  descricao_site TEXT,
  
  -- Metadados
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_condominios_tenant_id ON public.condominios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_condominios_nome ON public.condominios(nome);
CREATE INDEX IF NOT EXISTS idx_condominios_cidade ON public.condominios(cidade);
CREATE INDEX IF NOT EXISTS idx_condominios_bairro ON public.condominios(bairro);
CREATE INDEX IF NOT EXISTS idx_condominios_tipo ON public.condominios(tipo);
CREATE INDEX IF NOT EXISTS idx_condominios_status ON public.condominios(status);

-- Constraint única para código por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_condominios_tenant_codigo ON public.condominios(tenant_id, codigo) WHERE codigo IS NOT NULL;

-- RLS (Row Level Security)
ALTER TABLE public.condominios ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver condominios do seu tenant
CREATE POLICY "Usuários podem ver condominios do seu tenant"
  ON public.condominios
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Policy: Usuários podem inserir condominios no seu tenant
CREATE POLICY "Usuários podem inserir condominios no seu tenant"
  ON public.condominios
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Policy: Usuários podem atualizar condominios do seu tenant
CREATE POLICY "Usuários podem atualizar condominios do seu tenant"
  ON public.condominios
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Policy: Usuários podem deletar condominios do seu tenant
CREATE POLICY "Usuários podem deletar condominios do seu tenant"
  ON public.condominios
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
  );

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_condominios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_condominios_updated_at ON public.condominios;
CREATE TRIGGER trigger_condominios_updated_at
  BEFORE UPDATE ON public.condominios
  FOR EACH ROW
  EXECUTE FUNCTION update_condominios_updated_at();

-- Comentários
COMMENT ON TABLE public.condominios IS 'Tabela de condomínios, edifícios e lançamentos por tenant';
COMMENT ON COLUMN public.condominios.tipo IS 'Tipo: Condomínio Residencial, Edifício, Loteamento, Condomínio Comercial, etc.';
COMMENT ON COLUMN public.condominios.status IS 'Status: Pré-lançamento, Lançamento, Em Construção, Em Acabamento, Pronto';
