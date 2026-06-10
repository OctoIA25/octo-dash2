import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Limpa o DOM renderizado após cada teste para evitar vazamento entre casos
afterEach(() => {
  cleanup();
});
