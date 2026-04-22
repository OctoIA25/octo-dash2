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
