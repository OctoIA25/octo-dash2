/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Seção de Configurações do Sistema
 */

import { useState, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getWebhookUrl, saveWebhookUrl, testWebhookConnection } from '@/features/agentes-ia/services/agentWebhookService';
import { supabase } from '@/integrations/supabase/client';
import { Lock } from 'lucide-react';
import { getDailySessionId } from '@/utils/snowflakeId';
import { UsuariosSection } from '@/components/sections/UsuariosSection';
import { DEFAULT_BOLSAO_CONFIG, TenantBolsaoConfig, fetchTenantBolsaoConfig, saveTenantBolsaoConfig } from '@/features/leads/services/tenantBolsaoConfigService';
import {
  TenantLeadLimitConfig,
  DEFAULT_LEAD_LIMIT_CONFIG,
  KANBAN_STATUSES,
  fetchLeadLimitConfig,
  saveLeadLimitConfig,
} from '@/features/corretores/services/tenantLeadLimitService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  User, 
  Mail, 
  Phone, 
  Building2,
  Bell,
  Shield,
  Palette,
  Save,
  Settings,
  Check,
  Bot,
  Link as LinkIcon,
  TestTube,
  Loader2,
  UserCog,
  Clock,
  Users,
  UserCheck,
  Calendar,
  TrendingUp,
  RotateCcw,
  Inbox
} from 'lucide-react';

const BOLSAO_TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 240, 360, 480, 720, 1440];

const getTimeOptionIndex = (value: number) => {
  const index = BOLSAO_TIME_OPTIONS.findIndex(v => v >= value);
  return index === -1 ? BOLSAO_TIME_OPTIONS.length - 1 : index;
};

const formatTempoExpiracao = (value: number) => {
  if (value < 60) return `${value} minutos`;
  return `${(value / 60).toFixed(value % 60 === 0 ? 0 : 1)}h`;
};

interface ConfiguracoesSectionProps {
  leads?: ProcessedLead[];
}

export const ConfiguracoesSection = ({ leads }: ConfiguracoesSectionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentTheme, changeTheme, themes } = useTheme();
  
  const [activeTab, setActiveTab] = useState<'perfil' | 'geral' | 'aparencia' | 'agentes-ia' | 'usuarios' | 'bolsao' | 'limite-leads'>('perfil');
  
  // Estados para os campos do perfil
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    company: user?.company || 'Imobiliária Japi'
  });

  // Estados para alteração de senha própria
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingOwnProfile, setIsSavingOwnProfile] = useState(false);

  // Estados para configurações gerais
  const [generalSettings, setGeneralSettings] = useState({
    notifications: true,
    emailAlerts: true,
    darkMode: true,
    autoRefresh: true
  });

  // Estados para Agentes de IA
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [sessionId, setSessionId] = useState('');

  // URL IMUTÁVEL do webhook - SEMPRE a mesma para todos os usuários
  const DEFAULT_WEBHOOK_URL = 'https://webhook.octoia.org/webhook/650caf33-df01-426f-ab35-728fe16d3b57';
  const webhookUrl = DEFAULT_WEBHOOK_URL; // SEMPRE usar a URL padrão

  // Estados para Configurações do Bolsão
  const [bolsaoConfig, setBolsaoConfig] = useState<TenantBolsaoConfig>(DEFAULT_BOLSAO_CONFIG);

  // Carregar session ID ao montar componente
  useEffect(() => {
    // SEMPRE garantir que a URL padrão está salva
    saveWebhookUrl(DEFAULT_WEBHOOK_URL);
    setSessionId(getDailySessionId());
  }, []);

  useEffect(() => {
    const loadBolsaoConfig = async () => {
      if (!user?.tenantId) return;
      const config = await fetchTenantBolsaoConfig(user.tenantId);
      setBolsaoConfig(config);
    };

    loadBolsaoConfig();
  }, [user?.tenantId]);

  // ---- Lead Limit Config ----
  const [leadLimitConfig, setLeadLimitConfig] = useState<TenantLeadLimitConfig | null>(null);
  const [isLoadingLimitConfig, setIsLoadingLimitConfig] = useState(false);
  const [isSavingLimitConfig, setIsSavingLimitConfig] = useState(false);
  const [limitConfigDraft, setLimitConfigDraft] = useState<Omit<TenantLeadLimitConfig, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>(DEFAULT_LEAD_LIMIT_CONFIG);

  useEffect(() => {
    const loadLeadLimitConfig = async () => {
      if (!user?.tenantId) return;
      setIsLoadingLimitConfig(true);
      try {
        const cfg = await fetchLeadLimitConfig(user.tenantId);
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
    };
    loadLeadLimitConfig();
  }, [user?.tenantId]);

  const handleSaveLeadLimitConfig = async () => {
    if (!user?.tenantId) return;
    setIsSavingLimitConfig(true);
    try {
      const result = await saveLeadLimitConfig(user.tenantId, limitConfigDraft);
      if (result.success) {
        toast({ title: 'Configuração de limite salva!', description: 'Os limites foram atualizados com sucesso.', duration: 3000 });
        const cfg = await fetchLeadLimitConfig(user.tenantId);
        if (cfg) setLeadLimitConfig(cfg);
      } else {
        toast({ title: 'Erro ao salvar', description: result.error || 'Erro desconhecido', variant: 'destructive', duration: 5000 });
      }
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Falha ao salvar configuração de limite', variant: 'destructive', duration: 5000 });
    } finally {
      setIsSavingLimitConfig(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingOwnProfile(true);
    try {
      const cleanEmail = profileData.email.trim().toLowerCase();
      const emailChanged = cleanEmail && cleanEmail !== (user.email || '').toLowerCase();

      if (emailChanged) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          toast({ title: 'Email inválido', variant: 'destructive', duration: 3000 });
          return;
        }
        const { error } = await supabase.auth.updateUser({ email: cleanEmail });
        if (error) {
          toast({ title: 'Erro ao atualizar email', description: error.message, variant: 'destructive', duration: 4000 });
          return;
        }
      }

      toast({
        title: 'Perfil atualizado!',
        description: emailChanged
          ? 'Verifique seu novo email para confirmar a alteração.'
          : 'Suas informações foram salvas com sucesso.',
        duration: 3000,
      });
    } finally {
      setIsSavingOwnProfile(false);
    }
  };

  const handleChangeOwnPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Mínimo 6 caracteres.', variant: 'destructive', duration: 3000 });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive', duration: 3000 });
      return;
    }
    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: 'Erro ao alterar senha', description: error.message, variant: 'destructive', duration: 4000 });
        return;
      }
      toast({ title: 'Senha alterada com sucesso', duration: 3000 });
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveSettings = () => {
    // TODO: Integrar com localStorage ou Supabase
    
    toast({
      title: "Configurações salvas!",
      description: "Suas preferências foram atualizadas.",
      duration: 3000,
    });
  };

  // handleSaveWebhook removido - URL é imutável e configurada automaticamente

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast({
        title: "Erro!",
        description: "Por favor, insira uma URL para testar.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setIsTestingWebhook(true);
    
    const result = await testWebhookConnection(webhookUrl);
    
    setIsTestingWebhook(false);

    if (result.success) {
      toast({
        title: "Conexão bem-sucedida! ✅",
        description: "O webhook respondeu corretamente.",
        duration: 3000,
      });
    } else {
      toast({
        title: "Falha na conexão ❌",
        description: result.error || "Não foi possível conectar ao webhook.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const salvarConfiguracoesBolsao = async (novasConfigs: TenantBolsaoConfig) => {
    try {
      setBolsaoConfig(novasConfigs);
      if (user?.tenantId) {
        await saveTenantBolsaoConfig(user.tenantId, novasConfigs);
      }
      toast({
        title: "✅ Configurações Salvas",
        description: "As configurações do Bolsão foram atualizadas com sucesso.",
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error?.message || "Não foi possível salvar as configurações do Bolsão.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  return (
    <div className="px-6 py-5">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex gap-5 items-start">
          {/* Sidebar */}
          <div className="w-52 shrink-0">
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 space-y-0.5">
              <button type="button" onClick={() => setActiveTab('perfil')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'perfil' ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'perfil' ? 'bg-blue-100 dark:bg-blue-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}><User className={`w-3.5 h-3.5 ${activeTab === 'perfil' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} /></div>
                Perfil
              </button>
              <button type="button" onClick={() => setActiveTab('geral')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'geral' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'geral' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-slate-100 dark:bg-slate-800'}`}><Bell className={`w-3.5 h-3.5 ${activeTab === 'geral' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`} /></div>
                Geral
              </button>
              <button type="button" onClick={() => setActiveTab('aparencia')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'aparencia' ? 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'aparencia' ? 'bg-violet-100 dark:bg-violet-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}><Palette className={`w-3.5 h-3.5 ${activeTab === 'aparencia' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} /></div>
                Aparência
              </button>
              <button type="button" onClick={() => setActiveTab('agentes-ia')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'agentes-ia' ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'agentes-ia' ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}><Bot className={`w-3.5 h-3.5 ${activeTab === 'agentes-ia' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} /></div>
                Agentes de IA
              </button>
              {user?.role === 'gestao' && (
                <>
                  <div className="mx-2 my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600">Admin</p>
                  <button type="button" onClick={() => setActiveTab('bolsao')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'bolsao' ? 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'bolsao' ? 'bg-orange-100 dark:bg-orange-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}><Inbox className={`w-3.5 h-3.5 ${activeTab === 'bolsao' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'}`} /></div>
                    Bolsão
                  </button>
                  <button type="button" onClick={() => setActiveTab('limite-leads')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'limite-leads' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'limite-leads' ? 'bg-emerald-100 dark:bg-emerald-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}><Shield className={`w-3.5 h-3.5 ${activeTab === 'limite-leads' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} /></div>
                    Limite de Leads
                  </button>
                  <button type="button" onClick={() => setActiveTab('usuarios')} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === 'usuarios' ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === 'usuarios' ? 'bg-purple-100 dark:bg-purple-900/60' : 'bg-slate-100 dark:bg-slate-800'}`}><UserCog className={`w-3.5 h-3.5 ${activeTab === 'usuarios' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} /></div>
                    Usuários
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          {/* ABA PERFIL */}
          {activeTab === 'perfil' && (
            <div className="space-y-6">
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <User className="w-[18px] h-[18px] text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Perfil</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Suas informações pessoais</p>
                </div>
              </div>
              <div className="flex items-center justify-center mb-8">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-600 to-blue-500 rounded-full flex items-center justify-center text-white text-5xl font-bold shadow-2xl shadow-blue-500/30 relative">
                  {profileData.name.charAt(0).toUpperCase()}
                  <button type="button" className="absolute bottom-0 right-0 w-10 h-10 bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-full flex items-center justify-center transition-colors">
                    <User className="h-5 w-5 text-blue-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="name" className="text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-blue-400" />
                    Nome Completo
                  </Label>
                  <Input
                    id="name"
                    value={profileData.name}
                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    className="border focus:border-blue-500 h-11"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Seu nome completo"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-blue-400" />
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    className="border focus:border-blue-500 h-11"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="seu@email.com"
                  />
                </div>

                <div>
                  <Label htmlFor="phone" className="text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                    <Phone className="h-4 w-4 text-blue-400" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    className="border focus:border-blue-500 h-11"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div>
                  <Label htmlFor="company" className="text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-blue-400" />
                    Empresa
                  </Label>
                  <Input
                    id="company"
                    value={profileData.company}
                    onChange={(e) => setProfileData({ ...profileData, company: e.target.value })}
                    className="border focus:border-blue-500 h-11"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>

              {/* Alterar senha */}
              <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                    <Lock className="w-[18px] h-[18px] text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Alterar senha</h3>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">Mínimo 6 caracteres</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="new-password" className="text-slate-700 dark:text-slate-300 mb-2 block">
                      Nova senha
                    </Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Digite a nova senha"
                      className="h-11"
                      disabled={isSavingPassword}
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirm-password" className="text-slate-700 dark:text-slate-300 mb-2 block">
                      Confirmar nova senha
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Repita a nova senha"
                      className="h-11"
                      disabled={isSavingPassword}
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleChangeOwnPassword}
                    disabled={isSavingPassword || !newPassword || !confirmPassword}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {isSavingPassword ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Alterando...</>
                    ) : (
                      <><Lock className="h-4 w-4 mr-2" /> Alterar senha</>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-6 flex justify-end">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSavingOwnProfile}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                >
                  {isSavingOwnProfile ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Salvar Perfil</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ABA GERAL */}
          {activeTab === 'geral' && (
            <div className="space-y-4">
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Bell className="w-[18px] h-[18px] text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Geral</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Notificações e preferências do sistema</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-5 rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div>
                    <p className="font-semibold text-base text-slate-900 dark:text-slate-100">Notificações do Sistema</p>
                  <p className="text-gray-500 text-sm mt-1">Receber notificações de novos leads e atualizações</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generalSettings.notifications}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, notifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-5 rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-slate-900 dark:text-slate-100 font-semibold text-base">Alertas por E-mail</p>
                  <p className="text-gray-500 text-sm mt-1">Receber alertas importantes no seu e-mail</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generalSettings.emailAlerts}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, emailAlerts: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-5 rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-slate-900 dark:text-slate-100 font-semibold text-base">Atualização Automática</p>
                  <p className="text-gray-500 text-sm mt-1">Atualizar dados do dashboard automaticamente</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generalSettings.autoRefresh}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, autoRefresh: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="pt-6 flex justify-end">
                <Button
                  onClick={handleSaveSettings}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configurações
                </Button>
              </div>
            </div>
          )}

          {/* ABA APARÊNCIA */}
          {activeTab === 'aparencia' && (
            <div className="space-y-6">
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Palette className="w-[18px] h-[18px] text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Aparência</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Escolha o tema do sistema</p>
                </div>
              </div>
              <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <Palette className="h-6 w-6 text-blue-400" />
                <div>
                    <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Tema do Sistema</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Escolha o tema que melhor se adapta ao seu ambiente de trabalho</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* TEMA CINZA */}
                  <button
                    onClick={() => {
                      changeTheme('cinza');
                      toast({
                        title: "Tema alterado!",
                        description: "Tema Cinza aplicado com sucesso.",
                        duration: 2000,
                      });
                    }}
                    className={`relative group p-6 rounded-xl border-2 transition-all duration-300 ${
                      currentTheme === 'cinza'
                        ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                        : ''
                    }`}
                    style={currentTheme !== 'cinza' ? { 
                      backgroundColor: 'var(--bg-card)', 
                      borderColor: 'var(--border)' 
                    } : {}}
                  >
                    {currentTheme === 'cinza' && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                    
                    <div className="mb-4">
                      <div className="theme-preview theme-preview-cinza w-full h-32 rounded-lg bg-zinc-800 border border-zinc-700 shadow-xl flex items-center justify-center overflow-hidden">
                        <div className="text-center">
                          <div className="theme-preview-element w-16 h-16 bg-zinc-700 rounded-lg mx-auto mb-2 border border-zinc-600"></div>
                          <div className="space-y-1">
                            <div className="theme-preview-element w-20 h-2 bg-zinc-600 rounded mx-auto"></div>
                            <div className="theme-preview-element w-16 h-2 bg-zinc-600 rounded mx-auto"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Cinza</h3>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Equilíbrio perfeito entre claro e escuro</p>
                    </div>
                  </button>

                  {/* TEMA BRANCO */}
                  <button
                    onClick={() => {
                      changeTheme('branco');
                      toast({
                        title: "Tema alterado!",
                        description: "Tema Branco aplicado com sucesso.",
                        duration: 2000,
                      });
                    }}
                    className={`relative group p-6 rounded-xl border-2 transition-all duration-300 ${
                      currentTheme === 'branco'
                        ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                        : ''
                    }`}
                    style={currentTheme !== 'branco' ? { 
                      backgroundColor: 'var(--bg-card)', 
                      borderColor: 'var(--border)' 
                    } : {}}
                  >
                    {currentTheme === 'branco' && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                    
                    <div className="mb-4">
                      <div className="theme-preview theme-preview-branco w-full h-32 rounded-lg bg-white border border-gray-200 shadow-xl flex items-center justify-center overflow-hidden">
                        <div className="text-center">
                          <div className="theme-preview-element w-16 h-16 bg-gray-50 rounded-lg mx-auto mb-2 border border-gray-200"></div>
                          <div className="space-y-1">
                            <div className="theme-preview-element w-20 h-2 bg-gray-200 rounded mx-auto"></div>
                            <div className="theme-preview-element w-16 h-2 bg-gray-200 rounded mx-auto"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Branco</h3>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Claridade total para ambientes iluminados</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ABA BOLSÃO */}
          {activeTab === 'bolsao' && user?.role === 'gestao' && (
            <div className="space-y-6">
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                  <Inbox className="w-[18px] h-[18px] text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Bolsão</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Regras de expiração e distribuição de leads</p>
                </div>
              </div>
              {/* Limite de Tempo para Atendimento */}
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      Limite de tempo para atendimento
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Esse é o tempo máximo que um usuário tem para interagir com o lead antes de ser disponibilizado no bolsão.
                    </p>
                    <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                      Recomendamos o prazo de 30 minutos ou menos para maximizar sua taxa de conversão!
                    </p>

                    {/* Slider */}
                    <div className="py-4">
                      <style>{`
                        .custom-slider::-webkit-slider-thumb {
                          appearance: none;
                          width: 20px;
                          height: 20px;
                          border-radius: 50%;
                          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                          cursor: pointer;
                          border: 3px solid white;
                          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                          transition: all 0.2s ease;
                        }
                        .custom-slider::-webkit-slider-thumb:hover {
                          transform: scale(1.15);
                          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                        }
                        .custom-slider::-moz-range-thumb {
                          width: 20px;
                          height: 20px;
                          border-radius: 50%;
                          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                          cursor: pointer;
                          border: 3px solid white;
                          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                          transition: all 0.2s ease;
                        }
                        .custom-slider::-moz-range-thumb:hover {
                          transform: scale(1.15);
                          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                        }
                      `}</style>
                      <div className="space-y-8">
                        {[
                          { key: 'tempoExpiracaoExclusivo', label: 'Imóveis exclusivos', color: 'purple' },
                          { key: 'tempoExpiracaoNaoExclusivo', label: 'Imóveis não exclusivos', color: 'blue' }
                        ].map(({ key, label, color }) => {
                          const selectedValue = bolsaoConfig[key as 'tempoExpiracaoExclusivo' | 'tempoExpiracaoNaoExclusivo'];
                          const selectedIndex = getTimeOptionIndex(selectedValue);
                          const progress = (selectedIndex / (BOLSAO_TIME_OPTIONS.length - 1)) * 100;

                          return (
                            <div key={key} className="space-y-4">
                              <div className="flex items-center justify-between">
                                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                                <Badge variant="outline">{formatTempoExpiracao(selectedValue)}</Badge>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max={String(BOLSAO_TIME_OPTIONS.length - 1)}
                                step="1"
                                value={selectedIndex}
                                onChange={(e) => {
                                  const index = parseInt(e.target.value);
                                  setBolsaoConfig({ ...bolsaoConfig, [key]: BOLSAO_TIME_OPTIONS[index] });
                                }}
                                className="custom-slider w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                style={{
                                  background: `linear-gradient(to right, ${color === 'purple' ? '#9333ea' : '#2563eb'} 0%, ${color === 'purple' ? '#9333ea' : '#2563eb'} ${progress}%, #d1d5db ${progress}%, #d1d5db 100%)`
                                }}
                              />
                              <div className="w-full h-[3px] bg-gray-400 dark:bg-gray-500 mt-2 mb-4"></div>
                              <div className="flex justify-between">
                                {[
                                  { label: '5\nmin', pos: 0 },
                                  { label: '10\nmin', pos: 1 },
                                  { label: '15\nmin', pos: 2 },
                                  { label: '20\nmin', pos: 3 },
                                  { label: '30\nmin', pos: 4 },
                                  { label: '45\nmin', pos: 5 },
                                  { label: '1h', pos: 6 },
                                  { label: '1h30', pos: 7 },
                                  { label: '2h', pos: 8 },
                                  { label: '4h', pos: 9 },
                                  { label: '6h', pos: 10 },
                                  { label: '8h', pos: 11 },
                                  { label: '12h', pos: 12 },
                                  { label: '24h', pos: 13 }
                                ].map(({ label, pos }) => (
                                  <div 
                                    key={`${key}-${pos}`}
                                    className="text-xs whitespace-pre-line text-center"
                                    style={{ flex: '1', color: 'var(--text-secondary)' }}
                                  >
                                    {label}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Valor selecionado */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-center gap-3 p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
                        <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        <div className="text-center">
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Exclusivos</p>
                          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatTempoExpiracao(bolsaoConfig.tempoExpiracaoExclusivo)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-3 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                        <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        <div className="text-center">
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Não exclusivos</p>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatTempoExpiracao(bolsaoConfig.tempoExpiracaoNaoExclusivo)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Disponibilidade do Lead */}
              <Card>
                <CardContent className="p-6 space-y-6">
                  <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Lead ficar disponível para
                  </h3>

                  {/* Opção 1: Todos */}
                  <label className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-purple-500/50 hover:bg-purple-500/5"
                    style={{
                      borderColor: bolsaoConfig.disponibilidadeLead === 'todos' ? 'rgb(147 51 234)' : 'var(--border)',
                      backgroundColor: bolsaoConfig.disponibilidadeLead === 'todos' ? 'rgb(147 51 234 / 0.1)' : 'transparent'
                    }}
                  >
                    <input
                      type="radio"
                      name="disponibilidade"
                      checked={bolsaoConfig.disponibilidadeLead === 'todos'}
                      onChange={() => setBolsaoConfig({ ...bolsaoConfig, disponibilidadeLead: 'todos' })}
                      className="mt-1 h-5 w-5 accent-purple-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Qualquer usuário de qualquer equipe da MINHA empresa
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Qualquer corretor pode assumir leads do bolsão, independente da equipe
                      </p>
                    </div>
                  </label>

                  {/* Opção 2: Apenas da equipe */}
                  <label className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-blue-500/50 hover:bg-blue-500/5"
                    style={{
                      borderColor: bolsaoConfig.disponibilidadeLead === 'equipe' ? 'rgb(59 130 246)' : 'var(--border)',
                      backgroundColor: bolsaoConfig.disponibilidadeLead === 'equipe' ? 'rgb(59 130 246 / 0.1)' : 'transparent'
                    }}
                  >
                    <input
                      type="radio"
                      name="disponibilidade"
                      checked={bolsaoConfig.disponibilidadeLead === 'equipe'}
                      onChange={() => setBolsaoConfig({ ...bolsaoConfig, disponibilidadeLead: 'equipe' })}
                      className="mt-1 h-5 w-5 accent-blue-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <UserCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Apenas usuários da equipe que recebeu o lead
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Somente corretores da mesma equipe podem assumir o lead do bolsão
                      </p>
                    </div>
                  </label>
                </CardContent>
              </Card>

              {/* Horário de Funcionamento */}
              <Card>
                <CardContent className="p-6 space-y-6">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    * Horário de funcionamento
                  </h3>

                  <div className="overflow-x-auto">
                    <div className="inline-block min-w-full">
                      {/* Cabeçalho com os dias da semana */}
                      <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '80px repeat(7, minmax(100px, 1fr))' }}>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}></div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Segunda</div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Terça</div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Quarta</div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Quinta</div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Sexta</div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Sábado</div>
                        <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Domingo</div>
                      </div>

                      {/* Linha dos botões SIM/NÃO */}
                      <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: '80px repeat(7, minmax(100px, 1fr))' }}>
                        <div className="text-sm font-semibold py-2" style={{ color: 'var(--text-primary)' }}></div>
                        {(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const).map((dia) => (
                          <div key={dia} className="flex justify-center items-center">
                            <button
                              onClick={() => setBolsaoConfig({
                                ...bolsaoConfig,
                                horarioFuncionamento: {
                                  ...bolsaoConfig.horarioFuncionamento,
                                  [dia]: { ...bolsaoConfig.horarioFuncionamento[dia], ativo: !bolsaoConfig.horarioFuncionamento[dia].ativo }
                                }
                              })}
                              className={`px-4 py-2 rounded font-semibold text-sm transition-colors w-full max-w-[100px] ${
                                bolsaoConfig.horarioFuncionamento[dia].ativo
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-500'
                              }`}
                            >
                              {bolsaoConfig.horarioFuncionamento[dia].ativo ? 'SIM' : 'NÃO'}
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Linha Início */}
                      <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: '80px repeat(7, minmax(100px, 1fr))' }}>
                        <div className="text-sm font-semibold py-2" style={{ color: 'var(--text-primary)' }}>Início</div>
                        {(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const).map((dia) => (
                          <input
                            key={`${dia}-inicio`}
                            type="time"
                            value={bolsaoConfig.horarioFuncionamento[dia].inicio}
                            onChange={(e) => setBolsaoConfig({
                              ...bolsaoConfig,
                              horarioFuncionamento: {
                                ...bolsaoConfig.horarioFuncionamento,
                                [dia]: { ...bolsaoConfig.horarioFuncionamento[dia], inicio: e.target.value }
                              }
                            })}
                            disabled={!bolsaoConfig.horarioFuncionamento[dia].ativo}
                            className="w-full px-2 py-2 border rounded disabled:opacity-50 text-center text-sm"
                            style={{ 
                              backgroundColor: 'var(--bg-card)', 
                              borderColor: 'var(--border)', 
                              color: 'var(--text-primary)',
                              minWidth: '100px',
                              maxWidth: '120px'
                            }}
                          />
                        ))}
                      </div>

                      {/* Linha Término */}
                      <div className="grid gap-3" style={{ gridTemplateColumns: '80px repeat(7, minmax(100px, 1fr))' }}>
                        <div className="text-sm font-semibold py-2" style={{ color: 'var(--text-primary)' }}>Término</div>
                        {(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const).map((dia) => (
                          <input
                            key={`${dia}-termino`}
                            type="time"
                            value={bolsaoConfig.horarioFuncionamento[dia].termino}
                            onChange={(e) => setBolsaoConfig({
                              ...bolsaoConfig,
                              horarioFuncionamento: {
                                ...bolsaoConfig.horarioFuncionamento,
                                [dia]: { ...bolsaoConfig.horarioFuncionamento[dia], termino: e.target.value }
                              }
                            })}
                            disabled={!bolsaoConfig.horarioFuncionamento[dia].ativo}
                            className="w-full px-2 py-2 border rounded disabled:opacity-50 text-center text-sm"
                            style={{ 
                              backgroundColor: 'var(--bg-card)', 
                              borderColor: 'var(--border)', 
                              color: 'var(--text-primary)',
                              minWidth: '100px',
                              maxWidth: '120px'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fila por Equipe */}
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Fila por Equipe</h3>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        Quando ativo, leads expirados sem resposta são redistribuídos para outro corretor da <strong>mesma equipe</strong> antes de irem ao bolsão geral.
                        O lead circula por todos os membros disponíveis da equipe.
                      </p>
                    </div>
                  </div>

                  {/* Toggle */}
                  <div className="flex items-center justify-between p-5 rounded-lg border transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }} onClick={() => setBolsaoConfig({ ...bolsaoConfig, teamQueueEnabled: !bolsaoConfig.teamQueueEnabled })}>
                    <div>
                      <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Ativar fila por equipe</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {bolsaoConfig.teamQueueEnabled ? 'Redistribuição interna ativa' : 'Leads vão direto ao bolsão geral'}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={bolsaoConfig.teamQueueEnabled}
                        onChange={(e) => setBolsaoConfig({ ...bolsaoConfig, teamQueueEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Ordem de distribuição — visível só se habilitado */}
                  {bolsaoConfig.teamQueueEnabled && (
                    <div className="space-y-3 pl-2 mt-6">
                      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Ordem de distribuição</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label
                          className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
                            bolsaoConfig.teamQueueOrder === 'random'
                              ? 'bg-blue-50/50 border-blue-500 dark:bg-blue-900/20'
                              : 'bg-transparent border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'
                          }`}
                        >
                          <input
                            type="radio"
                            name="teamQueueOrder"
                            value="random"
                            checked={bolsaoConfig.teamQueueOrder === 'random'}
                            onChange={() => setBolsaoConfig({ ...bolsaoConfig, teamQueueOrder: 'random' })}
                            className="mt-1 w-5 h-5 accent-blue-600 cursor-pointer"
                          />
                          <div>
                            <p className="font-bold text-base" style={{ color: bolsaoConfig.teamQueueOrder === 'random' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              Aleatória
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                              Sorteia o próximo corretor disponível da equipe
                            </p>
                          </div>
                        </label>
                        <label
                          className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
                            bolsaoConfig.teamQueueOrder === 'linear'
                              ? 'bg-blue-50/50 border-blue-500 dark:bg-blue-900/20'
                              : 'bg-transparent border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'
                          }`}
                        >
                          <input
                            type="radio"
                            name="teamQueueOrder"
                            value="linear"
                            checked={bolsaoConfig.teamQueueOrder === 'linear'}
                            onChange={() => setBolsaoConfig({ ...bolsaoConfig, teamQueueOrder: 'linear' })}
                            className="mt-1 w-5 h-5 accent-blue-600 cursor-pointer"
                          />
                          <div>
                            <p className="font-bold text-base" style={{ color: bolsaoConfig.teamQueueOrder === 'linear' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              Linear (alfabética)
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                              Distribui em ordem alfabética de nome do corretor
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Botões de Ação */}
              <div className="flex items-center gap-4 pt-4">
                <Button
                  onClick={() => salvarConfiguracoesBolsao(bolsaoConfig)}
                  className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-md transition-colors"
                >
                  <Save className="h-6 w-6 mr-3" />
                  Salvar Configurações
                </Button>

                <Button
                  onClick={() => {
                    salvarConfiguracoesBolsao(DEFAULT_BOLSAO_CONFIG);
                  }}
                  variant="outline"
                  className="h-14 px-8 font-semibold border-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  Restaurar Padrão
                </Button>
              </div>

              {/* Informações Atuais */}
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-2 border-blue-200 dark:border-blue-800 shadow-lg">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-lg">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      Configurações Atuais
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Tempo de Expiração */}
                    <div className="group relative p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-200 dark:border-purple-800 hover:shadow-xl transition-all duration-300 hover:scale-105">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-800 transition-colors">
                          <Clock className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Tempo de Expiração</p>
                          <p className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                            {formatTempoExpiracao(bolsaoConfig.tempoExpiracaoExclusivo)} / {formatTempoExpiracao(bolsaoConfig.tempoExpiracaoNaoExclusivo)}
                          </p>
                          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>Exclusivo / Não exclusivo</p>
                        </div>
                      </div>
                    </div>

                    {/* Disponibilidade */}
                    <div className="group relative p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 hover:shadow-xl transition-all duration-300 hover:scale-105">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800 transition-colors">
                          <Users className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Disponibilidade</p>
                          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {bolsaoConfig.disponibilidadeLead === 'todos' ? 'Todos os corretores' : 'Mesma equipe'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dias Ativos */}
                    <div className="col-span-1 md:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 shadow-md">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                          <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Dias Ativos</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {bolsaoConfig.horarioFuncionamento.segunda.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Seg</Badge>
                        )}
                        {bolsaoConfig.horarioFuncionamento.terca.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Ter</Badge>
                        )}
                        {bolsaoConfig.horarioFuncionamento.quarta.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Qua</Badge>
                        )}
                        {bolsaoConfig.horarioFuncionamento.quinta.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Qui</Badge>
                        )}
                        {bolsaoConfig.horarioFuncionamento.sexta.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Sex</Badge>
                        )}
                        {bolsaoConfig.horarioFuncionamento.sabado.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Sáb</Badge>
                        )}
                        {bolsaoConfig.horarioFuncionamento.domingo.ativo && (
                          <Badge className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0 shadow-md hover:shadow-lg transition-all">Dom</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ABA LIMITE DE LEADS */}
          {activeTab === 'limite-leads' && user?.role === 'gestao' && (
            <div className="space-y-6">
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <Shield className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Limite de Leads</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Controle de capacidade por corretor</p>
                </div>
              </div>
              {/* Header */}
              <div className="bg-gradient-to-br from-emerald-600/10 via-green-600/10 to-emerald-600/10 border border-emerald-500/20 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Limite de Leads por Corretor</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Defina um limite máximo de leads por corretor. Quando atingido, novos leads não serão atribuídos automaticamente a ele.
                      O padrão recomendado é <strong>100 leads ativos</strong> na carteira.
                    </p>
                  </div>
                  {isLoadingLimitConfig && <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />}
                </div>
              </div>

              {/* Toggle Ativar/Desativar */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between p-5 rounded-lg border transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }} onClick={() => setLimitConfigDraft(d => ({ ...d, lead_limit_enabled: !d.lead_limit_enabled }))}>
                    <div>
                      <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Ativar controle de limite</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Bloqueia atribuição automática quando o corretor atingir o limite configurado</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={limitConfigDraft.lead_limit_enabled}
                        onChange={(e) => setLimitConfigDraft(d => ({ ...d, lead_limit_enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  {leadLimitConfig?.lead_limit_enabled ? (
                    <Badge className="mt-4 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-3 py-1 text-sm">Controle Ativo</Badge>
                  ) : (
                    <Badge variant="outline" className="mt-4 text-gray-500 dark:text-gray-400 border-gray-400 dark:border-gray-600 px-3 py-1 text-sm">Controle Inativo</Badge>
                  )}
                </CardContent>
              </Card>

              {/* Limites numéricos */}
              <Card>
                <CardContent className="p-6 space-y-6">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Limites de Leads</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Máx. leads ativos por corretor (carteira)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9999}
                        value={limitConfigDraft.max_active_leads_per_broker}
                        onChange={(e) => setLimitConfigDraft(d => ({ ...d, max_active_leads_per_broker: Number(e.target.value) || 1 }))}
                        className="h-11"
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Recomendado: 100 leads</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Máx. leads com resposta pendente</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9999}
                        value={limitConfigDraft.max_pending_response_leads_per_broker}
                        onChange={(e) => setLimitConfigDraft(d => ({ ...d, max_pending_response_leads_per_broker: Number(e.target.value) || 1 }))}
                        className="h-11"
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Recomendado: 50 leads</p>
                    </div>
                  </div>

                  {/* Critério de bloqueio */}
                  <div className="space-y-2">
                    <Label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Critério de bloqueio</Label>
                    <Select
                      value={limitConfigDraft.blocking_mode}
                      onValueChange={(v) => setLimitConfigDraft(d => ({ ...d, blocking_mode: v as any }))}
                    >
                      <SelectTrigger className="h-11" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Ambos (carteira OU pendências)</SelectItem>
                        <SelectItem value="carteira">Apenas carteira total</SelectItem>
                        <SelectItem value="pendencia">Apenas pendências</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Define se o bloqueio ocorre ao atingir o limite da carteira, das pendências, ou qualquer um dos dois.
                    </p>
                  </div>

                  {/* Percentual de aviso */}
                  <div className="space-y-2">
                    <Label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Percentual para aviso: <span className="font-bold text-amber-400">{limitConfigDraft.warning_threshold_percent}%</span>
                    </Label>
                    <input
                      type="range"
                      min={50}
                      max={99}
                      value={limitConfigDraft.warning_threshold_percent}
                      onChange={(e) => setLimitConfigDraft(d => ({ ...d, warning_threshold_percent: Number(e.target.value) }))}
                      className="w-full h-2 accent-emerald-600"
                    />
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Exibe aviso visual quando o corretor atingir {limitConfigDraft.warning_threshold_percent}% do limite
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Status considerados como pendentes */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Status considerados como resposta pendente</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Selecione quais status de lead contam como "resposta pendente" para o cálculo do limite.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {KANBAN_STATUSES.filter(s => s !== 'Arquivado').map((s) => (
                      <label key={s} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm transition-all ${
                        limitConfigDraft.pending_statuses.includes(s)
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                          : 'border-gray-700 hover:border-gray-500'
                      }`} style={{ color: limitConfigDraft.pending_statuses.includes(s) ? undefined : 'var(--text-secondary)' }}>
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
                          className="h-4 w-4 accent-amber-500 rounded"
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Resumo Atual */}
              {leadLimitConfig && (
                <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-2 border-emerald-200 dark:border-emerald-800 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Configuração Atual</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{leadLimitConfig.max_active_leads_per_broker}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Máx. carteira</p>
                      </div>
                      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{leadLimitConfig.max_pending_response_leads_per_broker}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Máx. pendentes</p>
                      </div>
                      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{leadLimitConfig.warning_threshold_percent}%</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Aviso em</p>
                      </div>
                      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 text-center">
                        <p className="text-sm font-bold text-purple-600 dark:text-purple-400">
                          {leadLimitConfig.blocking_mode === 'both' ? 'Ambos' : leadLimitConfig.blocking_mode === 'carteira' ? 'Carteira' : 'Pendências'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Critério</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center gap-4 pt-4">
                <Button
                  onClick={handleSaveLeadLimitConfig}
                  disabled={isSavingLimitConfig}
                  className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-md transition-colors"
                >
                  {isSavingLimitConfig ? (
                    <><Loader2 className="h-6 w-6 mr-3 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="h-6 w-6 mr-3" /> Salvar Configurações</>
                  )}
                </Button>
                <Button
                  onClick={() => setLimitConfigDraft(DEFAULT_LEAD_LIMIT_CONFIG)}
                  variant="outline"
                  className="h-14 px-8 font-semibold border-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  Restaurar Padrão
                </Button>
              </div>
            </div>
          )}

          {/* ABA USUÁRIOS */}
          {activeTab === 'usuarios' && (
            <div>
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                  <UserCog className="w-[18px] h-[18px] text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Usuários</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Gerenciar membros e permissões da equipe</p>
                </div>
              </div>
              <UsuariosSection />
            </div>
          )}

          {activeTab === 'agentes-ia' && (
            <div className="space-y-6">
              <div className="-mx-6 -mt-6 mb-6 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <Bot className="w-[18px] h-[18px] text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Agentes de IA</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Configuração de webhook e integrações</p>
                </div>
              </div>
              {/* Info Header */}
              <div className="bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/10 border border-blue-500/20 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Configurações dos Agentes de IA</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                      Configure o webhook para integração com os agentes inteligentes. Todas as mensagens enviadas aos agentes 
                      serão encaminhadas para a URL configurada via método POST.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informações da Empresa */}
              <div className="border rounded-xl p-6" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-500" />
                  Informações da Empresa
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Empresa</p>
                    <p className="text-slate-900 dark:text-slate-100 font-semibold">Imobiliária Japi</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Usuário</p>
                    <p className="text-slate-900 dark:text-slate-100 font-semibold">{user?.name || 'Não identificado'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-800 md:col-span-2">
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">ID da Sessão (Snowflake - Renovado Diariamente)</p>
                    <p className="text-blue-400 font-mono text-sm">{sessionId}</p>
                  </div>
                </div>
              </div>

              {/* Configuração do Webhook */}
              <div className="border rounded-xl p-6" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-blue-500" />
                  URL do Webhook
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="webhook-url" className="text-gray-300 mb-2 block flex items-center gap-2">
                      URL do Webhook (Configuração Padrão)
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30">
                        🔒 Imutável
                      </span>
                    </Label>
                    <Input
                      id="webhook-url"
                      type="url"
                      value={webhookUrl}
                      readOnly
                      disabled
                      className="border h-12 font-mono text-sm cursor-not-allowed opacity-75"
                      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-green-400 text-xs mt-2 flex items-center gap-1">
                      <span>✅</span>
                      <span>URL configurada automaticamente. Esta configuração é fixa e não pode ser alterada.</span>
                    </p>
                  </div>

                  {/* Estrutura de Dados */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-3">Estrutura dos dados enviados (POST):</p>
                    <pre className="text-xs text-gray-400 font-mono overflow-x-auto">
{`{
  "empresa": "Imobiliária Japi",
  "usuario": "${user?.name || 'Nome do Usuário'}",
  "id_usuario": "${sessionId}",
  "agente": "Marketing",
  "mensagem": "Texto da mensagem do usuário"
}`}
                    </pre>
                  </div>

                  {/* Botão de Teste */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={handleTestWebhook}
                      disabled={isTestingWebhook}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                    >
                      {isTestingWebhook ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Testando...
                        </>
                      ) : (
                        <>
                          <TestTube className="h-4 w-4 mr-2" />
                          Testar Conexão
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Informações Técnicas */}
              <div className="bg-gradient-to-r from-purple-600/5 to-blue-600/5 border border-purple-500/20 rounded-xl p-6">
                <h3 className="text-slate-900 dark:text-slate-100 font-bold mb-3 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-500" />
                  Informações Técnicas
                </h3>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span><strong>Método:</strong> POST</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span><strong>Content-Type:</strong> application/json</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span><strong>ID da Sessão:</strong> Snowflake ID único renovado diariamente para identificação do usuário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span><strong>Empresa:</strong> Sempre "Imobiliária Japi"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span><strong>Agente:</strong> Nome do agente que está recebendo a mensagem (ex: Marketing, Comportamental)</span>
                  </li>
                </ul>
              </div>

            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

