# Feature: relatorios

Funcionalidades relacionadas a **relatorios** no CRM.

## Estrutura
- `components/` — componentes específicos
- `hooks/` — hooks específicos
- `pages/` — páginas da feature
- `services/` — integrações (Supabase, APIs)
- `types/` — tipos TypeScript

## API pública
Exportar aqui apenas o que outras features/páginas precisam usar:
```ts
export { SomePage } from './pages/SomePage';
export { useSomeHook } from './hooks/useSomeHook';
```

## Relatório: Funil por Unidade (tipo de imóvel)

Mesmo conceito do funil de leads existente, porém **agrupando por tipo de
imóvel/unidade** em vez de mídia/origem. Renderizado no topo da seção
**Imóveis** (landing padrão, `tipoCliente === 'nenhum'`), logo após os KPIs.

- **Etapas do funil:** reaproveitadas de `@/features/leads/utils/funnelStages`
  (as mesmas dos demais relatórios — sem duplicar regra de negócio).
- **Classificação do tipo:** o lead não possui tipo de imóvel estruturado.
  Cruza-se `lead.codigo_imovel` (= `leads.property_code`) com
  `imoveis_locais (codigo_imovel, tipo, tipo_simplificado)` via
  `useImovelTipoMap` (1 query por tenant, junção em memória — sem N+1).
- **Categorias:** Apartamento, Casa, Terreno, **Galpão**, Outros, Não informado
  (`utils/unidadeClassifier.ts`).
  - "Galpão" é detectado pelo **texto livre** `imoveis_locais.tipo`, pois o
    `tipo_simplificado` o agrupa genericamente em `comercial`.
  - `comercial` (não-galpão), `rural` e `outro` caem em **Outros**.
  - Lead sem `codigo_imovel`, ou com código sem correspondência, cai em
    **Não informado** (a lacuna de dado é exposta, não mascarada).

### Comportamento documentado: "Lançamentos" omitido

A categoria **Lançamentos** foi **intencionalmente deixada de fora**.
`lancamentos` é uma **tabela separada**, sem vínculo com o lead no modelo
atual — não há, hoje, como contar um lead como "Lançamento". Quando esse
vínculo existir (ex.: campo no lead ou marcação em `imoveis_locais`), basta:
1. adicionar `'Lançamentos'` em `UNIDADE_CATEGORIES` (na ordem desejada);
2. tratar o caso em `classifyUnidade`/`categoriaFromTipo`.
Nenhuma outra parte do relatório precisa mudar (etapas e renderização são
reaproveitadas).
