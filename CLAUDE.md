# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Instalar dependências do frontend
npm install

# Iniciar frontend (Vite) na porta 8080
npm run dev

# Iniciar servidor Express separado (necessário para /api/v1/*)
node server/api-server.js

# Lint
npm run lint
```

### Build e Produção
```bash
# Build do frontend (VITE_* vars são injetadas no build, não em runtime)
npm run build

# Servidor de produção (serve o build + proxy Kenlo)
npm run start:prod

# Docker
npm run docker:build-run
```

### Servidor de desenvolvimento com nodemon
```bash
cd server && npm run dev
```

---

## Arquitetura

### Dois processos em desenvolvimento
Em dev, rodam **dois processos simultâneos**:
1. **Vite** (`npm run dev`) na porta 8080 — serve o frontend React
2. **Express** (`node server/api-server.js`) na porta 3001 — serve a REST API

O Vite faz proxy das rotas:
- `/api/v1/*` → `localhost:3001` (Express local)
- `/api/kenlo/*` → API externa Kenlo/ValueGaia (resolve CORS)

Em produção, `server/proxy-production.js` faz tudo: serve o `dist/` estático + proxy Kenlo + endpoints Supabase.

### Multi-tenancy
Cada imobiliária é um **tenant** isolado. O isolamento ocorre em duas camadas:
1. **RLS no Supabase** — políticas por `tenant_id` filtram automaticamente dados por usuário
2. **Aplicação** — `AuthContext` carrega `tenantId` do usuário e passa para queries/serviços

**4 roles do sistema** (`src/types/permissions.ts`):
- `owner` — dono da plataforma (email hardcoded: `octo.inteligenciaimobiliaria@gmail.com`), acesso a todos os tenants via impersonation
- `admin` — administrador de uma imobiliária
- `team_leader` — líder de equipe
- `corretor` — acesso restrito às próprias funcionalidades

### Autenticação (`src/contexts/AuthContext.tsx`)
- Único `AuthProvider` no topo da árvore — **não use `useAuth()` diretamente**, use `useAuthContext()`
- Login = Supabase Auth (`signInWithPassword`) + busca de membership na view `my_memberships_with_tenant`
- Owner pode fazer impersonation de tenants via `localStorage` (chave `owner-impersonation`)
- Permissões de sidebar são derivadas do role ou de `permissions.sidebar_permissions` no banco

### Fluxo de renderização (`src/App.tsx`)
```
App
└── QueryClientProvider + AuthProvider + NotificationsProvider
    └── AppContent
        ├── isLoading → OctoDashLoader
        ├── isOwner && tenantId === 'owner' → OwnerDashboard
        ├── isAuthenticated → DashboardLayout (CRM principal)
        └── !isAuthenticated → MinimalLoginScreen
```

Todas as páginas são carregadas com `React.lazy` + `React.Suspense`.

### Supabase client
- Cliente singleton em `src/lib/supabaseClient.ts`, re-exportado por `src/integrations/supabase/client.ts`
- **`VITE_SUPABASE_ANON_KEY` deve ser a chave JWT legacy** (começa com `eyJ`), não a publishable (`sb_`)
- `SUPABASE_SERVICE_ROLE_KEY` é usada pelo servidor Express (bypassa RLS)

### Variáveis de ambiente obrigatórias
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=          # JWT (eyJ...), NÃO publishable (sb_...)
SUPABASE_SERVICE_ROLE_KEY=       # Servidor apenas (bypassa RLS)
VITE_GOOGLE_CALENDAR_CLIENT_ID=  # OAuth Google Calendar
VITE_GOOGLE_CALENDAR_CLIENT_SECRET=
```

Em Docker/EasyPanel, as variáveis `VITE_*` devem ser passadas como **Build Arguments** (não env vars de runtime), pois são incorporadas no bundle pelo Vite.

### Módulos de feature (`src/modules/`)
Funcionalidades mais complexas são organizadas em módulos com estrutura `components/`, `hooks/`, `utils/`, `index.ts`:
- `corretores/` — métricas e análises de corretores
- `imoveis/` — gestão de imóveis
- `funil-cliente-interessado/` — funil de clientes interessados
- `funil-cliente-proprietario/` — funil de proprietários

### Estado do servidor
TanStack Query com configuração global: `staleTime: 5min`, `gcTime: 10min`, `refetchOnWindowFocus: false`, `retry: 1`.

### Path alias
`@/` mapeia para `src/` — use sempre para imports internos.
