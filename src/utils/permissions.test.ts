import { expect, describe, it } from "vitest";
import { CORRETOR_BLOCKED_SECTIONS, CORRETOR_SIDEBAR_PERMISSIONS } from "@/types/permissions";
it("corretor nunca acessa secoes bloqueadas", () => {
    for (const blocked of CORRETOR_BLOCKED_SECTIONS) {
        expect(CORRETOR_SIDEBAR_PERMISSIONS).not.toContain(blocked);
    }
})