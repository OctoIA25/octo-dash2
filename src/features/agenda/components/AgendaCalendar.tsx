/**
 * Agenda Calendar - Calendário visual moderno para o corretor
 * Design harmonioso com o restante do dashboard
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Plus,
  Home,
  Phone,
  CheckCircle2,
  User,
  MapPin,
  Filter,
  X,
  Sparkles,
  AlertCircle,
  Flag,
  Edit2,
  Trash2,
  RotateCcw
} from 'lucide-react';

const GOOGLE_LOGO_URL = 'https://i.ibb.co/PGPcZyPw/google-lens-icon-logo-symbol-free-png.webp';

import { useAuth } from "@/hooks/useAuth";
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';
import { useImoveisData } from '@/features/imoveis/hooks/useImoveisData';
import { useTarefas } from '@/hooks/useTarefas';
import { ComboBox } from '@/components/ui/combobox';
import { ImoveisComboBox } from '@/components/ui/imovel-combobox';
import { eventoToSupabase, supabaseToEvento, AgendaQueries } from '../services/agendaSupabaseService';
import { hasAnyPendingBlockingActivity, unblockCorretor } from '@/features/corretores/services/activityBlockingService';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Evento {
  id: string;
  titulo: string;
  descricao?: string;
  data: Date;
  horario?: string;
  tipo: 'visita_agendada' | 'visita_realizada' | 'visita_nao_realizada' | 'retornar_cliente' | 'reuniao' | 'tarefa' | 'outro';
  status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado';
  leadNome?: string;
  leadTelefone?: string;
  imovelRef?: string;
  imovelTitulo?: string;
  prioridade?: 'alta' | 'media' | 'baixa';
  recorrencia?: 'nenhuma' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'anual';
}

// Project ID do Supabase
const SUPABASE_PROJECT_ID = 'icpgzclbhhfmavihtetf';

const criarEventoExemploVisitaAtraso = (): Evento => {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  return {
    id: 'exemplo-visita-atraso',
    titulo: 'Visita em atraso',
    descricao: 'Exemplo: visita agendada que ainda não foi concluída.',
    data: ontem,
    horario: '10:00',
    tipo: 'visita_agendada',
    status: 'pendente',
    prioridade: 'alta',
    leadNome: 'Cliente Exemplo',
    leadTelefone: '(11) 99999-9999',
    imovelRef: 'AP0000',
    imovelTitulo: 'Imóvel Exemplo'
  };
};

export type AgendaCalendarProps = {
  corretorEmail?: string;
};

export const AgendaCalendar = ({ corretorEmail }: AgendaCalendarProps) => {
  const { user, tenantId, isAdmin } = useAuth();
  const { leads } = useLeadsData();
  const { imoveis = [] } = useImoveisData(); // Garantir que seja array
  const { tarefas } = useTarefas();
  const { isConnected, isLoading: googleLoading, connectGoogleCalendar, disconnect, syncEvent, syncAllEvents, isSyncing } = useGoogleCalendar();

  const emailParaOperacao = corretorEmail || user?.email;

  const handleSyncGoogleCalendar = async () => {
    try {
      await syncAllEvents();
    } finally {
      await carregarEventosDoSupabase();
    }
  };
  
  const [mesAtual, setMesAtual] = useState(new Date());
  const [diaHover, setDiaHover] = useState<number | null>(null);
  const [diaPopoverAberto, setDiaPopoverAberto] = useState<string | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const popoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'visita_agendada' | 'visita_realizada' | 'visita_nao_realizada' | 'retornar_cliente' | 'reuniao' | 'tarefa' | 'outro'>('todos');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<'todos' | 'alta' | 'media' | 'baixa'>('todos');
  const [criarEventoOpen, setCriarEventoOpen] = useState(false);
  const [editarEventoOpen, setEditarEventoOpen] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<Evento | null>(null);
  const [detalhesEventoOpen, setDetalhesEventoOpen] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState<Evento | null>(null);
  const [eventosConcluídosExpanded, setEventosConcluídosExpanded] = useState(false);
  const [confirmarExclusaoOpen, setConfirmarExclusaoOpen] = useState(false);
  const [eventoParaExcluir, setEventoParaExcluir] = useState<Evento | null>(null);
  
  // Eventos customizados salvos
  const [eventosCustomizados, setEventosCustomizados] = useState<Evento[]>([]);
  const [carregandoEventos, setCarregandoEventos] = useState(false);
  
  // Estados do formulário de novo evento
  const [novoEvento, setNovoEvento] = useState({
    titulo: '',
    descricao: '',
    data: '',
    horario: '',
    tipo: 'outro' as Evento['tipo'],
    prioridade: 'media' as 'alta' | 'media' | 'baixa',
    recorrencia: 'nenhuma' as 'nenhuma' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'anual',
    leadNome: '',
    leadTelefone: '',
    imovelRef: '',
    imovelTitulo: ''
  });

  // Função para carregar eventos do Supabase (multitenant: por tenant + corretor)
  const carregarEventosDoSupabase = async () => {
    if (!emailParaOperacao || !tenantId || tenantId === 'owner') return;
    
    setCarregandoEventos(true);
    try {
      
      const { data, error } = await supabase
        .from('agenda_eventos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('corretor_email', emailParaOperacao)
        .order('data', { ascending: true })
        .order('horario', { ascending: true });
      
      if (error) {
        console.error('❌ Erro Supabase:', error);
        throw error;
      }
      
      if (data && Array.isArray(data)) {
        const eventosConvertidos = data.map((e: any) => supabaseToEvento(e));
        if (eventosConvertidos.length === 0) {
          setEventosCustomizados([criarEventoExemploVisitaAtraso()]);
        } else {
          setEventosCustomizados(eventosConvertidos);
        }
      } else {
        setEventosCustomizados([criarEventoExemploVisitaAtraso()]);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar eventos:', error);
      toast.error('Erro ao carregar eventos da agenda');
      setEventosCustomizados([]);
    } finally {
      setCarregandoEventos(false);
    }
  };

  // Carregar eventos ao iniciar
  useEffect(() => {
    carregarEventosDoSupabase();
  }, [corretorEmail, user?.email, tenantId]);

  // Removido: Não precisamos mais salvar no localStorage
  // Tudo é gerenciado pelo Supabase

  // Forçar cores via DOM após render - SOLUÇÃO DEFINITIVA
  useEffect(() => {
    const aplicarCoresCalendario = () => {
      setTimeout(() => {
        const botoesDias = document.querySelectorAll('[data-evento-prioridade]');
        botoesDias.forEach(button => {
          const prioridadeEvento = button.getAttribute('data-evento-prioridade');
          if (prioridadeEvento && prioridadeEvento !== 'nenhuma') {
            let cor = '#ffffff';
            switch (prioridadeEvento) {
              case 'alta': cor = '#FFF1F1'; break;
              case 'media': cor = '#FFF7F0'; break;
              case 'baixa': cor = '#FFFEF0'; break;
            }
            (button as HTMLElement).style.setProperty('background-color', cor, 'important');
            (button as HTMLElement).style.setProperty('background', cor, 'important');
            (button as HTMLElement).style.setProperty('background-image', 'none', 'important');
          }
        });
      }, 100);
    };
    
    aplicarCoresCalendario();
  }, [eventosCustomizados, mesAtual, diaSelecionado]);

  // Gerar eventos baseados APENAS em eventos customizados
  // Removemos a geração automática de leads e tarefas para dar controle total ao usuário
  const eventos = useMemo((): Evento[] => {
    const items: Evento[] = [...eventosCustomizados];
    return items.sort((a, b) => a.data.getTime() - b.data.getTime());
  }, [eventosCustomizados]);

  // Calendário do mês
  const diasDoMes = useMemo(() => {
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    
    const diasAnteriores = primeiroDia.getDay();
    const totalDias = ultimoDia.getDate();
    
    const dias: (Date | null)[] = [];
    
    // Dias do mês anterior (vazios)
    for (let i = 0; i < diasAnteriores; i++) {
      dias.push(null);
    }
    
    // Dias do mês atual
    for (let dia = 1; dia <= totalDias; dia++) {
      dias.push(new Date(ano, mes, dia));
    }
    
    return dias;
  }, [mesAtual]);

  // Eventos por dia
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, Evento[]>();
    
    eventos.forEach(evento => {
      const key = evento.data.toDateString();
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(evento);
    });
    
    return map;
  }, [eventos]);

  // Todos os eventos com filtros aplicados
  const eventosFiltrados = useMemo(() => {
    let eventosParaFiltrar = [...eventos];
    
    // Filtrar por tipo
    if (tipoFiltro !== 'todos') {
      eventosParaFiltrar = eventosParaFiltrar.filter(evento => evento.tipo === tipoFiltro);
    }
    
    // Filtrar por prioridade
    if (prioridadeFiltro !== 'todos') {
      eventosParaFiltrar = eventosParaFiltrar.filter(evento => evento.prioridade === prioridadeFiltro);
    }
    
    return eventosParaFiltrar;
  }, [eventos, tipoFiltro, prioridadeFiltro]);

  // Separar eventos pendentes e concluídos
  const eventosPendentes = useMemo(() => {
    return eventosFiltrados.filter(evento => evento.status !== 'concluido');
  }, [eventosFiltrados]);

  const eventosConcluidos = useMemo(() => {
    return eventosFiltrados.filter(evento => evento.status === 'concluido');
  }, [eventosFiltrados]);

  // Data de hoje para comparações
  const hoje = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  // Eventos atrasados (pendentes de dias anteriores)
  const eventosAtrasados = useMemo(() => {
    return eventosPendentes.filter(evento => {
      const dataEvento = new Date(evento.data);
      dataEvento.setHours(0, 0, 0, 0);
      return dataEvento.getTime() < hoje.getTime();
    });
  }, [eventosPendentes, hoje]);

  // Eventos próximos (hoje e futuro, não concluídos)
  const eventosProximos = useMemo(() => {
    return eventosPendentes.filter(evento => {
      const dataEvento = new Date(evento.data);
      dataEvento.setHours(0, 0, 0, 0);
      return dataEvento.getTime() >= hoje.getTime();
    });
  }, [eventosPendentes, hoje]);

  const navegarMes = (direcao: 'anterior' | 'proximo') => {
    const novoMes = new Date(mesAtual);
    novoMes.setMonth(mesAtual.getMonth() + (direcao === 'proximo' ? 1 : -1));
    setMesAtual(novoMes);
  };

  const voltarHoje = () => {
    const dataHoje = new Date();
    setMesAtual(dataHoje);
    setDiaSelecionado(dataHoje);
    setDatePickerOpen(false);
  };

  const selecionarDataCustomizada = (date: Date | undefined) => {
    if (date) {
      setMesAtual(date);
      setDiaSelecionado(date);
      setDatePickerOpen(false);
    }
  };

  const abrirCriarEvento = () => {
    setNovoEvento({
      titulo: '',
      descricao: '',
      data: diaSelecionado?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      horario: '',
      tipo: 'outro',
      prioridade: 'media',
      recorrencia: 'nenhuma',
      leadNome: '',
      leadTelefone: '',
      imovelRef: '',
      imovelTitulo: ''
    });
    setCriarEventoOpen(true);
  };

  const abrirDetalhes = (evento: Evento) => {
    setEventoSelecionado(evento);
    setDetalhesEventoOpen(true);
  };

  const abrirEditarEvento = (evento: Evento) => {
    setEventoEditando(evento);
    setNovoEvento({
      titulo: evento.titulo,
      descricao: evento.descricao || '',
      data: evento.data.toISOString().split('T')[0],
      horario: evento.horario || '',
      tipo: evento.tipo,
      prioridade: evento.prioridade || 'media',
      recorrencia: evento.recorrencia || 'nenhuma',
      leadNome: evento.leadNome || '',
      leadTelefone: evento.leadTelefone || '',
      imovelRef: evento.imovelRef || '',
      imovelTitulo: evento.imovelTitulo || ''
    });
    setDetalhesEventoOpen(false); // Fechar detalhes ao abrir edição
    setEditarEventoOpen(true);
  };

  const handleCriarEvento = async () => {
    
    if (!emailParaOperacao || !tenantId || tenantId === 'owner') {
      toast.error('Usuário não autenticado ou tenant não selecionado');
      return;
    }

    try {
      // Preparar dados para Supabase - SEM campos obrigatórios (multitenant)
      const tituloFinal = novoEvento.titulo?.trim() || 'Evento sem nome';
      
      const eventoParaSalvar = {
        tenant_id: tenantId,
        corretor_email: emailParaOperacao,
        corretor_id: user?.id || user?.name || '',
        titulo: tituloFinal,
        descricao: novoEvento.descricao?.trim() || null,
        data: novoEvento.data || new Date().toISOString().split('T')[0], // Data padrão = hoje
        horario: novoEvento.horario || null,
        tipo: novoEvento.tipo || 'outro',
        status: 'pendente',
        prioridade: novoEvento.prioridade || 'media',
        recorrencia: novoEvento.recorrencia || 'nenhuma',
        lead_nome: novoEvento.leadNome?.trim() || null,
        lead_telefone: novoEvento.leadTelefone?.trim() || null,
        imovel_ref: novoEvento.imovelRef?.trim() || null,
        imovel_titulo: novoEvento.imovelTitulo?.trim() || null
      };
      
      
      const { data, error } = await supabase
        .from('agenda_eventos')
        .insert([eventoParaSalvar])
        .select();
      
      if (error) {
        console.error('❌ Erro Supabase:', error);
        console.error('Detalhes do erro:', error.message, error.details);
        throw new Error(`Erro ao salvar: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        throw new Error('Nenhum dado retornado do Supabase');
      }
      
      
      // Sincronizar com Google Calendar se conectado
      if (isConnected && data[0]) {
        try {
          await syncEvent(data[0], 'create');
        } catch (syncError) {
          console.error('⚠️ Erro ao sincronizar com Google Calendar:', syncError);
        }
      }
      
      toast.success('Evento criado com sucesso!', {
        description: `${tituloFinal} adicionado à sua agenda`
      });
      
      // Recarregar eventos do Supabase
      await carregarEventosDoSupabase();
      
      setCriarEventoOpen(false);
      setNovoEvento({
        titulo: '',
        descricao: '',
        data: new Date().toISOString().split('T')[0],
        horario: '',
        tipo: 'outro',
        prioridade: 'media',
        recorrencia: 'nenhuma',
        leadNome: '',
        leadTelefone: '',
        imovelRef: '',
        imovelTitulo: ''
      });
    } catch (error) {
      console.error('❌ Erro ao criar evento:', error);
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao criar evento', {
        description: mensagem
      });
    }
  };

  const handleEditarEvento = async () => {
    if (!eventoEditando || !user?.email) {
      toast.error('Erro ao atualizar evento');
      return;
    }

    try {
      // Preparar dados para Supabase - SEM campos obrigatórios
      const tituloFinal = novoEvento.titulo?.trim() || 'Evento sem nome';
      
      const eventoParaAtualizar = {
        titulo: tituloFinal,
        descricao: novoEvento.descricao?.trim() || null,
        data: novoEvento.data || new Date().toISOString().split('T')[0],
        horario: novoEvento.horario || null,
        tipo: novoEvento.tipo || 'outro',
        prioridade: novoEvento.prioridade || 'media',
        recorrencia: novoEvento.recorrencia || 'nenhuma',
        lead_nome: novoEvento.leadNome?.trim() || null,
        lead_telefone: novoEvento.leadTelefone?.trim() || null,
        imovel_ref: novoEvento.imovelRef?.trim() || null,
        imovel_titulo: novoEvento.imovelTitulo?.trim() || null
      };
      
      
      const { error } = await supabase
        .from('agenda_eventos')
        .update(eventoParaAtualizar)
        .eq('id', eventoEditando.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', emailParaOperacao);
      
      if (error) {
        console.error('❌ Erro Supabase:', error);
        throw new Error(`Erro ao atualizar: ${error.message}`);
      }
      
      
      // Sincronizar com Google Calendar se conectado
      if (isConnected && eventoEditando) {
        try {
          await syncEvent({...eventoEditando, ...eventoParaAtualizar}, 'update');
        } catch (syncError) {
          console.error('⚠️ Erro ao sincronizar com Google Calendar:', syncError);
        }
      }
      
      toast.success('Evento atualizado com sucesso!', {
        description: tituloFinal
      });
      
      // Recarregar eventos do Supabase
      await carregarEventosDoSupabase();
      
      setEditarEventoOpen(false);
      setEventoEditando(null);
      setNovoEvento({
        titulo: '',
        descricao: '',
        data: new Date().toISOString().split('T')[0],
        horario: '',
        tipo: 'outro',
        prioridade: 'media',
        recorrencia: 'nenhuma',
        leadNome: '',
        leadTelefone: '',
        imovelRef: '',
        imovelTitulo: ''
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error);
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao atualizar evento', {
        description: mensagem
      });
    }
  };

  const toggleStatus = async (evento: Evento) => {
    if (!user?.email) {
      toast.error('Usuário não autenticado');
      return;
    }

    try {
      const novoStatus = evento.status === 'concluido' ? 'pendente' : 'concluido';
      
      
      const { error } = await supabase
        .from('agenda_eventos')
        .update({ status: novoStatus })
        .eq('id', evento.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', emailParaOperacao);
      
      if (error) {
        console.error('❌ Erro Supabase:', error);
        throw error;
      }

      if (novoStatus === 'concluido' && (evento.tipo === 'retornar_cliente' || evento.tipo === 'visita_agendada') && tenantId && tenantId !== 'owner' && emailParaOperacao) {
        const stillHas = await hasAnyPendingBlockingActivity(tenantId, emailParaOperacao);
        if (!stillHas) {
          await unblockCorretor(tenantId, emailParaOperacao);
          toast.success('Evento concluído! Corretor desbloqueado do recebimento de leads.');
        } else {
          toast.success('Evento marcado como concluído!');
        }
      } else {
        toast.success(novoStatus === 'concluido' ? 'Evento marcado como concluído!' : 'Evento marcado como pendente!');
      }

      await carregarEventosDoSupabase();
      setDetalhesEventoOpen(false);
      setEventoSelecionado(null);
    } catch (error) {
      console.error('❌ Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status do evento');
    }
  };

  const confirmarExclusao = (evento: Evento) => {
    setEventoParaExcluir(evento);
    setConfirmarExclusaoOpen(true);
  };

  const excluirEvento = async () => {
    if (!eventoParaExcluir || !user?.email) return;

    const isBlockingType = eventoParaExcluir.tipo === 'retornar_cliente' || eventoParaExcluir.tipo === 'visita_agendada';
    const eventDate = new Date(eventoParaExcluir.data);
    if (eventoParaExcluir.horario && /^\d{2}:\d{2}/.test(eventoParaExcluir.horario)) {
      const [hh, mm] = eventoParaExcluir.horario.split(':').map(Number);
      eventDate.setHours(hh || 0, mm || 0, 0, 0);
    } else {
      eventDate.setHours(23, 59, 59, 999);
    }
    const isPast = eventDate.getTime() < Date.now();
    if (isBlockingType && isPast && !isAdmin) {
      toast.error('Após o prazo do evento, apenas o gestor pode excluir esta atividade.');
      setConfirmarExclusaoOpen(false);
      setEventoParaExcluir(null);
      return;
    }

    try {

      let q = supabase
        .from('agenda_eventos')
        .delete()
        .eq('id', eventoParaExcluir.id)
        .eq('tenant_id', tenantId);
      if (!isAdmin) {
        q = q.eq('corretor_email', emailParaOperacao);
      }
      const { error } = await q;

      if (error) {
        console.error('❌ Erro Supabase:', error);
        throw error;
      }

      
      // Sincronizar exclusão com Google Calendar
      if (isConnected && eventoParaExcluir.google_event_id) {
        try {
          await syncEvent(eventoParaExcluir, 'delete');
        } catch (syncError) {
          console.error('⚠️ Erro ao remover do Google Calendar:', syncError);
        }
      }

      toast.success('Evento excluído com sucesso!');
      
      // Recarregar eventos do Supabase
      await carregarEventosDoSupabase();
      
      // Fechar modais
      setConfirmarExclusaoOpen(false);
      setDetalhesEventoOpen(false);
      setEventoParaExcluir(null);
    } catch (error) {
      console.error('❌ Erro ao excluir evento:', error);
      toast.error('Erro ao excluir evento do Supabase');
    }
  };

  const limparTodosEventos = async () => {
    if (!user?.email) return;
    
    if (window.confirm('Tem certeza que deseja excluir TODOS os eventos? Esta ação não pode ser desfeita.')) {
      try {
        
        const { error } = await supabase
          .from('agenda_eventos')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('corretor_email', emailParaOperacao);
        
        if (error) {
          console.error('❌ Erro Supabase:', error);
          throw error;
        }
        
        const count = eventosCustomizados.length;
        await carregarEventosDoSupabase();
        
        toast.success(`Todos os eventos foram excluídos! (${count} eventos removidos)`);
      } catch (error) {
        console.error('❌ Erro ao excluir eventos:', error);
        toast.error('Erro ao excluir eventos do Supabase');
      }
    }
  };

  const getCorTipo = (tipo: Evento['tipo']) => {
    switch (tipo) {
      case 'visita_agendada':
        return 'bg-cyan-100 dark:bg-cyan-900/20';
      case 'visita_realizada':
        return 'bg-green-100 dark:bg-green-900/20';
      case 'visita_nao_realizada':
        return 'bg-red-100 dark:bg-red-900/20';
      case 'retornar_cliente':
        return 'bg-blue-100 dark:bg-blue-900/20';
      case 'reuniao':
        return 'bg-gray-100 dark:bg-gray-800/50';
      case 'tarefa':
        return 'bg-gray-100 dark:bg-gray-800/50';
      case 'outro':
        return 'bg-gray-100 dark:bg-gray-800/50';
      default:
        return 'bg-gray-100 dark:bg-gray-800/50';
    }
  };

  const getIconeTipo = (tipo: Evento['tipo']) => {
    switch (tipo) {
      case 'visita_agendada':
        return CalendarIcon;
      case 'visita_realizada':
        return CheckCircle2;
      case 'visita_nao_realizada':
        return X;
      case 'retornar_cliente':
        return Phone;
      case 'reuniao':
        return User;
      case 'tarefa':
        return CheckCircle2;
      case 'outro':
        return CalendarIcon;
      default:
        return CalendarIcon;
    }
  };

  const getNomeTipo = (tipo: Evento['tipo']) => {
    switch (tipo) {
      case 'visita_agendada':
        return 'Visita Agendada';
      case 'visita_realizada':
        return 'Visita Realizada';
      case 'visita_nao_realizada':
        return 'Visita Não Realizada';
      case 'retornar_cliente':
        return 'Retornar Cliente';
      case 'reuniao':
        return 'Reunião';
      case 'tarefa':
        return 'Tarefa';
      case 'outro':
        return 'Outro';
      default:
        return tipo;
    }
  };

  // Cores de prioridade: gradiente de frio para quente (Alta=vermelho, Média=laranja, Baixa=amarelo)
  const getCorPrioridade = (prioridade?: 'alta' | 'media' | 'baixa') => {
    switch (prioridade) {
      case 'alta':
        return 'border-l-4 border-red-500';
      case 'media':
        return 'border-l-4 border-orange-500';
      case 'baixa':
        return 'border-l-4 border-yellow-400';
      default:
        return 'border-l-4 border-gray-300 dark:border-gray-600';
    }
  };

  const getBadgePrioridade = (prioridade?: 'alta' | 'media' | 'baixa') => {
    switch (prioridade) {
      case 'alta':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'media':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800';
      case 'baixa':
        return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    }
  };

  // Função auxiliar para filtrar próximos eventos sem duplicação (não usada mais)
  const filtrarProximosEventos = (eventos: Evento[]) => {
    // Mostrar próximos eventos: eventos >= hoje (incluindo hoje)
    return eventos.filter(e => {
      const dataEvento = new Date(e.data);
      dataEvento.setHours(0, 0, 0, 0);
      
      // Incluir se o evento é hoje ou no futuro
      return dataEvento.getTime() >= hoje.getTime();
    });
  };

  return (
    <div className="w-full max-w-full">
      {/* Header da seção seguindo padrão das outras abas */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">Agenda</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          {eventosCustomizados.length} {eventosCustomizados.length === 1 ? 'evento' : 'eventos'} • Gerencie seus compromissos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Coluna Esquerda: Agenda */}
        <div>
          {/* Card único com Filtros e Calendário */}
          <Card>
            <CardContent className="p-6">

              {/* Header do calendário com filtros integrados */}
              <div className="flex items-center justify-between mb-6">
                {/* Lado esquerdo: Título + Filtros */}
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-gray-900 dark:text-slate-100 capitalize whitespace-nowrap" style={{ fontSize: '29px' }}>
                    {mesAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </h2>
                  
                  {/* Filtros ao lado do título */}
                  <div className="flex items-center gap-1.5">
                  {/* Filtro Tipo de Atividade */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 px-2.5 dark:text-slate-300"
                      >
                        <Filter className="h-3.5 w-3.5 mr-1" />
                        Atividade
                        {tipoFiltro !== 'todos' && (
                          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>
                        )}
                        <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="start">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Tipo de atividade</h4>
                        <div className="space-y-1">
                          <Button
                            variant={tipoFiltro === 'todos' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('todos')}
                            className="w-full justify-start text-xs"
                          >
                            Todos
                          </Button>
                          <Button
                            variant={tipoFiltro === 'visita_agendada' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('visita_agendada')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-cyan-500 mr-2" />
                            Visita Agendada
                          </Button>
                          <Button
                            variant={tipoFiltro === 'visita_realizada' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('visita_realizada')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                            Visita Realizada
                          </Button>
                          <Button
                            variant={tipoFiltro === 'visita_nao_realizada' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('visita_nao_realizada')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                            Visita Não Realizada
                          </Button>
                          <Button
                            variant={tipoFiltro === 'retornar_cliente' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('retornar_cliente')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                            Retornar para o Cliente
                          </Button>
                          <Button
                            variant={tipoFiltro === 'reuniao' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('reuniao')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-purple-500 mr-2" />
                            Reunião
                          </Button>
                          <Button
                            variant={tipoFiltro === 'tarefa' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('tarefa')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                            Tarefa
                          </Button>
                          <Button
                            variant={tipoFiltro === 'outro' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setTipoFiltro('outro')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full bg-gray-500 mr-2" />
                            Outro
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Filtro Prioridade */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 px-2.5 dark:text-slate-300"
                      >
                        <Flag className="h-3.5 w-3.5 mr-1" />
                        Prioridade
                        {prioridadeFiltro !== 'todos' && (
                          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>
                        )}
                        <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-3" align="start">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Prioridade</h4>
                        <div className="space-y-1">
                          <Button
                            variant={prioridadeFiltro === 'todos' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setPrioridadeFiltro('todos')}
                            className="w-full justify-start text-xs"
                          >
                            Todas
                          </Button>
                          <Button
                            variant={prioridadeFiltro === 'alta' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setPrioridadeFiltro('alta')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#ef4444' }} />
                            Alta
                          </Button>
                          <Button
                            variant={prioridadeFiltro === 'media' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setPrioridadeFiltro('media')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#f97316' }} />
                            Média
                          </Button>
                          <Button
                            variant={prioridadeFiltro === 'baixa' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setPrioridadeFiltro('baixa')}
                            className="w-full justify-start text-xs"
                          >
                            <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#facc15' }} />
                            Baixa
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  </div>
                </div>

                {/* Lado direito: Navegação */}
                <div className="flex items-center gap-1.5">
                  {/* Botão Hoje */}
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 px-3 dark:text-slate-300"
                      >
                        <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                        Hoje
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            Ir para data
                          </h4>
                        </div>
                        
                        {/* Mini calendário de seleção */}
                        <div className="space-y-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={voltarHoje}
                          >
                            <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                            Hoje
                          </Button>
                          
                          {/* Input de data customizada */}
                          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-slate-800">
                            <label className="text-xs text-gray-600 dark:text-gray-400 block dark:text-slate-400">
                              Selecione uma data:
                            </label>
                            <input
                              type="date"
                              className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:text-slate-100"
                              value={diaSelecionado?.toISOString().split('T')[0] || ''}
                              onChange={(e) => {
                                const selectedDate = new Date(e.target.value + 'T12:00:00');
                                selecionarDataCustomizada(selectedDate);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navegarMes('anterior')}
                    className="h-8 w-8 p-0 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-bold text-base dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    ‹
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navegarMes('proximo')}
                    className="h-8 w-8 p-0 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 font-bold text-base dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    ›
                  </Button>
                </div>
              </div>

              {/* Dias da semana */}
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
                  <div
                    key={dia}
                    className="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider py-2 dark:text-slate-400"
                  >
                    {dia}
                  </div>
                ))}
              </div>

              {/* Grid de dias */}
              <div className="grid grid-cols-7 gap-1.5">
                {diasDoMes.map((dia, index) => {
                  if (!dia) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const key = dia.toDateString();
                  const eventosNoDia = eventosPorDia.get(key) || [];
                  const isHoje = dia.toDateString() === hoje.toDateString();
                  const isSelecionado = diaSelecionado?.toDateString() === key;
                  const isHover = diaHover === dia.getDate();
                  
                  // Gerar background inline style baseado na MAIOR PRIORIDADE entre os eventos do dia
                  const getBackgroundStyle = () => {
                    if (eventosNoDia.length === 0) {
                      return { 
                        backgroundColor: '#ffffff',
                        background: '#ffffff'
                      };
                    }
                    
                    // Encontrar o evento com maior prioridade no dia
                    const eventoMaiorPrioridade = eventosNoDia.reduce((eventoMax, eventoAtual) => {
                      const prioridadeAtual = eventoAtual.prioridade || 'baixa';
                      const prioridadeMax = eventoMax.prioridade || 'baixa';
                      
                      // Hierarquia: alta > media > baixa
                      const hierarquia = { 'alta': 3, 'media': 2, 'baixa': 1 };
                      
                      return hierarquia[prioridadeAtual] > hierarquia[prioridadeMax] ? eventoAtual : eventoMax;
                    });
                    
                    // Cores sólidas HEX no tom perfeito baseadas na MAIOR PRIORIDADE
                    let corClara = '';
                    switch (eventoMaiorPrioridade.prioridade) {
                      case 'alta':
                        corClara = '#FFF1F1'; // vermelho claro perfeito
                        break;
                      case 'media':
                        corClara = '#FFF7F0'; // laranja claro perfeito
                        break;
                      case 'baixa':
                        corClara = '#FFFEF0'; // amarelo claro perfeito
                        break;
                      default:
                        corClara = '#ffffff'; // branco se não tiver prioridade
                        break;
                    }
                    
                    return { 
                      backgroundColor: corClara,
                      background: corClara,
                      backgroundImage: 'none',
                      backgroundAttachment: 'initial',
                      backgroundRepeat: 'initial',
                      backgroundSize: 'initial',
                      backgroundPosition: 'initial'
                    };
                  };

                  return (
                    <Popover 
                      open={diaPopoverAberto === key && eventosNoDia.length > 0}
                      onOpenChange={(open) => {
                        if (!open) setDiaPopoverAberto(null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          key={key}
                          onClick={() => {
                            setDiaSelecionado(dia);
                            abrirCriarEvento();
                          }}
                          onMouseEnter={() => {
                            setDiaHover(dia.getDate());
                            if (popoverTimeoutRef.current) {
                              clearTimeout(popoverTimeoutRef.current);
                              popoverTimeoutRef.current = null;
                            }
                            if (eventosNoDia.length > 0) {
                              setDiaPopoverAberto(key);
                            }
                          }}
                          onMouseLeave={() => {
                            setDiaHover(null);
                            // Não fechar imediatamente, dar tempo para o mouse ir ao popover
                            popoverTimeoutRef.current = setTimeout(() => {
                              setDiaPopoverAberto(prev => prev === key ? null : prev);
                            }, 150);
                          }}
                          className={`
                            aspect-square p-2 rounded-lg text-sm font-medium transition-all duration-200
                            ${isHoje ? 'ring-1 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900' : ''}
                            ${isSelecionado 
                              ? 'shadow-md scale-105 ring-2 ring-blue-600' 
                              : ''
                            }
                            ${isHover && !isSelecionado ? 'scale-105' : ''}
                          `}
                          style={{
                            ...getBackgroundStyle(),
                            ...(isSelecionado ? { borderColor: '#2563eb', borderWidth: '4px', borderStyle: 'solid' } : {})
                          }}
                          data-evento-prioridade={eventosNoDia.length > 0 ? 
                            eventosNoDia.reduce((eventoMax, eventoAtual) => {
                              const prioridadeAtual = eventoAtual.prioridade || 'baixa';
                              const prioridadeMax = eventoMax.prioridade || 'baixa';
                              const hierarquia = { 'alta': 3, 'media': 2, 'baixa': 1 };
                              return hierarquia[prioridadeAtual] > hierarquia[prioridadeMax] ? eventoAtual : eventoMax;
                            }).prioridade || 'nenhuma' : 'nenhuma'}
                        >
                          <div className="flex flex-col items-center justify-center h-full gap-1">
                            {/* Número do dia - CENTRO */}
                            <span className={`font-semibold text-base ${isSelecionado ? 'text-[#2563eb] dark:text-blue-100' : 'text-gray-900 dark:text-white'}`}>
                              {dia.getDate()}
                            </span>
                            
                            {/* Bolinhas indicadoras - Abaixo do número */}
                            {eventosNoDia.length > 0 && (
                              <div className="flex gap-1 items-center justify-center">
                                {eventosNoDia.slice(0, 3).map((evento) => {
                                  const corNormal = evento.tipo === 'visita_agendada' ? '#3b82f6' : 
                                                    evento.tipo === 'visita_realizada' ? '#06b6d4' :
                                                    evento.tipo === 'reuniao' ? '#a855f7' :
                                                    evento.tipo === 'tarefa' ? '#10b981' : '#6b7280';
                                  
                                  const corSelecionado = evento.tipo === 'visita_agendada' ? '#1e40af' : 
                                                         evento.tipo === 'visita_realizada' ? '#0e7490' :
                                                         evento.tipo === 'reuniao' ? '#7e22ce' :
                                                         evento.tipo === 'tarefa' ? '#047857' : '#374151';
                                  
                                  return (
                                    <div
                                      key={evento.id}
                                      className="w-1.5 h-1.5 rounded-full shadow-sm"
                                      style={{ backgroundColor: isSelecionado ? corSelecionado : corNormal }}
                                    />
                                  );
                                })}
                                {eventosNoDia.length > 3 && (
                                  <span className={`text-[9px] ml-0.5 font-medium ${isSelecionado ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                    +{eventosNoDia.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      </PopoverTrigger>
                      {eventosNoDia.length > 0 && (
                        <PopoverContent 
                          className="w-72 p-3" 
                          align="center" 
                          side="top"
                          onMouseEnter={() => {
                            if (popoverTimeoutRef.current) {
                              clearTimeout(popoverTimeoutRef.current);
                              popoverTimeoutRef.current = null;
                            }
                            setDiaPopoverAberto(key);
                          }}
                          onMouseLeave={() => setDiaPopoverAberto(null)}
                        >
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-gray-900 dark:text-slate-100 mb-2">
                              {eventosNoDia.length} {eventosNoDia.length === 1 ? 'Evento' : 'Eventos'}
                            </h4>
                            {eventosNoDia.map((evento) => {
                              const Icone = getIconeTipo(evento.tipo);
                              const cor = evento.tipo === 'visita_agendada' ? 'text-blue-600' : 
                                          evento.tipo === 'visita_realizada' ? 'text-cyan-600' :
                                          evento.tipo === 'reuniao' ? 'text-purple-600' :
                                          evento.tipo === 'tarefa' ? 'text-emerald-600' : 'text-gray-600';
                              
                              return (
                                <button 
                                  key={evento.id} 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirDetalhes(evento);
                                  }}
                                  className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-left dark:hover:bg-slate-800"
                                >
                                  <Icone className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cor}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate dark:text-slate-100">
                                      {evento.titulo}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {evento.horario && (
                                        <p className="text-[10px] text-gray-500 dark:text-slate-400">
                                          {evento.horario}
                                        </p>
                                      )}
                                      {evento.prioridade && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                          evento.prioridade === 'alta' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                          evento.prioridade === 'media' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        }`}>
                                          {evento.prioridade}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita: Eventos */}
        <div>
          {/* Card único seguindo padrão das outras abas */}
          <Card className="sticky top-4">
            <CardContent className="p-0">
              {/* Header simplificado */}
              <div className="mb-6 px-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2 dark:text-slate-100">
                    <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Eventos
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    {diaSelecionado ? (
                      diaSelecionado.toDateString() === hoje.toDateString()
                        ? 'Hoje'
                        : diaSelecionado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                    ) : 'Selecione um dia'} • {eventosFiltrados.length} {eventosFiltrados.length === 1 ? 'compromisso' : 'compromissos'}
                  </p>
                </div>
              </div>

              {/* Botão Criar Evento */}
              <div className="px-6 pb-4 border-b border-gray-200 dark:border-slate-800">
                <Button 
                  onClick={abrirCriarEvento}
                  variant="outline"
                  className="w-full justify-center text-black dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:hover:bg-slate-800/60"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar evento
                </Button>
              </div>

              {/* Próximos eventos - Apenas eventos pendentes */}
              <div className="py-4 space-y-3 max-h-[600px] overflow-y-auto">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 px-6 dark:text-slate-100">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Próximos Eventos ({eventosProximos.length})
                </h4>
                <div className="space-y-3 px-6">
                  {eventosProximos
                    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
                    .slice(0, 10)
                    .map(evento => {
                      const Icone = getIconeTipo(evento.tipo);
                      const dataEvento = new Date(evento.data);
                      const isHoje = dataEvento.toDateString() === hoje.toDateString();
                      const isAmanha = dataEvento.toDateString() === new Date(hoje.getTime() + 24 * 60 * 60 * 1000).toDateString();
                      
                      let labelData = '';
                      if (isHoje) {
                        labelData = 'Hoje';
                      } else if (isAmanha) {
                        labelData = 'Amanhã';
                      } else {
                        labelData = dataEvento.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                      }
                      
                      // Buscar imóvel se tiver referência
                      const imovel = evento.imovelRef ? imoveis.find(i => i.referencia === evento.imovelRef) : null;
                      const temFotoImovel = imovel?.fotos && imovel.fotos.length > 0;
                      
                      return (
                        <div 
                          key={evento.id} 
                          className="group p-5 rounded-xl border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                          onClick={() => abrirDetalhes(evento)}
                          style={{
                            background: evento.tipo === 'visita_agendada' ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(6, 182, 212, 0.03) 100%)' :
                                       evento.tipo === 'visita_realizada' ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%)' :
                                       evento.tipo === 'visita_nao_realizada' ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.03) 100%)' :
                                       evento.tipo === 'retornar_cliente' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%)' :
                                       evento.tipo === 'reuniao' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.03) 100%)' :
                                       evento.tipo === 'tarefa' ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%)' :
                                       'linear-gradient(135deg, rgba(107, 114, 128, 0.08) 0%, rgba(107, 114, 128, 0.03) 100%)'
                          }}
                        >
                          <div className="flex items-center gap-3.5">
                            {/* Foto do imóvel ou ícone do tipo */}
                            {temFotoImovel ? (
                              <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
                                <img 
                                  src={imovel.fotos[0]} 
                                  alt={evento.imovelTitulo || 'Imóvel'}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                                <Icone className="h-5 w-5 text-white" />
                              </div>
                            )}
                            
                            {/* Conteúdo principal */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white truncate dark:text-slate-100">
                                  {evento.titulo}
                                </h5>
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shadow-sm ${
                                  isHoje 
                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white' 
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                }`}>
                                  {labelData}
                                </span>
                              </div>
                              
                              {/* Informações secundárias - layout em coluna para evitar overflow */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                                  {/* Tipo */}
                                  <span>{getNomeTipo(evento.tipo)}</span>
                                  
                                  {/* Horário */}
                                  {evento.horario && (
                                    <>
                                      <span>•</span>
                                      <Clock className="h-3 w-3" />
                                      <span className="font-medium">{evento.horario}</span>
                                    </>
                                  )}
                                  
                                  {/* Prioridade */}
                                  {evento.prioridade && (
                                    <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                                      evento.prioridade === 'alta' 
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        : evento.prioridade === 'media'
                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    }`}>
                                      {evento.prioridade}
                                    </span>
                                  )}
                                </div>
                                
                                {/* Lead em linha separada se houver */}
                                {evento.leadNome && (
                                  <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                                    <User className="h-3 w-3" />
                                    <span className="truncate">{evento.leadNome}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  
                  {/* Estado vazio */}
                  {eventosProximos.length === 0 && (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3 dark:bg-slate-800">
                        <CalendarIcon className="h-6 w-6 text-gray-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        Nenhum evento próximo
                      </p>
                    </div>
                  )}
                </div>

                {/* Conecte Seu Google Agenda - card horizontal harmônico */}
                <div className="mt-6 pt-6 px-6 border-t border-gray-200 dark:border-slate-800">
                  <div className="rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-gray-800/50 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-row items-center justify-between gap-4 min-h-[72px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={GOOGLE_LOGO_URL}
                        alt="Google"
                        className="w-10 h-10 object-contain flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                          Conecte seu Google Agenda
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Sincronize eventos com o Google Calendar
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {googleLoading ? (
                        <div className="h-9 w-20 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : isConnected ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSyncGoogleCalendar}
                            disabled={isSyncing}
                            className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 font-medium dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300"
                          >
                            {isSyncing ? (
                              <>
                                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                Sincronizando...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                Sincronizar
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={disconnect}
                            className="bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-medium dark:bg-red-950/40 dark:border-red-900 dark:text-red-300"
                          >
                            Desconectar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={connectGoogleCalendar}
                          className="bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 border border-gray-300 dark:border-slate-600 text-black dark:text-slate-100 font-medium shadow-sm hover:text-black dark:hover:text-white"
                        >
                          Conectar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Seção Eventos Pendentes (Atrasados) */}
                {eventosAtrasados.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-800">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 px-6 dark:text-slate-100">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      Eventos Pendentes ({eventosAtrasados.length})
                    </h4>
                    <div className="space-y-3 px-6">
                      {eventosAtrasados
                        .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
                        .slice(0, 10)
                        .map(evento => {
                          const Icone = getIconeTipo(evento.tipo);
                          const dataEvento = new Date(evento.data);
                          
                          // Calcular dias de atraso
                          const diasAtraso = Math.floor((hoje.getTime() - dataEvento.getTime()) / (1000 * 60 * 60 * 24));
                          
                          // Buscar imóvel se tiver referência
                          const imovel = evento.imovelRef ? imoveis.find(i => i.referencia === evento.imovelRef) : null;
                          const temFotoImovel = imovel?.fotos && imovel.fotos.length > 0;
                          
                          return (
                            <div 
                              key={evento.id} 
                              className="group p-5 rounded-xl border-2 border-red-200/60 dark:border-red-800/60 hover:border-red-400 dark:hover:border-red-600 hover:shadow-md cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                              onClick={() => abrirDetalhes(evento)}
                              style={{
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.04) 100%)'
                              }}
                            >
                              <div className="flex items-center gap-3.5">
                                {/* Foto do imóvel ou ícone do tipo */}
                                {temFotoImovel ? (
                                  <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden shadow-sm ring-2 ring-red-300 dark:ring-red-700">
                                    <img 
                                      src={imovel.fotos[0]} 
                                      alt={evento.imovelTitulo || 'Imóvel'}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm">
                                    <Icone className="h-5 w-5 text-white" />
                                  </div>
                                )}
                                
                                {/* Conteúdo principal */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-sm font-semibold text-gray-900 dark:text-white truncate dark:text-slate-100">
                                      {evento.titulo}
                                    </h5>
                                    <span className="text-xs px-2.5 py-1 rounded-full font-medium shadow-sm bg-gradient-to-r from-red-500 to-red-600 text-white">
                                      {diasAtraso === 1 ? 'Ontem' : `${diasAtraso} dias atrás`}
                                    </span>
                                  </div>
                                  
                                  {/* Informações secundárias */}
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                                      {/* Tipo */}
                                      <span>{getNomeTipo(evento.tipo)}</span>
                                      
                                      {/* Horário */}
                                      {evento.horario && (
                                        <>
                                          <span>•</span>
                                          <Clock className="h-3 w-3" />
                                          <span className="font-medium">{evento.horario}</span>
                                        </>
                                      )}
                                      
                                      {/* Prioridade */}
                                      {evento.prioridade && (
                                        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                                          evento.prioridade === 'alta' 
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            : evento.prioridade === 'media'
                                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        }`}>
                                          {evento.prioridade}
                                        </span>
                                      )}
                                    </div>
                                    
                                    {/* Lead em linha separada se houver */}
                                    {evento.leadNome && (
                                      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                                        <User className="h-3 w-3" />
                                        <span className="truncate">{evento.leadNome}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Seção Eventos Concluídos - Expansível */}
                {eventosConcluidos.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 px-6 dark:border-slate-800">
                    <button
                      onClick={() => setEventosConcluídosExpanded(!eventosConcluídosExpanded)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group dark:hover:bg-slate-800/60"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                          Eventos Concluídos ({eventosConcluidos.length})
                        </h4>
                      </div>
                      <ChevronDown 
                        className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                          eventosConcluídosExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {eventosConcluídosExpanded && (
                      <div className="mt-3 space-y-2 pb-6">
                        {eventosConcluidos
                          .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                          .slice(0, 5)
                          .map(evento => {
                            const Icone = getIconeTipo(evento.tipo);
                            const dataEvento = new Date(evento.data);
                            
                            // Buscar imóvel se tiver referência
                            const imovel = evento.imovelRef ? imoveis.find(i => i.referencia === evento.imovelRef) : null;
                            const temFotoImovel = imovel?.fotos && imovel.fotos.length > 0;
                            
                            return (
                              <div 
                                key={evento.id} 
                                className="group p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/40 hover:border-emerald-300 dark:hover:border-emerald-600 cursor-pointer transition-all duration-200 opacity-75 hover:opacity-100"
                                onClick={() => abrirDetalhes(evento)}
                              >
                                <div className="flex items-center gap-2.5">
                                  {/* Foto do imóvel ou ícone de check */}
                                  {temFotoImovel ? (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden shadow-sm ring-1 ring-emerald-200 dark:ring-emerald-800 relative">
                                      <img 
                                        src={imovel.fotos[0]} 
                                        alt={evento.imovelTitulo || 'Imóvel'}
                                        className="w-full h-full object-cover opacity-60"
                                      />
                                      <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center dark:bg-emerald-950/60">
                                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                  )}
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                      <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate line-through dark:text-slate-300">
                                        {evento.titulo}
                                      </h5>
                                      <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-2 dark:text-slate-400">
                                        {dataEvento.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-slate-400">
                                      <span>{getNomeTipo(evento.tipo)}</span>
                                      {evento.horario && (
                                        <>
                                          <span>•</span>
                                          <span>{evento.horario}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Criar Evento - Design Harmonioso */}
      <Dialog open={criarEventoOpen} onOpenChange={setCriarEventoOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-4 border-b border-gray-100 dark:border-gray-800 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Criar Novo Evento
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400 text-sm mt-1 dark:text-slate-400">
                  Adicione um compromisso à sua agenda
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Formulário */}
          <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto">
            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="titulo" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                Título do Evento
              </Label>
              <Input
                id="titulo"
                placeholder="Ex: Reunião com cliente, Visita ao imóvel..."
                value={novoEvento.titulo}
                onChange={(e) => setNovoEvento({ ...novoEvento, titulo: e.target.value })}
                className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:bg-slate-950 dark:border-slate-800"
              />
            </div>

            {/* Tipo e Prioridade em Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Tipo de Atividade */}
              <div className="space-y-2">
                <Label htmlFor="tipo" className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Atividade
                </Label>
                <div className="relative">
                  <select
                    id="tipo"
                    value={novoEvento.tipo}
                    onChange={(e) => {
                      setNovoEvento({ ...novoEvento, tipo: e.target.value as Evento['tipo'] });
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-transparent hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg appearance-none dark:border-slate-800 dark:text-slate-100"
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

              {/* Prioridade */}
              <div className="space-y-2">
                <Label htmlFor="prioridade" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <Flag className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                  Prioridade
                </Label>
                <div className="relative">
                  <select
                    id="prioridade"
                    value={novoEvento.prioridade}
                    onChange={(e) => {
                      setNovoEvento({ ...novoEvento, prioridade: e.target.value as 'alta' | 'media' | 'baixa' });
                    }}
                    className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-transparent hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg appearance-none dark:border-slate-800 dark:text-slate-100"
                  >
                    <option value="media">🟡 Média</option>
                    <option value="alta">🔴 Alta</option>
                    <option value="baixa">🟢 Baixa</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none dark:text-slate-500" />
                </div>
              </div>
            </div>

            {/* Data e Horário em Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Data
                </Label>
                <Input
                  id="data"
                  type="date"
                  value={novoEvento.data}
                  onChange={(e) => setNovoEvento({ ...novoEvento, data: e.target.value })}
                  className="h-11 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-transparent hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 shadow-sm hover:shadow-lg dark:border-slate-800"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="horario" className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Horário (opcional)
                </Label>
                <Input
                  id="horario"
                  type="time"
                  value={novoEvento.horario}
                  onChange={(e) => setNovoEvento({ ...novoEvento, horario: e.target.value })}
                  className="h-11 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-transparent hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 shadow-sm hover:shadow-lg dark:border-slate-800"
                />
              </div>
            </div>

            {/* Recorrência */}
            <div className="space-y-2">
              <Label htmlFor="recorrencia" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                <RotateCcw className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                Recorrência
              </Label>
              <div className="relative">
                <select
                  id="recorrencia"
                  value={novoEvento.recorrencia}
                  onChange={(e) => {
                    setNovoEvento({ ...novoEvento, recorrencia: e.target.value as 'nenhuma' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'anual' });
                  }}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-transparent hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg appearance-none dark:border-slate-800 dark:text-slate-100"
                >
                  <option value="nenhuma">🚫 Não repetir</option>
                  <option value="diaria">📅 Diariamente</option>
                  <option value="semanal">📆 Semanalmente</option>
                  <option value="quinzenal">🗓️ Quinzenalmente</option>
                  <option value="mensal">📋 Mensalmente</option>
                  <option value="anual">🎂 Anualmente</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none dark:text-slate-500" />
              </div>
            </div>

            {/* Imóvel e Contato em Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                  Imóvel
                </Label>
                <ImoveisComboBox
                  imoveis={imoveis}
                  value={novoEvento.imovelRef}
                  onChange={(value, imovel) => {
                    setNovoEvento({
                      ...novoEvento,
                      imovelRef: value,
                      imovelTitulo: imovel?.titulo || value
                    });
                  }}
                  placeholder="Selecione um imóvel (opcional)"
                  emptyText="Nenhum imóvel encontrado"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <User className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                  Contato/Lead
                </Label>
                <ComboBox
                  options={leads && leads.length > 0 ? leads
                    .filter(lead => 
                      lead.corretor_responsavel === user?.name
                    )
                    .map(lead => ({
                      value: lead.nome_lead,
                      label: lead.nome_lead,
                      sublabel: lead.telefone
                    })) : []}
                  value={novoEvento.leadNome}
                  onChange={(value) => {
                    const leadSelecionado = leads?.find(lead => lead.nome_lead === value);
                    setNovoEvento({
                      ...novoEvento,
                      leadNome: value,
                      leadTelefone: leadSelecionado?.telefone || ''
                    });
                  }}
                  placeholder="Digite ou selecione um lead"
                  emptyText="Nenhum lead encontrado"
                  allowCustom={true}
                  className="h-11"
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="descricao" className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Descrição (opcional)
              </Label>
              <Textarea
                id="descricao"
                placeholder="Adicione detalhes sobre o evento..."
                value={novoEvento.descricao}
                onChange={(e) => setNovoEvento({ ...novoEvento, descricao: e.target.value })}
                rows={3}
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 resize-none dark:bg-slate-950 dark:border-slate-800"
              />
            </div>
          </div>

          {/* Footer com botões */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCriarEventoOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCriarEvento}
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Evento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Editar Evento */}
      <Dialog open={editarEventoOpen} onOpenChange={setEditarEventoOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-4 border-b border-gray-100 dark:border-gray-800 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Edit2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Editar Evento
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400 text-sm mt-1 dark:text-slate-400">
                  Atualize as informações do seu compromisso
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Formulário */}
          <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto">
            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="titulo-edit" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                Título do Evento
              </Label>
              <Input
                id="titulo-edit"
                placeholder="Ex: Reunião com cliente, Visita ao imóvel..."
                value={novoEvento.titulo}
                onChange={(e) => setNovoEvento({ ...novoEvento, titulo: e.target.value })}
                className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:bg-slate-950 dark:border-slate-800"
              />
            </div>

            {/* Tipo e Prioridade em Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Tipo de Atividade */}
              <div className="space-y-2">
                <Label htmlFor="tipo-edit" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Atividade
                </Label>
                <div className="relative">
                  <select
                    id="tipo-edit"
                    value={novoEvento.tipo}
                    onChange={(e) => setNovoEvento({ ...novoEvento, tipo: e.target.value as Evento['tipo'] })}
                    className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md appearance-none dark:border-slate-800 dark:text-slate-100"
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

              {/* Prioridade */}
              <div className="space-y-2">
                <Label htmlFor="prioridade-edit" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <Flag className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                  Prioridade
                </Label>
                <div className="relative">
                  <select
                    id="prioridade-edit"
                    value={novoEvento.prioridade}
                    onChange={(e) => setNovoEvento({ ...novoEvento, prioridade: e.target.value as 'alta' | 'media' | 'baixa' })}
                    className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/80 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md appearance-none dark:border-slate-800 dark:text-slate-100"
                  >
                    <option value="media">🟡 Média</option>
                    <option value="alta">🔴 Alta</option>
                    <option value="baixa">🟢 Baixa</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none dark:text-slate-500" />
                </div>
              </div>
            </div>

            {/* Data e Horário em Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data-edit" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Data
                </Label>
                <Input
                  id="data-edit"
                  type="date"
                  value={novoEvento.data}
                  onChange={(e) => setNovoEvento({ ...novoEvento, data: e.target.value })}
                  className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="horario-edit" className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Horário
                </Label>
                <Input
                  id="horario-edit"
                  type="time"
                  value={novoEvento.horario}
                  onChange={(e) => setNovoEvento({ ...novoEvento, horario: e.target.value })}
                  className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800"
                />
              </div>
            </div>

            {/* Imóvel e Contato em Grid - EDITAR */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                  Imóvel
                </Label>
                <ImoveisComboBox
                  imoveis={imoveis}
                  value={novoEvento.imovelRef}
                  onChange={(value, imovel) => {
                    setNovoEvento({
                      ...novoEvento,
                      imovelRef: value,
                      imovelTitulo: imovel?.titulo || value
                    });
                  }}
                  placeholder="Selecione um imóvel (opcional)"
                  emptyText="Nenhum imóvel encontrado"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 dark:text-slate-300">
                  <User className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
                  Contato/Lead
                </Label>
                <ComboBox
                  options={leads && leads.length > 0 ? leads
                    .filter(lead => 
                      lead.corretor_responsavel === user?.name
                    )
                    .map(lead => ({
                      value: lead.nome_lead,
                      label: lead.nome_lead,
                      sublabel: lead.telefone
                    })) : []}
                  value={novoEvento.leadNome}
                  onChange={(value) => {
                    const leadSelecionado = leads?.find(lead => lead.nome_lead === value);
                    setNovoEvento({
                      ...novoEvento,
                      leadNome: value,
                      leadTelefone: leadSelecionado?.telefone || ''
                    });
                  }}
                  placeholder="Digite ou selecione um lead"
                  emptyText="Nenhum lead encontrado"
                  allowCustom={true}
                  className="h-11"
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="descricao-edit" className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Descrição (opcional)
              </Label>
              <Textarea
                id="descricao-edit"
                placeholder="Adicione detalhes sobre o evento..."
                value={novoEvento.descricao}
                onChange={(e) => setNovoEvento({ ...novoEvento, descricao: e.target.value })}
                rows={3}
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 resize-none dark:bg-slate-950 dark:border-slate-800"
              />
            </div>
          </div>

          {/* Footer com botões */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditarEventoOpen(false);
                setEventoEditando(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleEditarEvento}
              disabled={!novoEvento.titulo || !novoEvento.data || !novoEvento.horario}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes do Evento */}
      <Dialog open={detalhesEventoOpen} onOpenChange={setDetalhesEventoOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-hidden">
          {eventoSelecionado && (
            <>
              <DialogHeader className="pb-4 border-b border-gray-100 dark:border-gray-800 dark:border-slate-800">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center flex-shrink-0">
                    {(() => {
                      const Icone = getIconeTipo(eventoSelecionado.tipo);
                      return <Icone className="h-6 w-6 text-gray-600 dark:text-slate-400" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                      {eventoSelecionado.titulo}
                    </DialogTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-slate-300">
                        {getNomeTipo(eventoSelecionado.tipo)}
                      </Badge>
                      {eventoSelecionado.status === 'concluido' && (
                        <Badge className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300 dark:border-green-900">
                          ✓ Concluído
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Conteúdo */}
              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                {/* Data e Horário */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 dark:bg-blue-950/40 dark:border-blue-900">
                    <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-0.5">Data</p>
                      <p className="text-sm text-gray-900 dark:text-white font-medium dark:text-slate-100">
                        {eventoSelecionado.data.toLocaleDateString('pt-BR', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>

                  {eventoSelecionado.horario && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                      <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0 dark:text-slate-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5 dark:text-slate-400">Horário</p>
                        <p className="text-sm text-gray-900 dark:text-white font-medium dark:text-slate-100">{eventoSelecionado.horario}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Descrição */}
                {eventoSelecionado.descricao && (
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2 dark:text-slate-400">Descrição</p>
                    <p className="text-sm text-gray-900 dark:text-white leading-relaxed dark:text-slate-100">
                      {eventoSelecionado.descricao}
                    </p>
                  </div>
                )}

                {/* Informações adicionais */}
                <div className="space-y-3">
                  {eventoSelecionado.prioridade && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                      <Flag className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0 dark:text-slate-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5 dark:text-slate-400">Prioridade</p>
                        <Badge variant="outline" className={`text-xs ${getBadgePrioridade(eventoSelecionado.prioridade)}`}>
                          {eventoSelecionado.prioridade === 'alta' ? 'Alta' : 
                           eventoSelecionado.prioridade === 'media' ? 'Média' : 'Baixa'}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {eventoSelecionado.leadNome && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                      <User className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0 dark:text-slate-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5 dark:text-slate-400">Contato</p>
                        <p className="text-sm text-gray-900 dark:text-white font-medium dark:text-slate-100">{eventoSelecionado.leadNome}</p>
                        {eventoSelecionado.leadTelefone && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 dark:text-slate-400">{eventoSelecionado.leadTelefone}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {eventoSelecionado.imovelRef && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                      <MapPin className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0 dark:text-slate-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5 dark:text-slate-400">Imóvel</p>
                        <p className="text-sm text-gray-900 dark:text-white font-medium dark:text-slate-100">{eventoSelecionado.imovelRef}</p>
                        {eventoSelecionado.imovelTitulo && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 dark:text-slate-400">{eventoSelecionado.imovelTitulo}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer com ações */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 dark:bg-slate-950 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus(eventoSelecionado);
                  }}
                  className="text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {eventoSelecionado.status === 'concluido' ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 mr-2" />
                      Marcar Pendente
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                      Concluir
                    </>
                  )}
                </Button>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirEditarEvento(eventoSelecionado);
                    }}
                    className="text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-2" />
                    Editar
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmarExclusao(eventoSelecionado);
                    }}
                    className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Excluir
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={confirmarExclusaoOpen} onOpenChange={setConfirmarExclusaoOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Confirmar Exclusão
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400 text-sm mt-1 dark:text-slate-400">
                  Esta ação não pode ser desfeita
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed dark:text-slate-300">
              Deseja realmente excluir o evento{' '}
              <span className="font-semibold text-gray-900 dark:text-slate-100">
                "{eventoParaExcluir?.titulo}"
              </span>
              ?
            </p>
            {eventoParaExcluir?.data && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>
                    {new Date(eventoParaExcluir.data).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                  {eventoParaExcluir.horario && (
                    <>
                      <span className="mx-1">•</span>
                      <Clock className="h-3.5 w-3.5" />
                      <span>{eventoParaExcluir.horario}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmarExclusaoOpen(false);
                setEventoParaExcluir(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={excluirEvento}
              className="bg-red-100 hover:bg-red-200 text-gray-900 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-200 border-red-200 dark:border-red-800 dark:bg-red-950/60 dark:text-slate-100 dark:border-red-900"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Sim, Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
