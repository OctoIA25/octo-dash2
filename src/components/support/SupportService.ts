import { BugReport } from "./types";
import { supabase } from "@/lib/supabaseClient";

type SupportUserContext = {
    id?: string;
};

export class SupportService {
    private static instance: SupportService;
    private static currentUser?: SupportUserContext | null;
    private static currentTenantId?: string;

    static getInstance(): SupportService {
        if(!SupportService.instance) {
            SupportService.instance = new SupportService();
        }
        return SupportService.instance;
    }

    static setContext(user: SupportUserContext | null, tenantId: string) {
        SupportService.currentUser = user;
        SupportService.currentTenantId = tenantId;
    }

    async sendBugReport(report: Omit<BugReport, 'id' | 'status'>): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            const systemInfo = this.collectSystemInfo();

            // `user_id`, e NÃO `id`. Até 22/09/2026 isto mandava o identificador
            // de QUEM reportou no campo do identificador DO REPORTE — e como
            // `bug_reports` não tinha chave primária, nada reclamou: os quatro
            // reportes de produção ficaram com o mesmo id e `user_id` vazio.
            // Mesmo abrindo a tabela, não dava para saber de quem era a queixa.
            // O id agora vem do banco (`gen_random_uuid()`).
            const payload = {
                ...report,
                ...systemInfo,
                user_id: SupportService.currentUser?.id ?? null,
                tenant_id: SupportService.currentTenantId,
                status: 'open' as const
            };

            const response = await this.submitToBackend(payload);

            return { success: true, id: response.id}
        } catch(err) {
            console.error('Erro ao enviar bug report:', err)
            return { success: false, error: err.message };
        }
    }

    private collectSystemInfo() {
        return {
            user_agent: navigator.userAgent,
            url: window.location.href,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            screen: {
                width: screen.width,
                height: screen.height
            }  
        };
    }

    private async submitToBackend(payload: BugReport) {
       const { data, error } = await supabase
            .from('bug_reports')
            .insert([payload])
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }
}
