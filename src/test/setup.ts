import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Env fake p/ o supabaseClient não lançar ao ser importado em testes de unidade
// (services puros tipo leadsService importam o client no topo do módulo).
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
// JWT fake (formato eyJ...) — o client valida o formato, não a assinatura.
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.test");

// Limpa o DOM renderizado após cada teste para evitar vazamento entre casos
afterEach(() => {
  cleanup();
});
