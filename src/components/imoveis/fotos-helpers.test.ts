import { describe, it, expect } from "vitest";
import {
    getFotoUrl,
    getFotoLegenda,
    getFotoCapa,
    getFotoCapaUrl,
    normalizeFotos,
    type Foto,
    type FotoInput,
} from "./fotos-helpers";

// URLs reais do pipeline de marca d'água (servidos pela CDN do Supabase).
const URL_MARCADA = "https://cdn.supabase.co/property-photos/tenants/t1/properties/p1/img1/wm_v12_o35_s30_portal.webp";
const URL_LIMPA = "https://cdn.supabase.co/property-photos/tenants/t1/properties/p1/img1/clean_portal.webp";
const URL_ESTAVEL = "https://app.exemplo.com/api/v1/watermark/photos/img1/portal";

describe("getFotoUrl", () => {
    it.each([
        ["string crua", URL_LIMPA, URL_LIMPA],
        ["objeto {url}", { url: URL_MARCADA }, URL_MARCADA],
        ["endpoint estável", { url: URL_ESTAVEL }, URL_ESTAVEL],
    ])("extrai a URL de %s", (_caso, input, expected) => {
        expect(getFotoUrl(input as Foto | string)).toBe(expected);
    });

    it("desembrulha objeto aninhado { url: { url } } (registro legado)", () => {
        expect(getFotoUrl({ url: { url: URL_LIMPA } } as unknown as Foto)).toBe(URL_LIMPA);
    });

    it("aceita publicUrl no objeto aninhado", () => {
        expect(getFotoUrl({ url: { publicUrl: URL_LIMPA } } as unknown as Foto)).toBe(URL_LIMPA);
    });

    it.each([null, undefined, "", { url: 123 }, { url: {} }])(
        "retorna null pra entrada inválida: %s",
        (input) => {
            expect(getFotoUrl(input as Foto | string | null | undefined)).toBeNull();
        }
    );
});

describe("getFotoLegenda", () => {
    it("retorna a legenda do objeto", () => {
        expect(getFotoLegenda({ url: URL_LIMPA, legenda: "Fachada" })).toBe("Fachada");
    });

    it.each([null, undefined, URL_LIMPA, { url: URL_LIMPA }])(
        "retorna string vazia quando não há legenda: %s",
        (input) => {
            expect(getFotoLegenda(input as Foto | string | null | undefined)).toBe("");
        }
    );
});

describe("getFotoCapa / getFotoCapaUrl", () => {
    it("prefere a foto marcada como isCapa", () => {
        const fotos: Foto[] = [
            { url: URL_LIMPA },
            { url: URL_MARCADA, isCapa: true },
        ];
        expect(getFotoCapa(fotos)).toEqual({ url: URL_MARCADA, isCapa: true });
        expect(getFotoCapaUrl(fotos)).toBe(URL_MARCADA);
    });

    it("cai para a primeira foto quando nenhuma é capa", () => {
        const fotos: Foto[] = [{ url: URL_LIMPA }, { url: URL_MARCADA }];
        expect(getFotoCapaUrl(fotos)).toBe(URL_LIMPA);
    });

    // Tuplas de 1 arg: it.each espalharia o [] como "zero argumentos".
    it.each([[null], [undefined], [[] as Foto[]]])(
        "retorna null pra lista vazia/ausente: %s",
        (input) => {
            expect(getFotoCapa(input)).toBeNull();
            expect(getFotoCapaUrl(input)).toBeNull();
        }
    );
});

describe("normalizeFotos", () => {
    it("PRESERVA o id do pipeline de marca d'água (correção do liga/desliga)", () => {
        const out = normalizeFotos([
            { url: URL_MARCADA, id: "img-uuid-1", legenda: "Sala" },
        ]);
        // Sem o id, o reprocessamento pula a foto e a marca fica "presa".
        expect(out[0].id).toBe("img-uuid-1");
        expect(out[0].legenda).toBe("Sala");
    });

    it("NÃO inventa id quando a foto não tem (não cria a chave)", () => {
        const out = normalizeFotos([{ url: URL_LIMPA }]);
        expect("id" in out[0]).toBe(false);
    });

    it("mantém o id ao longo da reescrita da capa", () => {
        const out = normalizeFotos([
            { url: URL_LIMPA, id: "a" },
            { url: URL_MARCADA, id: "b", isCapa: true },
        ]);
        expect(out.map((f) => f.id)).toEqual(["a", "b"]);
    });

    it("garante exatamente uma capa (marca a primeira se nenhuma)", () => {
        const out = normalizeFotos([{ url: URL_LIMPA }, { url: URL_MARCADA }]);
        expect(out.map((f) => f.isCapa)).toEqual([true, false]);
    });

    it("mantém só a primeira capa quando há mais de uma marcada", () => {
        const out = normalizeFotos([
            { url: URL_LIMPA, isCapa: true },
            { url: URL_MARCADA, isCapa: true },
        ]);
        expect(out.map((f) => f.isCapa)).toEqual([true, false]);
    });

    it("converte formato legado (string[]) para objetos", () => {
        const out = normalizeFotos([URL_LIMPA, URL_MARCADA]);
        expect(out).toEqual([
            { url: URL_LIMPA, legenda: "", isCapa: true },
            { url: URL_MARCADA, legenda: "", isCapa: false },
        ]);
    });

    it("descarta fotos sem URL válida", () => {
        const out = normalizeFotos([
            { url: "" },
            { url: URL_LIMPA, id: "ok" },
            { url: { foo: "bar" } } as unknown as Foto,
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({ url: URL_LIMPA, legenda: "", isCapa: true, id: "ok" });
    });

    // Tuplas de 1 arg: it.each espalharia o [] como "zero argumentos".
    it.each([[null], [undefined], [[] as FotoInput[]]])(
        "retorna lista vazia pra entrada vazia/ausente: %s",
        (input) => {
            expect(normalizeFotos(input)).toEqual([]);
        }
    );
});
