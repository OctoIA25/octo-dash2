import { useState, useRef, useEffect } from 'react';
import { useLateralDrawer } from '@/hooks/useLateralDrawer';
import { createPortal } from 'react-dom';
import { X, Mail, Clock, User, ChevronDown, Edit2, Check, XCircle, Camera, BadgeCheck, UserCog, Shield, Lock, Unlock, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';

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

interface BrokerPermissions {
  id?: string;
  broker_id: string;
  // Permissões de acesso às seções
  can_access_leads: boolean;
  can_access_meus_leads: boolean;
  can_access_cliente_interessado: boolean;
  can_access_cliente_proprietario: boolean;
  can_access_corretores: boolean;
  can_access_imoveis: boolean;
  can_access_agentes_ia: boolean;
  can_access_configuracoes: boolean;
  // Permissões de ações
  can_edit_leads: boolean;
  can_delete_leads: boolean;
  can_assign_leads: boolean;
  can_view_all_leads: boolean;
  can_export_data: boolean;
  // Permissões administrativas
  is_admin: boolean;
  is_manager: boolean;
}

interface EquipeDetailsSidebarProps {
  membro: MembroEquipe | null;
  onClose: () => void;
  onDelete?: (memberId: string, brokerUuid?: string) => Promise<void>;
}

export const EquipeDetailsSidebar = ({ membro, onClose, onDelete }: EquipeDetailsSidebarProps) => {
  // Apenas sobrepor — não empurrar o conteúdo (área de membros fica esmagada).
  const [isEditing, setIsEditing] = useState(false);
  const [editedNome, setEditedNome] = useState(membro?.nome || '');
  const [editedEmail, setEditedEmail] = useState(membro?.email || '');
  const [editedCreci, setEditedCreci] = useState(membro?.creci || '');
  const [editedEquipe, setEditedEquipe] = useState(membro?.equipe || '');
  const [editedFoto, setEditedFoto] = useState(membro?.foto || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Estados para permissões
  const [permissions, setPermissions] = useState<BrokerPermissions | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [savingPermissions, setSavingPermissions] = useState(false);
  
  // TODO: Substituir por verificação real de usuário logado e permissões
  const usuarioLogadoId = 'gabriel-niero'; // Exemplo: ID do usuário logado
  const isAdmin = true; // Exemplo: verificar se é admin
  const isProprioDono = membro?.id === usuarioLogadoId;
  const podeEditar = isAdmin || isProprioDono;
  const podeEditarPermissoes = isAdmin; // Apenas admin pode editar permissões

  if (!membro) return null;

  // Carregar permissões do Supabase
  useEffect(() => {
    const loadPermissions = async () => {
      // Usar broker_uuid se disponível, caso contrário não carregar permissões
      if (!membro?.broker_uuid) {
        setLoadingPermissions(false);
        return;
      }
      
      setLoadingPermissions(true);
      try {
        // Buscar permissões do corretor usando o UUID
        const { data, error } = await supabase
          .from('broker_permissions')
          .select('*')
          .eq('broker_id', membro.broker_uuid)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          console.error('Erro ao carregar permissões:', error);
          setLoadingPermissions(false);
          return;
        }

        if (data) {
          setPermissions(data);
        } else {
          // Criar permissões padrão se não existirem
          const defaultPermissions: Partial<BrokerPermissions> = {
            broker_id: membro.broker_uuid,
            can_access_leads: true,
            can_access_meus_leads: true,
            can_access_cliente_interessado: true,
            can_access_cliente_proprietario: false,
            can_access_corretores: false,
            can_access_imoveis: false,
            can_access_agentes_ia: false,
            can_access_configuracoes: false,
            can_edit_leads: true,
            can_delete_leads: false,
            can_assign_leads: false,
            can_view_all_leads: false,
            can_export_data: false,
            is_admin: false,
            is_manager: false,
          };
          
          const { data: newPermissions, error: insertError } = await supabase
            .from('broker_permissions')
            .insert(defaultPermissions)
            .select()
            .single();
          
          if (!insertError && newPermissions) {
            setPermissions(newPermissions);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar permissões:', error);
      } finally {
        setLoadingPermissions(false);
      }
    };

    loadPermissions();
  }, [membro?.broker_uuid]);

  // Salvar permissões no Supabase
  const handleSavePermissions = async (updatedPermissions: Partial<BrokerPermissions>) => {
    if (!membro?.broker_uuid) {
      console.error('broker_uuid não encontrado');
      alert('Erro: Corretor não encontrado no sistema.');
      return;
    }

    // Guardar estado anterior para possível reversão em caso de erro
    const previousPermissions = permissions;

    setSavingPermissions(true);
    try {
      let result;
      
      if (permissions?.id) {
        // Atualizar permissões existentes
        const { data, error } = await supabase
          .from('broker_permissions')
          .update(updatedPermissions)
          .eq('id', permissions.id)
          .select()
          .single();

        if (error) {
          console.error('Erro ao atualizar permissões:', error);
          // Reverter estado otimista em caso de erro
          if (previousPermissions) {
            setPermissions(previousPermissions);
          }
          alert('Erro ao salvar permissões. Tente novamente.');
          return;
        }
        
        result = data;
      } else {
        // Criar novas permissões se não existirem
        const newPermissions: Partial<BrokerPermissions> = {
          broker_id: membro.broker_uuid,
          can_access_leads: true,
          can_access_meus_leads: true,
          can_access_cliente_interessado: true,
          can_access_cliente_proprietario: false,
          can_access_corretores: false,
          can_access_imoveis: false,
          can_access_agentes_ia: false,
          can_access_configuracoes: false,
          can_edit_leads: true,
          can_delete_leads: false,
          can_assign_leads: false,
          can_view_all_leads: false,
          can_export_data: false,
          is_admin: false,
          is_manager: false,
          ...updatedPermissions, // Sobrescrever com os valores atualizados
        };

        const { data, error } = await supabase
          .from('broker_permissions')
          .insert(newPermissions)
          .select()
          .single();

        if (error) {
          console.error('Erro ao criar permissões:', error);
          // Reverter estado otimista em caso de erro
          if (previousPermissions) {
            setPermissions(previousPermissions);
          } else {
            setPermissions(null);
          }
          alert('Erro ao criar permissões. Tente novamente.');
          return;
        }
        
        result = data;
      }

      // Atualizar com dados do servidor (confirmação)
      if (result) {
        setPermissions(result as BrokerPermissions);
      }
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      // Reverter estado otimista em caso de erro
      if (previousPermissions) {
        setPermissions(previousPermissions);
      } else {
        setPermissions(null);
      }
      alert('Erro ao salvar permissões. Tente novamente.');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Toggle de permissão individual
  const togglePermission = (key: keyof BrokerPermissions) => {
    if (!podeEditarPermissoes) {
      return;
    }
    
    if (!membro?.broker_uuid) {
      return;
    }

    // Se não há permissões carregadas, criar objeto temporário com valores padrão
    const currentPermissions = permissions || {
      broker_id: membro.broker_uuid,
      can_access_leads: true,
      can_access_meus_leads: true,
      can_access_cliente_interessado: true,
      can_access_cliente_proprietario: false,
      can_access_corretores: false,
      can_access_imoveis: false,
      can_access_agentes_ia: false,
      can_access_configuracoes: false,
      can_edit_leads: true,
      can_delete_leads: false,
      can_assign_leads: false,
      can_view_all_leads: false,
      can_export_data: false,
      is_admin: false,
      is_manager: false,
    } as BrokerPermissions;

    const currentValue = currentPermissions[key] ?? false;
    const newValue = !currentValue;
    
    
    // Atualização otimista: atualizar o estado imediatamente para feedback visual
    setPermissions({
      ...currentPermissions,
      [key]: newValue
    } as BrokerPermissions);
    
    // Salvar no Supabase (assíncrono)
    handleSavePermissions({ [key]: newValue });
  };

  const handleSave = () => {
    // TODO: Implementar lógica de salvamento no backend/Supabase
    setIsEditing(false);
    // Aqui você chamaria a API/Supabase para salvar os dados
  };

  const handleCancel = () => {
    setEditedNome(membro.nome);
    setEditedEmail(membro.email || '');
    setEditedCreci(membro.creci || '');
    setEditedEquipe(membro.equipe || '');
    setEditedFoto(membro.foto || '');
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // TODO: Implementar upload real da imagem
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditedFoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDelete = async () => {
    if (!membro || !onDelete) return;
    
    setIsDeleting(true);
    try {
      await onDelete(membro.id, membro.broker_uuid);
      onClose();
    } catch (error) {
      console.error('Erro ao excluir membro:', error);
      alert('Erro ao excluir membro. Tente novamente.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return createPortal(
    <>
      {/* Área transparente — fecha ao clicar fora do painel (começa abaixo da topbar de 56px) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 56,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: 'calc(100vh - 56px)',
          zIndex: 99998,
        }}
      />
      <div
        className="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
        style={{
          position: 'fixed',
          right: 0,
          top: 56,
          width: '480px',
          height: 'calc(100vh - 56px)',
          maxHeight: 'calc(100vh - 56px)',
          zIndex: 99999,
        }}
      >
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4 flex-1">
            {/* Avatar/Foto */}
            <div className="relative flex-shrink-0">
              {isEditing ? (
                <div className="relative">
                  {editedFoto ? (
                    <img 
                      src={editedFoto} 
                      alt={editedNome}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className={`w-16 h-16 ${membro.cor} rounded-lg flex items-center justify-center`}>
                      <span className="text-2xl font-bold text-white">
                        {membro.iniciais}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 bg-purple-600 hover:bg-purple-700 text-white rounded-full p-1.5 shadow-lg transition-colors"
                  >
                    <Camera className="h-3 w-3" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <>
                  {membro.foto || editedFoto ? (
                    <img 
                      src={membro.foto || editedFoto} 
                      alt={membro.nome}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className={`w-16 h-16 ${membro.cor} rounded-lg flex items-center justify-center`}>
                      <span className="text-2xl font-bold text-white">
                        {membro.iniciais}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Nome e Status */}
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-2 mb-3">
                  <Input
                    value={editedNome}
                    onChange={(e) => setEditedNome(e.target.value)}
                    className="font-semibold text-gray-900 dark:text-slate-100"
                    placeholder="Nome completo"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 truncate">
                    {membro.nome}
                  </h2>
                  <ChevronDown className="h-4 w-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                </div>
              )}
              
              <p className="text-sm text-gray-400 dark:text-slate-500 mb-2">
                {membro.cargo} - {membro.equipe}
              </p>
              
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  membro.status === 'online' ? 'bg-green-500' :
                  membro.status === 'ausente' ? 'bg-yellow-500' :
                  'bg-gray-400'
                }`} />
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  {membro.status === 'online' ? 'On-line' : 
                   membro.status === 'ausente' ? 'Ausente' : 'Off-line'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Botões de Ação */}
          <div className="flex items-center gap-2">
            {podeEditar && (
              <>
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="text-green-600 dark:text-green-300 hover:text-green-700 transition-colors"
                      title="Salvar"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleCancel}
                      className="text-red-600 dark:text-red-300 hover:text-red-700 transition-colors"
                      title="Cancelar"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                )}
              </>
            )}
            {/* Botão Excluir - Apenas Admin */}
            {isAdmin && onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-gray-400 dark:text-slate-500 hover:text-red-600 transition-colors"
                title="Excluir corretor"
                disabled={isDeleting}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo Scrollável */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4" style={{ minHeight: 0 }}>
        {/* Informações de Contato e Profissionais */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Informações Profissionais</h3>
          
          {/* Email */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              <Label className="text-xs font-medium text-gray-500 dark:text-slate-400">Email</Label>
            </div>
            {isEditing ? (
              <Input
                type="email"
                value={editedEmail}
                onChange={(e) => setEditedEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="text-sm"
              />
            ) : (
              <p className="text-sm text-gray-900 dark:text-slate-100 pl-6">
                {membro.email || editedEmail || 'Não informado'}
              </p>
            )}
          </div>

          {/* CRECI */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              <Label className="text-xs font-medium text-gray-500 dark:text-slate-400">CRECI</Label>
            </div>
            {isEditing ? (
              <Input
                type="text"
                value={editedCreci}
                onChange={(e) => setEditedCreci(e.target.value)}
                placeholder="Ex: CRECI 123456-F"
                className="text-sm"
              />
            ) : (
              <p className="text-sm text-gray-900 dark:text-slate-100 pl-6">
                {membro.creci || editedCreci || 'Não informado'}
              </p>
            )}
          </div>

          {/* Equipe */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              <Label className="text-xs font-medium text-gray-500 dark:text-slate-400">Equipe</Label>
            </div>
            {isEditing ? (
              <Input
                type="text"
                value={editedEquipe}
                onChange={(e) => setEditedEquipe(e.target.value)}
                placeholder="Ex: Vendas, Locação, Gestão"
                className="text-sm"
              />
            ) : (
              <p className="text-sm text-gray-900 dark:text-slate-100 pl-6">
                {membro.equipe || editedEquipe || 'Não informado'}
              </p>
            )}
          </div>

          {/* Hora Local */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              <Label className="text-xs font-medium text-gray-500 dark:text-slate-400">Hora Local</Label>
            </div>
            <p className="text-sm text-gray-900 dark:text-slate-100 pl-6">
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Gerente */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-gray-400 dark:text-slate-500" />
              <Label className="text-xs font-medium text-gray-500 dark:text-slate-400">Gerente</Label>
            </div>
            <div className="flex items-center gap-2 pl-6 text-sm text-gray-400 dark:text-slate-500 cursor-pointer hover:text-gray-600">
              <span>Selecione o gerente</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Seção de Permissões - Apenas para Admins */}
        {podeEditarPermissoes && (
          <>
            <div className="border-t border-gray-200 dark:border-slate-800 my-6"></div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Permissões e Acessos</h3>
              </div>

              {!membro?.broker_uuid ? (
                <div className="text-sm text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                  <p className="font-medium mb-1">⚠️ Corretor não encontrado no sistema</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Este corretor precisa estar cadastrado na tabela "brokers" do Supabase para gerenciar permissões.
                  </p>
                </div>
              ) : loadingPermissions ? (
                <div className="text-sm text-gray-400 dark:text-slate-500 text-center py-4">
                  Carregando permissões...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Permissões Administrativas */}
                  <div className="space-y-3">
                    <Label className="text-xs font-medium text-gray-700 dark:text-slate-300 uppercase tracking-wide">
                      Nível de Acesso
                    </Label>
                    
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                        <Label 
                          className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer"
                          onClick={() => togglePermission('is_admin')}
                        >
                          Administrador
                        </Label>
                      </div>
                      <Switch
                        checked={permissions?.is_admin ?? false}
                        onCheckedChange={() => {
                          togglePermission('is_admin');
                        }}
                        disabled={savingPermissions || !membro?.broker_uuid}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <UserCog className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Gerente
                        </Label>
                      </div>
                      <Switch
                        checked={permissions?.is_manager ?? false}
                        onCheckedChange={() => togglePermission('is_manager')}
                        disabled={savingPermissions || !membro?.broker_uuid}
                      />
                    </div>
                  </div>

                  {/* Acesso às Seções */}
                  <div className="space-y-3">
                    <Label className="text-xs font-medium text-gray-700 dark:text-slate-300 uppercase tracking-wide">
                      Acesso às Áreas
                    </Label>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Leads
                        </Label>
                        <Switch
                          checked={permissions?.can_access_leads ?? false}
                          onCheckedChange={() => togglePermission('can_access_leads')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Meus Leads
                        </Label>
                        <Switch
                          checked={permissions?.can_access_meus_leads ?? false}
                          onCheckedChange={() => togglePermission('can_access_meus_leads')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Cliente Interessado
                        </Label>
                        <Switch
                          checked={permissions?.can_access_cliente_interessado ?? false}
                          onCheckedChange={() => togglePermission('can_access_cliente_interessado')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Cliente Proprietário
                        </Label>
                        <Switch
                          checked={permissions?.can_access_cliente_proprietario ?? false}
                          onCheckedChange={() => togglePermission('can_access_cliente_proprietario')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Corretores
                        </Label>
                        <Switch
                          checked={permissions?.can_access_corretores ?? false}
                          onCheckedChange={() => togglePermission('can_access_corretores')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Imóveis
                        </Label>
                        <Switch
                          checked={permissions?.can_access_imoveis ?? false}
                          onCheckedChange={() => togglePermission('can_access_imoveis')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Agentes IA
                        </Label>
                        <Switch
                          checked={permissions?.can_access_agentes_ia ?? false}
                          onCheckedChange={() => togglePermission('can_access_agentes_ia')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Configurações
                        </Label>
                        <Switch
                          checked={permissions?.can_access_configuracoes ?? false}
                          onCheckedChange={() => togglePermission('can_access_configuracoes')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Permissões de Ações */}
                  <div className="space-y-3">
                    <Label className="text-xs font-medium text-gray-700 dark:text-slate-300 uppercase tracking-wide">
                      Permissões de Ações
                    </Label>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Editar Leads
                        </Label>
                        <Switch
                          checked={permissions?.can_edit_leads ?? false}
                          onCheckedChange={() => togglePermission('can_edit_leads')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Excluir Leads
                        </Label>
                        <Switch
                          checked={permissions?.can_delete_leads ?? false}
                          onCheckedChange={() => togglePermission('can_delete_leads')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Atribuir Leads
                        </Label>
                        <Switch
                          checked={permissions?.can_assign_leads ?? false}
                          onCheckedChange={() => togglePermission('can_assign_leads')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Ver Todos os Leads
                        </Label>
                        <Switch
                          checked={permissions?.can_view_all_leads ?? false}
                          onCheckedChange={() => togglePermission('can_view_all_leads')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <Label className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                          Exportar Dados
                        </Label>
                        <Switch
                          checked={permissions?.can_export_data ?? false}
                          onCheckedChange={() => togglePermission('can_export_data')}
                          disabled={savingPermissions || !membro?.broker_uuid}
                        />
                      </div>
                    </div>
                  </div>

                  {savingPermissions && (
                    <div className="text-xs text-purple-600 dark:text-purple-300 text-center py-2">
                      Salvando alterações...
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Excluir Corretor</h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">
              Tem certeza que deseja excluir <strong>{membro?.nome}</strong>?
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">
              Esta ação irá remover o corretor da equipe, suas permissões e acesso ao sistema. 
              Esta ação não pode ser desfeita.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>,
    document.body
  );
};

