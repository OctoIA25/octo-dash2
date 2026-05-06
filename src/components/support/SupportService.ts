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

            const payload = {
                ...report,
                ...systemInfo,
                id: SupportService.currentUser?.id,
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
