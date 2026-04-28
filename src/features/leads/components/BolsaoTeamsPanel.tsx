/**
 * Aba "Equipes" da página Bolsão.
 * Lista equipes do tenant (tabela `teams`) com membros e leads que
 * passaram por cada equipe via `lead_queue_history`.
 *
 * Interligado com `teamsManagementService` (mesma fonte do CRM principal).
 */

import { useEffect, useState, useMemo } from 'react';
import { Loader2, Users, Crown, Inbox, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchTeams,
  fetchTeamMembers,
  type Team,
  type TeamMember,
} from '@/features/corretores/services/teamsManagementService';

interface BolsaoTeamsPanelProps {
  tenantId: string | null | undefined;
  isAdmin: boolean;
  teamQueueEnabled: boolean;
}

interface TeamLeadHistory {
  id: string;
  bolsao_lead_id: number | null;
  original_corretor_name: string | null;
  redistributed_to_name: string | null;
  attempt_number: number;
  created_at: string;
}

interface ExpandedTeamData {
  members: TeamMember[];
  history: TeamLeadHistory[];
  loading: boolean;
}

export const BolsaoTeamsPanel = ({ tenantId, isAdmin, teamQueueEnabled }: BolsaoTeamsPanelProps) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<Record<string, ExpandedTeamData>>({});
  const [historyCounts, setHistoryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchTeams(tenantId),
      // Conta leads redistribuídos por leader (mais confiável que matching por nome)
      supabase
        .from('lead_queue_history' as any)
        .select('leader_user_id')
        .eq('tenant_id', tenantId)
        .eq('reason', 'expired_no_response_team_queue')
        .eq('success', true),
    ])
      .then(([teamsResult, historyResult]) => {
        if (cancelled) return;
        setTeams(teamsResult);
        const counts: Record<string, number> = {};
        const rows = (historyResult as { data?: { leader_user_id?: string }[] }).data ?? [];
        for (const row of rows) {
          if (!row.leader_user_id) continue;
          counts[row.leader_user_id] = (counts[row.leader_user_id] ?? 0) + 1;
        }
        setHistoryCounts(counts);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tenantId]);

  const handleToggleExpand = async (team: Team) => {
    if (expandedTeam === team.id) {
      setExpandedTeam(null);
      return;
    }
    setExpandedTeam(team.id);

    if (teamData[team.id]) return; // cache

    setTeamData((prev) => ({ ...prev, [team.id]: { members: [], history: [], loading: true } }));

    if (!tenantId) return;

    const [members, historyRes] = await Promise.all([
      fetchTeamMembers(team.id, tenantId),
      team.leader_user_id
        ? supabase
            .from('lead_queue_history' as any)
            .select('id, bolsao_lead_id, original_corretor_name, redistributed_to_name, attempt_number, created_at')
            .eq('tenant_id', tenantId)
            .eq('leader_user_id', team.leader_user_id)
            .eq('reason', 'expired_no_response_team_queue')
            .eq('success', true)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

    setTeamData((prev) => ({
      ...prev,
      [team.id]: {
        members,
        history: ((historyRes as { data?: TeamLeadHistory[] }).data ?? []),
        loading: false,
      },
    }));
  };

  if (!isAdmin) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400">
        <Users className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
        <p className="text-sm">Apenas administradores podem ver as equipes do bolsão.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center text-slate-500 dark:text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p className="text-sm">Carregando equipes…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-[1100px] mx-auto space-y-4">
      {/* Aviso quando team_queue não está ativo */}
      {!teamQueueEnabled && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 flex items-start gap-3">
          <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
              Bolsão por equipe não está ativo
            </p>
            <p className="text-[12px] text-amber-700 dark:text-amber-300/80 mt-0.5">
              Para os leads expirarem dentro da equipe, ative em <strong>Configurações → Modo de redistribuição → Bolsão por equipe</strong>.
              Esta tela continua mostrando as equipes pra você consultar.
            </p>
          </div>
        </div>
      )}

      {/* Header info */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Equipes do tenant</h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {teams.length} {teams.length === 1 ? 'equipe' : 'equipes'} cadastrada{teams.length === 1 ? '' : 's'} no CRM.
          </p>
        </div>
      </div>

      {/* Lista de equipes */}
      {teams.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">Nenhuma equipe cadastrada</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Crie equipes em <strong>Gestão de Equipe</strong> para que possam aparecer aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => {
            const expanded = expandedTeam === team.id;
            const data = teamData[team.id];
            const leadCount = team.leader_user_id ? historyCounts[team.leader_user_id] ?? 0 : 0;
            return (
              <div
                key={team.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              >
                {/* Header do card */}
                <button
                  type="button"
                  onClick={() => handleToggleExpand(team)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                    style={{ backgroundColor: team.color }}
                  >
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 truncate">{team.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {team.leader_name && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                          <Crown className="w-3 h-3 text-amber-500" />
                          {team.leader_name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                        <Users className="w-3 h-3" />
                        {team.member_count ?? 0} {(team.member_count ?? 0) === 1 ? 'membro' : 'membros'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                        <Inbox className="w-3 h-3" />
                        {leadCount} {leadCount === 1 ? 'lead passou' : 'leads passaram'}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Conteúdo expandido */}
                {expanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 bg-slate-50/30 dark:bg-slate-950/30">
                    {!data || data.loading ? (
                      <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Carregando detalhes…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Membros */}
                        <div>
                          <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Membros ({data.members.length})
                          </h4>
                          {data.members.length === 0 ? (
                            <p className="text-[12px] text-slate-400 italic">Nenhum membro nesta equipe ainda.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {data.members.map((m) => (
                                <li key={m.membership_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
                                    {m.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 truncate">{m.name}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{m.email}</p>
                                  </div>
                                  {m.role === 'team_leader' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold uppercase tracking-wider">
                                      Líder
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Leads que passaram */}
                        <div>
                          <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Histórico de redistribuições ({data.history.length})
                          </h4>
                          {data.history.length === 0 ? (
                            <p className="text-[12px] text-slate-400 italic">Nenhum lead foi redistribuído nesta equipe ainda.</p>
                          ) : (
                            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                              {data.history.map((h) => (
                                <li key={h.id} className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                  <p className="text-[12.5px] text-slate-700 dark:text-slate-200">
                                    <span className="font-semibold">{h.original_corretor_name || 'Sem original'}</span>
                                    <span className="text-slate-400"> → </span>
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">{h.redistributed_to_name}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Tentativa #{h.attempt_number} · {new Date(h.created_at).toLocaleString('pt-BR')}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BolsaoTeamsPanel;
