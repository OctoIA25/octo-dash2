import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Shield, Settings, X, Check, LogOut, Building2, Code2, ArrowRight, Loader2, Package } from 'lucide-react';
import { useAuth } from "@/hooks/useAuth";
import { supabase } from '@/lib/supabaseClient';
import { SidebarPermission } from '@/types/permissions';

// Lista completa de features disponíveis para tenants
const ALL_TENANT_FEATURES: { id: SidebarPermission; label: string; description: string }[] = [
  { id: 'leads', label: 'Início/Leads', description: 'Página inicial e gestão de leads' },
  { id: 'notificacoes', label: 'Notificações', description: 'Sistema de notificações' },
  { id: 'metricas', label: 'Comercial/Métricas', description: 'Análises e métricas de desempenho' },
  { id: 'estudo-mercado', label: 'Estudo de Mercado', description: 'Análise de mercado e tendências' },
  { id: 'recrutamento', label: 'Recrutamento', description: 'Gestão de recrutamento' },
  { id: 'gestao-equipe', label: 'Gestão de Equipe', description: 'Gestão completa da equipe' },
  { id: 'imoveis', label: 'Imóveis', description: 'Gestão de imóveis' },
  { id: 'agentes-ia', label: 'Agentes de IA', description: 'Agentes inteligentes e automações' },
  { id: 'octo-chat', label: 'Octo Chat', description: 'Assistente de chat inteligente' },
  { id: 'integracoes', label: 'Integrações', description: 'Conectar fontes de leads' },
  { id: 'central-leads', label: 'Central de Leads', description: 'Leads das integrações' },
  { id: 'atividades', label: 'Atividades', description: 'Atividades e tarefas' },
  { id: 'relatorios', label: 'Relatórios', description: 'Relatórios e análises' },
];

// Features padrão para novos tenants
const DEFAULT_TENANT_FEATURES: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'estudo-mercado', 'imoveis', 'octo-chat'
];

type OwnerTenant = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  allowedFeatures?: SidebarPermission[];
};

const SELECTED_TENANT_KEY = 'owner-selected-tenant';

type TenantRow = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  allowed_features?: SidebarPermission[];
};

const TEST_TENANT_ID = 'tenant-area-de-teste';
const TEST_TENANT_CODE = 'TESTE';

export const OwnerDashboard = () => {
  const { user, logout } = useAuth();
  const [tenants, setTenants] = useState<OwnerTenant[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCode, setNewTenantCode] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Estados para modal de permissões
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [selectedTenantForPermissions, setSelectedTenantForPermissions] = useState<OwnerTenant | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<SidebarPermission[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const ownerEmail = useMemo(() => user?.email || '', [user?.email]);

  const loadTenants = async () => {
    setIsLoadingTenants(true);
    setError('');
    
    // Tentar buscar com allowed_features, se falhar buscar sem
    let data: TenantRow[] | null = null;
    let tenantsError: { message: string } | null = null;
    
    // Primeira tentativa: com allowed_features
    const result1 = await supabase
      .from('tenants')
      .select('id, code, name, created_at, allowed_features')
      .order('created_at', { ascending: false });
    
    if (result1.error?.message?.includes('allowed_features does not exist')) {
      // Coluna não existe ainda, buscar sem ela
      const result2 = await supabase
        .from('tenants')
        .select('id, code, name, created_at')
        .order('created_at', { ascending: false });
      
      data = result2.data as TenantRow[];
      tenantsError = result2.error;
    } else {
      data = result1.data as TenantRow[];
      tenantsError = result1.error;
    }

    if (tenantsError) {
      setError(tenantsError.message);
      setTenants([]);
      setIsLoadingTenants(false);
      return;
    }

    const mapped = (data || []).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      createdAt: t.created_at,
      allowedFeatures: t.allowed_features || DEFAULT_TENANT_FEATURES
    }));

    const hasTestTenant = mapped.some((t) => (t.name || '').trim().toLowerCase() === 'imobiliária de teste' || t.code === TEST_TENANT_CODE);
    const withTestTenant = hasTestTenant
      ? mapped
      : [
          {
            id: TEST_TENANT_ID,
            name: 'Imobiliária de teste',
            code: TEST_TENANT_CODE,
            createdAt: new Date().toISOString(),
            allowedFeatures: DEFAULT_TENANT_FEATURES,
          },
          ...mapped,
        ];

    setTenants(withTestTenant);
    setIsLoadingTenants(false);
  };
  
  // Abrir modal de permissões
  const openPermissionsModal = (tenant: OwnerTenant, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar abrir o tenant
    setSelectedTenantForPermissions(tenant);
    setEditingFeatures(tenant.allowedFeatures || DEFAULT_TENANT_FEATURES);
    setIsPermissionsModalOpen(true);
  };
  
  // Toggle de feature
  const toggleFeature = (featureId: SidebarPermission) => {
    setEditingFeatures(prev => {
      if (prev.includes(featureId)) {
        return prev.filter(f => f !== featureId);
      } else {
        return [...prev, featureId];
      }
    });
  };
  
  // Salvar permissões
  const savePermissions = async () => {
    if (!selectedTenantForPermissions) return;
    
    setIsSavingPermissions(true);
    setError('');
    
    
    try {
      // Usar .select() para verificar se o update afetou alguma linha
      const { data: updateData, error: updateError } = await supabase
        .from('tenants')
        .update({ allowed_features: editingFeatures })
        .eq('id', selectedTenantForPermissions.id)
        .select('id, allowed_features');
      
      
      if (updateError) {
        // Verificar se é erro de coluna não existente
        if (updateError.message?.includes('allowed_features')) {
          setError('A coluna de permissões ainda não existe no banco. Execute a migration: supabase/migrations/20260220_add_allowed_features_to_tenants.sql');
        } else {
          setError(`Erro ao salvar permissões: ${updateError.message}`);
        }
        setIsSavingPermissions(false);
        return;
      }
      
      // Verificar se o update realmente afetou alguma linha
      if (!updateData || updateData.length === 0) {
        console.error('❌ Nenhuma linha foi atualizada! Possível problema de RLS.');
        setError('Não foi possível salvar as permissões. Verifique se você tem permissão para editar este tenant. Execute a migration: supabase/migrations/20260220_add_tenants_update_policy.sql');
        setIsSavingPermissions(false);
        return;
      }
      
      
      // Atualizar lista local
      setTenants(prev => prev.map(t => 
        t.id === selectedTenantForPermissions.id 
          ? { ...t, allowedFeatures: editingFeatures }
          : t
      ));
      
      
      setIsPermissionsModalOpen(false);
      setSelectedTenantForPermissions(null);
    } catch (err) {
      console.error('❌ Erro ao salvar permissões:', err);
      setError('Erro ao salvar permissões');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  useEffect(() => {
    loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(t => {
      const name = (t.name || '').toLowerCase();
      const code = (t.code || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [search, tenants]);

  const openTenant = async (tenant: OwnerTenant) => {
    setError('');
    localStorage.setItem('owner-impersonation', JSON.stringify({
      tenantId: tenant.id,
      tenantCode: tenant.code,
      tenantName: tenant.name
    }));
    window.location.reload();
  };

  const onCreateTenant = async () => {
    const name = newTenantName.trim();
    const code = newTenantCode.trim().toUpperCase();
    const adminEmail = newAdminEmail.trim().toLowerCase();
    const adminPassword = newAdminPassword;

    if (!name) return;
    if (!adminEmail) return;
    if (!adminPassword || adminPassword.length < 6) return;

    setIsCreating(true);
    setError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('Sessão inválida. Faça login novamente.');
      setIsCreating(false);
      return;
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!anonKey) {
      setError('Configuração inválida: VITE_SUPABASE_ANON_KEY não encontrado.');
      setIsCreating(false);
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/owner-create-tenant`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey
      },
      body: JSON.stringify({
        tenant_name: name,
        tenant_code: code || undefined,
        admin_email: adminEmail,
        admin_password: adminPassword
      })
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      if (res.status === 401) {
        setError('Não autorizado (401). Faça logout e login novamente como dono e tente de novo.');
      } else {
        setError(payload?.error || 'Erro ao criar imobiliária');
      }
      setIsCreating(false);
      await loadTenants();
      return;
    }

    setNewTenantName('');
    setNewTenantCode('');
    setNewAdminEmail('');
    setNewAdminPassword('');
    setIsModalOpen(false);
    setIsCreating(false);
    await loadTenants();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Topbar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-500/30 flex items-center justify-center">
              <Code2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Área do Desenvolvedor
              </h1>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Logado como <span className="font-medium text-slate-700 dark:text-slate-300">{ownerEmail}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              onClick={async () => {
                await logout();
                window.location.href = '/';
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-sm transition-colors"
              onClick={() => setIsModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Nova imobiliária
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Hero card */}
        <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Imobiliárias</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              Clique em uma imobiliária para acessar. O sistema vai voltar para o login com o código já preenchido.
            </p>
          </div>
        </div>

        {/* Search bar + count */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou código..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-slate-100 dark:bg-slate-800/60 text-[12px] font-medium text-slate-600 dark:text-slate-300">
            <Building2 className="h-3.5 w-3.5" />
            {filteredTenants.length} de {tenants.length}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-4 text-[13px]">
            {error}
          </div>
        )}

        {/* Tenants grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoadingTenants && (
            <div className="col-span-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex items-center justify-center gap-3 text-[13px] text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando imobiliárias...
            </div>
          )}

          {filteredTenants.map((t) => {
            const featuresCount = t.allowedFeatures?.length || 0;
            const initials = (t.name || '?').trim().charAt(0).toUpperCase();
            return (
              <div
                key={t.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/5 transition-all overflow-hidden"
              >
                {/* Header */}
                <div className="p-5 flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-md shadow-blue-500/30 flex items-center justify-center shrink-0">
                    <span className="text-white text-[15px] font-semibold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {t.name}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Código:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {t.code}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Módulos */}
                <div className="px-5 pb-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Package className="h-3 w-3 text-slate-400" />
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Módulos Ativos ({featuresCount})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(t.allowedFeatures || []).slice(0, 4).map((featureId) => {
                      const feature = ALL_TENANT_FEATURES.find((f) => f.id === featureId);
                      return feature ? (
                        <span
                          key={featureId}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40"
                        >
                          {feature.label}
                        </span>
                      ) : null;
                    })}
                    {featuresCount > 4 && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        +{featuresCount - 4} mais
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="px-5 pb-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openTenant(t)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium transition-colors"
                  >
                    Acessar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => openPermissionsModal(t, e)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-[12px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Permissões
                  </button>
                </div>
              </div>
            );
          })}

          {!isLoadingTenants && tenants.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                <Building2 className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">
                Nenhuma imobiliária criada ainda
              </p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                Clique em "Nova imobiliária" para começar.
              </p>
            </div>
          )}

          {tenants.length > 0 && filteredTenants.length === 0 && (
            <div className="col-span-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
              Nenhum resultado para “{search}”.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Criar nova imobiliária */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Building2 className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                    Criar nova imobiliária
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Configure o tenant e o admin inicial
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isCreating}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome da imobiliária
                </label>
                <input
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                  placeholder="Ex: Imobiliária 1"
                  disabled={isCreating}
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Código da imobiliária (opcional)
                </label>
                <input
                  value={newTenantCode}
                  onChange={(e) => setNewTenantCode(e.target.value.toUpperCase())}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors font-mono uppercase"
                  placeholder="Ex: IMOB001"
                  disabled={isCreating}
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email do admin
                </label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                  placeholder="admin@imobiliaria.com"
                  disabled={isCreating}
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Senha do admin
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                  placeholder="mínimo 6 caracteres"
                  disabled={isCreating}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isCreating}
                className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onCreateTenant}
                disabled={
                  isCreating ||
                  !newTenantName.trim() ||
                  !newAdminEmail.trim() ||
                  !newAdminPassword ||
                  newAdminPassword.length < 6
                }
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Criar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Permissões */}
      {isPermissionsModalOpen && selectedTenantForPermissions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Settings className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                    Permissões do CRM
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedTenantForPermissions.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPermissionsModalOpen(false);
                  setSelectedTenantForPermissions(null);
                }}
                disabled={isSavingPermissions}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">
                Selecione quais módulos do CRM esta imobiliária pode acessar.
                Admins terão acesso a todos os módulos selecionados.
              </p>

              <div className="space-y-2">
                {ALL_TENANT_FEATURES.map((feature) => {
                  const isEnabled = editingFeatures.includes(feature.id);
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      onClick={() => toggleFeature(feature.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        isEnabled
                          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                          isEnabled
                            ? 'bg-blue-600'
                            : 'bg-transparent border-2 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {isEnabled && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[13px] font-medium ${
                            isEnabled
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {feature.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {feature.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {editingFeatures.length}
                </span>{' '}
                de {ALL_TENANT_FEATURES.length} módulos
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPermissionsModalOpen(false);
                    setSelectedTenantForPermissions(null);
                  }}
                  disabled={isSavingPermissions}
                  className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={savePermissions}
                  disabled={isSavingPermissions}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSavingPermissions ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
