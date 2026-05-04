import { useQuery } from "@tanstack/react-query";
import { fetchLeadsDoCorretorCRM, LeadType } from "@/features/leads/services/leadsService";

export function useLeadsQuery(
    userId: string,
    tenantId?: string,
    corretorNome?: string,
    leadType?: LeadType
) {
    return useQuery({
        queryKey: ['leads', 'corretor', userId, tenantId, leadType],
        queryFn: () => fetchLeadsDoCorretorCRM(userId, tenantId, corretorNome, leadType),
        enabled: !!userId,
        staleTime: 2 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    })
}