import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronDown, Users, UserPlus, Shield, User, Loader2, Trash2, Mail, Lock, Unlock, Camera, AlertTriangle, CheckCircle, Settings, Info, Ban, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { EquipeDetailsSidebar } from './EquipeDetailsSidebar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from "@/hooks/useAuth";
import { getTenantCorretores, type TenantCorretor } from '@/features/imoveis/services/imoveisXmlService';
import { fetchTenantMembers, createTenantMember, updateMemberRole, removeTenantMember, updateMemberPermissions, updateMemberLeader, deleteMemberCompletely, adminUpdateMemberPassword, adminUpdateMemberEmail, type TenantMember } from '../services/tenantMembersService';
import { fetchTeams, setTeamLeader, type Team } from '../services/teamsManagementService';
import { useLateralDrawer } from '@/hooks/useLateralDrawer';
import { SidebarPermission } from '@/types/permissions';
import {
  fetchLeadLimitConfig,
  saveLeadLimitConfig,
  getBrokerLeadCountsBatch,
  getBrokerStatusLabel,
  getBrokerStatusColor,
  DEFAULT_LEAD_LIMIT_CONFIG,
  KANBAN_STATUSES,
  type TenantLeadLimitConfig,
  type BrokerLeadLimitOverride,
  type BrokerLeadCounts,
  type BrokerStatus,
} from '../services/tenantLeadLimitService';

// Função para excluir corretor completamente (tenant_memberships + tenant_brokers + auth.users)
async function deleteCorretorCompleto(memberId: string, brokerUuid?: string, tenantId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Remover de tenant_memberships
    const { error: membershipError } = await supabase
      .from('tenant_memberships')
      .delete()
      .eq('id', memberId);

    if (membershipError) {
      console.error('Erro ao remover membership:', membershipError);
    }

    // 2. Se tiver broker_uuid, remover de tenant_brokers
    if (brokerUuid && tenantId) {
      const { error: brokerError } = await supabase
        .from('tenant_brokers')
        .delete()
        .eq('auth_user_id', brokerUuid)
        .eq('tenant_id', tenantId);

      if (brokerError) {
        console.error('Erro ao remover broker:', brokerError);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao excluir corretor:', error);
    return { success: false, error: error.message };
  }
}

interface EquipeSectionProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface MembroEquipe {
  id: string;
  broker_uuid?: string; // UUID do corretor na tabela brokers do Supabase
  nome: string;
  iniciais: string;
  cor: string;
  status: 'online' | 'offline' | 'ausente';
  equipe: string;
  cargo: string;
  totalLeads: number;
  leadsAtivos: number;
  taxaConversao: number;
  email?: string;
  creci?: string;
  foto?: string;
}

const CORES_AVATAR = [
  'bg-[#5E35B1]', // Roxo profundo como na imagem
  'bg-purple-600',
  'bg-indigo-600',
  'bg-blue-600',
  'bg-teal-600',
  'bg-green-600',
  'bg-yellow-600',
  'bg-orange-600',
  'bg-red-600',
  'bg-pink-600',
];

export const EquipeSection = ({ leads }: EquipeSectionProps) => {
  const { tenantId, tenantCode, user: currentUser } = useAuth() as any;
  const isCurrentUserAdmin = currentUser?.systemRole === 'admin' || currentUser?.systemRole === 'owner';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [equipeFilter, setEquipeFilter] = useState<string>('todas');
  const [cargoFilter, setCargoFilter] = useState<string>('todos');
  const [sortBy, setSortBy] = useState<string>('nome');
  const [membroSelecionado, setMembroSelecionado] = useState<MembroEquipe | null>(null);

  const [corretoresXml, setCorretoresXml] = useState<TenantCorretor[]>([]);
  
  // Estados para membros do banco de dados
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  
  // Estados para modal de novo membro
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberSurname, setNewMemberSurname] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberPhoto, setNewMemberPhoto] = useState<string>('');
  const newMemberPhotoInputRef = useRef<HTMLInputElement>(null);
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'corretor' | 'team_leader'>('corretor');
  const [newMemberTeam, setNewMemberTeam] = useState<'vermelha' | 'verde' | 'amarela' | 'azul' | ''>('');
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  
  // Estados para permissões granulares
  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
  const [permissions, setPermissions] = useState({
    leads: true,
    notificacoes: true,
    metricas: true,
    'estudo-mercado': true,
    recrutamento: true,
    'gestao-equipe': true,
    imoveis: true,
    'agentes-ia': false, // Bloqueado por padrão para corretores
    'octo-chat': true,
    integracoes: false, // Bloqueado por padrão para corretores
    'central-leads': false, // Bloqueado por padrão para corretores
    relatorios: false // Bloqueado por padrão para corretores
  });
  
  // Estados para modal de edição de permissões
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TenantMember | null>(null);
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({});
  const [editSubPermissions, setEditSubPermissions] = useState<Record<string, boolean>>({});
  const [editSpecialPermissions, setEditSpecialPermissions] = useState<Record<string, boolean>>({ can_manage_roleta: false });
  const [editMemberPhoto, setEditMemberPhoto] = useState<string>('');
  const editMemberPhotoInputRef = useRef<HTMLInputElement>(null);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editLeaderId, setEditLeaderId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'corretor' | 'team_leader'>('corretor');
  const [editLeadsTeamIds, setEditLeadsTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [credentialsEmail, setCredentialsEmail] = useState('');
  const [credentialsNewPassword, setCredentialsNewPassword] = useState('');
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);

  // ---- Lead Limit Config ----
  const [leadLimitConfig, setLeadLimitConfig] = useState<TenantLeadLimitConfig | null>(null);
  const [isLoadingLimitConfig, setIsLoadingLimitConfig] = useState(false);
  const [showLeadLimitPanel, setShowLeadLimitPanel] = useState(false);
  const [isSavingLimitConfig, setIsSavingLimitConfig] = useState(false);
  const [limitConfigDraft, setLimitConfigDraft] = useState<Omit<TenantLeadLimitConfig, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>(DEFAULT_LEAD_LIMIT_CONFIG);
  // Per-broker override (inside edit modal)
  const [editBrokerOverride, setEditBrokerOverride] = useState<BrokerLeadLimitOverride>({});

  // Mesmo comportamento dos drawers da área de Tarefas: empurra o conteúdo.
  useLateralDrawer(isNewMemberModalOpen || isEditModalOpen, 560);
  // Batch counts for visual indicators
  const [brokerLeadCounts, setBrokerLeadCounts] = useState<Record<string, BrokerLeadCounts>>({});

  // Buscar membros do tenant do banco de dados
  const loadTenantMembers = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    
    setIsLoadingMembers(true);
    try {
      const members = await fetchTenantMembers(tenantId);
      setTenantMembers(members);
    } catch (error) {
      console.error('Erro ao carregar membros:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTenantMembers();
  }, [loadTenantMembers]);

  const loadTeams = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    try {
      const data = await fetchTeams(tenantId);
      setTeams(data);
    } catch (error) {
      console.error('Erro ao carregar equipes:', error);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Carregar config de limite de leads
  const loadLeadLimitConfig = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    setIsLoadingLimitConfig(true);
    try {
      const cfg = await fetchLeadLimitConfig(tenantId);
      if (cfg) {
        setLeadLimitConfig(cfg);
        setLimitConfigDraft({
          lead_limit_enabled: cfg.lead_limit_enabled,
          max_active_leads_per_broker: cfg.max_active_leads_per_broker,
          max_pending_response_leads_per_broker: cfg.max_pending_response_leads_per_broker,
          blocking_mode: cfg.blocking_mode,
          warning_threshold_percent: cfg.warning_threshold_percent,
          pending_statuses: cfg.pending_statuses,
          exclusive_lead_timeout_minutes: cfg.exclusive_lead_timeout_minutes ?? 30,
          general_lead_timeout_minutes: cfg.general_lead_timeout_minutes ?? 5,
        });
      }
    } finally {
      setIsLoadingLimitConfig(false);
    }
  }, [tenantId]);

  useEffect(() => { loadLeadLimitConfig(); }, [loadLeadLimitConfig]);

  // Carregar contagem de leads por corretor (batch)
  useEffect(() => {
    if (!tenantId || !leadLimitConfig?.lead_limit_enabled) return;
    getBrokerLeadCountsBatch(tenantId, leadLimitConfig.pending_statuses).then(setBrokerLeadCounts);
  }, [tenantId, leadLimitConfig]);

  // Salvar configuração global de limite
  const handleSaveLeadLimitConfig = async () => {
    if (!tenantId) return;
    setIsSavingLimitConfig(true);
    try {
      const result = await saveLeadLimitConfig(tenantId, limitConfigDraft);
      if (result.success) {
        toast.success('Configuração de limite salva!');
        loadLeadLimitConfig();
      } else {
        toast.error(result.error || 'Erro ao salvar configuração');
      }
    } finally {
      setIsSavingLimitConfig(false);
    }
  };

  // Atualizar permissões quando role mudar
  useEffect(() => {
    if (newMemberRole === 'admin') {
      // Admin tem acesso a tudo
      setPermissions({
        leads: true,
        notificacoes: true,
        metricas: true,
        'estudo-mercado': true,
        recrutamento: true,
        'gestao-equipe': true,
        imoveis: true,
        'agentes-ia': true,
        'octo-chat': true,
        integracoes: true,
        'central-leads': true,
        relatorios: true
      });
    } else if (newMemberRole === 'team_leader') {
      // Team Leader tem acesso intermediário
      setPermissions({
        leads: true,
        notificacoes: true,
        metricas: true,
        'estudo-mercado': true,
        recrutamento: false,
        'gestao-equipe': true,
        imoveis: true,
        'agentes-ia': false,
        'octo-chat': true,
        integracoes: false,
        'central-leads': false,
        relatorios: false
      });
    } else {
      // Corretor tem restrições padrão (BLOQUEADO nas áreas sensíveis)
      setPermissions({
        leads: true,
        notificacoes: true,
        metricas: true,
        'estudo-mercado': true,
        recrutamento: false,  // ❌ Bloqueado
        'gestao-equipe': false, // ❌ Bloqueado
        imoveis: true,
        'agentes-ia': false,  // ❌ Bloqueado
        'octo-chat': true,
        integracoes: false,   // ❌ Bloqueado
        'central-leads': false, // ❌ Bloqueado
        relatorios: false     // ❌ Bloqueado
      });
    }
  }, [newMemberRole]);

  // Criar novo membro
  const handleCreateMember = async () => {
    if (!tenantId) {
      toast.error('Tenant ID não encontrado. Faça login novamente.');
      return;
    }

    if (!newMemberEmail || !newMemberPassword) {
      toast.error('Preencha email e senha');
      return;
    }

    if (newMemberPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsCreatingMember(true);
    try {
      // Converter permissões em array de sidebar permissions
      const sidebarPerms = Object.entries(permissions)
        .filter(([_, value]) => value)
        .map(([key]) => key);
      
      const memberData = {
        email: newMemberEmail,
        password: newMemberPassword,
        role: newMemberRole,
        name: `${newMemberName} ${newMemberSurname}`.trim() || undefined,
        team: newMemberTeam || undefined,
        permissions: { ...permissions, photo: newMemberPhoto || null } as any,
        sidebarPermissions: sidebarPerms as any
      };
      
      const result = await createTenantMember(tenantId!, memberData);

      if (result.success) {
        // Verificar se precisa confirmação de email
        if (result.data?.needsEmailConfirmation) {
          toast.success('Membro criado! Um email de confirmação foi enviado para ' + newMemberEmail);
        } else {
          toast.success('Membro adicionado com sucesso!');
        }
        
        // Limpar formulário
        setIsNewMemberModalOpen(false);
        setNewMemberName('');
        setNewMemberSurname('');
        setNewMemberEmail('');
        setNewMemberPassword('');
        setNewMemberPhoto('');
        setNewMemberRole('corretor');
        setNewMemberTeam('');
        setIsPermissionsExpanded(false);
        loadTenantMembers();
      } else {
        toast.error(result.error || 'Erro ao criar membro');
      }
    } catch (error) {
      console.error('❌ Erro ao criar membro:', error);
      toast.error('Erro inesperado ao criar membro: ' + (error as any)?.message || 'Erro desconhecido');
    } finally {
      setIsCreatingMember(false);
    }
  };

// ...
  // Remover membro
  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Tem certeza que deseja remover este membro?')) return;

    const result = await removeTenantMember(memberId);
    if (result.success) {
      toast.success('Membro removido');
      loadTenantMembers();
    } else {
      toast.error(result.error || 'Erro ao remover membro');
    }
  };

  // Atualizar role do membro
  const handleUpdateRole = async (memberId: string, newRole: 'admin' | 'corretor' | 'team_leader') => {
    const result = await updateMemberRole(memberId, newRole);
    if (result.success) {
      toast.success('Cargo atualizado');
      loadTenantMembers();
    } else {
      toast.error(result.error || 'Erro ao atualizar cargo');
    }
    return result;
  };

  // Admin: salvar email novo do membro
  const handleSaveMemberEmail = async () => {
    if (!editingMember) return;
    const newEmail = credentialsEmail.trim().toLowerCase();
    if (!newEmail || newEmail === (editingMember.email || '').toLowerCase()) {
      toast.info('Email não foi alterado');
      return;
    }
    setIsSavingCredentials(true);
    const result = await adminUpdateMemberEmail(editingMember.user_id, newEmail);
    setIsSavingCredentials(false);
    if (result.success) {
      toast.success('Email alterado com sucesso');
      loadTenantMembers();
    } else {
      toast.error(result.error || 'Erro ao alterar email');
    }
  };

  // Admin: salvar nova senha do membro
  const handleSaveMemberPassword = async () => {
    if (!editingMember) return;
    if (!credentialsNewPassword || credentialsNewPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setIsSavingCredentials(true);
    const result = await adminUpdateMemberPassword(editingMember.user_id, credentialsNewPassword);
    setIsSavingCredentials(false);
    if (result.success) {
      toast.success('Senha alterada com sucesso');
      setCredentialsNewPassword('');
    } else {
      toast.error(result.error || 'Erro ao alterar senha');
    }
  };

  // Toggle rápido: corretor ↔ team_leader
  const handleQuickToggleLeader = async (e: React.MouseEvent, member: TenantMember) => {
    e.stopPropagation();
    if (member.role === 'admin' || member.role === 'owner') {
      toast.info('Use o modal de edição para alterar o cargo de um admin.');
      return;
    }
    const newRole: 'corretor' | 'team_leader' = member.role === 'team_leader' ? 'corretor' : 'team_leader';
    await handleUpdateRole(member.id, newRole);
  };

  // Abrir modal de edição de permissões
  const handleOpenEditModal = (member: TenantMember) => {
    setEditingMember(member);
    setEditLeaderId(member.leader_user_id ?? null);
    setEditRole(member.role === 'owner' ? 'admin' : (member.role as 'admin' | 'corretor' | 'team_leader'));
    const ledTeamIds = teams.filter((t) => t.leader_user_id === member.user_id).map((t) => t.id);
    setEditLeadsTeamIds(ledTeamIds);
    setCredentialsEmail(member.email || '');
    setCredentialsNewPassword('');
    
    // Carregar permissões atuais do membro
    const currentPerms = member.permissions || {};
    const sidebarPerms = currentPerms.sidebar_permissions || [];
    const currentPhoto = (currentPerms as any).photo as string | undefined;
    setEditMemberPhoto(currentPhoto || '');
    
    // Definir permissões de abas baseado nas sidebar_permissions salvas ou padrão por role
    const defaultPerms: Record<string, boolean> = {
      leads: true,
      notificacoes: true,
      metricas: true,
      'estudo-mercado': true,
      recrutamento: member.role === 'admin',
      'gestao-equipe': member.role === 'admin' || member.role === 'team_leader',
      imoveis: true,
      'agentes-ia': member.role === 'admin',
      'octo-chat': true,
      integracoes: member.role === 'admin',
      'central-leads': member.role === 'admin',
      relatorios: member.role === 'admin'
    };
    
    // Se tem permissões salvas, usar elas
    if (Array.isArray(sidebarPerms) && sidebarPerms.length > 0) {
      Object.keys(defaultPerms).forEach(key => {
        defaultPerms[key] = sidebarPerms.includes(key);
      });
    }
    
    setEditPermissions(defaultPerms);
    
    // Sub-permissões (KPIs, OKRs, etc)
    const subPerms = currentPerms.sub_permissions || {};
    setEditSubPermissions({
      // Início
      'leads-funil': subPerms['leads-funil'] ?? true,
      'leads-okrs': subPerms['leads-okrs'] ?? true,
      'leads-kpis': subPerms['leads-kpis'] ?? true,
      'leads-pdi': subPerms['leads-pdi'] ?? true,
      'leads-tarefas': subPerms['leads-tarefas'] ?? true,
      'leads-agenda': subPerms['leads-agenda'] ?? true,
      // Comercial/Métricas
      'metricas-geral': subPerms['metricas-geral'] ?? true,
      'metricas-equipes': subPerms['metricas-equipes'] ?? true,
      'metricas-corretores': subPerms['metricas-corretores'] ?? true,
      // Gestão de Equipe
      'gestao-tarefas': subPerms['gestao-tarefas'] ?? true,
      'gestao-okrs': subPerms['gestao-okrs'] ?? true,
      'gestao-pdi': subPerms['gestao-pdi'] ?? true,
      'gestao-metricas': subPerms['gestao-metricas'] ?? true,
      'gestao-acessos': subPerms['gestao-acessos'] ?? (member.role === 'admin'),
    });

    // Permissões especiais do Bolsão
    setEditSpecialPermissions({
      can_manage_roleta: Boolean((currentPerms as any).can_manage_roleta) || member.role === 'team_leader',
    });

    // Override de limite de leads por corretor
    const savedOverride = (currentPerms as any).lead_limit as BrokerLeadLimitOverride | undefined;
    setEditBrokerOverride(savedOverride || {});
    
    setIsEditModalOpen(true);
  };

  // Salvar permissões editadas
  const handleSavePermissions = async () => {
    if (!editingMember) return;
    
    setIsSavingPermissions(true);
    try {
      // Converter permissões em array de sidebar_permissions
      const sidebarPerms = Object.entries(editPermissions)
        .filter(([_, value]) => value)
        .map(([key]) => key);
      
      const newPermissions = {
        ...editingMember.permissions,
        photo: editMemberPhoto || null,
        sidebar_permissions: sidebarPerms,
        sub_permissions: editSubPermissions,
        can_manage_roleta: editSpecialPermissions.can_manage_roleta,
        team: editingMember.team || null,
        lead_limit: Object.keys(editBrokerOverride).length > 0 ? editBrokerOverride : undefined,
      };
      
      const result = await updateMemberPermissions(editingMember.id, newPermissions);
      
      if (!result.success) {
        toast.error(result.error || 'Erro ao salvar permissões');
        return;
      }

      // Atualizar cargo se mudou
      if (editRole !== editingMember.role) {
        const roleResult = await updateMemberRole(editingMember.id, editRole);
        if (!roleResult.success) {
          toast.error(roleResult.error || 'Erro ao salvar cargo');
          return;
        }
      }

      // Atualizar líder se o membro é corretor
      if (editRole === 'corretor') {
        const leaderResult = await updateMemberLeader(editingMember.id, editLeaderId);
        if (!leaderResult.success) {
          toast.error(leaderResult.error || 'Erro ao salvar líder');
          return;
        }
      }

      // Sincronizar equipes que este membro lidera
      const currentlyLed = teams.filter((t) => t.leader_user_id === editingMember.user_id).map((t) => t.id);
      const shouldLead = editRole === 'team_leader' ? editLeadsTeamIds : [];

      const toAdd = shouldLead.filter((id) => !currentlyLed.includes(id));
      const toRemove = currentlyLed.filter((id) => !shouldLead.includes(id));

      for (const teamId of toRemove) {
        const r = await setTeamLeader(teamId, null);
        if (!r.success) {
          toast.error(r.error || 'Erro ao remover liderança de equipe');
          return;
        }
      }
      for (const teamId of toAdd) {
        const r = await setTeamLeader(teamId, editingMember.user_id);
        if (!r.success) {
          toast.error(r.error || 'Erro ao atribuir liderança de equipe');
          return;
        }
      }

      if (result.success) {
        toast.success('Permissões atualizadas com sucesso!');
        setIsEditModalOpen(false);
        setEditingMember(null);
        loadTenantMembers();
        loadTeams();
      }
    } catch (error) {
      toast.error('Erro ao salvar permissões');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // Excluir membro completamente
  const handleDeleteCompletely = async () => {
    if (!editingMember || !tenantId) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteMemberCompletely(
        editingMember.id,
        editingMember.user_id,
        tenantId
      );
      
      if (result.success) {
        toast.success('Usuário excluído completamente do sistema!');
        setIsEditModalOpen(false);
        setEditingMember(null);
        setShowDeleteConfirm(false);
        loadTenantMembers();
      } else {
        toast.error(result.error || 'Erro ao excluir usuário');
      }
    } catch (error) {
      toast.error('Erro ao excluir usuário');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    setCorretoresXml(getTenantCorretores(tenantId));
  }, [tenantId]);

  // Limpar corretores do XML ao carregar se não tiverem email válido
  useEffect(() => {
    if (!tenantId) return;
    
    const corretores = getTenantCorretores(tenantId);
    const comEmailValido = corretores.filter(c => c.email && c.email.includes('@'));
    
    // Se mais de 50% não tem email, limpar o cache
    if (corretores.length > 0 && comEmailValido.length < corretores.length * 0.5) {
      localStorage.removeItem(`corretores_${tenantId}`);
    }
  }, [tenantId]);

  // Nota: A tabela 'brokers' não existe no banco multitenant
  // Os membros são gerenciados via tenant_memberships

  // Extrair membros da equipe - PRIORIDADE: tenant_memberships do banco de dados
  const membrosEquipe = useMemo(() => {
    const membrosMap = new Map<string, MembroEquipe>();

    // FONTE PRINCIPAL: Membros do banco de dados (tenant_memberships)
    tenantMembers.forEach((member, index) => {
      const nomeMembro = member.email.split('@')[0] || member.email;
      const iniciais = nomeMembro
        .split(/[._-]/)
        .map(n => n[0]?.toUpperCase() || '')
        .join('')
        .substring(0, 2) || 'U';
      const cor = CORES_AVATAR[index % CORES_AVATAR.length];
      const matchingCorretor = corretoresXml.find(
        (c) =>
          c.email?.toLowerCase() === member.email?.toLowerCase() ||
          c.nome?.toLowerCase() === nomeMembro.toLowerCase()
      );
      const foto = ((member.permissions as any)?.photo as string | undefined) || matchingCorretor?.foto;

      membrosMap.set(member.user_id, {
        id: member.id,
        broker_uuid: member.user_id,
        nome: member.email,
        iniciais,
        cor,
        status: 'online', // Membros do banco são considerados ativos
        equipe: member.role === 'admin' ? 'Gestão' : 'Vendas',
        cargo: member.role === 'admin' ? 'Admin' : 'Corretor',
        totalLeads: 0,
        leadsAtivos: 0,
        taxaConversao: 0,
        email: member.email,
        foto,
      });
    });

    // Complementar com corretores do XML (se não estiverem no banco)
    corretoresXml.forEach((c) => {
      const nomeMembro = c.nome || 'Não Atribuído';
      // Verificar se já existe por email
      const existingMember = Array.from(membrosMap.values()).find(
        (m) =>
          (m.email && c.email && m.email.toLowerCase() === c.email.toLowerCase()) ||
          m.nome?.toLowerCase() === nomeMembro.toLowerCase()
      );

      if (!existingMember && c.nome) {
        const iniciais = nomeMembro
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);
        const cor = CORES_AVATAR[membrosMap.size % CORES_AVATAR.length];

        membrosMap.set(nomeMembro, {
          id: (c.email || nomeMembro).toLowerCase().replace(/\s+/g, '-'),
          nome: nomeMembro,
          iniciais,
          cor,
          status: 'offline',
          equipe: 'Vendas',
          cargo: 'Corretor',
          totalLeads: 0,
          leadsAtivos: 0,
          taxaConversao: 0,
          email: c.email,
          foto: c.foto,
        });
      } else if (existingMember && !existingMember.foto && c.foto) {
        existingMember.foto = c.foto;
      }
    });
    
    // Contabilizar leads por corretor
    leads.forEach((lead) => {
      const nomeMembro = lead.corretor_responsavel || 'Não Atribuído';
      
      // Buscar membro por nome ou email
      let membro = Array.from(membrosMap.values()).find(
        m => m.nome === nomeMembro || m.email?.toLowerCase() === nomeMembro.toLowerCase()
      );
      
      if (!membro && nomeMembro !== 'Não Atribuído') {
        const iniciais = nomeMembro
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);
        
        const cor = CORES_AVATAR[membrosMap.size % CORES_AVATAR.length];
        
        const novoMembro: MembroEquipe = {
          id: nomeMembro.toLowerCase().replace(/\s+/g, '-'),
          nome: nomeMembro,
          iniciais,
          cor,
          status: 'offline',
          equipe: 'Vendas',
          cargo: 'Corretor',
          totalLeads: 0,
          leadsAtivos: 0,
          taxaConversao: 0,
        };
        membrosMap.set(nomeMembro, novoMembro);
        membro = novoMembro;
      }
      
      if (membro) {
        membro.totalLeads++;
        if (lead.Arquivamento !== 'Sim') {
          membro.leadsAtivos++;
        }
      }
    });

    // Calcular taxa de conversão
    membrosMap.forEach((membro) => {
      if (membro.totalLeads > 0) {
        membro.taxaConversao = (membro.leadsAtivos / membro.totalLeads) * 100;
      }
    });

    return Array.from(membrosMap.values());
  }, [leads, corretoresXml, tenantMembers]);

  // Filtrar e ordenar membros
  const membrosFiltrados = useMemo(() => {
    let filtered = membrosEquipe;

    // Filtro de pesquisa
    if (searchTerm) {
      filtered = filtered.filter(membro =>
        membro.nome.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter(membro => membro.status === statusFilter);
    }

    // Filtro de equipe
    if (equipeFilter !== 'todas') {
      filtered = filtered.filter(membro => membro.equipe === equipeFilter);
    }

    // Filtro de cargo
    if (cargoFilter !== 'todos') {
      filtered = filtered.filter(membro => membro.cargo === cargoFilter);
    }

    // Ordenação
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'nome':
          return a.nome.localeCompare(b.nome);
        case 'leads':
          return b.totalLeads - a.totalLeads;
        case 'conversao':
          return b.taxaConversao - a.taxaConversao;
        default:
          return 0;
      }
    });

    return filtered;
  }, [membrosEquipe, searchTerm, statusFilter, equipeFilter, cargoFilter, sortBy]);


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 w-full relative">
      {/* Área Principal - Cards */}
      <div 
        className="px-6 py-6 transition-all duration-300 overflow-y-auto"
        style={{ 
          width: membroSelecionado ? 'calc(100% - 480px)' : '100%',
          maxWidth: membroSelecionado ? 'calc(100% - 480px)' : '100%',
          minHeight: '100vh'
        }}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Membros da Equipe</h1>
            
            {/* Botão Novo Membro */}
            <Button
              onClick={() => setIsNewMemberModalOpen(true)}
              className="bg-[#1a5276] hover:bg-[#154360] text-white h-10 px-4 gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Novo Membro
            </Button>
          </div>

          {/* Info: Membros do banco */}
          {isLoadingMembers ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando membros...
            </div>
          ) : tenantMembers.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 mb-4 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 rounded-lg">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <span>{tenantMembers.length} membro(s) cadastrado(s) nesta imobiliária</span>
            </div>
          )}

          {/* Painel: Configuração de Limite de Leads */}
          <div className="mb-4 border border-gray-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLeadLimitPanel(!showLeadLimitPanel)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-gray-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Limite de Leads por Corretor</span>
                {isLoadingLimitConfig && <Loader2 className="h-3 w-3 animate-spin text-gray-400 dark:text-slate-500" />}
                {leadLimitConfig?.lead_limit_enabled ? (
                  <span className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-2 py-0.5 rounded-full font-medium">Ativo</span>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-800 px-2 py-0.5 rounded-full">Inativo</span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-500 dark:text-slate-400 transition-transform ${showLeadLimitPanel ? 'rotate-180' : ''}`} />
            </button>

            {showLeadLimitPanel && (
              <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Defina um limite máximo de leads por corretor. Quando atingido, novos leads não serão atribuídos automaticamente a ele.
                </p>

                {/* Ativar/Desativar */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Ativar controle de limite</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Bloqueia atribuição automática quando o limite é atingido</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLimitConfigDraft(d => ({ ...d, lead_limit_enabled: !d.lead_limit_enabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      limitConfigDraft.lead_limit_enabled ? 'bg-[#1a5276]' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${
                      limitConfigDraft.lead_limit_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {/* Limites numéricos — sempre visíveis */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-700 dark:text-slate-300">Máx. leads ativos por corretor (carteira)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9999}
                        value={limitConfigDraft.max_active_leads_per_broker}
                        onChange={(e) => setLimitConfigDraft(d => ({ ...d, max_active_leads_per_broker: Number(e.target.value) || 1 }))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-700 dark:text-slate-300">Máx. leads pendentes por corretor</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9999}
                        value={limitConfigDraft.max_pending_response_leads_per_broker}
                        onChange={(e) => setLimitConfigDraft(d => ({ ...d, max_pending_response_leads_per_broker: Number(e.target.value) || 1 }))}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Modo de bloqueio */}
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-700 dark:text-slate-300">Critério de bloqueio</Label>
                    <Select
                      value={limitConfigDraft.blocking_mode}
                      onValueChange={(v) => setLimitConfigDraft(d => ({ ...d, blocking_mode: v as any }))}
                    >
                      <SelectTrigger className="h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Ambos (carteira OU pendências)</SelectItem>
                        <SelectItem value="carteira">Apenas carteira total</SelectItem>
                        <SelectItem value="pendencia">Apenas pendências</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Aviso % */}
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-700 dark:text-slate-300">Percentual para aviso: {limitConfigDraft.warning_threshold_percent}%</Label>
                    <input
                      type="range"
                      min={50}
                      max={99}
                      value={limitConfigDraft.warning_threshold_percent}
                      onChange={(e) => setLimitConfigDraft(d => ({ ...d, warning_threshold_percent: Number(e.target.value) }))}
                      className="w-full h-2 accent-[#1a5276]"
                    />
                    <p className="text-xs text-gray-400 dark:text-slate-500">Exibe aviso visual quando o corretor atingir {limitConfigDraft.warning_threshold_percent}% do limite</p>
                  </div>

                  {/* Status considerados como pendentes */}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-700 dark:text-slate-300">Status considerados como resposta pendente</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {KANBAN_STATUSES.filter(s => s !== 'Arquivado').map((s) => (
                        <label key={s} className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer text-xs transition-all ${
                          limitConfigDraft.pending_statuses.includes(s)
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-200'
                            : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
                        }`}>
                          <input
                            type="checkbox"
                            checked={limitConfigDraft.pending_statuses.includes(s)}
                            onChange={(e) => {
                              setLimitConfigDraft(d => ({
                                ...d,
                                pending_statuses: e.target.checked
                                  ? [...d.pending_statuses, s]
                                  : d.pending_statuses.filter(x => x !== s)
                              }));
                            }}
                            className="h-3 w-3"
                          />
                          {s}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Tempo de bolsão por tipo de imóvel */}
                  <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium text-gray-700 dark:text-slate-300">Tempo de bolsão por tipo de imóvel</Label>
                      <span className="text-xs text-gray-400 dark:text-slate-500">(em minutos)</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Tempo máximo que o lead permanece no bolsão antes de ser repassado ao próximo corretor.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
                          Imóvel Exclusivo
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            value={limitConfigDraft.exclusive_lead_timeout_minutes}
                            onChange={(e) => setLimitConfigDraft(d => ({ ...d, exclusive_lead_timeout_minutes: Number(e.target.value) || 1 }))}
                            className="h-9"
                          />
                          <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">min</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-slate-500">Ex.: Japi = 30 min</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                          Imóvel Geral
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={1440}
                            value={limitConfigDraft.general_lead_timeout_minutes}
                            onChange={(e) => setLimitConfigDraft(d => ({ ...d, general_lead_timeout_minutes: Number(e.target.value) || 1 }))}
                            className="h-9"
                          />
                          <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">min</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-slate-500">Ex.: Japi = 5 min</p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSaveLeadLimitConfig}
                  disabled={isSavingLimitConfig}
                  className="w-full bg-[#1a5276] hover:bg-[#154360] text-white h-9"
                >
                  {isSavingLimitConfig ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
                  ) : (
                    'Salvar Configuração'
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Barra de Pesquisa */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
            <Input
              type="text"
              placeholder="Pesquisar"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-10"
            />
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="ausente">Ausente</SelectItem>
              </SelectContent>
            </Select>

            {/* Equipe */}
            <Select value={equipeFilter} onValueChange={setEquipeFilter}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas Equipes</SelectItem>
                <SelectItem value="Vendas">Vendas</SelectItem>
                <SelectItem value="Locação">Locação</SelectItem>
                <SelectItem value="Gestão">Gestão</SelectItem>
              </SelectContent>
            </Select>

            {/* Cargo */}
            <Select value={cargoFilter} onValueChange={setCargoFilter}>
              <SelectTrigger className="w-[160px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Cargos</SelectItem>
                <SelectItem value="Corretor">Corretor</SelectItem>
                <SelectItem value="Gerente">Gerente</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>

            {/* Gerente - Placeholder */}
            <Button 
              variant="outline" 
              className="h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60"
            >
              Gerente
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>

            {/* Classificar */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Classificar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome">Nome</SelectItem>
                <SelectItem value="leads">Total de Leads</SelectItem>
                <SelectItem value="conversao">Taxa de Conversão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grid de Cards de Membros */}
        {membrosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-2">
              Nenhum membro encontrado
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Tente ajustar os filtros ou termo de pesquisa
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {membrosFiltrados.map((membro) => {
              // Verificar se o membro tem dados no banco (tenant_memberships)
              const tenantMember = tenantMembers.find(tm =>
                tm.email?.toLowerCase() === membro.email?.toLowerCase() || tm.id === membro.id
              );
              const fotoSrc = membro.foto || ((tenantMember?.permissions as any)?.photo as string | undefined);

              // Indicador de limite de leads
              const brokerUserId = tenantMember?.user_id || membro.broker_uuid;
              const brokerCounts = brokerUserId ? brokerLeadCounts[brokerUserId] : undefined;
              const brokerOverride = (tenantMember?.permissions as any)?.lead_limit as BrokerLeadLimitOverride | undefined;
              const limitEnabled = leadLimitConfig?.lead_limit_enabled || brokerOverride?.lead_limit_enabled;
              const maxActive = brokerOverride?.custom_max_active_leads ?? leadLimitConfig?.max_active_leads_per_broker ?? 100;
              const maxPending = brokerOverride?.custom_max_pending_response_leads ?? leadLimitConfig?.max_pending_response_leads_per_broker ?? 50;
              const threshold = (leadLimitConfig?.warning_threshold_percent ?? 80) / 100;
              const isBlocked = limitEnabled && brokerCounts && (
                (leadLimitConfig?.blocking_mode !== 'pendencia' && brokerCounts.active_leads >= maxActive) ||
                (leadLimitConfig?.blocking_mode !== 'carteira' && brokerCounts.pending_response_leads >= maxPending)
              );
              const isWarning = !isBlocked && limitEnabled && brokerCounts && (
                (leadLimitConfig?.blocking_mode !== 'pendencia' && brokerCounts.active_leads / maxActive >= threshold) ||
                (leadLimitConfig?.blocking_mode !== 'carteira' && brokerCounts.pending_response_leads / maxPending >= threshold)
              );
              const isPaused = brokerOverride?.receives_auto_leads === false;
              const isExempt = brokerOverride?.limit_exempt === true;

              const roleLabel =
                tenantMember?.role === 'admin' ? 'Admin' :
                tenantMember?.role === 'team_leader' ? 'Gestor' :
                tenantMember?.role === 'owner' ? 'Owner' :
                'Corretor';

              const handleMemberClick = () => {
                if (tenantMember) {
                  handleOpenEditModal(tenantMember);
                } else {
                  setMembroSelecionado(membro);
                }
              };

              return (
                <div
                  key={membro.id}
                  onClick={handleMemberClick}
                  className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer p-4 flex items-center gap-3 min-w-0"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-blue-500 shadow-md shadow-blue-500/20 flex items-center justify-center">
                      {fotoSrc ? (
                        <img src={fotoSrc} alt={membro.nome} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-white text-lg font-semibold">{membro.iniciais}</span>
                      )}
                    </div>
                    {/* Status dot */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                        membro.status === 'online' ? 'bg-green-500' :
                        membro.status === 'ausente' ? 'bg-yellow-500' :
                        'bg-slate-400'
                      }`}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {(membro.nome || '').replace(/[\uFFFD\u0000-\u001F]/g, '').trim() || '—'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                          tenantMember?.role === 'admin' || tenantMember?.role === 'owner'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                            : tenantMember?.role === 'team_leader'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {roleLabel}
                      </span>
                      {/* Limit indicators */}
                      {isPaused && !isExempt && (
                        <Ban className="h-3 w-3 text-slate-400" aria-label="Pausado" />
                      )}
                      {isExempt && (
                        <Info className="h-3 w-3 text-blue-400" aria-label="Sem limite" />
                      )}
                      {isBlocked && !isPaused && !isExempt && (
                        <AlertTriangle className="h-3 w-3 text-red-500" aria-label="No limite" />
                      )}
                      {isWarning && !isBlocked && !isPaused && !isExempt && (
                        <AlertTriangle className="h-3 w-3 text-yellow-500" aria-label="Próximo do limite" />
                      )}
                    </div>
                  </div>

                  {/* Ação rápida: promover/rebaixar */}
                  {tenantMember && tenantMember.role !== 'admin' && tenantMember.role !== 'owner' && (
                    <button
                      type="button"
                      onClick={(e) => handleQuickToggleLeader(e, tenantMember)}
                      title={tenantMember.role === 'team_leader' ? 'Rebaixar a corretor' : 'Promover a gestor'}
                      aria-label={tenantMember.role === 'team_leader' ? 'Rebaixar a corretor' : 'Promover a gestor'}
                      className="shrink-0 h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Shield className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Contador */}
        <div className="mt-6 text-sm text-gray-500 dark:text-slate-400 text-center">
          Exibindo {membrosFiltrados.length} de {membrosEquipe.length} pessoas
        </div>
      </div>

      {/* Sidebar de Detalhes */}
      {membroSelecionado && (
        <EquipeDetailsSidebar 
          membro={membroSelecionado}
          onClose={() => setMembroSelecionado(null)}
          onDelete={async (memberId, brokerUuid) => {
            const result = await deleteCorretorCompleto(memberId, brokerUuid, tenantId);
            if (result.success) {
              toast.success('Corretor excluído com sucesso');
              setMembroSelecionado(null);
              loadTenantMembers(); // Recarregar lista
            } else {
              toast.error(result.error || 'Erro ao excluir corretor');
              throw new Error(result.error);
            }
          }}
        />
      )}

      {/* Drawer lateral: Novo Membro */}
      {isNewMemberModalOpen && (
        <div
          onClick={() => !isCreatingMember && setIsNewMemberModalOpen(false)}
          style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
        />
      )}
      {isNewMemberModalOpen && (
        <div
          className="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
          style={{ position: 'fixed', right: 0, top: 56, width: '560px', height: 'calc(100vh - 56px)', maxHeight: 'calc(100vh - 56px)', zIndex: 99999 }}
        >
            <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-[#1a5276]" />
                  Adicionar Novo Membro
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Adicione um novo membro à sua equipe. O usuário receberá acesso ao CRM.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isCreatingMember && setIsNewMemberModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Foto do Corretor
              </Label>
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                    {newMemberPhoto ? (
                      <img src={newMemberPhoto} alt="Foto do corretor" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => newMemberPhotoInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-[#1a5276] text-white shadow-sm flex items-center justify-center hover:bg-[#154360] transition-colors"
                    aria-label="Selecionar foto"
                    disabled={isCreatingMember}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <input
                    ref={newMemberPhotoInputRef}
                    id="new-member-photo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        setNewMemberPhoto('');
                        return;
                      }

                      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
                      if (!allowed.includes(file.type)) {
                        toast.error('Formato inválido. Envie PNG, JPG ou WebP.');
                        e.target.value = '';
                        return;
                      }

                      const maxBytes = 2 * 1024 * 1024;
                      if (file.size > maxBytes) {
                        toast.error('A imagem é muito grande. Máximo 2MB.');
                        e.target.value = '';
                        return;
                      }

                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result;
                        if (typeof result === 'string') {
                          setNewMemberPhoto(result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                    disabled={isCreatingMember}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => newMemberPhotoInputRef.current?.click()}
                      disabled={isCreatingMember}
                    >
                      Selecionar foto
                    </Button>
                    {newMemberPhoto && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 text-red-600 dark:text-red-300 hover:text-red-700"
                        onClick={() => {
                          setNewMemberPhoto('');
                          if (newMemberPhotoInputRef.current) newMemberPhotoInputRef.current.value = '';
                        }}
                        disabled={isCreatingMember}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">PNG, JPG ou WebP (máx. 2MB).</p>
                </div>
              </div>
            </div>

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                Nome
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Nome do membro"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Sobrenome */}
            <div className="space-y-2">
              <Label htmlFor="sobrenome" className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                Sobrenome
              </Label>
              <Input
                id="sobrenome"
                type="text"
                placeholder="Sobrenome do membro"
                value={newMemberSurname}
                onChange={(e) => setNewMemberSurname(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Senha */}
            <div className="space-y-2">
              <Label htmlFor="password">Senha Inicial</Label>
              <Input
                id="password"
                type="password"
                placeholder="Senha para o novo usuário"
                value={newMemberPassword}
                onChange={(e) => setNewMemberPassword(e.target.value)}
                className="h-10"
              />
              <p className="text-xs text-gray-500 dark:text-slate-400">
                O usuário poderá alterar a senha após o primeiro acesso.
              </p>
            </div>

            {/* Permissão/Role */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                Tipo de Usuário
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setNewMemberRole('corretor')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    newMemberRole === 'corretor'
                      ? 'border-[#1a5276] bg-blue-50 dark:bg-blue-950/40'
                      : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
                  }`}
                >
                  <User className={`h-5 w-5 ${newMemberRole === 'corretor' ? 'text-[#1a5276]' : 'text-gray-400 dark:text-slate-500'}`} />
                  <span className={`text-xs font-medium ${newMemberRole === 'corretor' ? 'text-[#1a5276]' : 'text-gray-600 dark:text-slate-400'}`}>
                    Corretor
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 text-center">
                    Acesso básico
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewMemberRole('team_leader')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    newMemberRole === 'team_leader'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
                      : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
                  }`}
                >
                  <Users className={`h-5 w-5 ${newMemberRole === 'team_leader' ? 'text-amber-600 dark:text-amber-300' : 'text-gray-400 dark:text-slate-500'}`} />
                  <span className={`text-xs font-medium ${newMemberRole === 'team_leader' ? 'text-amber-600 dark:text-amber-300' : 'text-gray-600 dark:text-slate-400'}`}>
                    Líder de Equipe
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 text-center">
                    Gestão de equipe
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewMemberRole('admin')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                    newMemberRole === 'admin'
                      ? 'border-[#1a5276] bg-blue-50 dark:bg-blue-950/40'
                      : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
                  }`}
                >
                  <Shield className={`h-5 w-5 ${newMemberRole === 'admin' ? 'text-[#1a5276]' : 'text-gray-400 dark:text-slate-500'}`} />
                  <span className={`text-xs font-medium ${newMemberRole === 'admin' ? 'text-[#1a5276]' : 'text-gray-600 dark:text-slate-400'}`}>
                    Admin
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 text-center">
                    Acesso total
                  </span>
                </button>
              </div>
            </div>

            {/* Equipe - Apenas para Corretor e Team Leader */}
            {(newMemberRole === 'corretor' || newMemberRole === 'team_leader') && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                  Equipe
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'vermelha', label: 'Vermelha', color: 'bg-red-500', borderColor: 'border-red-500', bgColor: 'bg-red-50 dark:bg-red-950/40' },
                    { id: 'verde', label: 'Verde', color: 'bg-green-500', borderColor: 'border-green-500', bgColor: 'bg-green-50 dark:bg-green-950/40' },
                    { id: 'amarela', label: 'Amarela', color: 'bg-yellow-500', borderColor: 'border-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-950/40' },
                    { id: 'azul', label: 'Azul', color: 'bg-blue-500', borderColor: 'border-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-950/40' }
                  ].map((equipe) => (
                    <button
                      key={equipe.id}
                      type="button"
                      onClick={() => setNewMemberTeam(equipe.id as any)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${
                        newMemberTeam === equipe.id
                          ? `${equipe.borderColor} ${equipe.bgColor}`
                          : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${equipe.color}`}></div>
                      <span className={`text-xs font-medium ${newMemberTeam === equipe.id ? 'text-gray-800' : 'text-gray-600 dark:text-slate-400'}`}>
                        {equipe.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Selecione a qual equipe este membro pertence.
                </p>
              </div>
            )}

            {/* Permissões Granulares - Accordion Harmônico */}
            <div className="border border-gray-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-950 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-gray-600 dark:text-slate-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Permissões de Acesso</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    ({Object.values(permissions).filter(Boolean).length}/{Object.keys(permissions).length} ativas)
                  </span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-500 dark:text-slate-400 transition-transform ${isPermissionsExpanded ? 'rotate-180' : ''}`} />
              </button>
              
              {isPermissionsExpanded && (
                <div className="p-4 space-y-3 bg-white dark:bg-slate-900">
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                    {newMemberRole === 'admin' 
                      ? 'Administradores têm acesso total a todas as seções.'
                      : newMemberRole === 'team_leader'
                      ? 'Líderes de equipe têm acesso intermediário. Podem gerenciar sua equipe mas não têm acesso a IA, Integrações, Central de Leads e Relatórios.'
                      : 'Corretores têm acesso restrito. Por padrão, NÃO têm acesso a: Agentes de IA, Integrações, Central de Leads, Relatórios, Recrutamento e Gestão de Equipe.'}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'leads', label: 'Início', icon: '🏠' },
                      { id: 'notificacoes', label: 'Notificações', icon: '🔔' },
                      { id: 'metricas', label: 'Comercial', icon: '📊' },
                      { id: 'estudo-mercado', label: 'Estudo de Mercado', icon: '📈' },
                      { id: 'recrutamento', label: 'Recrutamento', icon: '✅' },
                      { id: 'gestao-equipe', label: 'Gestão de Equipe', icon: '👥' },
                      { id: 'imoveis', label: 'Imóveis', icon: '🏢' },
                      { id: 'agentes-ia', label: 'Agentes de IA', icon: '🤖', restricted: true },
                      { id: 'octo-chat', label: 'Octo Chat', icon: '💬' },
                      { id: 'integracoes', label: 'Integrações', icon: '🔌', restricted: true },
                      { id: 'central-leads', label: 'Central Leads', icon: '📥', restricted: true },
                      { id: 'relatorios', label: 'Relatórios', icon: '📄', restricted: true }
                    ].map((section) => (
                      <label
                        key={section.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          permissions[section.id as keyof typeof permissions]
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900'
                            : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
                        } ${newMemberRole === 'admin' ? 'opacity-50 cursor-not-allowed' : ''} ${
                          section.restricted && newMemberRole === 'corretor' ? 'border-orange-200 dark:border-orange-900' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={permissions[section.id as keyof typeof permissions]}
                          onChange={(e) => {
                            if (newMemberRole !== 'admin') {
                              setPermissions(prev => ({
                                ...prev,
                                [section.id]: e.target.checked
                              }));
                            }
                          }}
                          disabled={newMemberRole === 'admin'}
                          className="h-4 w-4 text-blue-600 dark:text-blue-300 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{section.icon}</span>
                            <span className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate">{section.label}</span>
                          </div>
                          {section.restricted && newMemberRole === 'corretor' && (
                            <span className="text-[10px] text-orange-600 dark:text-orange-300">Restrito</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  
                  {newMemberRole === 'corretor' && (
                    <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-lg mt-3">
                      <Unlock className="h-4 w-4 text-orange-600 dark:text-orange-300 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-800 dark:text-orange-200">
                        <strong>Restrições padrão:</strong> Corretores não têm acesso a seções administrativas (marcadas como "Restrito") por padrão. Você pode habilitar manualmente se necessário.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Info sobre código da imobiliária */}
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Alternativa:</strong> O usuário pode se cadastrar sozinho usando o código da imobiliária: <code className="bg-amber-100 dark:bg-amber-950/60 px-1 rounded font-mono">{tenantCode}</code>
              </p>
            </div>
          </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsNewMemberModalOpen(false)}
                disabled={isCreatingMember}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateMember}
                disabled={isCreatingMember || !newMemberEmail || !newMemberPassword}
                className="bg-[#1a5276] hover:bg-[#154360] text-white"
              >
                {isCreatingMember ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Criando...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Adicionar Membro
                  </>
                )}
              </Button>
            </div>
        </div>
      )}

      {/* Drawer lateral: Editar Permissões */}
      {isEditModalOpen && (
        <div
          onClick={() => {
            setIsEditModalOpen(false);
            setEditingMember(null);
            setEditMemberPhoto('');
            setShowDeleteConfirm(false);
          }}
          style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
        />
      )}
      {isEditModalOpen && (
        <div
          className="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
          style={{ position: 'fixed', right: 0, top: 56, width: '560px', height: 'calc(100vh - 56px)', maxHeight: 'calc(100vh - 56px)', zIndex: 99999 }}
        >
            {/* Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#1a5276]" />
                  Gerenciar Permissões
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">
                  {editingMember?.email} — {editRole === 'admin' ? 'Administrador' : editRole === 'team_leader' ? 'Líder de Equipe' : 'Corretor'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingMember(null);
                  setEditMemberPhoto('');
                  setShowDeleteConfirm(false);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Corpo scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Cargo do membro */}
            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4 bg-gray-50/40 dark:bg-slate-900/40">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Cargo do membro</span>
              </div>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as 'admin' | 'corretor' | 'team_leader')}
                disabled={isSavingPermissions || editingMember?.role === 'owner'}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corretor">Corretor</SelectItem>
                  <SelectItem value="team_leader">Líder de Equipe (Gestor)</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>

              {editRole === 'team_leader' && (
                <div className="mt-4">
                  <Label className="text-xs text-gray-600 dark:text-slate-400 mb-2 block">
                    Equipes que este gestor lidera (pode selecionar várias)
                  </Label>
                  {teams.length === 0 ? (
                    <p className="text-xs text-amber-600">
                      Nenhuma equipe criada. Crie uma equipe em "Equipes" antes de atribuir liderança.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-slate-800 p-2 bg-white dark:bg-slate-950">
                      {teams.map((t) => {
                        const checked = editLeadsTeamIds.includes(t.id);
                        const isLedByOther = !!t.leader_user_id && t.leader_user_id !== editingMember?.user_id;
                        return (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSavingPermissions}
                              onChange={(e) => {
                                setEditLeadsTeamIds((prev) =>
                                  e.target.checked
                                    ? [...prev, t.id]
                                    : prev.filter((id) => id !== t.id)
                                );
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-[#1a5276] focus:ring-[#1a5276]"
                            />
                            <span className="flex-1 truncate">{t.name}</span>
                            {isLedByOther && (
                              <span className="text-[10px] text-amber-600">
                                (líder atual: {t.leader_name ?? t.leader_email ?? 'outro'} — será substituído)
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {editLeadsTeamIds.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                      Liderando {editLeadsTeamIds.length} {editLeadsTeamIds.length === 1 ? 'equipe' : 'equipes'}.
                    </p>
                  )}
                </div>
              )}
            </div>

            {isCurrentUserAdmin && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-4 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Credenciais de acesso (somente admin)
                  </span>
                </div>

                <Label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">
                  Email de acesso
                </Label>
                <div className="flex gap-2 mb-3">
                  <Input
                    type="email"
                    value={credentialsEmail}
                    onChange={(e) => setCredentialsEmail(e.target.value)}
                    placeholder="novo@email.com"
                    className="h-9"
                    disabled={isSavingCredentials}
                  />
                  <Button
                    type="button"
                    onClick={handleSaveMemberEmail}
                    disabled={isSavingCredentials || !credentialsEmail.trim()}
                    className="h-9 bg-[#1a5276] hover:bg-[#154360] text-white"
                  >
                    {isSavingCredentials ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar email'}
                  </Button>
                </div>

                <Label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">
                  Nova senha (mín. 6 caracteres)
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={credentialsNewPassword}
                    onChange={(e) => setCredentialsNewPassword(e.target.value)}
                    placeholder="Digite a nova senha"
                    className="h-9"
                    disabled={isSavingCredentials}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    onClick={handleSaveMemberPassword}
                    disabled={isSavingCredentials || credentialsNewPassword.length < 6}
                    className="h-9 bg-amber-700 hover:bg-amber-800 text-white"
                  >
                    {isSavingCredentials ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Redefinir senha'}
                  </Button>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                  O usuário precisará fazer login novamente após a alteração.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4 bg-gray-50/40 dark:bg-slate-900/40">
              <div className="flex items-center gap-2 mb-3">
                <Camera className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Foto do corretor</span>
              </div>
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                    {editMemberPhoto ? (
                      <img src={editMemberPhoto} alt="Foto do corretor" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => editMemberPhotoInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-[#1a5276] text-white shadow-sm flex items-center justify-center hover:bg-[#154360] transition-colors"
                    aria-label="Selecionar foto"
                    disabled={isSavingPermissions}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    ref={editMemberPhotoInputRef}
                    id="edit-member-photo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        setEditMemberPhoto('');
                        return;
                      }

                      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
                      if (!allowed.includes(file.type)) {
                        toast.error('Formato inválido. Envie PNG, JPG ou WebP.');
                        e.target.value = '';
                        return;
                      }

                      const maxBytes = 2 * 1024 * 1024;
                      if (file.size > maxBytes) {
                        toast.error('A imagem é muito grande. Máximo 2MB.');
                        e.target.value = '';
                        return;
                      }

                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result;
                        if (typeof result === 'string') {
                          setEditMemberPhoto(result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                    disabled={isSavingPermissions}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => editMemberPhotoInputRef.current?.click()}
                      disabled={isSavingPermissions}
                    >
                      Selecionar foto
                    </Button>
                    {editMemberPhoto && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 text-red-600 dark:text-red-300 hover:text-red-700"
                        onClick={() => {
                          setEditMemberPhoto('');
                          if (editMemberPhotoInputRef.current) editMemberPhotoInputRef.current.value = '';
                        }}
                        disabled={isSavingPermissions}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">PNG, JPG ou WebP (máx. 2MB).</p>
                </div>
              </div>
            </div>
            {/* Permissões de Abas Principais */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Abas do Menu Principal
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'leads', label: 'Início', icon: '🏠' },
                  { id: 'notificacoes', label: 'Notificações', icon: '🔔' },
                  { id: 'metricas', label: 'Comercial', icon: '📊' },
                  { id: 'estudo-mercado', label: 'Estudo de Mercado', icon: '📈' },
                  { id: 'recrutamento', label: 'Recrutamento', icon: '✅', restricted: true },
                  { id: 'gestao-equipe', label: 'Gestão de Equipe', icon: '👥', restricted: true },
                  { id: 'imoveis', label: 'Imóveis', icon: '🏢' },
                  { id: 'agentes-ia', label: 'Agentes de IA', icon: '🤖', restricted: true },
                  { id: 'octo-chat', label: 'Octo Chat', icon: '💬' },
                  { id: 'integracoes', label: 'Integrações', icon: '🔌', restricted: true },
                  { id: 'central-leads', label: 'Central Leads', icon: '📥', restricted: true },
                  { id: 'relatorios', label: 'Relatórios', icon: '📄', restricted: true }
                ].map((section) => (
                  <label
                    key={section.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                      editPermissions[section.id]
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900'
                        : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editPermissions[section.id] || false}
                      onChange={(e) => setEditPermissions(prev => ({
                        ...prev,
                        [section.id]: e.target.checked
                      }))}
                      className="h-4 w-4 text-blue-600 dark:text-blue-300 rounded border-gray-300"
                    />
                    <span className="text-sm">{section.icon}</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{section.label}</span>
                    {section.restricted && (
                      <span className="text-[10px] text-orange-600 dark:text-orange-300 ml-auto">Restrito</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Sub-permissões: Início */}
            {editPermissions.leads && (
              <div className="space-y-3 p-3 bg-gray-50 dark:bg-slate-950 rounded-lg">
                <h4 className="font-medium text-gray-700 dark:text-slate-300 text-sm">Sub-abas de Início</h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'leads-funil', label: 'Funil' },
                    { id: 'leads-okrs', label: 'OKRs' },
                    { id: 'leads-kpis', label: 'KPIs' },
                    { id: 'leads-pdi', label: 'PDI' },
                    { id: 'leads-tarefas', label: 'Tarefas da Semana' },
                    { id: 'leads-agenda', label: 'Agenda' }
                  ].map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={editSubPermissions[sub.id] || false}
                        onChange={(e) => setEditSubPermissions(prev => ({
                          ...prev,
                          [sub.id]: e.target.checked
                        }))}
                        className="h-3 w-3 text-blue-600 dark:text-blue-300 rounded"
                      />
                      {sub.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-permissões: Comercial/Métricas */}
            {editPermissions.metricas && (
              <div className="space-y-3 p-3 bg-gray-50 dark:bg-slate-950 rounded-lg">
                <h4 className="font-medium text-gray-700 dark:text-slate-300 text-sm">Sub-abas de Comercial</h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'metricas-geral', label: 'Métricas Gerais' },
                    { id: 'metricas-equipes', label: 'Por Equipes' },
                    { id: 'metricas-corretores', label: 'Por Corretores' }
                  ].map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={editSubPermissions[sub.id] || false}
                        onChange={(e) => setEditSubPermissions(prev => ({
                          ...prev,
                          [sub.id]: e.target.checked
                        }))}
                        className="h-3 w-3 text-blue-600 dark:text-blue-300 rounded"
                      />
                      {sub.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-permissões: Gestão de Equipe */}
            {editPermissions['gestao-equipe'] && (
              <div className="space-y-3 p-3 bg-gray-50 dark:bg-slate-950 rounded-lg">
                <h4 className="font-medium text-gray-700 dark:text-slate-300 text-sm">Sub-abas de Gestão de Equipe</h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gestao-tarefas', label: 'Tarefas' },
                    { id: 'gestao-okrs', label: 'OKRs' },
                    { id: 'gestao-pdi', label: 'PDI' },
                    { id: 'gestao-metricas', label: 'Métricas' },
                    { id: 'gestao-acessos', label: 'Acessos e Permissões' }
                  ].map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={editSubPermissions[sub.id] || false}
                        onChange={(e) => setEditSubPermissions(prev => ({
                          ...prev,
                          [sub.id]: e.target.checked
                        }))}
                        className="h-3 w-3 text-blue-600 dark:text-blue-300 rounded"
                      />
                      {sub.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Permissões Especiais do Bolsão */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <span>🎰</span>
                Permissões Especiais — Bolsão
              </h3>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    editSpecialPermissions.can_manage_roleta
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300'
                      : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={editSpecialPermissions.can_manage_roleta || false}
                    onChange={(e) => setEditSpecialPermissions(prev => ({
                      ...prev,
                      can_manage_roleta: e.target.checked
                    }))}
                    className="h-4 w-4 text-amber-600 dark:text-amber-300 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Gerenciar Roleta</span>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Permite selecionar quais corretores participam da roleta de distribuição de leads no Bolsão. Team Leaders têm isso por padrão.
                    </p>
                  </div>
                  {editSpecialPermissions.can_manage_roleta && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full">Ativo</span>
                  )}
                </label>
              </div>
            </div>

            {/* Fila por Equipe — Líder atribuído (apenas corretores) */}
            {editingMember?.role === 'corretor' && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  <span>🔄</span>
                  Fila por Equipe
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Quando este corretor não atender um lead no prazo, o sistema tentará redistribuí-lo
                  para outro corretor da mesma equipe antes de enviar ao Bolsão geral.
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Líder de Equipe</label>
                  <Select
                    value={editLeaderId ?? '__none__'}
                    onValueChange={(v) => setEditLeaderId(v === '__none__' ? null : v)}
                  >
                    <SelectTrigger className="h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800">
                      <SelectValue placeholder="Nenhum líder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (sem fila de equipe)</SelectItem>
                      {tenantMembers
                        .filter((m) => m.role === 'team_leader')
                        .map((leader) => (
                          <SelectItem key={leader.user_id} value={leader.user_id}>
                            {leader.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {editLeaderId && (
                    <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded px-2 py-1 mt-1">
                      ✅ Fila ativa — leads expirados serão redistribuídos na equipe antes do Bolsão.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Limite de Leads — Override por Corretor */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Limite de Leads — Este Corretor
              </h3>
              {!leadLimitConfig && (
                <p className="text-xs text-gray-400 dark:text-slate-500 italic">
                  Configure o limite global primeiro na tela de Gestão de Equipe.
                </p>
              )}

              {/* Pausar recebimento automático */}
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                editBrokerOverride.receives_auto_leads === false
                  ? 'bg-gray-50 dark:bg-slate-950 border-gray-400'
                  : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
              }`}>
                <input
                  type="checkbox"
                  checked={editBrokerOverride.receives_auto_leads === false}
                  onChange={(e) => setEditBrokerOverride(prev => ({
                    ...prev,
                    receives_auto_leads: e.target.checked ? false : undefined
                  }))}
                  className="h-4 w-4 text-gray-600 dark:text-slate-400 rounded border-gray-300"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Pausar recebimento automático</span>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Este corretor não receberá leads via roleta ou atribuição automática.
                  </p>
                </div>
              </label>

              {/* Isento de limite */}
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                editBrokerOverride.limit_exempt
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300'
                  : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
              }`}>
                <input
                  type="checkbox"
                  checked={editBrokerOverride.limit_exempt || false}
                  onChange={(e) => setEditBrokerOverride(prev => ({
                    ...prev,
                    limit_exempt: e.target.checked || undefined
                  }))}
                  className="h-4 w-4 text-blue-600 dark:text-blue-300 rounded border-gray-300"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Isento de limite</span>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Ignora qualquer limite configurado (global ou personalizado).
                  </p>
                </div>
              </label>

              {/* Limites personalizados */}
              {!editBrokerOverride.limit_exempt && editBrokerOverride.receives_auto_leads !== false && (
                <div className="p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800 space-y-3">
                  <p className="text-xs text-gray-600 dark:text-slate-400 font-medium">Limites personalizados (sobrescreve o global)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-700 dark:text-slate-300">Máx. ativos (vazio = global)</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder={String(leadLimitConfig?.max_active_leads_per_broker ?? 100)}
                        value={editBrokerOverride.custom_max_active_leads ?? ''}
                        onChange={(e) => setEditBrokerOverride(prev => ({
                          ...prev,
                          custom_max_active_leads: e.target.value ? Number(e.target.value) : undefined
                        }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-700 dark:text-slate-300">Máx. pendentes (vazio = global)</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder={String(leadLimitConfig?.max_pending_response_leads_per_broker ?? 50)}
                        value={editBrokerOverride.custom_max_pending_response_leads ?? ''}
                        onChange={(e) => setEditBrokerOverride(prev => ({
                          ...prev,
                          custom_max_pending_response_leads: e.target.value ? Number(e.target.value) : undefined
                        }))}
                        className="h-8"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tempo de bolsão individual — sempre visível */}
              <div className="p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-600 dark:text-slate-400 font-medium">Tempo de bolsão — Imóveis Exclusivos</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Tempo individual deste corretor no bolsão antes do lead ser repassado. Vazio = usa o valor global.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
                      Exclusivo (min)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      placeholder={String(leadLimitConfig?.exclusive_lead_timeout_minutes ?? 30)}
                      value={editBrokerOverride.custom_exclusive_timeout_minutes ?? ''}
                      onChange={(e) => setEditBrokerOverride(prev => ({
                        ...prev,
                        custom_exclusive_timeout_minutes: e.target.value ? Number(e.target.value) : undefined
                      }))}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                      Geral (min)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      placeholder={String(leadLimitConfig?.general_lead_timeout_minutes ?? 5)}
                      value={editBrokerOverride.custom_general_timeout_minutes ?? ''}
                      onChange={(e) => setEditBrokerOverride(prev => ({
                        ...prev,
                        custom_general_timeout_minutes: e.target.value ? Number(e.target.value) : undefined
                      }))}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Zona de Perigo - Excluir */}
            <div className="border-t pt-4 mt-4">
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-4">
                <h4 className="font-semibold text-red-800 dark:text-red-200 flex items-center gap-2 mb-2">
                  <Trash2 className="h-4 w-4" />
                  Zona de Perigo
                </h4>
                {!showDeleteConfirm ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Usuário Permanentemente
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      <strong>Atenção!</strong> Esta ação é irreversível. O usuário será removido completamente do sistema e não poderá mais acessar a plataforma.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteCompletely}
                        disabled={isDeleting}
                        className="flex-1"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Excluindo...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Confirmar Exclusão
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

            {/* Footer fixo */}
            <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSavingPermissions}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSavePermissions}
                disabled={isSavingPermissions}
                className="bg-[#1a5276] hover:bg-[#154360] text-white"
              >
                {isSavingPermissions ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Salvar Permissões
                  </>
                )}
              </Button>
            </div>
        </div>
      )}
    </div>
  );
};

