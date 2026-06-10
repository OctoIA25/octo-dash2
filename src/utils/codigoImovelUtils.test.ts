import { describe, it, expect } from "vitest";
import { extractCodigoFromConversation, extractCodigoImovel, isValidCodigoImovel, normalizeCodigoImovel } from "./codigoImovelUtils";

describe("extractCodigoImovel", () => {
    it.each([
        ["cb0123", "CB0123"],
        ["Imovel CB0123 está disponivel", "CB0123"],
        ["ref CA 0123", "CA0123"]
    ])("extrai e normaliza o codigo de %j", (input, expected) => {
        expect(extractCodigoImovel(input)).toBe(expected);
    });

    it.each([null, undefined, "", "abc", "123456"])(
        "retorna undefined pra entrada inválida: %s",
        (input) => {
            expect(extractCodigoImovel(input)).toBeUndefined();
        }
    )

    it.each(["CA0123", "AP123", "CS-1234"])(
        "aceita codigo válido: %s",
        (codigo) => {
            expect(isValidCodigoImovel(codigo)).toBe(true);
        }
    )

    it.each([null, undefined, "CASA123", "A123", "123456"])(
        "rejeita codigo inválido: %s",
        (codigo) => {
            expect(isValidCodigoImovel(codigo)).toBe(false);
        }
    )

    it.each([
            ["O cliente quer o imovel CA0123 urgente", "CA0123"],
            ["O cliente precisa do codigo CA0123", "CA0123"],
            ["Vi o apartamento CA0123 e AP0456", "CA0123"]
        ])("extrair codigo da conversa: %s", (input, expected) => {
        expect(extractCodigoFromConversation(input)).toBe(expected);
    }); 
});
