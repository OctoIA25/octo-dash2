/**
 * 🪟 MODAL DE DETALHES DO LEAD
 * Modal que exibe todas as informações completas de um lead
 * Com integração de atividades da Agenda
 */

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Phone, 
  Building2, 
  Clock, 
  User, 
  Calendar,
  CheckCircle,
  CheckCircle2,
  Loader2,
  Home,
  MapPin,
  DollarSign,
  Bed,
  Car,
  Bath,
  Square,
  Plus,
  X,
  CalendarPlus,
  ChevronDown,
  Flag,
  ClipboardList,
  Archive
} from 'lucide-react';
import { BolsaoLead } from '../services/bolsaoService';
import { Imovel, fetchImovelByCodigo } from '@/features/imoveis/services/kenloService';
import { supabase } from '@/integrations/supabase/client';
import { eventoToSupabase, supabaseToEvento } from '@/features/agenda/services/agendaSupabaseService';
import { useAuth } from "@/hooks/useAuth";
import { useImoveisData } from '@/features/imoveis/hooks/useImoveisData';
import { ImoveisComboBox } from '@/components/ui/imovel-combobox';

// Tipos de atividade
type TipoAtividade = 'visita_agendada' | 'visita_realizada' | 'visita_nao_realizada' | 'retornar_cliente' | 'reuniao' | 'tarefa' | 'outro';

interface Atividade {
  id: string;
  titulo: string;
  descricao?: string;
  data: Date;
  horario?: string;
  tipo: TipoAtividade;
  status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado';
  prioridade?: 'alta' | 'media' | 'baixa';
}

interface LeadDetailsModalProps {
  lead: BolsaoLead | null;
  isOpen: boolean;
  onClose: () => void;
  onAssumirLead: (leadId: number) => Promise<void>;
  onConfirmarAtendimento: (leadId: number) => Promise<void>;
  isAssumindoLead: boolean;
  isConfirmandoLead: boolean;
  isAdmin: boolean;
  isCorretor: boolean;
  currentCorretor: string;
  onAtualizarStatusLead?: (leadId: number, novoStatus: string) => Promise<void>;
  onArquivarLead?: (lead: BolsaoLead) => void;
}

export const LeadDetailsModal = ({
  lead,
  isOpen,
  onClose,
  onAssumirLead,
  onConfirmarAtendimento,
  isAssumindoLead,
  isConfirmandoLead,
  isAdmin,
  isCorretor,
  currentCorretor,
  onAtualizarStatusLead,
  onArquivarLead
}: LeadDetailsModalProps) => {
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const { imoveis = [] } = useImoveisData();
  
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [carregandoImovel, setCarregandoImovel] = useState(false);
  
  // Estados para atividades
  const [criarAtividadeOpen, setCriarAtividadeOpen] = useState(false);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [carregandoAtividades, setCarregandoAtividades] = useState(false);
  const [salvandoAtividade, setSalvandoAtividade] = useState(false);
  
  // Estado do formulário de nova atividade
  const [novaAtividade, setNovaAtividade] = useState({
    titulo: '',
    descricao: '',
    data: new Date().toISOString().split('T')[0],
    horario: '',
    tipo: 'outro' as TipoAtividade,
    prioridade: 'media' as 'alta' | 'media' | 'baixa',
    imovelCodigo: '',
    imovelTitulo: ''
  });
  
  // Atualizar código do imóvel quando o lead mudar
  useEffect(() => {
    if (lead?.codigo) {
      // Buscar o imóvel correspondente para pegar o título
      const imovelDoLead = imoveis.find(i => i.referencia === lead.codigo);
      setNovaAtividade(prev => ({ 
        ...prev, 
        imovelCodigo: lead.codigo || '',
        imovelTitulo: imovelDoLead?.titulo || ''
      }));
    }
  }, [lead?.codigo, imoveis]);

  // Função para carregar atividades do lead (multitenant)
  const carregarAtividadesDoLead = async () => {
    if (!lead?.id || !tenantId || tenantId === 'owner') return;
    
    try {
      setCarregandoAtividades(true);
      
      const { data, error } = await supabase
        .from('agenda_eventos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('lead_id', lead.id)
        .order('data', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar atividades:', error);
        return;
      }
      
      if (data) {
        const atividadesFormatadas = data.map((a: any) => supabaseToEvento(a));
        setAtividades(atividadesFormatadas);
      }
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
    } finally {
      setCarregandoAtividades(false);
    }
  };

  // Função para criar nova atividade
  const handleCriarAtividade = async () => {

    if (!novaAtividade.titulo || !novaAtividade.data || !novaAtividade.horario) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha título, data e horário",
        variant: "destructive"
      });
      return;
    }

    if (!user?.email || !tenantId || tenantId === 'owner') {
      console.error('❌ Usuário não autenticado ou tenant não selecionado:', user);
      toast({
        title: "Erro",
        description: "Usuário não autenticado ou tenant não selecionado",
        variant: "destructive"
      });
      return;
    }

    if (!lead) {
      console.error('❌ Lead não selecionado');
      toast({
        title: "Erro",
        description: "Lead não selecionado",
        variant: "destructive"
      });
      return;
    }

    try {
      setSalvandoAtividade(true);

      const eventoTemp = {
        titulo: novaAtividade.titulo,
        descricao: novaAtividade.descricao || undefined,
        data: new Date(novaAtividade.data + 'T12:00:00'),
        horario: novaAtividade.horario,
        tipo: novaAtividade.tipo,
        status: 'pendente' as const,
        prioridade: novaAtividade.prioridade,
        leadId: lead.id,
        leadNome: lead.nomedolead || '',
        leadTelefone: lead.lead || '',
        imovelRef: novaAtividade.imovelCodigo || lead.codigo || '',
        imovelTitulo: novaAtividade.imovelTitulo || ''
      };


      const corretorNome = user.name || currentCorretor || 'Corretor';
      const eventoSupabase = eventoToSupabase(eventoTemp, user.email, corretorNome);
      

      const { data, error } = await supabase
        .from('agenda_eventos')
        .insert([{ ...eventoSupabase, tenant_id: tenantId }])
        .select();
      
      if (error) {
        console.error('❌ Erro Supabase:', error);
        throw new Error(error.message || 'Erro ao salvar no Supabase');
      }


      toast({
        title: "✅ Atividade criada!",
        description: `${novaAtividade.titulo} adicionada à agenda`,
        className: "bg-green-500/10 border-green-500/50"
      });

      // Atualizar status do lead baseado no tipo de atividade
      
      if (onAtualizarStatusLead) {
        if (novaAtividade.tipo === 'visita_agendada' || novaAtividade.tipo === 'visita_realizada') {
          // Visita agendada OU visita realizada → move para "visita-agendada"
          await onAtualizarStatusLead(lead.id, 'visita-agendada');
          toast({
            title: "📍 Lead movido!",
            description: `Lead movido para etapa "Visita Agendada"`,
            className: "bg-blue-500/10 border-blue-500/50"
          });
        } else if (novaAtividade.tipo === 'retornar_cliente' || novaAtividade.tipo === 'reuniao') {
          // Se criar uma atividade de retornar cliente ou reunião, move para "visita-agendada" (se ainda não estiver em etapas avançadas)
          const statusAtual = lead.status?.toLowerCase().replace(/\s+/g, '-');
          if (statusAtual === 'novos-leads' || statusAtual === 'novo' || statusAtual === 'interacao' || statusAtual === 'assumido') {
            await onAtualizarStatusLead(lead.id, 'visita-agendada');
            toast({
              title: "📍 Lead movido!",
              description: `Lead movido para etapa "Visita Agendada"`,
              className: "bg-blue-500/10 border-blue-500/50"
            });
          } else {
          }
        } else {
        }
      } else {
        console.warn('⚠️ Callback onAtualizarStatusLead não está disponível!');
      }

      // Recarregar atividades
      await carregarAtividadesDoLead();
      
      // Fechar modal de criar e resetar form
      setCriarAtividadeOpen(false);
      const imovelDoLead = imoveis.find(i => i.referencia === lead?.codigo);
      setNovaAtividade({
        titulo: '',
        descricao: '',
        data: new Date().toISOString().split('T')[0],
        horario: '',
        tipo: 'outro',
        prioridade: 'media',
        imovelCodigo: lead?.codigo || '',
        imovelTitulo: imovelDoLead?.titulo || ''
      });

    } catch (error) {
      console.error('❌ ERRO AO CRIAR ATIVIDADE:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'N/A');
      toast({
        title: "Erro ao criar atividade",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive"
      });
    } finally {
      setSalvandoAtividade(false);
    }
  };

  // Helper para nome do tipo de atividade
  const getNomeTipo = (tipo: TipoAtividade) => {
    switch (tipo) {
      case 'visita_agendada': return 'Visita Agendada';
      case 'visita_realizada': return 'Visita Realizada';
      case 'visita_nao_realizada': return 'Visita Não Realizada';
      case 'retornar_cliente': return 'Retornar Cliente';
      case 'reuniao': return 'Reunião';
      case 'tarefa': return 'Tarefa';
      case 'outro': return 'Outro';
      default: return tipo;
    }
  };

  // Helper para cor do tipo
  const getCorTipo = (tipo: TipoAtividade) => {
    switch (tipo) {
      case 'visita_agendada': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
      case 'visita_realizada': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'visita_nao_realizada': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'retornar_cliente': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'reuniao': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'tarefa': return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  // Carregar atividades quando o modal abrir
  useEffect(() => {
    if (isOpen && lead?.id) {
      carregarAtividadesDoLead();
    }
  }, [isOpen, lead?.id]);
  
  // Buscar imóvel quando o modal abrir
  useEffect(() => {
    if (isOpen && lead?.codigo) {
      setCarregandoImovel(true);
      fetchImovelByCodigo(lead.codigo)
        .then(imovelEncontrado => {
          setImovel(imovelEncontrado);
        })
        .catch(error => {
          console.error('Erro ao buscar imóvel:', error);
          setImovel(null);
        })
        .finally(() => {
          setCarregandoImovel(false);
        });
    } else {
      setImovel(null);
    }
  }, [isOpen, lead?.codigo]);
  
  if (!lead) return null;
  
  // A foto já vem no campo lead.Foto do Supabase
  const fotoUrl = lead.Foto;

  // Calcular tempo no bolsão
  const calcularTempoNoBolsao = (data: string) => {
    const agora = new Date();
    const criacao = new Date(data);
    const diffMs = agora.getTime() - criacao.getTime();
    const diffMinutos = Math.floor(diffMs / 60000);
    
    const dias = Math.floor(diffMinutos / 1440);
    const horas = Math.floor((diffMinutos % 1440) / 60);
    const minutos = diffMinutos % 60;
    
    if (dias > 0) return `${dias}d ${horas}h`;
    if (horas > 0) return `${horas}h ${minutos}min`;
    return `${minutos}min`;
  };

  // Calcular urgência
  const calcularUrgencia = (data: string) => {
    const agora = new Date();
    const criacao = new Date(data);
    const diffMs = agora.getTime() - criacao.getTime();
    const diffMinutos = Math.floor(diffMs / 60000);
    
    if (diffMinutos > 120) return { nivel: 'crítico', cor: 'bg-red-500', texto: 'text-red-700 dark:text-red-400', emoji: '🔴' };
    if (diffMinutos > 60) return { nivel: 'alta', cor: 'bg-orange-500', texto: 'text-orange-700 dark:text-orange-400', emoji: '🟠' };
    return { nivel: 'normal', cor: 'bg-yellow-500', texto: 'text-yellow-700 dark:text-yellow-400', emoji: '🟡' };
  };

  // Status badge
  const getStatusConfig = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'novo':
        return { label: '🆕 Novo', cor: 'bg-blue-500' };
      case 'bolsão':
        return { label: '📦 Bolsão', cor: 'bg-purple-500' };
      case 'assumido':
        return { label: '🔄 Assumido', cor: 'bg-orange-500' };
      case 'atendido':
        return { label: '✅ Atendido', cor: 'bg-green-500' };
      case 'finalizado':
        return { label: '✅ Finalizado', cor: 'bg-emerald-500' };
      default:
        return { label: '❓ Desconhecido', cor: 'bg-gray-500' };
    }
  };

  // Formatar data
  const formatarData = (data: string | null) => {
    if (!data) return '-';
    const d = new Date(data);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Formatar telefone
  const formatarTelefone = (telefone: string | null) => {
    if (!telefone) return '-';
    
    const numeros = telefone.replace(/\D/g, '');
    
    if (numeros.length === 11) {
      const ddd = numeros.slice(0, 2);
      const parte1 = numeros.slice(2, 7);
      const parte2 = numeros.slice(7);
      return `(${ddd}) ${parte1}-${parte2}`;
    }
    
    if (numeros.length === 10) {
      const ddd = numeros.slice(0, 2);
      const parte1 = numeros.slice(2, 6);
      const parte2 = numeros.slice(6);
      return `(${ddd}) ${parte1}-${parte2}`;
    }
    
    return telefone;
  };

  const tempo = calcularTempoNoBolsao(lead.created_at);
  const urgencia = calcularUrgencia(lead.created_at);
  const statusConfig = getStatusConfig(lead.status);
  const isDisponivel = lead.status === 'bolsão';

  // Verificar se deve mostrar botões (no Bolsão, apenas mostrar botão Assumir)
  const mostrarBotaoAssumir = isDisponivel && (isCorretor || isAdmin);
  const mostrarBotaoConfirmar = false; // Confirmação agora é apenas em "Meus Leads"
  
  // Só pode criar atividade se o lead já foi assumido (não está no bolsão)
  const podecriarAtividade = !isDisponivel && (isCorretor || isAdmin);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-2xl bg-background animate-in fade-in-0 zoom-in-95 duration-200"
      >
        <DialogHeader>
          <div className="flex items-start gap-4">
            {/* Foto do Lead */}
            <div className="flex-shrink-0">
              {fotoUrl ? (
                <img 
                  src={fotoUrl} 
                  alt="Foto do lead"
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <User className="h-8 w-8 text-white" />
                </div>
              )}
            </div>
            
            {/* Título e Descrição */}
            <div className="flex-1">
              <DialogTitle className="text-xl">
                {lead.nomedolead || 'Lead sem nome'}
              </DialogTitle>
              <DialogDescription className="flex flex-col gap-1 mt-1">
                <span>Lead #{lead.id}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Status e Urgência */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={`${statusConfig.cor} text-white font-bold px-3 py-1.5`}>
              {statusConfig.label}
            </Badge>
            <Badge className={`${urgencia.cor} text-white font-bold px-3 py-1.5`}>
              {urgencia.emoji} {urgencia.nivel.toUpperCase()}
            </Badge>
            {lead.atendido && (
              <Badge className="bg-green-500 text-white font-bold px-3 py-1.5">
                ✅ Atendido
              </Badge>
            )}
          </div>

          {/* Informações Principais */}
          <div className="space-y-4">
            {/* Contato do Lead */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-5 w-5 text-blue-500" />
                <span className="font-bold text-sm text-muted-foreground">Contato do Lead</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {formatarTelefone(lead.lead)}
              </p>
            </div>

            {/* Código do Imóvel */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-purple-500" />
                <span className="font-bold text-sm text-muted-foreground">Código do Imóvel</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {lead.codigo || '-'}
              </p>
            </div>

            {/* Portal de Origem */}
            {lead.portal && (
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📍</span>
                  <span className="font-bold text-sm text-muted-foreground">Portal de Origem</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {lead.portal}
                </p>
              </div>
            )}

            {/* Tempo no Bolsão */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-orange-500" />
                <span className="font-bold text-sm text-muted-foreground">Tempo no Bolsão</span>
              </div>
              <p className={`text-lg font-bold ${urgencia.texto}`}>
                {tempo}
              </p>
            </div>
          </div>

          {/* Informações do Imóvel */}
          {lead.codigo && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <Home className="h-5 w-5 text-green-500" />
                Imóvel de Interesse
              </h4>
              
              {carregandoImovel ? (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Carregando informações do imóvel...</span>
                  </div>
                </div>
              ) : imovel ? (
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  {/* Título e Localização */}
                  <div>
                    <h5 className="font-bold text-foreground text-lg mb-1">{imovel.titulo}</h5>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{imovel.bairro}, {imovel.cidade}</span>
                    </div>
                  </div>

                  {/* Valores */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {imovel.valor_venda > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Venda</p>
                          <p className="font-bold text-green-600 dark:text-green-400">
                            R$ {imovel.valor_venda.toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    )}
                    {imovel.valor_locacao > 0 && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-blue-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Locação</p>
                          <p className="font-bold text-blue-600 dark:text-blue-400">
                            R$ {imovel.valor_locacao.toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Características */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {imovel.quartos > 0 && (
                      <div className="flex items-center gap-1">
                        <Bed className="h-4 w-4 text-purple-500" />
                        <span className="text-sm">{imovel.quartos} quartos</span>
                      </div>
                    )}
                    {imovel.banheiro > 0 && (
                      <div className="flex items-center gap-1">
                        <Bath className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">{imovel.banheiro} banheiros</span>
                      </div>
                    )}
                    {imovel.garagem > 0 && (
                      <div className="flex items-center gap-1">
                        <Car className="h-4 w-4 text-orange-500" />
                        <span className="text-sm">{imovel.garagem} vagas</span>
                      </div>
                    )}
                    {imovel.area_total > 0 && (
                      <div className="flex items-center gap-1">
                        <Square className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{imovel.area_total}m²</span>
                      </div>
                    )}
                  </div>

                  {/* Descrição */}
                  {imovel.descricao && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                      <p className="text-sm text-foreground line-clamp-3">
                        {imovel.descricao}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Imóvel não encontrado no catálogo</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Informações do Corretor */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-bold text-foreground flex items-center gap-2">
              <User className="h-5 w-5 text-blue-500" />
              Informações do Corretor
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Corretor Original */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Corretor Original</p>
                <p className="text-sm font-semibold text-foreground">
                  {lead.corretor || '-'}
                </p>
              </div>

              {/* Telefone do Corretor Original */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Telefone Original</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarTelefone(lead.numerocorretor)}
                </p>
              </div>

              {/* Corretor Responsável */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Corretor Responsável</p>
                <p className="text-sm font-semibold text-foreground">
                  {lead.corretor_responsavel || 'Não atribuído'}
                </p>
              </div>

              {/* Telefone do Responsável */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Telefone Responsável</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarTelefone(lead.numero_corretor_responsavel)}
                </p>
              </div>
            </div>
          </div>

          {/* Datas */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-bold text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              Histórico
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Data de Entrada */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Data de Entrada</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarData(lead.created_at)}
                </p>
              </div>

              {/* Data de Atribuição */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Data de Atribuição</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarData(lead.data_atribuicao)}
                </p>
              </div>

              {/* Data de Atendimento */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Data de Atendimento</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarData(lead.data_atendimento)}
                </p>
              </div>

              {/* Data de Expiração */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Data de Expiração</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarData(lead.data_expiracao)}
                </p>
              </div>
            </div>
          </div>

          {/* Seção de Atividades - Só aparece se o lead já foi assumido */}
          {podecriarAtividade && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-green-500" />
                Atividades
              </h4>
              <Button
                size="sm"
                onClick={() => setCriarAtividadeOpen(true)}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold gap-2"
              >
                <CalendarPlus className="h-4 w-4" />
                Criar Atividade
              </Button>
            </div>

            {/* Lista de Atividades */}
            {carregandoAtividades ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-muted-foreground text-sm">Carregando atividades...</span>
              </div>
            ) : atividades.length === 0 ? (
              <div className="text-center py-6 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
                <CalendarPlus className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Nenhuma atividade registrada</p>
                <p className="text-muted-foreground text-xs mt-1">Clique em "Criar Atividade" para adicionar</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {atividades.map((atividade) => (
                  <div
                    key={atividade.id}
                    className="p-3 bg-muted/30 rounded-lg border border-muted-foreground/10 hover:border-muted-foreground/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {atividade.titulo}
                          </span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${getCorTipo(atividade.tipo)}`}>
                            {getNomeTipo(atividade.tipo)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {atividade.data.toLocaleDateString('pt-BR')}
                          </span>
                          {atividade.horario && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {atividade.horario}
                            </span>
                          )}
                        </div>
                      </div>
                      {atividade.status === 'concluido' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Botões de Ação */}
          <div className="border-t pt-4 flex gap-3 flex-wrap">
            {mostrarBotaoAssumir && (
              <Button
                onClick={() => onAssumirLead(lead.id)}
                disabled={isAssumindoLead}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold"
              >
                {isAssumindoLead ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assumindo...
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4 mr-2" />
                    Assumir Lead
                  </>
                )}
              </Button>
            )}

            {mostrarBotaoConfirmar && (
              <Button
                onClick={() => onConfirmarAtendimento(lead.id)}
                disabled={isConfirmandoLead}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold"
              >
                {isConfirmandoLead ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirmar Atendimento
                  </>
                )}
              </Button>
            )}

            {onArquivarLead && lead && (
              <Button
                onClick={() => onArquivarLead(lead)}
                variant="outline"
                className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:border-orange-400 dark:text-orange-400"
              >
                <Archive className="h-4 w-4 mr-2" />
                Arquivar
              </Button>
            )}

            <Button
              onClick={onClose}
              variant="outline"
              className={mostrarBotaoAssumir || mostrarBotaoConfirmar ? '' : 'flex-1'}
            >
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Modal de Criar Atividade */}
      <Dialog open={criarAtividadeOpen} onOpenChange={setCriarAtividadeOpen}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto border border-border shadow-2xl bg-background"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CalendarPlus className="h-5 w-5 text-green-500" />
              Criar Atividade
            </DialogTitle>
            <DialogDescription>
              Adicione uma nova atividade para {lead?.nomedolead || 'este lead'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Informações do Lead (Imutável) */}
            <div className="p-3 bg-muted/50 rounded-lg border border-muted-foreground/10">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold text-foreground">Lead Vinculado</span>
                <Badge variant="outline" className="text-[10px] ml-auto">Fixo</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Nome:</span>
                  <p className="font-medium text-foreground truncate">{lead?.nomedolead || 'Sem nome'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Telefone:</span>
                  <p className="font-medium text-foreground">{lead?.lead || '-'}</p>
                </div>
              </div>
            </div>

            {/* Imóvel (Editável com ComboBox) */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Home className="h-3.5 w-3.5 text-green-500" />
                Imóvel
                <Badge variant="outline" className="text-[10px] ml-1">Editável</Badge>
              </Label>
              <ImoveisComboBox
                imoveis={imoveis}
                value={novaAtividade.imovelCodigo}
                onChange={(value, imovelSelecionado) => {
                  setNovaAtividade({
                    ...novaAtividade,
                    imovelCodigo: value,
                    imovelTitulo: imovelSelecionado?.titulo || value
                  });
                }}
                placeholder="Selecione ou busque um imóvel"
                emptyText="Nenhum imóvel encontrado"
              />
              {/* Preview do imóvel selecionado */}
              {novaAtividade.imovelCodigo && (() => {
                const imovelPreview = imoveis.find(i => i.referencia === novaAtividade.imovelCodigo);
                if (!imovelPreview) return null;
                return (
                  <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-muted-foreground/10 flex items-center gap-3">
                    {/* Foto do imóvel */}
                    <div className="w-14 h-14 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
                      {imovelPreview.fotos && imovelPreview.fotos.length > 0 ? (
                        <img
                          src={imovelPreview.fotos[0]}
                          alt={imovelPreview.titulo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Home className="h-6 w-6 text-gray-400 dark:text-slate-500" />
                        </div>
                      )}
                    </div>
                    {/* Info do imóvel */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {imovelPreview.referencia}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {imovelPreview.tipoSimplificado}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {imovelPreview.bairro} • {imovelPreview.cidade}
                      </p>
                      {imovelPreview.valor > 0 && (
                        <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-0.5">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(imovelPreview.valor)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="titulo-atividade" className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                Título
              </Label>
              <Input
                id="titulo-atividade"
                placeholder="Ex: Ligar para cliente"
                value={novaAtividade.titulo}
                onChange={(e) => setNovaAtividade({ ...novaAtividade, titulo: e.target.value })}
                className="h-11"
              />
            </div>

            {/* Tipo de Atividade */}
            <div className="space-y-2">
              <Label htmlFor="tipo-atividade" className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                Atividade
              </Label>
              <div className="relative">
                <select
                  id="tipo-atividade"
                  value={novaAtividade.tipo}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, tipo: e.target.value as TipoAtividade })}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg appearance-none dark:border-slate-800 dark:text-slate-100"
                >
                  <option value="outro">🔧 Outro</option>
                  <option value="visita_agendada">📅 Visita Agendada</option>
                  <option value="visita_realizada">✅ Visita Realizada</option>
                  <option value="visita_nao_realizada">❌ Visita Não Realizada</option>
                  <option value="retornar_cliente">📞 Retornar para o Cliente</option>
                  <option value="reuniao">👥 Reunião</option>
                  <option value="tarefa">📋 Tarefa</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none dark:text-slate-500" />
              </div>
            </div>

            {/* Data e Horário */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="data-atividade" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Data
                </Label>
                <Input
                  id="data-atividade"
                  type="date"
                  value={novaAtividade.data}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, data: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="horario-atividade" className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Horário
                </Label>
                <Input
                  id="horario-atividade"
                  type="time"
                  value={novaAtividade.horario}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, horario: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>

            {/* Prioridade */}
            <div className="space-y-2">
              <Label htmlFor="prioridade-atividade" className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Flag className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                Prioridade
              </Label>
              <div className="relative">
                <select
                  id="prioridade-atividade"
                  value={novaAtividade.prioridade}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, prioridade: e.target.value as 'alta' | 'media' | 'baixa' })}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer transition-all duration-200 shadow-sm appearance-none dark:border-slate-800 dark:text-slate-100"
                >
                  <option value="baixa">🟢 Baixa</option>
                  <option value="media">🟡 Média</option>
                  <option value="alta">🔴 Alta</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none dark:text-slate-500" />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="descricao-atividade" className="text-sm font-semibold text-foreground">
                Descrição (opcional)
              </Label>
              <Textarea
                id="descricao-atividade"
                placeholder="Detalhes adicionais sobre a atividade..."
                value={novaAtividade.descricao}
                onChange={(e) => setNovaAtividade({ ...novaAtividade, descricao: e.target.value })}
                className="min-h-[80px] resize-none"
              />
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleCriarAtividade}
                disabled={salvandoAtividade}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold"
              >
                {salvandoAtividade ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Criar Atividade
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setCriarAtividadeOpen(false)}
                disabled={salvandoAtividade}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
