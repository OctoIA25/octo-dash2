/**
 * Aba "Meus Imóveis" - Imóveis atribuídos ao corretor logado
 * Permite visualizar e gerenciar códigos de imóveis sob responsabilidade do corretor
 */

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { supabase } from '@/lib/supabaseClient';
import { Imovel } from '@/features/imoveis/services/kenloService';
import { ImovelCard } from './ImovelCard';
import { CriarImovelForm } from './CriarImovelForm';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { syncImoveisForCorretor, SyncResult, DiagnosticoAtribuicao } from '@/features/imoveis/services/xmlSyncService';
import { 
  Home, 
  Plus, 
  X, 
  Search,
  RefreshCw,
  Building2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Download,
  Loader2,
  Info,
  Clock,
  XCircle,
  ShieldCheck
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface PropertyAssignment {
  id: string;
  property_code: string;
  broker_id: string | null;
  broker_name: string;
  broker_phone: string | null;
  created_at: string;
}

interface ImovelLocal {
  id: string;
  tenant_id: string;
  codigo_imovel: string;
  titulo: string | null;
  tipo: string | null;
  tipo_simplificado: string | null;
  finalidade: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  area_total: number;
  area_util: number;
  quartos: number;
  suites: number;
  banheiros: number;
  vagas: number;
  valor_venda: number;
  valor_locacao: number;
  valor_condominio: number;
  valor_iptu: number;
  descricao: string | null;
  fotos: string[];
  created_at: string;
  status_aprovacao?: 'aprovado' | 'nao_aprovado' | 'aguardando';
  aprovado_por?: string;
  aprovado_em?: string;
  motivo_aprovacao?: string;
}

interface AprovacaoDialog {
  isOpen: boolean;
  imovelReferencia: string | null;
  novoStatus: StatusAprovacao | null;
  motivo: string;
}

type StatusAprovacao = 'aprovado' | 'nao_aprovado' | 'aguardando';

interface MeusImoveisTabProps {
  allImoveis: Imovel[];
  onViewDetails?: (imovel: Imovel) => void;
  onPropertyCreated?: () => void;
}

export const MeusImoveisTab = ({ allImoveis, onViewDetails, onPropertyCreated }: MeusImoveisTabProps) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const systemRole = user?.systemRole;
  
  const [assignments, setAssignments] = useState<PropertyAssignment[]>([]);
  const [imoveisLocais, setImoveisLocais] = useState<ImovelLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPropertyCode, setNewPropertyCode] = useState('');
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [addMessage, setAddMessage] = useState('');
  
  // Estados para sincronização do XML
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showSyncResult, setShowSyncResult] = useState(false);
  const [isCriarImovelOpen, setIsCriarImovelOpen] = useState(false);
  const [editingImovelData, setEditingImovelData] = useState<
    (Partial<Parameters<typeof CriarImovelForm>[0]['initialData']> & {
      codigo_imovel?: string;
      status_aprovacao?: string;
    }) | null
  >(null);
  
  // Estado para dialog de aprovação
  const [aprovacaoDialog, setAprovacaoDialog] = useState<AprovacaoDialog>({
    isOpen: false,
    imovelReferencia: null,
    novoStatus: null,
    motivo: ''
  });

  const isManager = ['admin', 'owner', 'gestao', 'gerente', 'team_leader'].includes(systemRole?.toLowerCase() || '');
  const isAdmin = ['admin', 'owner'].includes(systemRole?.toLowerCase() || '');

  // Carregar atribuições do corretor
  const loadAssignments = async () => {
    if (!tenantId || !user?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      let query = supabase
        .from('imoveis_corretores')
        .select('*')
        .eq('tenant_id', tenantId);
      
      // Se não for gestão, filtrar só os próprios imóveis
      if (!isManager) {
        query = query.eq('corretor_id', user.id);
      }
      
      const { data, error: fetchError } = await query.order('created_at', { ascending: false });
      
      if (fetchError) throw fetchError;
      
      setAssignments((data || []).map(row => ({
        id: row.id,
        property_code: row.codigo_imovel,
        broker_id: row.corretor_id,
        broker_name: row.corretor_nome,
        broker_phone: row.corretor_telefone,
        created_at: row.created_at
      })));
      
      // Carregar imóveis locais também
      await loadImoveisLocais();
    } catch (err) {
      console.error('Erro ao carregar atribuições:', err);
      setError('Erro ao carregar seus imóveis');
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar imóveis criados localmente
  const loadImoveisLocais = async () => {
    if (!tenantId) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('imoveis_locais')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        return;
      }
      
      setImoveisLocais(data || []);
    } catch (err) {
      console.error('Erro ao carregar imóveis locais:', err);
    }
  };

  // Excluir imóvel do banco de dados
  const handleDeleteImovel = async (referencia: string) => {
    if (!tenantId) return;
    
    try {
      // Excluir da tabela imoveis_locais
      const { error: deleteLocalError } = await supabase
        .from('imoveis_locais')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', referencia);
      
      if (deleteLocalError) {
      }
      
      // Excluir da tabela imoveis_corretores
      const { error: deleteCorretorError } = await supabase
        .from('imoveis_corretores')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', referencia);
      
      if (deleteCorretorError) {
        console.error('❌ Erro ao excluir de imoveis_corretores:', deleteCorretorError.message);
        throw deleteCorretorError;
      }
      
      
      // Recarregar dados
      await loadAssignments();
      onPropertyCreated?.();
      
    } catch (err) {
      console.error('❌ Erro ao excluir imóvel:', err);
    }
  };

  // Verificar se um imóvel pode ser excluído (apenas locais)
  const canDeleteImovel = (referencia: string): boolean => {
    return imoveisLocais.some(local => local.codigo_imovel.toUpperCase() === referencia.toUpperCase());
  };

  // Obter status de aprovação de um imóvel
  const getStatusAprovacao = (referencia: string): StatusAprovacao | null => {
    const imovelLocal = imoveisLocais.find(
      local => local.codigo_imovel.toUpperCase() === referencia.toUpperCase()
    );
    return imovelLocal?.status_aprovacao || null;
  };

  // Abrir dialog de aprovação
  const openAprovacaoDialog = (referencia: string, novoStatus: StatusAprovacao) => {
    setAprovacaoDialog({
      isOpen: true,
      imovelReferencia: referencia,
      novoStatus,
      motivo: ''
    });
  };

  // Fechar dialog de aprovação
  const closeAprovacaoDialog = () => {
    setAprovacaoDialog({
      isOpen: false,
      imovelReferencia: null,
      novoStatus: null,
      motivo: ''
    });
  };

  // Confirmar aprovação com motivo
  const handleConfirmAprovacao = async () => {
    if (!tenantId || !user?.id || !isAdmin || !aprovacaoDialog.imovelReferencia || !aprovacaoDialog.novoStatus) return;
    
    try {
      const { error } = await supabase
        .from('imoveis_locais')
        .update({
          status_aprovacao: aprovacaoDialog.novoStatus,
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
          motivo_aprovacao: aprovacaoDialog.motivo || null
        })
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', aprovacaoDialog.imovelReferencia);
      
      if (error) throw error;
      
      closeAprovacaoDialog();
      await loadImoveisLocais();
    } catch (err) {
      console.error('❌ Erro ao atualizar aprovação:', err);
    }
  };

  // Obter motivo de aprovação de um imóvel
  const getMotivoAprovacao = (referencia: string): string | null => {
    const imovelLocal = imoveisLocais.find(
      local => local.codigo_imovel.toUpperCase() === referencia.toUpperCase()
    );
    return imovelLocal?.motivo_aprovacao || null;
  };

  // Renderizar badge de status de aprovação
  const renderStatusAprovacaoBadge = (status: StatusAprovacao | null) => {
    if (!status) return null;
    
    const config = {
      aprovado: { 
        icon: <CheckCircle className="h-3 w-3" />, 
        text: 'Aprovado', 
        className: 'bg-green-500/20 text-green-400 border-green-500/30' 
      },
      nao_aprovado: { 
        icon: <XCircle className="h-3 w-3" />, 
        text: 'Não Aprovado', 
        className: 'bg-red-500/20 text-red-400 border-red-500/30' 
      },
      aguardando: { 
        icon: <Clock className="h-3 w-3" />, 
        text: 'Aguardando', 
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
      },
    };
    
    const { icon, text, className } = config[status];
    
    return (
      <Badge className={`flex items-center gap-1 text-xs ${className}`}>
        {icon}
        {text}
      </Badge>
    );
  };

  // Converter imóvel local para formato Imovel (compatível com ImovelCard)
  const convertLocalToImovel = (local: ImovelLocal): Imovel => {
    return {
      referencia: local.codigo_imovel,
      titulo: local.titulo || `${local.tipo || 'Imóvel'} - ${local.bairro || 'Sem bairro'}`,
      tipo: local.tipo || 'Outro',
      tipoSimplificado: (local.tipo_simplificado as Imovel['tipoSimplificado']) || 'outro',
      bairro: local.bairro || 'Sem bairro',
      cidade: local.cidade || 'Sem cidade',
      estado: local.estado || 'SP',
      valor_venda: local.valor_venda || 0,
      valor_locacao: local.valor_locacao || 0,
      finalidade: (local.finalidade as Imovel['finalidade']) || 'venda',
      valor_iptu: local.valor_iptu || 0,
      valor_condominio: local.valor_condominio || 0,
      area_total: local.area_total || 0,
      area_util: local.area_util || 0,
      quartos: local.quartos || 0,
      suites: local.suites || 0,
      garagem: local.vagas || 0,
      banheiro: local.banheiros || 0,
      salas: 0,
      descricao: local.descricao || '',
      fotos: Array.isArray(local.fotos) ? local.fotos : [],
      videos: [],
      area_comum: [],
      area_privativa: [],
    };
  };

  const buildEditDataFromLocal = (local: ImovelLocal) => {
    return {
      codigo_imovel: local.codigo_imovel,
      tipo: local.tipo || '',
      finalidade: (local.finalidade as any) || '',
      bairro: local.bairro || '',
      cidade: local.cidade || '',
      estado: local.estado || 'SP',
      logradouro: local.logradouro || '',
      numero: local.numero || '',
      area_total: local.area_total ? String(local.area_total) : '',
      area_util: local.area_util ? String(local.area_util) : '',
      quartos: local.quartos ? String(local.quartos) : '',
      suites: local.suites ? String(local.suites) : '',
      banheiros: local.banheiros ? String(local.banheiros) : '',
      vagas: local.vagas ? String(local.vagas) : '',
      valor_venda: local.valor_venda ? String(local.valor_venda) : '',
      valor_locacao: local.valor_locacao ? String(local.valor_locacao) : '',
      valor_condominio: local.valor_condominio ? String(local.valor_condominio) : '',
      valor_iptu: local.valor_iptu ? String(local.valor_iptu) : '',
      titulo: local.titulo || '',
      descricao: local.descricao || '',
      fotos: local.fotos || [],
      status_aprovacao: local.status_aprovacao,
    };
  };

  // Sincronização automática do XML ao carregar
  const autoSyncFromXml = async () => {
    if (!tenantId || !user?.id) return;
    
    try {
      const result = await syncImoveisForCorretor(tenantId, user.id);
      
      if (result.success && result.imoveisSincronizados > 0) {
      }
    } catch (err) {
      console.error('⚠️ [MeusImoveisTab] Erro na sincronização automática:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Primeiro sincroniza do XML (busca imóveis do corretor)
      await autoSyncFromXml();
      // Depois carrega as atribuições do banco
      await loadAssignments();
    };
    init();
  }, [tenantId, user?.id]);

  // Sincronizar imóveis do XML para este corretor
  const handleSyncFromXml = async () => {
    if (!tenantId || !user?.id || isSyncing) return;
    
    setIsSyncing(true);
    setSyncResult(null);
    setShowSyncResult(false);
    
    try {
      const result = await syncImoveisForCorretor(tenantId, user.id);
      setSyncResult(result);
      setShowSyncResult(true);
      
      if (result.success && result.imoveisSincronizados > 0) {
        // Recarregar lista após sincronização bem-sucedida
        await loadAssignments();
      }
      
    } catch (err) {
      console.error('❌ [MeusImoveisTab] Erro na sincronização:', err);
      setSyncResult({
        success: false,
        totalImoveis: 0,
        imoveisSincronizados: 0,
        corretoresEncontrados: 0,
        erros: [err instanceof Error ? err.message : 'Erro desconhecido'],
        diagnostico: []
      });
      setShowSyncResult(true);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filtrar imóveis que o corretor é responsável (XML + Locais)
  const meusImoveis = useMemo(() => {
    const meusCodigos = new Set(assignments.map(a => a.property_code.toUpperCase()));
    
    // Imóveis do XML que estão atribuídos ao corretor
    const imoveisXml = allImoveis.filter(imovel => 
      meusCodigos.has(imovel.referencia?.toUpperCase())
    );
    
    // Imóveis criados localmente (convertidos para formato Imovel)
    // Filtrar apenas os que estão nas atribuições do corretor
    const imoveisLocaisConvertidos = imoveisLocais
      .filter(local => meusCodigos.has(local.codigo_imovel.toUpperCase()))
      .map(convertLocalToImovel);
    
    // Criar um Set dos códigos que já existem no XML para evitar duplicatas
    const codigosXml = new Set(imoveisXml.map(i => i.referencia?.toUpperCase()));
    
    // Adicionar imóveis locais que não existem no XML
    const imoveisLocaisSemDuplicata = imoveisLocaisConvertidos.filter(
      local => !codigosXml.has(local.referencia?.toUpperCase())
    );
    
    // Combinar: XML primeiro, depois locais (que não duplicam)
    let combined = [...imoveisXml, ...imoveisLocaisSemDuplicata];
    
    // Aplicar busca
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      combined = combined.filter(i => 
        i.titulo?.toLowerCase().includes(search) ||
        i.referencia?.toLowerCase().includes(search) ||
        i.bairro?.toLowerCase().includes(search)
      );
    }
    
    return combined;
  }, [allImoveis, assignments, imoveisLocais, searchTerm]);

  // Adicionar código de imóvel
  const handleAddProperty = async () => {
    if (!newPropertyCode.trim() || !tenantId || !user) {
      setAddStatus('error');
      setAddMessage('Dados do usuário não disponíveis. Tente recarregar a página.');
      return;
    }
    
    setAddStatus('loading');
    setAddMessage('');
    
    const codigoNormalizado = newPropertyCode.trim().toUpperCase();
    
    // Preparar dados do corretor
    const corretorNome = user.name || user.corretor || user.email?.split('@')[0] || 'Corretor';
    const corretorTelefone = user.telefone ? String(user.telefone).replace(/\D/g, '') : null;
    
    try {
      // Verificar se código já está atribuído
      const { data: existing, error: fetchError } = await supabase
        .from('imoveis_corretores')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', codigoNormalizado);
      
      if (fetchError) {
        console.error('Erro ao verificar código existente:', fetchError);
        throw new Error(`Erro ao verificar: ${fetchError.message}`);
      }
      
      if (existing && existing.length > 0) {
        const currentOwner = existing[0];
        
        // Se já é do próprio corretor
        if (currentOwner.corretor_id === user.id) {
          setAddStatus('error');
          setAddMessage('Este código já está atribuído a você');
          return;
        }
        
        // Se não é gestão, não pode pegar de outro
        if (!isManager) {
          setAddStatus('error');
          setAddMessage(`Código já atribuído a ${currentOwner.corretor_nome || 'outro corretor'}. Contate a gestão para transferir.`);
          return;
        }
        
        // Transferir (gestão)
        const { error: updateError } = await supabase
          .from('imoveis_corretores')
          .update({
            corretor_id: user.id,
            corretor_nome: corretorNome,
            corretor_telefone: corretorTelefone,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing[0].id);
        
        if (updateError) {
          console.error('Erro ao transferir código:', updateError);
          throw new Error(`Erro ao transferir: ${updateError.message}`);
        }
        
        setAddStatus('success');
        setAddMessage(`Código ${codigoNormalizado} transferido para você!`);
      } else {
        // Criar nova atribuição
        const insertData = {
          tenant_id: tenantId,
          codigo_imovel: codigoNormalizado,
          corretor_id: user.id,
          corretor_nome: corretorNome,
          corretor_telefone: corretorTelefone,
          corretor_email: user.email || null
        };
        
        
        const { error: insertError } = await supabase
          .from('imoveis_corretores')
          .insert(insertData);
        
        if (insertError) {
          console.error('Erro ao inserir código:', insertError);
          throw new Error(`Erro ao inserir: ${insertError.message}`);
        }
        
        setAddStatus('success');
        setAddMessage(`Código ${codigoNormalizado} adicionado com sucesso!`);
      }
      
      setNewPropertyCode('');
      
      // Recarregar lista
      await loadAssignments();
      
      setTimeout(() => {
        setIsAddDialogOpen(false);
        setAddStatus('idle');
        setAddMessage('');
      }, 1500);
      
    } catch (err: any) {
      console.error('Erro ao adicionar código:', err);
      setAddStatus('error');
      setAddMessage(err.message || 'Erro ao adicionar código. Tente novamente.');
    }
  };

  // Remover atribuição
  const handleRemoveAssignment = async (assignment: PropertyAssignment) => {
    if (!tenantId || !user) return;
    
    // Corretor só pode remover suas próprias atribuições
    if (!isManager && assignment.broker_id !== user.id) {
      return;
    }
    
    try {
      const { error: deleteError } = await supabase
        .from('imoveis_corretores')
        .delete()
        .eq('id', assignment.id);
      
      if (deleteError) throw deleteError;
      
      // Atualizar lista local
      setAssignments(prev => prev.filter(a => a.id !== assignment.id));
    } catch (err) {
      console.error('Erro ao remover atribuição:', err);
    }
  };

  // Verificar se imóvel existe no catálogo
  const getImovelStatus = (code: string) => {
    const exists = allImoveis.some(i => i.referencia?.toUpperCase() === code.toUpperCase());
    return exists;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <OctoDashLoader message="Carregando seus imóveis..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Meus Imóveis</h2>
          <p className="text-text-secondary text-sm">
            {assignments.length} código{assignments.length !== 1 ? 's' : ''} atribuído{assignments.length !== 1 ? 's' : ''} a você
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAssignments}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Código
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Código de Imóvel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium text-text-primary">Código do Imóvel</label>
                  <Input
                    placeholder="Ex: APT-001, CASA-123"
                    value={newPropertyCode}
                    onChange={(e) => setNewPropertyCode(e.target.value.toUpperCase())}
                    className="mt-1"
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Digite o código de referência do imóvel que você é responsável
                  </p>
                </div>
                
                {addMessage && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    addStatus === 'success' ? 'bg-green-500/10 text-green-500' : 
                    addStatus === 'error' ? 'bg-red-500/10 text-red-500' : ''
                  }`}>
                    {addStatus === 'success' && <CheckCircle className="h-4 w-4" />}
                    {addStatus === 'error' && <AlertCircle className="h-4 w-4" />}
                    <span className="text-sm">{addMessage}</span>
                  </div>
                )}
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleAddProperty} 
                    disabled={!newPropertyCode.trim() || addStatus === 'loading'}
                  >
                    {addStatus === 'loading' ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        Adicionando...
                      </>
                    ) : (
                      'Adicionar'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="default" onClick={() => setIsCriarImovelOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Imóvel
          </Button>
        </div>
      </div>

      {/* Modal de Criação de Imóvel */}
      <CriarImovelForm
        isOpen={isCriarImovelOpen}
        onClose={() => {
          setIsCriarImovelOpen(false);
          setEditingImovelData(null);
        }}
        onSuccess={() => {
          loadAssignments();
          onPropertyCreated?.();
          setEditingImovelData(null);
        }}
        initialData={editingImovelData || undefined}
        isEdit={Boolean(editingImovelData)}
      />

      {/* Resultado da Sincronização */}
      {showSyncResult && syncResult && (
        <div className={`rounded-lg border p-4 ${
          syncResult.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {syncResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              )}
              <div>
                <h4 className={`font-medium ${
                  syncResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {syncResult.success ? 'Sincronização Concluída' : 'Erro na Sincronização'}
                </h4>
                <p className={`text-sm mt-1 ${
                  syncResult.success ? 'text-green-700' : 'text-red-700'
                }`}>
                  {syncResult.imoveisSincronizados > 0 
                    ? `${syncResult.imoveisSincronizados} imóvel(is) sincronizado(s) do XML`
                    : syncResult.success 
                      ? 'Nenhum imóvel novo encontrado para sincronizar'
                      : syncResult.erros.join(', ')
                  }
                </p>
                
                {/* Diagnóstico detalhado */}
                {syncResult.diagnostico && syncResult.diagnostico.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Detalhes:
                    </p>
                    {syncResult.diagnostico.slice(0, 5).map((d: DiagnosticoAtribuicao, idx: number) => (
                      <div key={idx} className={`text-xs px-2 py-1 rounded ${
                        d.status === 'atribuido' ? 'bg-green-100 text-green-700' :
                        d.status === 'conflito' ? 'bg-yellow-100 text-yellow-700' :
                        d.status === 'sem_corretor' ? 'bg-gray-100 text-gray-600' :
                        'bg-red-100 text-red-700'
                      }`}>
                        <strong>{d.codigoImovel}</strong>: {d.mensagem}
                      </div>
                    ))}
                    {syncResult.diagnostico.length > 5 && (
                      <p className="text-xs text-gray-500">
                        ... e mais {syncResult.diagnostico.length - 5} registro(s)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button 
              onClick={() => setShowSyncResult(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Lista de códigos atribuídos */}
      {assignments.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3">Códigos Atribuídos</h3>
          <div className="flex flex-wrap gap-2">
            {assignments.map(assignment => {
              const exists = getImovelStatus(assignment.property_code);
              return (
                <Badge 
                  key={assignment.id} 
                  variant={exists ? 'default' : 'secondary'}
                  className="flex items-center gap-1 px-3 py-1"
                >
                  <Building2 className="h-3 w-3" />
                  {assignment.property_code}
                  {!exists && (
                    <span className="text-xs opacity-70">(não encontrado)</span>
                  )}
                  {(isManager || assignment.broker_id === user?.id) && (
                    <button
                      onClick={() => handleRemoveAssignment(assignment)}
                      className="ml-1 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Busca nos imóveis */}
      {meusImoveis.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <Input
            placeholder="Buscar nos meus imóveis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Grid de imóveis */}
      {meusImoveis.length === 0 ? (
        <div className="text-center py-16">
          <Home className="h-16 w-16 text-text-secondary mx-auto mb-4 opacity-50" />
          {assignments.length === 0 ? (
            <>
              <p className="text-text-secondary mb-2">Você ainda não tem imóveis atribuídos</p>
              <p className="text-text-secondary text-sm mb-4">
                Clique em "Adicionar Código" para adicionar imóveis à sua responsabilidade
              </p>
            </>
          ) : (
            <>
              <p className="text-text-secondary mb-2">
                Nenhum imóvel encontrado no catálogo com os códigos atribuídos
              </p>
              <p className="text-text-secondary text-sm">
                Os códigos podem não estar sincronizados com o XML
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-text-secondary text-sm">
            Exibindo <strong>{meusImoveis.length}</strong> imóvel(is) sob sua responsabilidade
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {meusImoveis.map(imovel => {
              const statusAprovacao = getStatusAprovacao(imovel.referencia);
              const isImovelLocal = canDeleteImovel(imovel.referencia);
              
              return (
                <div key={imovel.referencia} className="relative">
                  {/* Badge de Status de Aprovação */}
                  {isImovelLocal && statusAprovacao && (
                    <div className="absolute top-2 left-2 z-10">
                      {renderStatusAprovacaoBadge(statusAprovacao)}
                    </div>
                  )}
                  
                  <ImovelCard 
                    imovel={imovel}
                    onViewDetails={onViewDetails}
                    onDelete={handleDeleteImovel}
                    canDelete={isImovelLocal}
                  />
                  
                  {/* Controles de Aprovação (apenas Admins) */}
                  {isAdmin && isImovelLocal && (
                    <div className="mt-2 p-2 bg-card border rounded-lg">
                      <div className="flex items-center gap-1 mb-2">
                        <ShieldCheck className="h-3 w-3 text-primary" />
                        <span className="text-xs font-medium text-text-secondary">Aprovação Admin</span>
                      </div>
                      {getMotivoAprovacao(imovel.referencia) && (
                        <p className="text-xs text-text-secondary mb-2 italic">
                          "{getMotivoAprovacao(imovel.referencia)}"
                        </p>
                      )}
                      <div className="flex gap-1">
                        <button
                          onClick={() => openAprovacaoDialog(imovel.referencia, 'aprovado')}
                          disabled={statusAprovacao === 'aprovado'}
                          className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                            statusAprovacao === 'aprovado'
                              ? 'bg-green-500 text-white cursor-default'
                              : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'
                          }`}
                        >
                          ✓ Aprovar
                        </button>
                        <button
                          onClick={() => openAprovacaoDialog(imovel.referencia, 'aguardando')}
                          disabled={statusAprovacao === 'aguardando'}
                          className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                            statusAprovacao === 'aguardando'
                              ? 'bg-yellow-500 text-black cursor-default'
                              : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/40'
                          }`}
                        >
                          ⏳ Aguardar
                        </button>
                        <button
                          onClick={() => openAprovacaoDialog(imovel.referencia, 'nao_aprovado')}
                          disabled={statusAprovacao === 'nao_aprovado'}
                          className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                            statusAprovacao === 'nao_aprovado'
                              ? 'bg-red-500 text-white cursor-default'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/40'
                          }`}
                        >
                          ✗ Reprovar
                        </button>
                        <button
                          onClick={() => {
                            const local = imoveisLocais.find(
                              (l) => l.codigo_imovel.toUpperCase() === imovel.referencia.toUpperCase()
                            );
                            if (!local) return;
                            setEditingImovelData(buildEditDataFromLocal(local));
                            setIsCriarImovelOpen(true);
                          }}
                          className="flex-1 px-2 py-1 text-xs rounded transition-colors bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                        >
                          ✎ Editar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <div className="text-center py-4">
          <p className="text-red-500">{error}</p>
          <Button variant="outline" onClick={loadAssignments} className="mt-2">
            Tentar Novamente
          </Button>
        </div>
      )}

      {/* Dialog de Aprovação com Motivo */}
      <Dialog open={aprovacaoDialog.isOpen} onOpenChange={(open) => !open && closeAprovacaoDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {aprovacaoDialog.novoStatus === 'aprovado' && 'Aprovar Imóvel'}
              {aprovacaoDialog.novoStatus === 'nao_aprovado' && 'Reprovar Imóvel'}
              {aprovacaoDialog.novoStatus === 'aguardando' && 'Marcar como Aguardando'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm text-text-secondary mb-2">
                Imóvel: <strong>{aprovacaoDialog.imovelReferencia}</strong>
              </p>
              <label className="text-sm font-medium text-text-primary">
                Descrição / Motivo (opcional)
              </label>
              <textarea
                value={aprovacaoDialog.motivo}
                onChange={(e) => setAprovacaoDialog(prev => ({ ...prev, motivo: e.target.value }))}
                placeholder={
                  aprovacaoDialog.novoStatus === 'aprovado' 
                    ? 'Ex: Documentação completa, fotos de qualidade...' 
                    : aprovacaoDialog.novoStatus === 'nao_aprovado'
                    ? 'Ex: Fotos insuficientes, dados incompletos...'
                    : 'Ex: Aguardando documentação adicional...'
                }
                className="mt-1 w-full min-h-[100px] p-3 rounded-lg border border-border bg-background text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeAprovacaoDialog}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmAprovacao}
                className={
                  aprovacaoDialog.novoStatus === 'aprovado' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : aprovacaoDialog.novoStatus === 'nao_aprovado'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-yellow-500 hover:bg-yellow-600 text-black'
                }
              >
                {aprovacaoDialog.novoStatus === 'aprovado' && '✓ Confirmar Aprovação'}
                {aprovacaoDialog.novoStatus === 'nao_aprovado' && '✗ Confirmar Reprovação'}
                {aprovacaoDialog.novoStatus === 'aguardando' && '⏳ Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MeusImoveisTab;
