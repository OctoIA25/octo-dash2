# Atribuição Automática de Corretores

## Visão Geral

O sistema OctoDash CRM implementa uma lógica de **atribuição automática de corretores** baseada no imóvel de interesse do lead. Quando um lead é criado (via API ou outras integrações) com um código de imóvel (`interest_reference`), o sistema automaticamente atribui esse lead ao corretor responsável pelo imóvel.

## Arquitetura

### Tabelas Envolvidas

1. **`imoveis_corretores`** - Mapeamento de imóveis para corretores
   - `id` (UUID) - Chave primária
   - `tenant_id` (UUID) - ID da imobiliária (multi-tenant)
   - `codigo_imovel` (TEXT) - Código de referência do imóvel (ex: CA0117, AP0929)
   - `corretor_nome` (TEXT) - Nome do corretor responsável
   - `corretor_email` (TEXT) - Email do corretor (opcional)
   - `corretor_telefone` (TEXT) - Telefone do corretor (opcional)
   - `corretor_id` (UUID) - ID do corretor quando login for implementado (opcional)
   - `created_at` (TIMESTAMP) - Data de criação
   - `updated_at` (TIMESTAMP) - Data de atualização

2. **`tenants`** - Configuração por imobiliária
   - `auto_assign_broker` (BOOLEAN) - Ativa/desativa atribuição automática (padrão: true)

3. **`kenlo_leads`** - Central de Leads
   - `attended_by_name` (TEXT) - Nome do corretor atribuído ao lead
   - `attended_by_id` (UUID) - ID do corretor no sistema (auth.users.id / tenant_memberships.user_id)

4. **`tenant_brokers`** - Corretores do tenant (fonte principal)
   - `auth_user_id` (UUID) - ID do usuário autenticado
   - `name` (TEXT) - Nome do corretor
   - `email` (TEXT) - Email do corretor
   - `phone` (TEXT) - Telefone do corretor

5. **`tenant_memberships`** - Membros do tenant (fallback)
   - `user_id` (UUID) - ID do usuário
   - `role` (TEXT) - Papel (admin, corretor, team_leader)

### Fluxo de Atribuição

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOVO LEAD RECEBIDO                           │
│              (API, Webhook, Portal, etc.)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Lead tem código de imóvel (interest_reference)?                │
└─────────────────────────────────────────────────────────────────┘
                    │                    │
                   SIM                  NÃO
                    │                    │
                    ▼                    ▼
┌───────────────────────────┐    ┌───────────────────────────────┐
│ Atribuição automática     │    │ Lead vai para fila geral      │
│ está ativada no tenant?   │    │ (sem corretor atribuído)      │
└───────────────────────────┘    └───────────────────────────────┘
          │           │
         SIM         NÃO
          │           │
          ▼           ▼
┌─────────────────┐  ┌─────────────────────────────────────────────┐
│ Buscar corretor │  │ Lead criado sem corretor                    │
│ na tabela       │  │ (atribuição manual posterior)               │
│ imoveis_corret. │  └─────────────────────────────────────────────┘
└─────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Corretor encontrado?                                           │
└─────────────────────────────────────────────────────────────────┘
          │           │
         SIM         NÃO
          │           │
          ▼           ▼
┌─────────────────┐  ┌─────────────────────────────────────────────┐
│ Lead criado com │  │ Lead criado sem corretor                    │
│ attended_by_name│  │ (imóvel não tem corretor cadastrado)        │
│ = corretor_nome │  └─────────────────────────────────────────────┘
└─────────────────┘
```

## Configuração

### Toggle na UI

O toggle de "Atribuição Automática de Corretor" está disponível em:
- **Configurações** → **Integrações** → **API**

Quando **ativado** (padrão):
- Leads com código de imóvel são automaticamente atribuídos ao corretor responsável

Quando **desativado**:
- Leads são criados sem corretor, exigindo atribuição manual

### API Endpoints

#### Criar Lead com Atribuição Automática

```http
POST /api/v1/leads
Authorization: Bearer octo_xxxxx
Content-Type: application/json

{
  "name": "João Silva",
  "phone": "11999998888",
  "email": "joao@email.com",
  "interest_reference": "CA0117",
  "message": "Interesse no imóvel"
}
```

**Resposta (com atribuição automática):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "João Silva",
    "interest_reference": "CA0117",
    "attended_by": "Maria Santos"
  },
  "message": "Lead criado e atribuído automaticamente ao corretor Maria Santos"
}
```

## Pipeline de Match de Corretor (Central de Leads)

Quando um lead chega via Central de Leads (Kenlo), o sistema executa o seguinte pipeline para vincular ao corretor correto no sistema:

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEAD DO KENLO RECEBIDO                       │
│              (via kenloPollingService)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. PRIMEIRO: Lead tem código do imóvel (interest_reference)?   │
│     (busca em "Meus Imóveis" - imoveis_corretores)              │
└─────────────────────────────────────────────────────────────────┘
                    │                    │
                   SIM                  NÃO
                    │                    │
                    ▼                    │
┌───────────────────────────┐            │
│ Buscar corretor em        │            │
│ imoveis_corretores        │            │
│ pelo código do imóvel     │            │
└───────────────────────────┘            │
          │                              │
          ▼                              │
┌─────────────────────────┐              │
│ Corretor encontrado?    │              │
└─────────────────────────┘              │
     │           │                       │
    SIM         NÃO                      │
     │           │                       │
     ▼           └───────────────────────┤
┌─────────────────────────┐              │
│ Atribuir lead ao        │              │
│ corretor do imóvel:     │              │
│ - attended_by_name      │              │
│ - attended_by_id (UUID) │              │
└─────────────────────────┘              │
                                         │
                              ┌──────────┴──────────┐
                              ▼                     │
┌─────────────────────────────────────────────────────────────────┐
│  2. FALLBACK: Lead tem attendedBy.name do Kenlo?                │
│     (corretor pré-definido no portal)                           │
└─────────────────────────────────────────────────────────────────┘
                    │                    │
                   SIM                  NÃO
                    │                    │
                    ▼                    ▼
┌───────────────────────────┐    ┌──────────────────────┐
│ findCorretorInSystem()    │    │ Lead sem corretor    │
│ Match por nome/email/tel  │    │ atribuído            │
└───────────────────────────┘    └──────────────────────┘
          │
          ▼
┌─────────────────────────┐
│ Atribuir:               │
│ - attended_by_name      │
│ - attended_by_id (UUID) │
└─────────────────────────┘
```

### Função `findCorretorInSystem`

Localizada em `src/services/kenloLeadsService.ts`, faz match por:

1. **Email** (prioridade máxima) - Match exato
2. **Telefone** - Match dos últimos 8 dígitos
3. **Nome** - Match fuzzy (inclui/contém)

Pipeline de busca:
1. `tenant_brokers` (fonte principal - tem `auth_user_id`)
2. `tenant_memberships` (fallback)

### Arquivos Envolvidos

- `src/services/kenloLeadsService.ts` - Salvamento de leads com atribuição automática
- `src/services/kenloPollingService.ts` - Polling e sync de leads do Kenlo
- `src/services/xmlSyncService.ts` - Sincronização de imóveis do XML

## Implementação Futura: Login de Corretores

Quando o sistema de login de corretores for implementado, as seguintes mudanças serão necessárias:

### 1. Tabela de Corretores

```sql
CREATE TABLE corretores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT,
  creci TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Autenticação

- Usar Supabase Auth com role `corretor`
- Cada corretor terá acesso apenas aos seus leads
- Políticas RLS por `corretor_id`

### 3. Atualização do Fluxo

1. **`imoveis_corretores.corretor_id`** passa a referenciar `corretores.id`
2. **`kenlo_leads.attended_by`** passa a referenciar `corretores.id`
3. Consultas de leads filtradas por `attended_by = auth.uid()`

### 4. Dashboard do Corretor

- Visualização apenas dos leads atribuídos
- Agenda pessoal
- Métricas individuais
- Notificações de novos leads

### 5. Reatribuição de Leads

- Admin pode reatribuir leads entre corretores
- Histórico de atribuições
- Notificação ao novo corretor

## Migração SQL

Execute no Supabase para criar a tabela de mapeamento:

```sql
-- Criar tabela de mapeamento imóveis → corretores
CREATE TABLE IF NOT EXISTS imoveis_corretores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  codigo_imovel TEXT NOT NULL,
  corretor_nome TEXT NOT NULL,
  corretor_email TEXT,
  corretor_telefone TEXT,
  corretor_id UUID, -- Para uso futuro com login de corretores
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, codigo_imovel)
);

-- Índices para performance
CREATE INDEX idx_imoveis_corretores_tenant ON imoveis_corretores(tenant_id);
CREATE INDEX idx_imoveis_corretores_codigo ON imoveis_corretores(codigo_imovel);

-- RLS
ALTER TABLE imoveis_corretores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants podem ver seus mapeamentos"
  ON imoveis_corretores FOR SELECT
  USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "Service role pode tudo"
  ON imoveis_corretores FOR ALL
  USING (auth.role() = 'service_role');

-- Política para API (via service role)
CREATE POLICY "API pode buscar mapeamentos"
  ON imoveis_corretores FOR SELECT
  USING (true);
```

## Logs e Monitoramento

O sistema registra logs de atribuição automática:

```
✅ API Key validada para tenant: uuid
🔍 Buscando corretor para imóvel CA0117 no tenant uuid...
✅ Corretor encontrado: Maria Santos
✅ Lead criado e atribuído automaticamente
```

## Contato

Para dúvidas sobre a implementação, consulte a equipe de desenvolvimento.
