/**
 * 👥 GERENCIADOR DE EQUIPES
 *
 * Permite criar/editar/excluir equipes, atribuir líderes e gerenciar membros.
 * Integrado com: leader_user_id, team queue, multitenancy.
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Crown, Edit2, Trash2, UserPlus, X, Loader2, Shield, Save, ChevronRight, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useLateralDrawer } from '@/hooks/useLateralDrawer';
import {
  fetchTeams, fetchTeamMembers, fetchAvailableMembers,
  createTeam, updateTeam, deleteTeam, addMemberToTeam, removeMemberFromTeam,
  type Team, type TeamMember,
} from '../services/teamsManagementService';
import { fetchTenantMembers, type TenantMember } from '../services/tenantMembersService';
import {
  fetchTenantBolsaoConfig,
  saveTenantBolsaoConfig,
  DEFAULT_BOLSAO_CONFIG,
  type TenantBolsaoConfig,
  type TeamQueueOrder,
} from '@/features/leads/services/tenantBolsaoConfigService';
import { Switch } from '@/components/ui/switch';
import { Settings2, Clock, Repeat } from 'lucide-react';

// ---------------------------------------------------------------------------
// Cores de equipe
// ---------------------------------------------------------------------------
const TEAM_COLORS: { id: string; label: string; bg: string; ring: string; dot: string; text: string }[] = [
  { id: 'vermelha', label: 'Vermelha', bg: 'bg-red-50 dark:bg-red-950/40', ring: 'ring-red-400', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300' },
  { id: 'verde',    label: 'Verde',    bg: 'bg-green-50 dark:bg-green-950/40', ring: 'ring-green-400', dot: 'bg-green-500', text: 'text-green-700 dark:text-green-300' },
  { id: 'amarela',  label: 'Amarela',  bg: 'bg-yellow-50 dark:bg-yellow-950/40', ring: 'ring-yellow-400', dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
  { id: 'azul',     label: 'Azul',     bg: 'bg-blue-50 dark:bg-blue-950/40', ring: 'ring-blue-400', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  { id: 'roxo',     label: 'Roxo',     bg: 'bg-purple-50 dark:bg-purple-950/40', ring: 'ring-purple-400', dot: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-300' },
  { id: 'laranja',  label: 'Laranja',  bg: 'bg-orange-50 dark:bg-orange-950/40', ring: 'ring-orange-400', dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  { id: 'rosa',     label: 'Rosa',     bg: 'bg-pink-50 dark:bg-pink-950/40', ring: 'ring-pink-400', dot: 'bg-pink-500', text: 'text-pink-700 dark:text-pink-300' },
  { id: 'cinza',    label: 'Cinza',    bg: 'bg-gray-50 dark:bg-slate-950', ring: 'ring-gray-400', dot: 'bg-gray-500', text: 'text-gray-700 dark:text-slate-300' },
];

const colorStyle = (color: string) =>
  TEAM_COLORS.find((c) => c.id === color) ?? TEAM_COLORS[3];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export const EquipesManagerSection = () => {
  const { tenantId, isAdmin, user } = useAuth();
  const isTeamLeader = user?.systemRole === 'team_leader';

  const [teams, setTeams] = useState<Team[]>([]);
  const [allMembers, setAllMembers] = useState<TenantMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal: criar/editar equipe
  const [teamModal, setTeamModal] = useState<{ open: boolean; mode: 'create' | 'edit'; team?: Team }>({ open: false, mode: 'create' });
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('azul');
  const [formDescription, setFormDescription] = useState('');
  const [formLeaderId, setFormLeaderId] = useState<string>('__none__');
  const [isSaving, setIsSaving] = useState(false);

  // Drawer: gerenciar membros da equipe selecionada
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  // Modal: confirmar exclusão
  const [deleteConfirm, setDeleteConfirm] = useState<Team | null>(null);

  // Apenas sobrepõe — não empurra o conteúdo da página de Gestão de Equipe.
  const [isDeleting, setIsDeleting] = useState(false);

  // Apenas administradores podem criar/editar/excluir equipes.
  // Team leaders gerenciam membros dentro da sua equipe, mas não criam/removem equipes.
  const canManage = isAdmin;

  // Config da fila por equipe (compartilhada com tenant_bolsao_config)
  const canConfigureQueue = isAdmin || isTeamLeader;
  const [bolsaoConfig, setBolsaoConfig] = useState<TenantBolsaoConfig>(DEFAULT_BOLSAO_CONFIG);
  const [isSavingQueue, setIsSavingQueue] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    fetchTenantBolsaoConfig(tenantId).then(setBolsaoConfig).catch(() => {});
  }, [tenantId]);

  const saveQueueConfig = async (patch: Partial<TenantBolsaoConfig>) => {
    if (!tenantId) return;
    const next = { ...bolsaoConfig, ...patch };
    setBolsaoConfig(next);
    setIsSavingQueue(true);
    try {
      await saveTenantBolsaoConfig(tenantId, next);
      toast.success('Fila por equipe atualizada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar configuração');
      setBolsaoConfig(bolsaoConfig); // rollback
    } finally {
      setIsSavingQueue(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------
  const loadTeams = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    setIsLoading(true);
    const [teamsData, membersData] = await Promise.all([
      fetchTeams(tenantId),
      fetchTenantMembers(tenantId),
    ]);
    setTeams(teamsData);
    setAllMembers(membersData);
    setIsLoading(false);
  }, [tenantId]);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  const loadTeamMembers = useCallback(async (team: Team) => {
    if (!tenantId) return;
    setIsLoadingMembers(true);
    const [members, available] = await Promise.all([
      fetchTeamMembers(team.id, tenantId),
      fetchAvailableMembers(tenantId, team.id),
    ]);
    setTeamMembers(members);
    setAvailableMembers(available);
    setIsLoadingMembers(false);
  }, [tenantId]);

  useEffect(() => {
    if (selectedTeam) loadTeamMembers(selectedTeam);
  }, [selectedTeam, loadTeamMembers]);

  // ---------------------------------------------------------------------------
  // Criar / Editar equipe
  // ---------------------------------------------------------------------------
  const openCreateModal = () => {
    setFormName('');
    setFormColor('azul');
    setFormDescription('');
    setFormLeaderId('__none__');
    setTeamModal({ open: true, mode: 'create' });
  };

  const openEditModal = (team: Team) => {
    setFormName(team.name);
    setFormColor(team.color);
    setFormDescription(team.description ?? '');
    setFormLeaderId(team.leader_user_id ?? '__none__');
    setTeamModal({ open: true, mode: 'edit', team });
  };

  const handleSaveTeam = async () => {
    if (!formName.trim() || !tenantId) return;
    setIsSaving(true);
    try {
      const leaderId = formLeaderId === '__none__' ? null : formLeaderId;
      const payload = { name: formName.trim(), color: formColor, description: formDescription.trim() || null, leader_user_id: leaderId };

      if (teamModal.mode === 'create') {
        const result = await createTeam(tenantId, payload as any);
        if (!result.success) {
          toast.error(result.error || 'Erro ao criar equipe. Verifique suas permissões.');
          console.error('[createTeam] falhou:', result);
          return;
        }
        toast.success(`Equipe "${formName}" criada!`);
      } else if (teamModal.team) {
        const result = await updateTeam(teamModal.team.id, payload as any);
        if (!result.success) {
          toast.error(result.error || 'Erro ao atualizar equipe.');
          console.error('[updateTeam] falhou:', result);
          return;
        }
        toast.success('Equipe atualizada!');
        // Atualizar selectedTeam se aberto
        if (selectedTeam?.id === teamModal.team.id) {
          setSelectedTeam((prev) => prev ? { ...prev, ...payload, leader_name: leaderId ? allMembers.find(m => m.user_id === leaderId)?.email ?? null : null } : prev);
        }
      }

      setTeamModal({ open: false, mode: 'create' });
      await loadTeams();
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Excluir equipe
  // ---------------------------------------------------------------------------
  const handleDeleteTeam = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    const result = await deleteTeam(deleteConfirm.id);
    setIsDeleting(false);
    if (!result.success) { toast.error(result.error); return; }
    toast.success(`Equipe "${deleteConfirm.name}" excluída`);
    setDeleteConfirm(null);
    if (selectedTeam?.id === deleteConfirm.id) setSelectedTeam(null);
    await loadTeams();
  };

  // ---------------------------------------------------------------------------
  // Membros
  // ---------------------------------------------------------------------------
  const handleAddMember = async (member: TeamMember) => {
    if (!selectedTeam) return;
    const result = await addMemberToTeam(member.membership_id, selectedTeam.id, tenantId!);
    if (!result.success) { toast.error(result.error); return; }
    toast.success(`${member.name} adicionado à equipe`);
    await Promise.all([loadTeamMembers(selectedTeam), loadTeams()]);
  };

  const handleRemoveMember = async (member: TeamMember) => {
    const result = await removeMemberFromTeam(member.membership_id);
    if (!result.success) { toast.error(result.error); return; }
    toast.success(`${member.name} removido da equipe`);
    if (selectedTeam) await Promise.all([loadTeamMembers(selectedTeam), loadTeams()]);
  };

  // ---------------------------------------------------------------------------
  // Líderes disponíveis (role = team_leader)
  // ---------------------------------------------------------------------------
  const teamLeaders = allMembers.filter((m) => m.role === 'team_leader');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!tenantId || tenantId === 'owner') {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-gray-500 dark:text-slate-400 text-sm">
        Selecione uma imobiliária para gerenciar equipes.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
            <Users2 className="h-5 w-5 text-[#1a5276]" />
            Equipes
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Organize corretores em equipes com líderes dedicados. Líderes recebem leads redistribuídos automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canConfigureQueue && (
            <Button
              variant="outline"
              onClick={() => setShowQueuePanel((v) => !v)}
              className="h-10 gap-2"
            >
              <Settings2 className="h-4 w-4" />
              Fila por Equipe
            </Button>
          )}
          {canManage && (
            <Button
              onClick={openCreateModal}
              className="bg-[#1a5276] hover:bg-[#154360] text-white h-10 gap-2"
            >
              <Plus className="h-4 w-4" />
              Nova Equipe
            </Button>
          )}
        </div>
      </div>

      {/* Painel: Configuração da Fila por Equipe */}
      {canConfigureQueue && showQueuePanel && (
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <Repeat className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                Fila por Equipe
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Quando um lead expira sem resposta, ele é redistribuído para outro corretor da mesma equipe antes de ir pro bolsão geral.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ativar/desativar — mutuamente exclusivos com Roleta */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start justify-between gap-4">
              <div>
                <Label className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                  Modo Roleta (distribuição global)
                </Label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Leads novos são distribuídos aleatoriamente entre todos os corretores.
                </p>
              </div>
              <Switch
                checked={bolsaoConfig.roletaEnabled}
                onCheckedChange={(v) =>
                  saveQueueConfig({ roletaEnabled: !!v, teamQueueEnabled: v ? false : bolsaoConfig.teamQueueEnabled })
                }
                disabled={isSavingQueue}
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start justify-between gap-4">
              <div>
                <Label className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                  Modo Fila por Equipe
                </Label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Leads expirados são redistribuídos dentro da equipe antes do bolsão.
                </p>
              </div>
              <Switch
                checked={bolsaoConfig.teamQueueEnabled}
                onCheckedChange={(v) =>
                  saveQueueConfig({ teamQueueEnabled: !!v, roletaEnabled: v ? false : bolsaoConfig.roletaEnabled })
                }
                disabled={isSavingQueue}
              />
            </div>

            {/* Modo de distribuição */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <Label className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mb-1 block">
                Ordem de distribuição
              </Label>
              <Select
                value={bolsaoConfig.teamQueueOrder}
                onValueChange={(v) => saveQueueConfig({ teamQueueOrder: v as TeamQueueOrder })}
                disabled={isSavingQueue || !bolsaoConfig.teamQueueEnabled}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanceado (quem tem menos leads recebe primeiro)</SelectItem>
                  <SelectItem value="linear">Linear (ordem alfabética)</SelectItem>
                  <SelectItem value="random">Aleatório</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                "Balanceado" garante que quem acabou de receber não recebe o próximo.
              </p>
            </div>

            {/* Tempo de expiração exclusivo */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <Label className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Tempo limite — imóvel exclusivo (min)
              </Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={bolsaoConfig.tempoExpiracaoExclusivo}
                onChange={(e) => setBolsaoConfig((p) => ({ ...p, tempoExpiracaoExclusivo: Number(e.target.value) || 0 }))}
                onBlur={() => saveQueueConfig({ tempoExpiracaoExclusivo: bolsaoConfig.tempoExpiracaoExclusivo })}
                disabled={isSavingQueue}
                className="h-10"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Se o corretor não interagir nesse tempo, o lead passa pro próximo da fila.
              </p>
            </div>

            {/* Tempo de expiração não exclusivo */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <Label className="text-[13px] font-medium text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Tempo limite — imóvel geral (min)
              </Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={bolsaoConfig.tempoExpiracaoNaoExclusivo}
                onChange={(e) => setBolsaoConfig((p) => ({ ...p, tempoExpiracaoNaoExclusivo: Number(e.target.value) || 0 }))}
                onBlur={() => saveQueueConfig({ tempoExpiracaoNaoExclusivo: bolsaoConfig.tempoExpiracaoNaoExclusivo })}
                disabled={isSavingQueue}
                className="h-10"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Vale para leads de imóveis não-exclusivos.
              </p>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 border border-slate-100 dark:border-slate-800">
            💡 <strong>Como funciona:</strong> lead chega pro corretor → se ele não mover o status em até N minutos, o sistema escolhe o próximo da mesma equipe (no modo "balanceado", quem tem menos leads ativos). Se todos falharem, vai pro bolsão geral.
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando equipes...
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-gray-200 dark:border-slate-800 rounded-xl bg-gray-50 dark:bg-slate-950">
          <Users className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-base font-medium text-gray-800 dark:text-slate-200 mb-1">Nenhuma equipe criada</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs">
            Crie equipes para organizar seus corretores e habilitar a redistribuição automática de leads por equipe.
          </p>
          {canManage && (
            <Button onClick={openCreateModal} className="mt-5 bg-[#1a5276] text-white gap-2">
              <Plus className="h-4 w-4" />
              Criar primeira equipe
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => {
            const cs = colorStyle(team.color);
            return (
              <div
                key={team.id}
                className={`relative rounded-xl border bg-white dark:bg-slate-900 hover:shadow-md transition-all cursor-pointer group overflow-hidden`}
                onClick={() => setSelectedTeam(team)}
              >
                {/* Faixa de cor no topo */}
                <div className={`h-1.5 w-full ${cs.dot}`} />

                <div className="p-5">
                  {/* Nome + cor */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cs.bg} ${cs.text}`}>
                        <span className={`w-2 h-2 rounded-full ${cs.dot}`} />
                        {cs.label}
                      </span>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEditModal(team)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-700 transition-colors"
                          title="Editar equipe"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(team)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 dark:text-slate-400 hover:text-red-600 transition-colors"
                          title="Excluir equipe"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Nome da equipe */}
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-base mb-1">{team.name}</h3>
                  {team.description && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 line-clamp-2">{team.description}</p>
                  )}

                  {/* Líder */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 mb-3">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-medium">
                      {team.leader_name ?? team.leader_email ?? (
                        <span className="text-gray-400 dark:text-slate-500 italic">Sem líder</span>
                      )}
                    </span>
                  </div>

                  {/* Footer: membros + seta */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        <strong className="text-gray-800 dark:text-slate-200">{team.member_count ?? 0}</strong>{' '}
                        {(team.member_count ?? 0) === 1 ? 'membro' : 'membros'}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 dark:text-slate-500 group-hover:text-[#1a5276] transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Drawer lateral: gerenciar membros da equipe */}
      {/* ------------------------------------------------------------------ */}
      {selectedTeam && (
        <div className="octo-modal-overlay fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="flex-1 bg-black/30"
            onClick={() => setSelectedTeam(null)}
          />

          {/* Painel */}
          <div className="w-full max-w-[480px] bg-white dark:bg-slate-900 h-full overflow-y-auto shadow-2xl flex flex-col">
            {/* Header do painel */}
            <div className={`p-5 border-b`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${colorStyle(selectedTeam.color).dot}`} />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{selectedTeam.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(selectedTeam)}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
                  <button
                    onClick={() => setSelectedTeam(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Info do líder */}
              <div className="flex items-center gap-2 text-sm">
                <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <span className="text-gray-700 dark:text-slate-300 font-medium">
                  {selectedTeam.leader_name ?? selectedTeam.leader_email ?? (
                    <span className="text-gray-400 dark:text-slate-500 italic text-sm">Sem líder atribuído</span>
                  )}
                </span>
                {(selectedTeam.leader_name || selectedTeam.leader_email) && (
                  <span className="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-900">
                    Team Leader
                  </span>
                )}
              </div>

              {selectedTeam.description && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{selectedTeam.description}</p>
              )}

              {/* Fila por equipe info */}
              <div className={`mt-3 flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                selectedTeam.leader_user_id
                  ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-800 dark:text-green-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
              }`}>
                <Shield className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  {selectedTeam.leader_user_id
                    ? 'Fila por equipe ativa — leads expirados serão redistribuídos entre os corretores desta equipe antes do Bolsão geral.'
                    : 'Atribua um líder para ativar a fila por equipe.'}
                </span>
              </div>
            </div>

            {/* Membros atuais */}
            <div className="flex-1 p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Membros da equipe ({teamMembers.length})
              </h3>

              {isLoadingMembers ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : teamMembers.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500 italic py-2">Nenhum membro nesta equipe ainda.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {teamMembers.map((member) => (
                    <div
                      key={member.membership_id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ${colorStyle(selectedTeam.color).dot}`}>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{member.name}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          member.role === 'team_leader'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        }`}>
                          {member.role === 'team_leader' ? 'Líder' : 'Corretor'}
                        </span>
                        {canManage && (
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="p-1 rounded-md hover:bg-red-50 text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                            title="Remover da equipe"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar membros */}
              {canManage && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Adicionar membros
                  </h3>

                  <Input
                    placeholder="Pesquisar por nome ou e-mail..."
                    value={memberSearchTerm}
                    onChange={(e) => setMemberSearchTerm(e.target.value)}
                    className="mb-3 h-9 text-sm"
                  />

                  {availableMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-slate-500 italic">Todos os corretores já estão em equipes.</p>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {availableMembers
                        .filter((m) =>
                          !memberSearchTerm ||
                          m.name.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
                          m.email.toLowerCase().includes(memberSearchTerm.toLowerCase())
                        )
                        .map((member) => (
                          <div
                            key={member.membership_id}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-dashed border-gray-200 dark:border-slate-800 hover:border-[#1a5276] hover:bg-blue-50/30 transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-slate-400 text-xs font-medium flex-shrink-0">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{member.name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{member.email}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddMember(member)}
                              className="h-7 px-2.5 text-xs text-[#1a5276] hover:bg-blue-100 flex-shrink-0 ml-2"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Adicionar
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal: Criar / Editar equipe */}
      {/* ------------------------------------------------------------------ */}
      {teamModal.open && (
        <>
          <div
            onClick={() => !isSaving && setTeamModal((p) => ({ ...p, open: false }))}
            style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
          />
          <div
            className="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
            style={{ position: 'fixed', right: 0, top: 56, width: '520px', height: 'calc(100vh - 56px)', maxHeight: 'calc(100vh - 56px)', zIndex: 99999 }}
          >
            <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  <Users2 className="h-5 w-5 text-[#1a5276]" />
                  {teamModal.mode === 'create' ? 'Nova Equipe' : 'Editar Equipe'}
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {teamModal.mode === 'create'
                    ? 'Crie uma equipe e atribua um líder para ativar a redistribuição automática de leads.'
                    : 'Edite as informações da equipe. Alterar o líder sincroniza todos os membros.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isSaving && setTeamModal((p) => ({ ...p, open: false }))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome da equipe</Label>
              <Input
                placeholder="Ex: Equipe Alpha, Vendas Norte..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Cor */}
            <div className="space-y-1.5">
              <Label>Cor identificadora</Label>
              <div className="grid grid-cols-4 gap-2">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFormColor(c.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-xs font-medium ${
                      formColor === c.id
                        ? `${c.ring} ring-2 ${c.bg} ${c.text}`
                        : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 text-gray-600 dark:text-slate-400'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${c.dot}`} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Breve descrição da equipe..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Líder (opcional) */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-amber-500" />
                Líder de Equipe <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </Label>
              <Select value={formLeaderId} onValueChange={setFormLeaderId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Sem líder definido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem líder definido</SelectItem>
                  {teamLeaders.map((leader) => (
                    <SelectItem key={leader.user_id} value={leader.user_id}>
                      {leader.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formLeaderId !== '__none__' && (
                <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded px-2 py-1">
                  ✅ Fila por equipe será ativada — leads expirados redistribuídos automaticamente nesta equipe.
                </p>
              )}
              {teamLeaders.length === 0 && (
                <p className="text-xs text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded px-2 py-1">
                  💡 Você pode criar a equipe agora e atribuir um líder depois em "Acessos e Permissões".
                </p>
              )}
            </div>
          </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setTeamModal((p) => ({ ...p, open: false }))} disabled={isSaving}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveTeam}
                disabled={isSaving || !formName.trim()}
                className="bg-[#1a5276] hover:bg-[#154360] text-white gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {teamModal.mode === 'create' ? 'Criar Equipe' : 'Salvar'}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal: Confirmar exclusão */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <Trash2 className="h-5 w-5" />
              Excluir Equipe
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-700 dark:text-slate-300">
              Tem certeza que deseja excluir a equipe{' '}
              <strong>"{deleteConfirm?.name}"</strong>?
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
              Os corretores desta equipe não serão excluídos, mas serão desassociados da equipe e da fila por equipe.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteTeam} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
