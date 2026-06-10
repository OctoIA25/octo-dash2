import { describe, expect, it } from "vitest";
import { gerarEmailCorretor } from "./emailUtils";

describe("gerarEmailCorretor", () => {
    it.each([
        ["Victor Prado", "victor.prado@imobiliaria.com"]
    ])("Gerador de email para corretores: %j", (input, expected) => {
        expect(gerarEmailCorretor(input)).toBe(expected);
    })
})