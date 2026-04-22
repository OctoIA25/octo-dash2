# Plano: Corrigir métricas de funis de corretores

## Problemas identificados

1. **Funis mostram dados incorretos**: Ao entrar como corretor, mostra 1 novo lead (mas não tem) e 1 em interação, depois de 7s mostra correto
2. **Funil "Cliente Interessado" zerado**: Mostra tudo zerado mesmo tendo leads
3. **Filtragem por tipo de lead**: Os componentes de funil não estão filtrando corretamente por `lead_type`
4. **Separação de funis**: Os dois funis (Interessado e Proprietário) devem ser espelhos dos funis gerais

## Causa raiz

Em `src/hooks/useLeadsMetrics.ts`:
- O hook é chamado sem `leadType` por padrão (`leadType = null`)
- Quando `leadType` é `null`, busca TODOS os leads do usuário (sem filtrar por `lead_type`)
- Os `funnelMetricsInteressado` e `funnelMetricsProprietario` são calculados a partir dos mesmos leads, causando contagens incorretas

Em `src/components/LeadsFunnelChart.tsx` e `src/components/VendedoresFunnelChart.tsx`:
- Ambos chamam `useLeadsMetrics()` sem passar `leadType`
- Isso significa que ambos recebem TODOS os leads (não filtrados por tipo)

## Solução

### 1. Modificar `useLeadsMetrics.ts` para buscar os tipos corretos

Quando `leadType` é `null`, o hook deve buscar leads de ambos os tipos separadamente e calcular os funis corretamente:

```typescript
// Se leadType é null, buscar leads de ambos os tipos
const [leadsInteressado, leadsProprietario] = await Promise.all([
  fetchLeadsForMetrics(effectiveTenantId, agentId, LEAD_TYPE_INTERESSADO),
  fetchLeadsForMetrics(effectiveTenantId, agentId, LEAD_TYPE_PROPRIETARIO)
]);
const allLeads = [...leadsInteressado, ...leadsProprietario];

// Calcular funis com os leads corretos
const funnelMetricsInteressado = calculateFunnelMetrics(leadsInteressado, LEAD_TYPE_INTERESSADO, isAdmin);
const funnelMetricsProprietario = calculateFunnelMetrics(leadsProprietario, LEAD_TYPE_PROPRIETARIO, isAdmin);
```

### 2. Modificar componentes de funil para usar hooks específicos

- `LeadsFunnelChart`: Usar `useInteressadoMetrics()` em vez de `useLeadsMetrics()`
- `VendedoresFunnelChart`: Usar `useProprietarioMetrics()` em vez de `useLeadsMetrics()`

### 3. Garantir filtragem por role

- Corretor: `agentId = user.id`, vê apenas seus leads
- Admin: `agentId = null`, vê todos os leads do tenant

## Arquivos a modificar

1. `src/hooks/useLeadsMetrics.ts` - Modificar lógica quando `leadType` é `null`
2. `src/components/LeadsFunnelChart.tsx` - Usar `useInteressadoMetrics()`
3. `src/components/VendedoresFunnelChart.tsx` - Usar `useProprietarioMetrics()`

## Validação

Após implementação:
1. Corretor com 1 lead em "Interação" deve mostrar 1 lead em "Interação" no funil de Interessado
2. Funil "Cliente Interessado" deve mostrar dados corretos (não zerado)
3. Admin deve ver total de leads de todos os corretores
4. Corretor deve ver apenas seus leads
5. Funis devem refletir corretamente onde os leads estão no kanban
