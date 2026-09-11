/**
 * 🪟 MODAL DE DETALHES DO LEAD
 * Modal que exibe todas as informações completas de um lead
 * Atividades ficam na AtividadesLeadSection, a mesma do card do lead no Kanban.
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
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { useChatPath, ConversationLinkField } from '@/features/chat/components/OpenConversationLink';
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
  ClipboardList,
  Archive,
  Sparkles,
  Tag,
  MessageSquare
} from 'lucide-react';
import { etapaAposAtividade } from '../utils/atividades';
import { AtividadesLeadSection } from './AtividadesLeadSection';
import { BolsaoLead } from '../services/bolsaoService';
import { CLASSIFICACAO_ESTILOS, CLASSIFICACAO_ORDEM } from './ClassificacaoBadge';
import { PreferenciasEditor, preferenciasDe } from './PreferenciasLead';
import { classificacoesDe, toggleClassificacao } from '../utils/classificarLead';
import { EnviarRecomendacoesModal } from '@/features/recommendations/components/EnviarRecomendacoesModal';
import { bolsaoLeadToRecommendationInput } from '@/features/recommendations/adapters';
import type { Imovel } from '@/features/imoveis/services/kenloService';
import { fetchImovelDoTenantPorCodigo } from '@/features/imoveis/services/catalogoImoveisService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from "@/hooks/useAuth";
import { useImoveisData } from '@/features/imoveis/hooks/useImoveisData';

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
  /**
   * Recomendações só fazem sentido com o lead já na carteira: elas são montadas
   * a partir do imóvel de interesse, que o Bolsão esconde de quem ainda não
   * assumiu. Falso no Bolsão, verdadeiro em Meus Leads.
   */
  mostrarRecomendacoes?: boolean;
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
  onArquivarLead,
  mostrarRecomendacoes = true
}: LeadDetailsModalProps) => {
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const { imoveis = [] } = useImoveisData();
  
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [carregandoImovel, setCarregandoImovel] = useState(false);
  const [recomendacoesOpen, setRecomendacoesOpen] = useState(false);

  // Classificação do lead — estado local otimista. O espelho (bolsao) é atualizado
  // pelo trigger tr_*_classification_to_bolsao; a listagem pega no próximo carregarLeads.
  const [classificacao, setClassificacao] = useState<string[]>(classificacoesDe(lead?.classification));
  useEffect(() => {
    setClassificacao(classificacoesDe(lead?.classification));
  }, [lead?.id, lead?.classification]);

  /**
   * Grava o conjunto inteiro de classificações. Escreve na FONTE pelo id de
   * origem — a linha do bolsão é espelho, atualizada por trigger.
   */
  const salvarClassificacao = async (valores: string[]) => {
    if (!lead || !tenantId || tenantId === 'owner') return;
    const anterior = classificacao;
    setClassificacao(valores);                       // otimista
    const [tabela, coluna] = lead.source_kenlo_id
      ? ['kenlo_leads', lead.source_kenlo_id]
      : ['leads', lead.source_lead_id];
    if (!coluna) {
      toast({
        title: 'Lead sem origem',
        description: 'Linha antiga do bolsão, anterior ao espelhamento.',
        variant: 'destructive',
      });
      setClassificacao(anterior);
      return;
    }
    const { error } = await supabase
      .from(tabela)
      .update({ classification: valores })           // source é carimbado por trigger
      .eq('id', coluna)
      .eq('tenant_id', tenantId)
      // .select().single() é o guard: um UPDATE que não casa nenhuma linha
      // (ex.: coluna aponta pra tabela errada) devolve sucesso silencioso sem
      // isto — 0 linhas afetadas não é erro pro Postgres/PostgREST. Com
      // .single(), 0 (ou >1) linhas vira `error`, cai no if abaixo.
      .select()
      .single();
    if (error) {
      setClassificacao(anterior);                    // desfaz o otimismo
      toast({ title: 'Erro ao classificar', description: error.message, variant: 'destructive' });
    }
  };

  // Preferências do lead (o que o cliente procura) — mesmo desenho otimista da
  // classificação. Eixo diferente: aqui é texto livre e não decide nada.
  const [preferencias, setPreferencias] = useState<string[]>(preferenciasDe(lead?.preferences));
  useEffect(() => {
    setPreferencias(preferenciasDe(lead?.preferences));
  }, [lead?.id, lead?.preferences]);

  /** Grava o conjunto inteiro na tabela FONTE, pelo id de origem. */
  const salvarPreferencias = async (valores: string[]) => {
    if (!lead || !tenantId || tenantId === 'owner') return;
    const anterior = preferencias;
    setPreferencias(valores);                        // otimista
    const [tabela, coluna] = lead.source_kenlo_id
      ? ['kenlo_leads', lead.source_kenlo_id]
      : ['leads', lead.source_lead_id];
    if (!coluna) {
      toast({
        title: 'Lead sem origem',
        description: 'Linha antiga do bolsão, anterior ao espelhamento.',
        variant: 'destructive',
      });
      setPreferencias(anterior);
      return;
    }
    const { error } = await supabase
      .from(tabela)
      // Array vazio vira NULL: o CHECK da 20260819 recusa `{}` de propósito —
      // "sem preferência" tem uma representação só.
      .update({ preferences: valores.length ? valores : null })
      .eq('id', coluna)
      .eq('tenant_id', tenantId)
      // Mesmo guard do salvarClassificacao: sem .single(), UPDATE que não casa
      // nenhuma linha devolve sucesso silencioso.
      .select()
      .single();
    if (error) {
      setPreferencias(anterior);                     // desfaz o otimismo
      toast({ title: 'Erro ao salvar preferências', description: error.message, variant: 'destructive' });
    }
  };

  // Buscar imóvel quando o modal abrir.
  // Catálogo do tenant (XML + imoveis_locais). O kenloService que ficava aqui
  // lia um XML estático de outra base e dizia "não encontrado" para código que
  // existe na aba Imóveis.
  useEffect(() => {
    if (isOpen && lead?.codigo && tenantId) {
      setCarregandoImovel(true);
      fetchImovelDoTenantPorCodigo(tenantId, lead.codigo)
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
  }, [isOpen, lead?.codigo, tenantId]);
  
  const chatPath = useChatPath(lead?.lead, lead?.nomedolead);

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
              {/* Link da conversa aqui em cima, com a identificação do lead: é o
                  que se copia para mandar a alguém, não um dado a consultar. */}
              <ConversationLinkField
                phone={lead.lead}
                contactName={lead.nomedolead}
                className="mt-2"
              />
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

            {/* Conversa WhatsApp — deep-link para o chat da Lia com este lead. */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-5 w-5 text-emerald-500" />
                <span className="font-bold text-sm text-muted-foreground">Conversa WhatsApp</span>
              </div>
              {chatPath ? (
                <Link
                  to={chatPath}
                  className="text-lg font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Abrir conversa
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Sem conversa disponível</p>
              )}
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

            {/* Classificação */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-5 w-5 text-violet-500" />
                <span className="font-bold text-sm text-muted-foreground">Classificação</span>
              </div>
              <div className="flex flex-wrap items-center gap-2" data-testid="classificacao-controle">
                {/* Botões de marcar/desmarcar, não Select: um lead pode ser
                    Lançamento E Locação (migration 20260818). Rótulos vêm do
                    vocabulário compartilhado — não repetir aqui, senão vira uma
                    cópia que diverge do CHECK do banco em silêncio. */}
                {CLASSIFICACAO_ORDEM.map((tipo) => {
                  const marcada = classificacao.includes(tipo);
                  return (
                    <button
                      key={tipo}
                      type="button"
                      aria-pressed={marcada}
                      onClick={() => salvarClassificacao(toggleClassificacao(classificacao, tipo))}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-all ${
                        marcada
                          ? CLASSIFICACAO_ESTILOS[tipo].className
                          : 'bg-transparent border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {CLASSIFICACAO_ESTILOS[tipo].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preferências — o que o cliente procura */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-5 w-5 text-sky-500" />
                <span className="font-bold text-sm text-muted-foreground">Preferências</span>
              </div>
              <PreferenciasEditor valor={preferencias} onChange={salvarPreferencias} />
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
              {/* Data de Entrada — data real do lead (event time), não a de import */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Data de Entrada</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatarData(lead.event_at || lead.created_at)}
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

          {/* Atividades — mesma section do card do lead no Kanban. O Bolsão
              identifica lead por inteiro próprio (`bolsao.id`); quando a linha
              espelha um lead do CRM, `source_lead_id` dá o uuid e o vínculo vira
              a FK de verdade. */}
          {podecriarAtividade && user?.email && tenantId && tenantId !== 'owner' && (
            <div className="border-t pt-4">
              <AtividadesLeadSection
                vinculo={
                  lead.source_lead_id
                    ? { coluna: 'lead_uuid', valor: lead.source_lead_id }
                    : { coluna: 'lead_id', valor: lead.id }
                }
                leadNome={lead.nomedolead}
                leadTelefone={lead.lead}
                tenantId={tenantId}
                corretorEmail={user.email}
                imovelRef={lead.codigo}
                onCriada={async (tipo) => {
                  const etapa = etapaAposAtividade(tipo, lead.status);
                  if (!etapa || !onAtualizarStatusLead) return;
                  await onAtualizarStatusLead(lead.id, etapa);
                  toast({
                    title: '📍 Lead movido!',
                    description: 'Lead movido para etapa "Visita Agendada"',
                    className: 'bg-blue-500/10 border-blue-500/50',
                  });
                }}
                ativo={isOpen}
              />
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

            {lead && mostrarRecomendacoes && (
              <Button
                onClick={() => setRecomendacoesOpen(true)}
                variant="outline"
                className="text-purple-600 border-purple-300 hover:bg-purple-50 hover:border-purple-400 dark:text-purple-400"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enviar Recomendações
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
      {/* Modal de Envio de Recomendações */}
      {lead && mostrarRecomendacoes && (
        <EnviarRecomendacoesModal
          lead={bolsaoLeadToRecommendationInput(lead)}
          isOpen={recomendacoesOpen}
          onClose={() => setRecomendacoesOpen(false)}
        />
      )}
    </Dialog>
  );
};
