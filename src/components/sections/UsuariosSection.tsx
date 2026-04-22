/**
 * 🔐 Seção de Gerenciamento de Usuários e Permissões
 * Somente acessível para Administradores
 * Design minimalista e harmônico - v2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getTenantCorretores } from '@/features/imoveis/services/imoveisXmlService';
import {
  UserPermissions,
  MenuPermission,
  MENU_LABELS,
  CORRETOR_DEFAULT_PERMISSIONS,
  ADMIN_DEFAULT_PERMISSIONS
} from '@/types/permissions';
import {
  loadUserPermissions,
  saveUserPermissions,
  createDefaultPermissions
} from '@/features/corretores/services/permissionsService';
import {
  Users,
  Shield,
  Check,
  Save,
  RefreshCw,
  Search,
  UserCog,
  Lock,
  Unlock,
  LayoutDashboard,
  User as UserIcon,
  UserPlus,
  Home,
  Building2,
  Bot,
  Settings,
  Edit,
  Trash2,
  UserCheck,
  Eye,
  FileDown,
  UsersRound,
  Sparkles,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';

// Mapeamento de ícones para cada menu
const MENU_ICONS: Record<MenuPermission, any> = {
  'dashboard-gestao': LayoutDashboard,
  'dashboard-corretor': UserIcon,
  'cliente-interessado': UserPlus,
  'cliente-proprietario': Home,
  'imoveis': Building2,
  'corretores-gestao': Users,
  'corretores': Users,
  'agentes-ia': Bot,
  'configuracoes': Settings
};

interface UsuariosSectionProps {}

export const UsuariosSection = ({}: UsuariosSectionProps) => {
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Map<string, UserPermissions>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const corretores = useMemo(() => {
    if (!tenantId || tenantId === 'owner') return [];

    const fromXml = getTenantCorretores(tenantId)
      .filter((c) => {
        const email = (c.email || '').trim().toLowerCase();
        return Boolean(email) && email.includes('@');
      })
      .map((c) => c.nome)
      .filter(Boolean);

    return [...new Set(fromXml)].sort((a, b) => a.localeCompare(b));
  }, [tenantId]);

  // Carregar permissões dos usuários
  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    if (corretores.length === 0) {
      setUserPermissions(new Map());
      return;
    }
    loadPermissions();
  }, [tenantId, corretores.length]);

  const loadPermissions = async () => {
    try {
      const data = await loadUserPermissions();
      
      if (data.length > 0) {
        const permissionsMap = new Map<string, UserPermissions>();
        data.forEach((perm: UserPermissions) => {
          permissionsMap.set(perm.userId, perm);
        });
        setUserPermissions(permissionsMap);
      } else {
        // Inicializar com permissões padrão para todos os corretores
        initializeDefaultPermissions();
      }
    } catch (error) {
      console.error('❌ Erro ao carregar permissões:', error);
      initializeDefaultPermissions();
    }
  };

  const initializeDefaultPermissions = async () => {
    const permissionsMap = new Map<string, UserPermissions>();
    corretores.forEach((corretor) => {
      const userPerm = createDefaultPermissions(corretor, corretor);
      permissionsMap.set(corretor, userPerm);
    });
    setUserPermissions(permissionsMap);
    await saveUserPermissions(Array.from(permissionsMap.values()));
  };

  const handleSavePermissions = async () => {
    setIsLoading(true);
    
    // Atualizar timestamp de atualização
    const updatedPermissions = new Map(userPermissions);
    updatedPermissions.forEach((perm) => {
      perm.updatedAt = new Date().toISOString();
    });
    
    const success = await saveUserPermissions(Array.from(updatedPermissions.values()));
    setUserPermissions(updatedPermissions);
    
    setTimeout(() => {
      setIsLoading(false);
      if (success) {
        toast({
          title: "Permissões salvas!",
          description: "As permissões de todos os usuários foram atualizadas.",
          duration: 3000,
        });
      } else {
        toast({
          title: "Erro ao salvar",
          description: "Não foi possível salvar as permissões.",
          variant: "destructive",
          duration: 3000,
        });
      }
    }, 500);
  };

  const toggleMenuPermission = (userId: string, permission: MenuPermission) => {
    const updatedPermissions = new Map(userPermissions);
    const userPerm = updatedPermissions.get(userId);
    
    if (userPerm) {
      const hasPermission = userPerm.menuPermissions.includes(permission);
      
      if (hasPermission) {
        userPerm.menuPermissions = userPerm.menuPermissions.filter(p => p !== permission);
      } else {
        userPerm.menuPermissions.push(permission);
      }
      
      updatedPermissions.set(userId, userPerm);
      setUserPermissions(updatedPermissions);
    }
  };

  const toggleBooleanPermission = (
    userId: string,
    permissionKey: keyof Pick<UserPermissions, 'canEditLeads' | 'canDeleteLeads' | 'canAssignLeads' | 'canViewAllLeads' | 'canExportData' | 'canManageTeams'>
  ) => {
    const updatedPermissions = new Map(userPermissions);
    const userPerm = updatedPermissions.get(userId);
    
    if (userPerm) {
      userPerm[permissionKey] = !userPerm[permissionKey];
      updatedPermissions.set(userId, userPerm);
      setUserPermissions(updatedPermissions);
    }
  };

  const resetUserPermissions = (userId: string) => {
    const updatedPermissions = new Map(userPermissions);
    const userPerm = updatedPermissions.get(userId);
    
    if (userPerm) {
      userPerm.menuPermissions = [...CORRETOR_DEFAULT_PERMISSIONS];
      userPerm.canEditLeads = true;
      userPerm.canDeleteLeads = false;
      userPerm.canAssignLeads = false;
      userPerm.canViewAllLeads = false;
      userPerm.canExportData = false;
      userPerm.canManageTeams = false;
      updatedPermissions.set(userId, userPerm);
      setUserPermissions(updatedPermissions);
      
      toast({
        title: "Permissões resetadas!",
        description: `As permissões de ${userId} foram restauradas para o padrão.`,
        duration: 3000,
      });
    }
  };

  const grantAllPermissions = (userId: string) => {
    const updatedPermissions = new Map(userPermissions);
    const userPerm = updatedPermissions.get(userId);
    
    if (userPerm) {
      userPerm.menuPermissions = [...ADMIN_DEFAULT_PERMISSIONS];
      userPerm.canEditLeads = true;
      userPerm.canDeleteLeads = true;
      userPerm.canAssignLeads = true;
      userPerm.canViewAllLeads = true;
      userPerm.canExportData = true;
      userPerm.canManageTeams = true;
      updatedPermissions.set(userId, userPerm);
      setUserPermissions(updatedPermissions);
      
      toast({
        title: "Acesso total concedido!",
        description: `${userId} agora tem acesso total ao sistema.`,
        duration: 3000,
      });
    }
  };

  // Filtrar corretores baseado na busca
  const filteredCorretores = corretores.filter(corretor =>
    corretor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedUserPermissions = selectedUser ? userPermissions.get(selectedUser) : null;

  // Verificar se usuário é admin
  if (user?.role !== 'gestao') {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardContent className="p-12 text-center">
            <Lock className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Acesso Restrito</h3>
            <p className="text-gray-600">
              Apenas administradores podem acessar o gerenciamento de usuários e permissões.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Função para aplicar permissões a todos os usuários
  const applyToAll = () => {
    if (!selectedUser || !selectedUserPermissions) {
      toast({
        title: "Nenhum usuário selecionado",
        description: "Selecione um usuário modelo primeiro.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const updatedPermissions = new Map(userPermissions);
    let count = 0;
    
    corretores.forEach((corretor) => {
      if (corretor !== selectedUser) {
        const userPerm = updatedPermissions.get(corretor);
        if (userPerm) {
          // Copiar todas as permissões do usuário selecionado
          userPerm.menuPermissions = [...selectedUserPermissions.menuPermissions];
          userPerm.canEditLeads = selectedUserPermissions.canEditLeads;
          userPerm.canDeleteLeads = selectedUserPermissions.canDeleteLeads;
          userPerm.canAssignLeads = selectedUserPermissions.canAssignLeads;
          userPerm.canViewAllLeads = selectedUserPermissions.canViewAllLeads;
          userPerm.canExportData = selectedUserPermissions.canExportData;
          userPerm.canManageTeams = selectedUserPermissions.canManageTeams;
          updatedPermissions.set(corretor, userPerm);
          count++;
        }
      }
    });
    
    setUserPermissions(updatedPermissions);
    toast({
      title: "✅ Permissões aplicadas!",
      description: `As permissões de ${selectedUser} foram aplicadas a ${count} usuários.`,
      duration: 4000,
    });
  };

  // Função para ativar/desativar todos
  const toggleAllUsers = (activate: boolean) => {
    const updatedPermissions = new Map(userPermissions);
    let count = 0;
    
    corretores.forEach((corretor) => {
      const userPerm = updatedPermissions.get(corretor);
      if (userPerm) {
        if (activate) {
          userPerm.menuPermissions = [...CORRETOR_DEFAULT_PERMISSIONS];
          userPerm.canEditLeads = true;
        } else {
          userPerm.menuPermissions = [];
          userPerm.canEditLeads = false;
          userPerm.canDeleteLeads = false;
          userPerm.canAssignLeads = false;
          userPerm.canViewAllLeads = false;
          userPerm.canExportData = false;
          userPerm.canManageTeams = false;
        }
        updatedPermissions.set(corretor, userPerm);
        count++;
      }
    });
    
    setUserPermissions(updatedPermissions);
    toast({
      title: activate ? "✅ Todos ativados!" : "❌ Todos desativados!",
      description: `${count} usuários foram ${activate ? 'ativados' : 'desativados'}.`,
      duration: 3000,
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header com Ações em Massa */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <UserCog className="h-6 w-6 text-gray-700" />
            </div>
            <div>
            <h2 className="text-2xl font-bold text-gray-900">Gerenciar Usuários</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              {filteredCorretores.length} {filteredCorretores.length === 1 ? 'usuário' : 'usuários'} • {userPermissions.size} com permissões
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-3">
          {/* Ações em Massa */}
          <div className="flex items-center gap-2 mr-2 pr-3 border-r border-gray-200">
            <Button
              onClick={() => toggleAllUsers(true)}
              variant="outline"
              size="sm"
              className="h-10 px-4 border-green-500 text-green-700 hover:bg-green-50 hover:border-green-600"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Ativar Todos
            </Button>
            <Button
              onClick={() => toggleAllUsers(false)}
              variant="outline"
              size="sm"
              className="h-10 px-4 border-red-500 text-red-700 hover:bg-red-50 hover:border-red-600"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Desativar Todos
            </Button>
            {selectedUser && (
              <Button
                onClick={applyToAll}
                variant="outline"
                size="sm"
                className="h-10 px-4 border-blue-500 text-blue-700 hover:bg-blue-50 hover:border-blue-600"
              >
                <Users className="h-4 w-4 mr-2" />
                Aplicar a Todos
              </Button>
            )}
          </div>
          
          {/* Botão de Salvar */}
          <Button
            onClick={handleSavePermissions}
            disabled={isLoading}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 h-10 shadow-lg shadow-purple-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-purple-500/30 hover:scale-105"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 flex-1 overflow-hidden">
          {/* Lista de Usuários - Compacta e Otimizada */}
          <div className="xl:col-span-4 flex flex-col h-full max-h-[calc(100vh-150px)]">
            <Card className="bg-white border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
              {/* Header Fixo */}
              <CardHeader className="pb-4 flex-shrink-0 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <CardTitle className="text-gray-900 flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                    Usuários do Sistema
                  </CardTitle>
                  <div className="text-xs bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                    <span className="text-gray-700 font-semibold">
                      {filteredCorretores.length}
                  </span>
                  </div>
                </div>
                
                {/* Busca Fixa */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar usuário..."
                    className="pl-10 h-11 border border-gray-200 bg-gray-50 focus:bg-white transition-colors text-sm text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </CardHeader>
              
              {/* Lista com Scroll Independente */}
              <CardContent className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                <div className="space-y-2">
                {filteredCorretores.map((corretor) => {
                  const permissions = userPermissions.get(corretor);
                  const isSelected = selectedUser === corretor;
                  const isActive = permissions && permissions.menuPermissions.length > 0;
                  
                  return (
                    <button
                      key={corretor}
                      onClick={() => setSelectedUser(corretor)}
                      className={`w-full p-3.5 rounded-xl border transition-all duration-150 text-left group relative overflow-hidden ${
                        isSelected
                          ? 'bg-gray-100 border-gray-300 shadow-lg'
                          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      {/* Barra lateral de status */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${
                        isSelected 
                          ? 'bg-blue-500' 
                          : isActive 
                            ? 'bg-green-500' 
                            : 'bg-red-500'
                      }`} />
                      
                      <div className="flex items-center gap-3 ml-1">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all flex-shrink-0 ${
                          isSelected
                            ? 'bg-gray-200 text-gray-900 shadow-lg'
                            : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                        }`}>
                          {corretor.charAt(0).toUpperCase()}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                            {corretor}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {permissions?.menuPermissions.length || 0} menus
                            </span>
                            <span className="text-gray-600">•</span>
                            <div className={`flex items-center gap-1 text-xs font-semibold ${
                              isActive ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {isActive ? (
                                <><CheckCircle2 className="h-3 w-3" />Ativo</>
                              ) : (
                                <><XCircle className="h-3 w-3" />Inativo</>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Indicador de seleção */}
                          {isSelected && (
                          <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                          )}
                      </div>
                    </button>
                  );
                })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Painel de Permissões - Ultra Otimizado */}
          <div className="xl:col-span-8 flex flex-col h-full max-h-[calc(100vh-150px)]">
            <Card className="bg-white border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-4 flex-shrink-0 border-b border-gray-200">
              {selectedUser && selectedUserPermissions ? (
                <>
                  {/* Cabeçalho do Usuário */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-900 flex items-center justify-center text-white font-bold text-lg">
                        {selectedUser.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{selectedUser}</h3>
                      <div className="flex items-center gap-2 mt-1">
                          <div className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                          selectedUserPermissions.menuPermissions.length > 0
                              ? 'bg-green-600/15 text-green-700 border border-green-600/30'
                              : 'bg-red-600/15 text-red-700 border border-red-600/30'
                          }`}>
                            {selectedUserPermissions.menuPermissions.length > 0 ? (
                              <><CheckCircle2 className="h-3 w-3" />ATIVO</>
                            ) : (
                              <><XCircle className="h-3 w-3" />INATIVO</>
                            )}
                          </div>
                          <span className="text-xs text-gray-600">
                            {selectedUserPermissions.menuPermissions.length}/{Object.keys(MENU_LABELS).length} menus
                          </span>
                        </div>
                      </div>
                      </div>
                    
                    {/* Ações Rápidas */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => resetUserPermissions(selectedUser)}
                      variant="outline"
                      size="sm"
                        className="h-9 px-4 border-orange-500 text-orange-700 hover:bg-orange-50 hover:border-orange-600 text-sm"
                    >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Resetar
                    </Button>
                    <Button
                      onClick={() => grantAllPermissions(selectedUser)}
                      variant="outline"
                      size="sm"
                        className="h-9 px-4 border-green-500 text-green-700 hover:bg-green-50 hover:border-green-600 text-sm"
                    >
                        <Unlock className="h-3.5 w-3.5 mr-1.5" />
                      Acesso Total
                    </Button>
                      
                      {/* Toggle Principal - Maior */}
                      <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                        <Label className="text-sm text-gray-700 font-medium">Ativo:</Label>
                        <Switch
                          checked={selectedUserPermissions.menuPermissions.length > 0}
                          onCheckedChange={(checked) => {
                            const updatedPermissions = new Map(userPermissions);
                            const userPerm = updatedPermissions.get(selectedUser);
                            if (userPerm) {
                              if (checked) {
                                userPerm.menuPermissions = [...CORRETOR_DEFAULT_PERMISSIONS];
                                userPerm.canEditLeads = true;
                                toast({ title: "✅ Usuário ativado", description: `${selectedUser} liberado`, duration: 2000 });
                              } else {
                                userPerm.menuPermissions = [];
                                userPerm.canEditLeads = false;
                                userPerm.canDeleteLeads = false;
                                userPerm.canAssignLeads = false;
                                userPerm.canViewAllLeads = false;
                                userPerm.canExportData = false;
                                userPerm.canManageTeams = false;
                                toast({ title: "❌ Usuário desativado", description: `${selectedUser} bloqueado`, duration: 2000 });
                              }
                              updatedPermissions.set(selectedUser, userPerm);
                              setUserPermissions(updatedPermissions);
                            }
                          }}
                          className="data-[state=checked]:bg-green-600"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Shield className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-base font-semibold text-gray-900">Selecione um usuário</h3>
                  <p className="text-sm text-gray-500 mt-1">Escolha à esquerda para gerenciar permissões</p>
                  </div>
                )}
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-4 pt-0">
              {selectedUser && selectedUserPermissions ? (
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar space-y-4">
                  {/* Acesso aos Menus */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4 text-blue-600" />
                        Acesso aos Menus
                      </h3>
                      <div className="text-xs bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                        <span className="text-gray-700 font-semibold">
                          {selectedUserPermissions.menuPermissions.length}/{Object.keys(MENU_LABELS).length}
                      </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {(Object.keys(MENU_LABELS) as MenuPermission[]).map((permission) => {
                        const hasPermission = selectedUserPermissions.menuPermissions.includes(permission);
                        const IconComponent = MENU_ICONS[permission];
                        
                        return (
                          <button
                            key={permission}
                            onClick={() => toggleMenuPermission(selectedUser, permission)}
                            className={`relative p-4 rounded-xl border transition-all duration-150 group ${
                              hasPermission
                                ? 'bg-blue-600/10 border-blue-500/30 hover:bg-blue-600/15 shadow-md'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex flex-col items-center gap-2.5">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                hasPermission
                                  ? 'bg-blue-600/20 text-blue-400'
                                  : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                              }`}>
                                <IconComponent className="h-5 w-5" />
                              </div>
                              <span className={`text-xs font-semibold text-center leading-tight ${
                                hasPermission ? 'text-gray-900' : 'text-gray-600'
                              }`}>
                              {MENU_LABELS[permission]}
                              </span>
                          </div>
                            
                            {/* Indicador de status maior */}
                            <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full transition-all ${
                              hasPermission ? 'bg-blue-500 shadow-lg shadow-blue-500/50' : 'bg-gray-600'
                            }`} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Permissões de Ações */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-600" />
                        Permissões de Ações
                      </h3>
                      <div className="text-xs bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                        <span className="text-gray-700 font-semibold">Controle detalhado</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Editar Leads */}
                      <button
                        onClick={() => toggleBooleanPermission(selectedUser, 'canEditLeads')}
                        className={`relative p-3.5 rounded-xl border transition-all duration-150 text-left group ${
                          selectedUserPermissions.canEditLeads
                            ? 'bg-purple-600/10 border-purple-500/30 hover:bg-purple-600/15 shadow-md'
                            : 'bg-neutral-800/20 border-neutral-700/30 hover:bg-neutral-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                            selectedUserPermissions.canEditLeads
                              ? 'bg-purple-600/20 text-purple-400'
                              : 'bg-neutral-700/50 text-gray-500 group-hover:bg-neutral-600/50'
                          }`}>
                            <Edit className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${
                              selectedUserPermissions.canEditLeads ? 'text-white' : 'text-gray-400'
                            }`}>Editar Leads</p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">Modificar informações</p>
                          </div>
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            selectedUserPermissions.canEditLeads ? 'bg-purple-500 shadow-lg shadow-purple-500/50' : 'bg-gray-600'
                          }`} />
                        </div>
                      </button>

                      {/* Demais Permissões */}
                      {[
                        { key: 'canDeleteLeads', label: 'Deletar Leads', desc: 'Remover do sistema', icon: Trash2, color: 'red' },
                        { key: 'canAssignLeads', label: 'Atribuir Leads', desc: 'Transferir para outros', icon: UserCheck, color: 'blue' },
                        { key: 'canViewAllLeads', label: 'Ver Todos', desc: 'Todos os leads', icon: Eye, color: 'green' },
                        { key: 'canExportData', label: 'Exportar', desc: 'Relatórios e dados', icon: FileDown, color: 'indigo' },
                        { key: 'canManageTeams', label: 'Gerenciar Equipes', desc: 'Configurar equipes', icon: UsersRound, color: 'orange' },
                      ].map((perm) => {
                        const isActive = selectedUserPermissions[perm.key as keyof typeof selectedUserPermissions] as boolean;
                        const Icon = perm.icon;
                        
                        return (
                          <button
                            key={perm.key}
                            onClick={() => toggleBooleanPermission(selectedUser, perm.key as any)}
                            className={`relative p-3.5 rounded-xl border transition-all duration-150 text-left group ${
                              isActive
                                ? `bg-${perm.color}-600/10 border-${perm.color}-500/30 hover:bg-${perm.color}-600/15 shadow-md`
                                : 'bg-neutral-800/20 border-neutral-700/30 hover:bg-neutral-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                                isActive
                                  ? `bg-${perm.color}-600/20 text-${perm.color}-400`
                                  : 'bg-neutral-700/50 text-gray-500 group-hover:bg-neutral-600/50'
                              }`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                  {perm.label}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5 truncate">{perm.desc}</p>
                              </div>
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                isActive ? `bg-${perm.color}-500 shadow-lg shadow-${perm.color}-500/50` : 'bg-gray-600'
                              }`} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

