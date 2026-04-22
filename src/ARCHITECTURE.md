# OctoDash CRM — Arquitetura do Código

> Documento para devs que vão trabalhar neste projeto.

## Princípios

- **Feature-based architecture** (Screaming Architecture): a estrutura de pastas reflete as funcionalidades do CRM, não o tipo técnico do arquivo.
- **Cada feature é auto-contida**: componentes, hooks, services e tipos relacionados ficam juntos na mesma pasta.
- **Shared é reutilizável**: só o que é usado por 2+ features fica em `shared/`.
- **Baixo acoplamento**: uma feature não importa diretamente de outra — passa por `shared/` ou via props.

## Estrutura

```
src/
├── features/              # Funcionalidades do CRM (uma pasta por domínio)
│   ├── auth/              # Autenticação, permissões, roles
│   ├── leads/             # Kanban de leads, central de leads, bolsão
│   ├── imoveis/           # Portfólio de imóveis, XML Kenlo
│   ├── corretores/        # Gestão de equipe, testes comportamentais (DISC, MBTI, Eneagrama)
│   ├── estudo-mercado/    # Avaliação de imóveis com amostras comparáveis
│   ├── relatorios/        # Dashboards de relatórios e gráficos
│   ├── agenda/            # Calendário + integração Google Calendar
│   ├── agentes-ia/        # Elaine, Caio Kotler (agentes de IA)
│   ├── metricas/          # Dashboards de métricas e KPIs
│   ├── bolsao/            # Pool de leads redistribuídos
│   ├── notificacoes/      # Sistema de notificações in-app
│   ├── api-docs/          # Documentação pública da API
│   └── settings/          # Configurações do tenant
│
├── shared/                # Código compartilhado entre features
│   ├── components/        # Componentes reutilizáveis (ErrorBoundary, layouts)
│   ├── hooks/             # Hooks comuns (use-toast, use-mobile)
│   ├── utils/             # Funções utilitárias (formatters, parsers)
│   ├── types/             # Tipos globais
│   └── lib/               # Bibliotecas de infraestrutura (supabase, openai)
│
├── components/ui/         # Componentes shadcn/ui (manter padrão)
├── contexts/              # React Context providers (Auth, Notifications)
├── pages/                 # Páginas root e layouts principais
├── styles/                # CSS adicionais
├── main.tsx               # Entry point
└── App.tsx                # Root component
```

## Estrutura de uma feature

Cada feature segue este padrão:

```
features/<nome>/
├── components/            # Componentes específicos desta feature
│   ├── FooCard.tsx
│   └── BarList.tsx
├── hooks/                 # Hooks específicos
│   └── useFooData.ts
├── pages/                 # Páginas dessa feature
│   └── FooPage.tsx
├── services/              # Integrações (Supabase, APIs externas)
│   └── fooService.ts
├── types/                 # Tipos específicos
│   └── foo.types.ts
├── index.ts               # Barrel export (re-exporta API pública)
└── README.md              # Descrição da feature
```

## Path Aliases

Imports seguem este padrão (configurado em `tsconfig.json` e `vite.config.ts`):

```typescript
import { ProfileCard } from '@/features/corretores/components/ProfileCard';
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';
import { supabase } from '@/shared/lib/supabase';
import { Button } from '@/components/ui/button';  // shadcn mantém @/components/ui
```

## Regras para novos devs

1. **Nova funcionalidade?** → crie ou use uma feature em `features/`.
2. **Componente usado em 2+ features?** → mova para `shared/components/`.
3. **Componente usado em 1 feature?** → fica em `features/<nome>/components/`.
4. **Import cross-feature** (`features/leads` importando `features/imoveis`)? → repensar; extrair para `shared/` ou passar via props.
5. **Página nova?** → `features/<nome>/pages/` + adicionar rota em `pages/DashboardLayout.tsx`.
6. **Antes de criar um service novo** → verificar se já existe algo reutilizável em `shared/lib/`.

## Histórico da migração

Este projeto foi migrado de uma estrutura "por tipo" (`components/`, `services/`, `hooks/`) para "por feature" em 2026. Alguns arquivos ainda podem estar nos caminhos antigos durante a transição — seguir migrando quando tocar neles.

Backup do CSS antigo em `src/index-legacy.css` (não importado no build).
