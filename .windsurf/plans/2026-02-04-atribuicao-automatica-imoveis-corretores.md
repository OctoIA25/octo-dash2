# Atribuição Automática de Imóveis e Leads para Corretores

Plano para sincronizar automaticamente os imóveis do XML com seus corretores responsáveis, garantindo que cada corretor veja seus imóveis em "Meus Imóveis" e que leads sejam atribuídos automaticamente ao corretor do imóvel.

---

## 📋 Resumo do Problema

1. **Meus Imóveis vazio**: Corretores não veem seus imóveis mesmo que estejam no XML
2. **Atribuição manual**: Atualmente os códigos precisam ser adicionados manualmente
3. **Leads sem corretor**: Leads chegam via API/Central sem atribuição automática baseada no imóvel

## 🔍 Análise do Sistema Atual

### Estrutura de Dados do XML
O XML contém dados do corretor em cada imóvel:
```typescript
interface Imovel {
  referencia: string;           // Código do imóvel (CA0099, AP0123, etc.)
  corretor_nome?: string;       // Nome do corretor responsável
  corretor_numero?: string;     // Telefone do corretor
  corretor_email?: string;      // Email do corretor
  corretor_foto?: string;       // Foto do corretor
}
```

### Tabelas Envolvidas
- **`imoveis_corretores`**: Atribuição imóvel ↔ corretor (usada por "Meus Imóveis")
- **`tenant_brokers`**: Cadastro de corretores do tenant
- **`tenant_memberships`**: Vínculo usuário ↔ tenant (para login)
- **`kenlo_leads`**: Leads da integração Kenlo
- **`leads`**: Leads do CRM principal

### Fluxo Atual de Atribuição (API)
O `api-server.js` já tem pipeline de atribuição:
1. `attendedBy` do Kenlo (raw_data)
2. `properties_cache` (XML sincronizado) - **NÃO ESTÁ POPULADO**
3. `imoveis_corretores` (Meus Imóveis) - **VAZIO PARA MAIORIA**
4. Roleta (fallback)

### Problema Identificado
- A função `extractCorretoresFromImoveis()` em `imoveisXmlService.ts` já extrai corretores do XML
- A Edge Function `xml-create-broker-access` já cria corretores e atribui imóveis
- **MAS**: Não há sincronização automática periódica!

---

## 🎯 Solução Proposta

### Fase 1: Sincronização Automática XML → imoveis_corretores

#### 1.1 Criar serviço de sincronização automática
**Arquivo**: `src/services/xmlSyncService.ts`

```typescript
// Funções principais:
- syncImoveisCorretoresFromXml(tenantId): Promise<SyncResult>
  - Busca XML do tenant
  - Extrai corretores e seus imóveis
  - Faz match por: email > telefone > nome
  - Atualiza tabela imoveis_corretores
  
- matchCorretorToUser(corretor, tenantUsers): User | null
  - Match por email (exato)
  - Match por telefone (normalizado)
  - Match por nome (fuzzy)
```

#### 1.2 Implementar job de sincronização periódica
**Estratégia**: Polling no frontend com controle de frequência

```typescript
// Hook: useXmlSyncPolling.ts
- Executa 1x ao dia (verificar última sync)
- Horário preferencial: madrugada (00:00-06:00)
- Fila por corretor (evitar sobrecarga)
- Intervalo entre corretores: 5 minutos
```

#### 1.3 Botão "Atualizar" mais direto em Meus Imóveis
- Chamar sync imediato para o corretor logado
- Feedback visual de progresso
- Não depender do job periódico

### Fase 2: Atribuição Automática de Leads

#### 2.1 Melhorar pipeline de atribuição na API
**Arquivo**: `server/api-server.js`

O pipeline já existe, mas precisa:
- Garantir que `imoveis_corretores` esteja populado (Fase 1)
- Adicionar busca direta no XML como fallback

#### 2.2 Atribuição na Central de Leads
**Arquivo**: `src/pages/CentralLeadsPage.tsx`

- Já faz auto-atribuição ao criar lead manual
- Precisa garantir que leads do Kenlo também sejam atribuídos

#### 2.3 Atribuição no polling do Kenlo
**Arquivo**: `src/hooks/useKenloPolling.ts`

- Ao salvar novos leads, verificar corretor do imóvel
- Atualizar `attended_by_name` automaticamente

---

## 📝 Tarefas de Implementação

### Tarefa 1: Criar `xmlSyncService.ts`
```
src/services/xmlSyncService.ts
- syncImoveisCorretoresFromXml(tenantId)
- matchCorretorByEmail(email, users)
- matchCorretorByPhone(phone, users)
- matchCorretorByName(name, users)
- getLastSyncTime(tenantId)
- setLastSyncTime(tenantId)
```

### Tarefa 2: Criar hook `useXmlAutoSync.ts`
```
src/hooks/useXmlAutoSync.ts
- Verificar se já sincronizou hoje
- Executar sync em background
- Controle de fila por corretor
- Logs de progresso
```

### Tarefa 3: Atualizar `MeusImoveisTab.tsx`
```
- Botão "Sincronizar do XML" (além de "Atualizar")
- Chamar sync direto para o corretor
- Mostrar progresso e resultado
- Recarregar lista após sync
```

### Tarefa 4: Atualizar `api-server.js`
```
- Adicionar busca no XML em memória como fallback
- Melhorar logs de atribuição
- Garantir que imoveis_corretores seja consultado corretamente
```

### Tarefa 5: Atualizar `kenloLeadsService.ts`
```
- Ao salvar leads, verificar corretor do imóvel
- Atualizar attended_by_name automaticamente
- Usar dados do XML para match
```

---

## 🔧 Detalhes Técnicos

### Match de Corretor (Prioridade)
1. **Email** (exato, case-insensitive)
2. **Telefone** (normalizado, últimos 8-9 dígitos)
3. **Nome** (fuzzy match, normalize acentos)

### Normalização de Telefone
```javascript
const normalizePhone = (phone) => {
  const clean = phone.replace(/\D/g, '');
  // Remover 55 (Brasil)
  if (clean.startsWith('55') && clean.length > 11) {
    return clean.substring(2);
  }
  return clean;
};
```

### Controle de Frequência
```javascript
// localStorage keys
'xml-sync-last-run-{tenantId}': ISO timestamp
'xml-sync-queue-{tenantId}': JSON array de corretores pendentes

// Regras
- Sync geral: 1x por dia
- Sync individual (botão): imediato
- Intervalo entre corretores na fila: 5 minutos
```

### Estrutura da Tabela `imoveis_corretores`
```sql
CREATE TABLE imoveis_corretores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  codigo_imovel VARCHAR(50) NOT NULL,
  corretor_id UUID REFERENCES auth.users(id),
  corretor_nome VARCHAR(255),
  corretor_telefone VARCHAR(50),
  corretor_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, codigo_imovel)
);
```

---

## 📊 Fluxo de Dados

```
┌─────────────────┐
│   XML Kenlo    │
│  (imóveis +    │
│  corretores)   │
└───────┬────────┘
        │
        ▼
┌─────────────────┐
│ xmlSyncService  │ ◄── Job diário (madrugada)
│ - Parse XML     │ ◄── Botão "Sincronizar"
│ - Match corretor│
│ - Upsert DB     │
└───────┬────────┘
        │
        ▼
┌─────────────────┐
│imoveis_corretores│
│ (tenant_id,     │
│  codigo_imovel, │
│  corretor_id)   │
└───────┬────────┘
        │
        ├──────────────────────┐
        ▼                      ▼
┌─────────────────┐   ┌─────────────────┐
│ Meus Imóveis    │   │ API /leads      │
│ (corretor vê    │   │ (atribuição     │
│  seus imóveis)  │   │  automática)    │
└─────────────────┘   └─────────────────┘
```

---

## ✅ Critérios de Aceite

1. [ ] Corretor logado vê seus imóveis em "Meus Imóveis" automaticamente
2. [ ] Sincronização automática 1x/dia (madrugada)
3. [ ] Botão "Sincronizar" funciona imediatamente
4. [ ] Leads criados via API são atribuídos ao corretor do imóvel
5. [ ] Leads da Central são atribuídos ao corretor do imóvel
6. [ ] Match funciona por email, telefone ou nome
7. [ ] Logs claros de sincronização e atribuição

---

## ⚠️ Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| XML sem dados de corretor | Fallback para roleta |
| Corretor não cadastrado no sistema | Criar via Edge Function |
| Múltiplos corretores com mesmo nome | Priorizar email > telefone |
| Sobrecarga de requisições | Fila com intervalo de 5min |
| XML indisponível | Usar cache local (temp_kenlo.xml) |

---

## 🚀 Ordem de Implementação

1. **xmlSyncService.ts** - Core da sincronização
2. **MeusImoveisTab.tsx** - Botão de sync manual
3. **useXmlAutoSync.ts** - Job automático
4. **api-server.js** - Melhorar pipeline
5. **kenloLeadsService.ts** - Atribuição em leads Kenlo

---

## 📅 Estimativa

- **Fase 1** (Sync XML → Meus Imóveis): 2-3 horas
- **Fase 2** (Atribuição automática leads): 1-2 horas
- **Testes e ajustes**: 1 hora

**Total estimado**: 4-6 horas
