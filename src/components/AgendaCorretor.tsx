/**
 * Agenda do Corretor - Mostra compromissos, tarefas e visitas
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Home,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useAuth } from "@/hooks/useAuth";
import { useTarefas } from '@/hooks/useTarefas';
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';

interface Compromisso {
  id: string;
  tipo: 'tarefa' | 'visita' | 'followup';
  titulo: string;
  descricao?: string;
  horario?: string;
  data: Date;
  concluido: boolean;
  prioridade?: 'alta' | 'media' | 'baixa';
  leadNome?: string;
  leadTelefone?: string;
}

export const AgendaCorretor = () => {
  const { user, currentCorretor } = useAuth();
  const { tarefas } = useTarefas();
  const { leads } = useLeadsData();
  
  const [dataAtual, setDataAtual] = useState(new Date());
  const [visualizacao, setVisualizacao] = useState<'dia' | 'semana'>('dia');

  // Pegar leads do corretor com visitas agendadas
  const meusLeads = useMemo(() => {
    if (!currentCorretor) return [];
    return leads.filter(lead => lead.corretor_responsavel === currentCorretor);
  }, [leads, currentCorretor]);

  // Gerar compromissos baseados nas tarefas e leads
  const compromissos = useMemo((): Compromisso[] => {
    const items: Compromisso[] = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Adicionar tarefas
    tarefas.forEach((tarefa, index) => {
      if (!tarefa.concluida) {
        // Tarefas sem prazo específico aparecem hoje
        const dataTarefa = tarefa.prazo ? new Date(tarefa.prazo) : hoje;
        
        items.push({
          id: `tarefa-${tarefa.id || index}`,
          tipo: 'tarefa',
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          data: dataTarefa,
          concluido: false,
          prioridade: tarefa.prioridade
        });
      }
    });

    // Adicionar visitas agendadas dos leads
    meusLeads.forEach((lead, index) => {
      if (lead.etapa_atual === 'Visita Agendada' || lead.etapa_atual === 'Visita Realizada') {
        // Simular data de visita (você pode adicionar um campo no lead)
        const dataVisita = new Date(lead.data_lead);
        dataVisita.setDate(dataVisita.getDate() + Math.floor(Math.random() * 7));
        
        items.push({
          id: `visita-${lead.id || index}`,
          tipo: 'visita',
          titulo: `Visita - ${lead.nome}`,
          descricao: lead.origem || 'Visita ao imóvel',
          horario: `${9 + Math.floor(Math.random() * 8)}:${['00', '30'][Math.floor(Math.random() * 2)]}`,
          data: dataVisita,
          concluido: lead.etapa_atual === 'Visita Realizada',
          leadNome: lead.nome,
          leadTelefone: lead.telefone
        });
      }

      // Adicionar follow-ups para leads quentes
      if (lead.status_temperatura === 'Quente' && lead.etapa_atual !== 'Fechamento' && lead.etapa_atual !== 'Finalizado') {
        const dataFollowup = new Date();
        dataFollowup.setDate(dataFollowup.getDate() + Math.floor(Math.random() * 3));
        
        items.push({
          id: `followup-${lead.id || index}`,
          tipo: 'followup',
          titulo: `Follow-up - ${lead.nome}`,
          descricao: `Retornar contato com lead quente`,
          data: dataFollowup,
          concluido: false,
          prioridade: 'alta',
          leadNome: lead.nome,
          leadTelefone: lead.telefone
        });
      }
    });

    // Ordenar por data e horário
    return items.sort((a, b) => {
      const dataA = a.data.getTime();
      const dataB = b.data.getTime();
      if (dataA !== dataB) return dataA - dataB;
      
      // Se mesma data, ordenar por horário
      if (a.horario && b.horario) {
        return a.horario.localeCompare(b.horario);
      }
      return 0;
    });
  }, [tarefas, meusLeads]);

  // Filtrar compromissos por data
  const compromissosFiltrados = useMemo(() => {
    if (visualizacao === 'dia') {
      const inicioDia = new Date(dataAtual);
      inicioDia.setHours(0, 0, 0, 0);
      const fimDia = new Date(dataAtual);
      fimDia.setHours(23, 59, 59, 999);

      return compromissos.filter(c => {
        const dataCompromisso = new Date(c.data);
        return dataCompromisso >= inicioDia && dataCompromisso <= fimDia;
      });
    } else {
      // Semana
      const inicioSemana = new Date(dataAtual);
      inicioSemana.setDate(dataAtual.getDate() - dataAtual.getDay());
      inicioSemana.setHours(0, 0, 0, 0);
      
      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      fimSemana.setHours(23, 59, 59, 999);

      return compromissos.filter(c => {
        const dataCompromisso = new Date(c.data);
        return dataCompromisso >= inicioSemana && dataCompromisso <= fimSemana;
      });
    }
  }, [compromissos, dataAtual, visualizacao]);

  const getIconePorTipo = (tipo: Compromisso['tipo']) => {
    switch (tipo) {
      case 'visita':
        return Home;
      case 'followup':
        return Phone;
      case 'tarefa':
      default:
        return CheckCircle2;
    }
  };

  const getCorPorTipo = (tipo: Compromisso['tipo']) => {
    switch (tipo) {
      case 'visita':
        return 'text-blue-600 dark:text-blue-400';
      case 'followup':
        return 'text-orange-600 dark:text-orange-400';
      case 'tarefa':
      default:
        return 'text-purple-600 dark:text-purple-400';
    }
  };

  const getCorPrioridade = (prioridade?: 'alta' | 'media' | 'baixa') => {
    switch (prioridade) {
      case 'alta':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'media':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      case 'baixa':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-700';
    }
  };

  const navegarData = (direcao: 'anterior' | 'proximo') => {
    const novaData = new Date(dataAtual);
    if (visualizacao === 'dia') {
      novaData.setDate(dataAtual.getDate() + (direcao === 'proximo' ? 1 : -1));
    } else {
      novaData.setDate(dataAtual.getDate() + (direcao === 'proximo' ? 7 : -7));
    }
    setDataAtual(novaData);
  };

  const formatarData = (data: Date) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const dataCompromisso = new Date(data);
    dataCompromisso.setHours(0, 0, 0, 0);

    if (dataCompromisso.getTime() === hoje.getTime()) {
      return 'Hoje';
    } else if (dataCompromisso.getTime() === amanha.getTime()) {
      return 'Amanhã';
    } else {
      return data.toLocaleDateString('pt-BR', { 
        weekday: 'short', 
        day: '2-digit', 
        month: 'short' 
      });
    }
  };

  const estatisticas = useMemo(() => {
    const total = compromissosFiltrados.length;
    const concluidos = compromissosFiltrados.filter(c => c.concluido).length;
    const pendentes = total - concluidos;
    const visitas = compromissosFiltrados.filter(c => c.tipo === 'visita').length;

    return { total, concluidos, pendentes, visitas };
  }, [compromissosFiltrados]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Minha Agenda
          </CardTitle>
          
          {/* Controles de visualização */}
          <div className="flex items-center gap-2">
            <Button
              variant={visualizacao === 'dia' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVisualizacao('dia')}
            >
              Dia
            </Button>
            <Button
              variant={visualizacao === 'semana' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVisualizacao('semana')}
            >
              Semana
            </Button>
          </div>
        </div>

        {/* Navegação de data */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarData('anterior')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {dataAtual.toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric' 
              })}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {dataAtual.toLocaleDateString('pt-BR', { weekday: 'long' })}
            </p>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navegarData('proximo')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Estatísticas rápidas */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {estatisticas.total}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
          </div>
          <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {estatisticas.concluidos}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Feitos</p>
          </div>
          <div className="text-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {estatisticas.pendentes}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Pendentes</p>
          </div>
          <div className="text-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {estatisticas.visitas}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Visitas</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {compromissosFiltrados.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              Nenhum compromisso para este período
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Compromisso
            </Button>
          </div>
        ) : (
          compromissosFiltrados.map((compromisso) => {
            const Icone = getIconePorTipo(compromisso.tipo);
            
            return (
              <div
                key={compromisso.id}
                className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                  compromisso.concluido
                    ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox / Ícone */}
                  <div className={`mt-0.5 ${compromisso.concluido ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    {compromisso.concluido ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icone className={`h-4 w-4 ${getCorPorTipo(compromisso.tipo)}`} />
                      <h4 className={`font-semibold text-gray-900 dark:text-white ${
                        compromisso.concluido ? 'line-through' : ''
                      }`}>
                        {compromisso.titulo}
                      </h4>
                    </div>

                    {compromisso.descricao && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {compromisso.descricao}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Horário */}
                      {compromisso.horario && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {compromisso.horario}
                        </Badge>
                      )}

                      {/* Data */}
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatarData(compromisso.data)}
                      </Badge>

                      {/* Prioridade */}
                      {compromisso.prioridade && (
                        <Badge className={`text-xs ${getCorPrioridade(compromisso.prioridade)}`}>
                          {compromisso.prioridade === 'alta' ? '🔴' : compromisso.prioridade === 'media' ? '🟡' : '🟢'}
                          {' '}
                          {compromisso.prioridade}
                        </Badge>
                      )}

                      {/* Info do Lead */}
                      {compromisso.leadNome && (
                        <Badge variant="outline" className="text-xs">
                          <User className="h-3 w-3 mr-1" />
                          {compromisso.leadNome}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

