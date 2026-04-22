/**
 * Week Planner - Planejador Semanal Visual
 * Integrado com os eventos da Agenda (Supabase)
 * Layout: Horários à esquerda, Dias (Dom-Sáb) no topo
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Plus,
  User,
  MapPin,
  Flag,
  Edit2,
  Trash2,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Home
} from 'lucide-react';
import { useAuth } from "@/hooks/useAuth";
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';
import { useImoveisData } from '@/features/imoveis/hooks/useImoveisData';
import { ComboBox } from '@/components/ui/combobox';
import { ImoveisComboBox } from '@/components/ui/imovel-combobox';
import { supabaseToEvento } from '@/features/agenda/services/agendaSupabaseService';
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
}

// Horários do dia (6h até 00:00 - meia-noite)
const HORARIOS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'
];

// Dias da semana
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface WeekPlannerProps {
  corretorEmail?: string;
}

export const WeekPlanner = ({ corretorEmail }: WeekPlannerProps) => {
  const { user, tenantId, isAdmin } = useAuth();
  const { leads } = useLeadsData();
  const { imoveis = [] } = useImoveisData();
  
  // Estado da semana atual
  const [semanaAtual, setSemanaAtual] = useState(() => {
    const hoje = new Date();
    const diaSemana = hoje.getDay();
    const domingo = new Date(hoje);
    domingo.setDate(hoje.getDate() - diaSemana);
    domingo.setHours(0, 0, 0, 0);
    return domingo;
  });
  
  // Eventos do Supabase
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(false);
  
  // Modais
  const [criarEventoOpen, setCriarEventoOpen] = useState(false);
  const [editarEventoOpen, setEditarEventoOpen] = useState(false);
  const [detalhesEventoOpen, setDetalhesEventoOpen] = useState(false);
  const [confirmarExclusaoOpen, setConfirmarExclusaoOpen] = useState(false);
  
  const [eventoSelecionado, setEventoSelecionado] = useState<Evento | null>(null);
  const [eventoEditando, setEventoEditando] = useState<Evento | null>(null);
  const [eventoParaExcluir, setEventoParaExcluir] = useState<Evento | null>(null);
  
  // Formulário
  const [novoEvento, setNovoEvento] = useState({
    titulo: '',
    descricao: '',
    data: '',
    horario: '',
    tipo: 'tarefa' as Evento['tipo'],
    prioridade: 'media' as 'alta' | 'media' | 'baixa',
    leadNome: '',
    leadTelefone: '',
    imovelRef: '',
    imovelTitulo: ''
  });

  // Dias da semana atual
  const diasDaSemana = useMemo(() => {
    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dia = new Date(semanaAtual);
      dia.setDate(semanaAtual.getDate() + i);
      dias.push(dia);
    }
    return dias;
  }, [semanaAtual]);

  // Carregar eventos do Supabase (multitenant)
  const carregarEventos = async () => {
    const emailParaConsulta = corretorEmail || user?.email;
    if (!emailParaConsulta || !tenantId || tenantId === 'owner') return;
    
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from('agenda_eventos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('corretor_email', emailParaConsulta)
        .order('data', { ascending: true })
        .order('horario', { ascending: true });
      
      if (error) throw error;
      
      if (data && Array.isArray(data)) {
        const eventosConvertidos = data.map((e: any) => supabaseToEvento(e));
        setEventos(eventosConvertidos);
      } else {
        setEventos([]);
      }
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
      toast.error('Erro ao carregar eventos');
      setEventos([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarEventos();
  }, [corretorEmail, user?.email, tenantId]);

  // Eventos da semana atual
  const eventosDaSemana = useMemo(() => {
    const inicioSemana = new Date(semanaAtual);
    inicioSemana.setHours(0, 0, 0, 0);
    
    const fimSemana = new Date(semanaAtual);
    fimSemana.setDate(semanaAtual.getDate() + 6);
    fimSemana.setHours(23, 59, 59, 999);
    
    return eventos.filter(evento => {
      const dataEvento = new Date(evento.data);
      return dataEvento >= inicioSemana && dataEvento <= fimSemana;
    });
  }, [eventos, semanaAtual]);

  // Mapa de eventos por dia e horário
  const eventosMap = useMemo(() => {
    const map = new Map<string, Evento[]>();
    
    eventosDaSemana.forEach(evento => {
      const dataKey = evento.data.toDateString();
      const horarioKey = evento.horario ? evento.horario.substring(0, 5) : 'sem-horario';
      const key = `${dataKey}-${horarioKey}`;
      
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(evento);
    });
    
    return map;
  }, [eventosDaSemana]);

  // Eventos sem horário definido
  const eventosSemHorario = useMemo(() => {
    return eventosDaSemana.filter(e => !e.horario);
  }, [eventosDaSemana]);

  // Navegação
  const navegarSemana = (direcao: 'anterior' | 'proxima') => {
    const novaSemana = new Date(semanaAtual);
    novaSemana.setDate(semanaAtual.getDate() + (direcao === 'proxima' ? 7 : -7));
    setSemanaAtual(novaSemana);
  };

  const voltarHoje = () => {
    const hoje = new Date();
    const diaSemana = hoje.getDay();
    const domingo = new Date(hoje);
    domingo.setDate(hoje.getDate() - diaSemana);
    domingo.setHours(0, 0, 0, 0);
    setSemanaAtual(domingo);
  };

  // Criar evento
  const abrirCriarEvento = (data?: Date, horario?: string) => {
    const dataFormatada = data ? data.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    setNovoEvento({
      titulo: '',
      descricao: '',
      data: dataFormatada,
      horario: horario || '',
      tipo: 'tarefa',
      prioridade: 'media',
      leadNome: '',
      leadTelefone: '',
      imovelRef: '',
      imovelTitulo: ''
    });
    setCriarEventoOpen(true);
  };

  const handleCriarEvento = async () => {
    if (!user?.email || !tenantId || tenantId === 'owner') {
      toast.error('Usuário não autenticado ou tenant não selecionado');
      return;
    }

    try {
      const tituloFinal = novoEvento.titulo?.trim() || 'Tarefa sem nome';
      
      const eventoParaSalvar = {
        tenant_id: tenantId,
        corretor_email: user.email,
        corretor_id: user.id || user.name || '',
        titulo: tituloFinal,
        descricao: novoEvento.descricao?.trim() || null,
        data: novoEvento.data || new Date().toISOString().split('T')[0],
        horario: novoEvento.horario || null,
        tipo: novoEvento.tipo || 'tarefa',
        status: 'pendente',
        prioridade: novoEvento.prioridade || 'media',
        lead_nome: novoEvento.leadNome?.trim() || null,
        lead_telefone: novoEvento.leadTelefone?.trim() || null,
        imovel_ref: novoEvento.imovelRef?.trim() || null,
        imovel_titulo: novoEvento.imovelTitulo?.trim() || null
      };
      
      const { error } = await supabase
        .from('agenda_eventos')
        .insert([eventoParaSalvar])
        .select();
      
      if (error) throw error;
      
      toast.success('Tarefa criada com sucesso!');
      await carregarEventos();
      setCriarEventoOpen(false);
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast.error('Erro ao criar tarefa');
    }
  };

  // Editar evento
  const abrirEditarEvento = (evento: Evento) => {
    setEventoEditando(evento);
    setNovoEvento({
      titulo: evento.titulo,
      descricao: evento.descricao || '',
      data: evento.data.toISOString().split('T')[0],
      horario: evento.horario || '',
      tipo: evento.tipo,
      prioridade: evento.prioridade || 'media',
      leadNome: evento.leadNome || '',
      leadTelefone: evento.leadTelefone || '',
      imovelRef: evento.imovelRef || '',
      imovelTitulo: evento.imovelTitulo || ''
    });
    setDetalhesEventoOpen(false);
    setEditarEventoOpen(true);
  };

  const handleEditarEvento = async () => {
    if (!eventoEditando || !user?.email) return;

    try {
      const tituloFinal = novoEvento.titulo?.trim() || 'Tarefa sem nome';
      
      const { error } = await supabase
        .from('agenda_eventos')
        .update({
          titulo: tituloFinal,
          descricao: novoEvento.descricao?.trim() || null,
          data: novoEvento.data,
          horario: novoEvento.horario || null,
          tipo: novoEvento.tipo,
          prioridade: novoEvento.prioridade,
          lead_nome: novoEvento.leadNome?.trim() || null,
          lead_telefone: novoEvento.leadTelefone?.trim() || null,
          imovel_ref: novoEvento.imovelRef?.trim() || null,
          imovel_titulo: novoEvento.imovelTitulo?.trim() || null
        })
        .eq('id', eventoEditando.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', user.email);
      
      if (error) throw error;
      
      toast.success('Tarefa atualizada!');
      await carregarEventos();
      setEditarEventoOpen(false);
      setEventoEditando(null);
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      toast.error('Erro ao atualizar tarefa');
    }
  };

  // Toggle status
  const toggleStatus = async (evento: Evento) => {
    if (!user?.email) return;

    try {
      const novoStatus = evento.status === 'concluido' ? 'pendente' : 'concluido';
      
      const { error } = await supabase
        .from('agenda_eventos')
        .update({ status: novoStatus })
        .eq('id', evento.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', user.email);
      
      if (error) throw error;

      if (novoStatus === 'concluido' && (evento.tipo === 'retornar_cliente' || evento.tipo === 'visita_agendada') && tenantId && tenantId !== 'owner') {
        const stillHas = await hasAnyPendingBlockingActivity(tenantId, user.email);
        if (!stillHas) {
          await unblockCorretor(tenantId, user.email);
          toast.success('Tarefa concluída! Você foi desbloqueado do recebimento de leads.');
        } else {
          toast.success('Tarefa concluída!');
        }
      } else {
        toast.success(novoStatus === 'concluido' ? 'Tarefa concluída!' : 'Tarefa reaberta!');
      }
      await carregarEventos();
      setDetalhesEventoOpen(false);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  // Excluir evento
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
        q = q.eq('corretor_email', user.email);
      }
      const { error } = await q;
      if (error) throw error;

      toast.success('Tarefa excluída!');
      await carregarEventos();
      setConfirmarExclusaoOpen(false);
      setDetalhesEventoOpen(false);
      setEventoParaExcluir(null);
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error);
      toast.error('Erro ao excluir tarefa');
    }
  };

  // Helpers de estilo
  const getCorTipo = (tipo: Evento['tipo']) => {
    switch (tipo) {
      case 'visita_agendada': return 'bg-cyan-500';
      case 'visita_realizada': return 'bg-green-500';
      case 'visita_nao_realizada': return 'bg-red-500';
      case 'retornar_cliente': return 'bg-blue-500';
      case 'reuniao': return 'bg-purple-500';
      case 'tarefa': return 'bg-emerald-500';
      default: return 'bg-gray-500';
    }
  };

  const getCorPrioridade = (prioridade?: string) => {
    switch (prioridade) {
      case 'alta': return 'border-l-red-500 bg-red-50 dark:bg-red-950/40 dark:bg-red-900/10';
      case 'media': return 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/40 dark:bg-orange-900/10';
      case 'baixa': return 'border-l-yellow-400 bg-yellow-50 dark:bg-yellow-950/40 dark:bg-yellow-900/10';
      default: return 'border-l-gray-300 bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/30';
    }
  };

  const getNomeTipo = (tipo: Evento['tipo']) => {
    switch (tipo) {
      case 'visita_agendada': return 'Visita Agendada';
      case 'visita_realizada': return 'Visita Realizada';
      case 'visita_nao_realizada': return 'Visita Não Realizada';
      case 'retornar_cliente': return 'Retornar Cliente';
      case 'reuniao': return 'Reunião';
      case 'tarefa': return 'Tarefa';
      default: return 'Outro';
    }
  };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Formato do período
  const periodoTexto = useMemo(() => {
    const inicio = diasDaSemana[0];
    const fim = diasDaSemana[6];
    const mesInicio = inicio.toLocaleDateString('pt-BR', { month: 'short' });
    const mesFim = fim.toLocaleDateString('pt-BR', { month: 'short' });
    
    if (mesInicio === mesFim) {
      return `${inicio.getDate()} - ${fim.getDate()} de ${mesInicio} ${fim.getFullYear()}`;
    }
    return `${inicio.getDate()} ${mesInicio} - ${fim.getDate()} ${mesFim} ${fim.getFullYear()}`;
  }, [diasDaSemana]);

  return (
    <div className="w-full max-w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">Tarefas da Semana</h2>
        <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
          {eventosDaSemana.length} {eventosDaSemana.length === 1 ? 'tarefa' : 'tarefas'} nesta semana
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Header do calendário */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 dark:text-white capitalize">
                {periodoTexto}
              </h3>
              <Badge variant="secondary" className="text-xs">
                {eventosDaSemana.filter(e => e.status !== 'concluido').length} pendentes
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={voltarHoje}
                className="h-8 text-xs"
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                Hoje
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navegarSemana('anterior')}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navegarSemana('proxima')}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => abrirCriarEvento()}
                className="h-8 ml-2"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova Tarefa
              </Button>
            </div>
          </div>

          {/* Grid do calendário semanal */}
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header dos dias */}
              <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-900 sticky top-0 z-10">
                <div className="p-3 text-center border-r border-gray-200 dark:border-slate-800 dark:border-gray-700">
                  <Clock className="h-4 w-4 mx-auto text-gray-400 dark:text-slate-500" />
                </div>
                {diasDaSemana.map((dia, index) => {
                  const isHoje = dia.toDateString() === hoje.toDateString();
                  return (
                    <div
                      key={index}
                      className={`p-3 text-center border-r border-gray-200 dark:border-slate-800 dark:border-gray-700 last:border-r-0 ${
                        isHoje ? 'bg-blue-50 dark:bg-blue-950/40 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <p className={`text-xs font-medium uppercase tracking-wider ${
                        isHoje ? 'text-blue-600 dark:text-blue-300 dark:text-blue-400' : 'text-gray-500 dark:text-slate-400 dark:text-gray-400'
                      }`}>
                        {DIAS_SEMANA[index]}
                      </p>
                      <p className={`text-lg font-bold mt-0.5 ${
                        isHoje 
                          ? 'text-blue-600 dark:text-blue-300 dark:text-blue-400' 
                          : 'text-gray-900 dark:text-slate-100 dark:text-white'
                      }`}>
                        {dia.getDate()}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Tarefas sem horário */}
              {eventosSemHorario.length > 0 && (
                <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30">
                  <div className="p-2 text-center border-r border-gray-200 dark:border-slate-800 dark:border-gray-700 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-gray-500 dark:text-slate-400 dark:text-gray-400 uppercase">
                      Dia todo
                    </span>
                  </div>
                  {diasDaSemana.map((dia, diaIndex) => {
                    const eventosDoDia = eventosSemHorario.filter(
                      e => e.data.toDateString() === dia.toDateString()
                    );
                    const isHoje = dia.toDateString() === hoje.toDateString();
                    
                    return (
                      <div
                        key={diaIndex}
                        className={`p-1.5 border-r border-gray-200 dark:border-slate-800 dark:border-gray-700 last:border-r-0 min-h-[60px] ${
                          isHoje ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          {eventosDoDia.map(evento => (
                            <button
                              key={evento.id}
                              onClick={() => {
                                setEventoSelecionado(evento);
                                setDetalhesEventoOpen(true);
                              }}
                              className={`w-full text-left p-1.5 rounded text-xs transition-all hover:scale-[1.02] border-l-2 ${
                                evento.status === 'concluido'
                                  ? 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 opacity-60 line-through border-l-gray-300'
                                  : getCorPrioridade(evento.prioridade)
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getCorTipo(evento.tipo)}`} />
                                <span className="truncate font-medium text-gray-900 dark:text-slate-100 dark:text-white">
                                  {evento.titulo}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Grid de horários */}
              <div className="max-h-[600px] overflow-y-auto">
                {HORARIOS.map((horario, horarioIndex) => (
                  <div
                    key={horario}
                    className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-gray-100 dark:border-slate-800 dark:border-gray-800 hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    {/* Coluna do horário */}
                    <div className="p-2 text-center border-r border-gray-200 dark:border-slate-800 dark:border-gray-700 flex items-start justify-center pt-3">
                      <span className="text-xs font-medium text-gray-500 dark:text-slate-400 dark:text-gray-400">
                        {horario}
                      </span>
                    </div>
                    
                    {/* Células dos dias */}
                    {diasDaSemana.map((dia, diaIndex) => {
                      const key = `${dia.toDateString()}-${horario}`;
                      const eventosNoSlot = eventosMap.get(key) || [];
                      const isHoje = dia.toDateString() === hoje.toDateString();
                      
                      return (
                        <div
                          key={diaIndex}
                          onClick={() => abrirCriarEvento(dia, horario)}
                          className={`p-1 border-r border-gray-100 dark:border-slate-800 dark:border-gray-800 last:border-r-0 min-h-[52px] cursor-pointer group transition-colors ${
                            isHoje 
                              ? 'bg-blue-50/30 dark:bg-blue-900/5 hover:bg-blue-100/50 dark:hover:bg-blue-900/20' 
                              : 'hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                          }`}
                        >
                          {/* Indicador de adicionar no hover */}
                          {eventosNoSlot.length === 0 && (
                            <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                            </div>
                          )}
                          
                          {/* Eventos no slot */}
                          <div className="space-y-1">
                            {eventosNoSlot.map(evento => (
                              <button
                                key={evento.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEventoSelecionado(evento);
                                  setDetalhesEventoOpen(true);
                                }}
                                className={`w-full text-left p-2 rounded-md text-xs transition-all hover:scale-[1.02] border-l-3 ${
                                  evento.status === 'concluido'
                                    ? 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 opacity-60 border-l-gray-300'
                                    : getCorPrioridade(evento.prioridade)
                                }`}
                                style={{ borderLeftWidth: '3px' }}
                              >
                                <div className="flex items-start gap-1.5">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${getCorTipo(evento.tipo)}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-medium truncate ${
                                      evento.status === 'concluido' 
                                        ? 'line-through text-gray-500 dark:text-slate-400 dark:text-gray-400' 
                                        : 'text-gray-900 dark:text-slate-100 dark:text-white'
                                    }`}>
                                      {evento.titulo}
                                    </p>
                                    {evento.leadNome && (
                                      <p className="text-[10px] text-gray-500 dark:text-slate-400 dark:text-gray-400 truncate mt-0.5">
                                        {evento.leadNome}
                                      </p>
                                    )}
                                  </div>
                                  {evento.status === 'concluido' && (
                                    <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legenda */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400">Tipos:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Visita</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Retornar</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Reunião</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Tarefa</span>
              </div>
              <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
              <span className="font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400">Prioridade:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-red-500" />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Alta</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#f97316' }} />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Média</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#facc15' }} />
                <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Baixa</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Criar Tarefa */}
      <Dialog open={criarEventoOpen} onOpenChange={setCriarEventoOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-4 border-b border-gray-100 dark:border-slate-800 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-100 dark:text-white">
                  Nova Tarefa
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-slate-400 dark:text-gray-400 text-sm mt-1">
                  Adicione uma tarefa à sua semana
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-4 max-h-[60vh] overflow-y-auto">
            {/* Título */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                Título da Tarefa
              </Label>
              <Input
                placeholder="Ex: Ligar para cliente, Visitar imóvel..."
                value={novoEvento.titulo}
                onChange={(e) => setNovoEvento({ ...novoEvento, titulo: e.target.value })}
                className="h-11"
              />
            </div>

            {/* Tipo e Prioridade */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                  Tipo
                </Label>
                <select
                  value={novoEvento.tipo}
                  onChange={(e) => setNovoEvento({ ...novoEvento, tipo: e.target.value as Evento['tipo'] })}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-800 px-3 text-sm"
                >
                  <option value="tarefa">📋 Tarefa</option>
                  <option value="visita_agendada">📅 Visita Agendada</option>
                  <option value="retornar_cliente">📞 Retornar Cliente</option>
                  <option value="reuniao">👥 Reunião</option>
                  <option value="outro">🔧 Outro</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                  Prioridade
                </Label>
                <select
                  value={novoEvento.prioridade}
                  onChange={(e) => setNovoEvento({ ...novoEvento, prioridade: e.target.value as 'alta' | 'media' | 'baixa' })}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-800 px-3 text-sm"
                >
                  <option value="media">🟡 Média</option>
                  <option value="alta">🔴 Alta</option>
                  <option value="baixa">🟢 Baixa</option>
                </select>
              </div>
            </div>

            {/* Data e Horário */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                  Data
                </Label>
                <Input
                  type="date"
                  value={novoEvento.data}
                  onChange={(e) => setNovoEvento({ ...novoEvento, data: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                  Horário
                </Label>
                <Input
                  type="time"
                  value={novoEvento.horario}
                  onChange={(e) => setNovoEvento({ ...novoEvento, horario: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>

            {/* Imóvel e Lead */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                  Imóvel (opcional)
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
                  placeholder="Selecione..."
                  emptyText="Nenhum imóvel"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                  Lead (opcional)
                </Label>
                <ComboBox
                  options={leads?.filter(lead => 
                    lead.corretor_responsavel === user?.name
                  ).map(lead => ({
                    value: lead.nome_lead,
                    label: lead.nome_lead,
                    sublabel: lead.telefone
                  })) || []}
                  value={novoEvento.leadNome}
                  onChange={(value) => {
                    const leadSelecionado = leads?.find(l => l.nome_lead === value);
                    setNovoEvento({
                      ...novoEvento,
                      leadNome: value,
                      leadTelefone: leadSelecionado?.telefone || ''
                    });
                  }}
                  placeholder="Selecione..."
                  emptyText="Nenhum lead"
                  allowCustom={true}
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">
                Descrição (opcional)
              </Label>
              <Textarea
                placeholder="Detalhes da tarefa..."
                value={novoEvento.descricao}
                onChange={(e) => setNovoEvento({ ...novoEvento, descricao: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
            <Button variant="outline" onClick={() => setCriarEventoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCriarEvento}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Tarefa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Tarefa */}
      <Dialog open={editarEventoOpen} onOpenChange={setEditarEventoOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-4 border-b border-gray-100 dark:border-slate-800 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Edit2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-slate-100 dark:text-white">
                  Editar Tarefa
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-slate-400 dark:text-gray-400 text-sm mt-1">
                  Atualize as informações da tarefa
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-4 max-h-[60vh] overflow-y-auto">
            {/* Mesmo formulário do criar */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">Título</Label>
              <Input
                value={novoEvento.titulo}
                onChange={(e) => setNovoEvento({ ...novoEvento, titulo: e.target.value })}
                className="h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">Tipo</Label>
                <select
                  value={novoEvento.tipo}
                  onChange={(e) => setNovoEvento({ ...novoEvento, tipo: e.target.value as Evento['tipo'] })}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-800 px-3 text-sm"
                >
                  <option value="tarefa">📋 Tarefa</option>
                  <option value="visita_agendada">📅 Visita Agendada</option>
                  <option value="retornar_cliente">📞 Retornar Cliente</option>
                  <option value="reuniao">👥 Reunião</option>
                  <option value="outro">🔧 Outro</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">Prioridade</Label>
                <select
                  value={novoEvento.prioridade}
                  onChange={(e) => setNovoEvento({ ...novoEvento, prioridade: e.target.value as 'alta' | 'media' | 'baixa' })}
                  className="h-11 w-full rounded-lg border border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-800 px-3 text-sm"
                >
                  <option value="media">🟡 Média</option>
                  <option value="alta">🔴 Alta</option>
                  <option value="baixa">🟢 Baixa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">Data</Label>
                <Input
                  type="date"
                  value={novoEvento.data}
                  onChange={(e) => setNovoEvento({ ...novoEvento, data: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">Horário</Label>
                <Input
                  type="time"
                  value={novoEvento.horario}
                  onChange={(e) => setNovoEvento({ ...novoEvento, horario: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300">Descrição</Label>
              <Textarea
                value={novoEvento.descricao}
                onChange={(e) => setNovoEvento({ ...novoEvento, descricao: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
            <Button variant="outline" onClick={() => setEditarEventoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditarEvento}>
              <Edit2 className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes */}
      <Dialog open={detalhesEventoOpen} onOpenChange={setDetalhesEventoOpen}>
        <DialogContent className="sm:max-w-[480px]">
          {eventoSelecionado && (
            <>
              <DialogHeader className="pb-4 border-b border-gray-100 dark:border-slate-800 dark:border-gray-800">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getCorTipo(eventoSelecionado.tipo)}`}>
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <DialogTitle className={`text-lg font-bold ${
                      eventoSelecionado.status === 'concluido' 
                        ? 'line-through text-gray-500 dark:text-slate-400' 
                        : 'text-gray-900 dark:text-slate-100 dark:text-white'
                    }`}>
                      {eventoSelecionado.titulo}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {getNomeTipo(eventoSelecionado.tipo)}
                      </Badge>
                      {eventoSelecionado.status === 'concluido' && (
                        <Badge className="text-xs bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300">✓ Concluído</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 py-4">
                {/* Data e Horário */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 dark:bg-blue-900/20">
                  <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">Data</p>
                    <p className="text-sm text-gray-900 dark:text-slate-100 dark:text-white font-medium">
                      {eventoSelecionado.data.toLocaleDateString('pt-BR', { 
                        weekday: 'long', day: 'numeric', month: 'long' 
                      })}
                      {eventoSelecionado.horario && ` às ${eventoSelecionado.horario}`}
                    </p>
                  </div>
                </div>

                {/* Prioridade */}
                {eventoSelecionado.prioridade && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50">
                    <Flag className="h-4 w-4 text-gray-600 dark:text-slate-400" />
                    <div>
                      <p className="text-xs text-gray-600 dark:text-slate-400 font-medium">Prioridade</p>
                      <Badge variant="outline" className={`text-xs ${
                        eventoSelecionado.prioridade === 'alta' ? 'border-red-500 text-red-600 dark:text-red-300' :
                        eventoSelecionado.prioridade === 'media' ? 'border-orange-500 text-orange-600 dark:text-orange-300' :
                        'border-yellow-500 text-yellow-600 dark:text-yellow-300'
                      }`}>
                        {eventoSelecionado.prioridade === 'alta' ? 'Alta' : 
                         eventoSelecionado.prioridade === 'media' ? 'Média' : 'Baixa'}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Descrição */}
                {eventoSelecionado.descricao && (
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50">
                    <p className="text-xs text-gray-600 dark:text-slate-400 font-medium mb-1">Descrição</p>
                    <p className="text-sm text-gray-900 dark:text-slate-100 dark:text-white">
                      {eventoSelecionado.descricao}
                    </p>
                  </div>
                )}

                {/* Lead */}
                {eventoSelecionado.leadNome && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50">
                    <User className="h-4 w-4 text-gray-600 dark:text-slate-400" />
                    <div>
                      <p className="text-xs text-gray-600 dark:text-slate-400 font-medium">Contato</p>
                      <p className="text-sm text-gray-900 dark:text-slate-100 dark:text-white font-medium">
                        {eventoSelecionado.leadNome}
                      </p>
                    </div>
                  </div>
                )}

                {/* Imóvel */}
                {eventoSelecionado.imovelRef && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50">
                    <Home className="h-4 w-4 text-gray-600 dark:text-slate-400" />
                    <div>
                      <p className="text-xs text-gray-600 dark:text-slate-400 font-medium">Imóvel</p>
                      <p className="text-sm text-gray-900 dark:text-slate-100 dark:text-white font-medium">
                        {eventoSelecionado.imovelRef}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleStatus(eventoSelecionado)}
                >
                  {eventoSelecionado.status === 'concluido' ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 mr-2" />
                      Reabrir
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                      Concluir
                    </>
                  )}
                </Button>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => abrirEditarEvento(eventoSelecionado)}
                    className="text-blue-600 dark:text-blue-300 border-blue-300 hover:bg-blue-50"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => confirmarExclusao(eventoSelecionado)}
                    className="text-red-600 dark:text-red-300 border-red-300 hover:bg-red-50"
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

      {/* Modal Confirmar Exclusão */}
      <Dialog open={confirmarExclusaoOpen} onOpenChange={setConfirmarExclusaoOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 dark:bg-red-900/30 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-300" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900 dark:text-slate-100 dark:text-white">
                  Excluir Tarefa
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-slate-400 dark:text-gray-400 text-sm">
                  Esta ação não pode ser desfeita
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-gray-700 dark:text-slate-300 dark:text-gray-300">
              Deseja excluir <strong>"{eventoParaExcluir?.titulo}"</strong>?
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
            <Button variant="outline" onClick={() => setConfirmarExclusaoOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluirEvento}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
