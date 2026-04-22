# Plano: Correções Meus Imóveis e Atribuição Automática
Esta proposta resolve o erro de cadastro na aba Meus Imóveis e implementa a lógica completa de autoatribuição/roleta para leads.

## 1. Diagnóstico e correção do erro em MeusImoveisTab
- **Reproduzir** o fluxo logado como corretor e capturar detalhes do erro (supabase response, campos enviados).
- **Verificar** se `user.id`, `tenantId` ou `telefone` estão indefinidos na chamada de insert/update; inspecionar console completo.
- **Checar** a tabela `imoveis_corretores` para confirmar colunas obrigatórias (nome, telefone, tenant_id) e ajustar o payload do insert/transfer.
- **Adicionar** validações de frontend (ex.: impedir código vazio, normalizar formato) e mensagens específicas segundo o erro retornado pelo Supabase.
- **Testar** atribuição como corretor comum e como gestor (com transferência), garantindo atualização instantânea da lista.

## 2. Estratégia universal de atribuição automática de leads
### 2.1 Pipeline de decisão
1. **Fonte Kenlo (raw_data.attendedBy)**: se o lead já vem com corretor do XML Kenlo, manter esse responsável e sincronizar com nossos campos (`attended_by_name/id`).
2. **Código de imóvel do XML/catálogo**: se recebemos `property_code` e o XML/cache indica um corretor responsável (dados vindo da sincronização de imóveis), usar esse corretor; comparar telefones normalizados.
3. **Banco de atribuições manuais (Meus Imóveis)**: se nenhum passo anterior resolveu, buscar na tabela `imoveis_corretores` pelo código cadastrado manualmente.
4. **Fallback (nova roleta)**: quando nenhum dos métodos anteriores encontra responsável, aplicar roleta.

### 2.2 Implementação técnica
- **Normalização**: criar helpers para limpar telefone (DDD + número) e código (upper-case, remover espaços).
- **Serviços compartilhados**: extrair função `resolveBrokerByPropertyCode` (para XML + Meus Imóveis) e `resolveBrokerByPhone` (para attendedBy/banco).
- **API** (`POST /leads`, `PATCH /leads/:id/agent`): refatorar para usar a pipeline unificada; registrar no response qual método atribuiu o lead.
- **Logs e auditoria**: armazenar `assignment_method` e `assignment_source` no lead para rastrear decisões.

## 3. Sistema de roleta racional para leads sem corretor
- **Critérios de elegibilidade**: lista de corretores ativos do tenant (roles específicos, status ativo, opt-in para roleta).
- **Persistência**: criar tabela/config para armazenar `last_assigned_index` por tenant, evitando reset a cada restart (ex.: `tenant_broker_rotation`).
- **Algoritmo**: ordenar corretores por prioridade fixa, atribuir ao próximo índice, atualizar ponteiro (`(index + 1) % total`).
- **Integração**: encaixar como último passo da pipeline de atribuição; registrar quando um lead for distribuído via roleta.
- **Monitoramento**: expor endpoint/admin view para visualizar status da roleta e próximos corretores na fila.

## 4. Testes e validação
- **Cenários Meus Imóveis**: adicionar/remover códigos, tentativa de duplicar, transferência por gestor.
- **Autoatribuição**: 
  - Lead com `raw_data.attendedBy` (simular payload do Kenlo).
  - Lead via API com `property_code` presente no XML/cache (mock).
  - Lead com código cadastrado manualmente em `imoveis_corretores`.
  - Lead sem responsável para acionar roleta.
- **Roleta**: validar sequência correta entre n corretores, inclusive após reinícios; cobrir casos com apenas 1 corretor (sempre ele) e nenhum corretor (retornar erro/controlar fallback).
- **Documentação**: atualizar /apidocs descrevendo a ordem de atribuição e como usar cada mecanismo.
