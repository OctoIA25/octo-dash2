/**
 * Planner Semanal de Tarefas
 * Mantem a base `tarefas_semanais`, mas apresenta a semana em grade de horarios.
 */

import { useMemo, useState } from 'react';
import { useTarefasSemanais, DIAS_SEMANA, DIAS_SEMANA_ABREV, DiaSemana, CreateTarefaSemanal, TarefaSemanal } from '@/hooks/useTarefasSemanais';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Home,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const HORARIOS = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
];

type PlannerFormData = CreateTarefaSemanal & {
  horario: string;
};

const getHorarioTarefa = (tarefa: TarefaSemanal): string => {
  const dados = tarefa.dados_recorrencia as { horario?: string } | null | undefined;
  return typeof dados?.horario === 'string' ? dados.horario.slice(0, 5) : '';
};

const getPrioridadeColor = (prioridade: string) => {
  switch (prioridade) {
    case 'urgente':
      return 'border-l-red-500 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200';
    case 'alta':
      return 'border-l-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200';
    case 'media':
      return 'border-l-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
    case 'baixa':
      return 'border-l-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200';
    default:
      return 'border-l-slate-300 bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-200';
  }
};

const getPrioridadeBadge = (prioridade: string) => {
  switch (prioridade) {
    case 'urgente':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800';
    case 'alta':
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800';
    case 'media':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    case 'baixa':
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
};

export const KanbanSemanalTarefas = () => {
  const {
    tarefas,
    isLoading,
    semanaAtual,
    proximaSemana,
    semanaAnterior,
    irParaHoje,
    criarTarefa,
    deletarTarefa,
    toggleConcluida,
    estatisticas,
    arquivarSemana,
  } = useTarefasSemanais();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tarefaParaDeletar, setTarefaParaDeletar] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState<PlannerFormData>({
    titulo: '',
    descricao: '',
    prioridade: 'media',
    categoria: 'geral',
    dia_semana: 1,
    horario: '09:00',
    recorrente: false,
  });

  const diasDaSemana = useMemo(() => {
    return ([1, 2, 3, 4, 5, 6, 7] as DiaSemana[]).map((dia) => {
      const data = new Date(semanaAtual.data_inicio);
      data.setDate(data.getDate() + (dia - 1));
      return { dia, data };
    });
  }, [semanaAtual.data_inicio]);

  const tarefasComHorario = useMemo(() => tarefas.filter((tarefa) => Boolean(getHorarioTarefa(tarefa))), [tarefas]);
  const tarefasSemHorario = useMemo(() => tarefas.filter((tarefa) => !getHorarioTarefa(tarefa)), [tarefas]);

  const tarefasPorSlot = useMemo(() => {
    const map = new Map<string, TarefaSemanal[]>();
    tarefasComHorario.forEach((tarefa) => {
      const horario = getHorarioTarefa(tarefa);
      const key = `${tarefa.dia_semana}-${horario}`;
      const list = map.get(key) || [];
      list.push(tarefa);
      map.set(key, list);
    });
    return map;
  }, [tarefasComHorario]);

  const tarefasSemHorarioPorDia = useMemo(() => {
    const map = new Map<DiaSemana, TarefaSemanal[]>();
    tarefasSemHorario.forEach((tarefa) => {
      const list = map.get(tarefa.dia_semana) || [];
      list.push(tarefa);
      map.set(tarefa.dia_semana, list);
    });
    return map;
  }, [tarefasSemHorario]);

  const resetForm = (dia: DiaSemana = 1, horario = '09:00') => {
    setFormData({
      titulo: '',
      descricao: '',
      prioridade: 'media',
      categoria: 'geral',
      dia_semana: dia,
      horario,
      recorrente: false,
    });
  };

  const handleOpenDialog = (dia?: DiaSemana, horario?: string) => {
    resetForm(dia || 1, horario || '09:00');
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo.trim()) return;

    const dataEspecifica = new Date(semanaAtual.data_inicio);
    dataEspecifica.setDate(dataEspecifica.getDate() + (formData.dia_semana - 1));

    try {
      await criarTarefa({
        ...formData,
        data_especifica: format(dataEspecifica, 'yyyy-MM-dd'),
        dados_recorrencia: {
          ...(formData.dados_recorrencia || {}),
          horario: formData.horario || null,
        },
      });
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
    }
  };

  const handleDelete = (tarefaId: string) => {
    setTarefaParaDeletar(tarefaId);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!tarefaParaDeletar) return;

    setIsDeleting(true);
    try {
      await deletarTarefa(tarefaParaDeletar);
      setShowDeleteDialog(false);
      setTarefaParaDeletar(null);
      toast({
        title: 'Tarefa excluida',
        description: 'A tarefa foi removida com sucesso.',
        duration: 3000,
      });
    } catch (err) {
      console.error('Erro ao deletar tarefa:', err);
      toast({
        title: 'Erro ao excluir tarefa',
        description: 'Nao foi possivel excluir a tarefa. Tente novamente.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const TarefaCard = ({ tarefa, compact = false }: { tarefa: TarefaSemanal; compact?: boolean }) => {
    const horario = getHorarioTarefa(tarefa);

    return (
      <div
        className={`group w-full rounded-md border border-slate-200 border-l-4 p-2 text-left shadow-sm transition hover:shadow-md dark:border-slate-800 ${getPrioridadeColor(tarefa.prioridade)} ${
          tarefa.concluida ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleConcluida(tarefa.id);
            }}
            className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
              tarefa.concluida
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-300 bg-white hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-950'
            }`}
            aria-label={tarefa.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
          >
            {tarefa.concluida && <CheckCircle2 className="h-3 w-3" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={`break-words text-xs font-semibold leading-snug ${tarefa.concluida ? 'line-through' : ''}`}>
                {tarefa.titulo}
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(tarefa.id);
                }}
                className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/40"
                aria-label="Excluir tarefa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {!compact && tarefa.descricao && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                {tarefa.descricao}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {horario && (
                <span className="inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                  <Clock className="h-3 w-3" />
                  {horario}
                </span>
              )}
              <Badge className={`${getPrioridadeBadge(tarefa.prioridade)} h-5 px-1.5 text-[10px] capitalize`}>
                <Flag className="mr-1 h-3 w-3" />
                {tarefa.prioridade}
              </Badge>
              {tarefa.recorrente && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Rec
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        <Clock className="mx-auto mb-2 h-8 w-8 animate-spin" />
        Carregando tarefas...
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{semanaAtual.nome}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Badge variant="outline">{estatisticas.concluidas} de {estatisticas.total} concluidas</Badge>
            <Badge variant="outline">{estatisticas.pendentes} pendentes</Badge>
            {estatisticas.urgentes > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                {estatisticas.urgentes} urgentes
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={semanaAnterior}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={irParaHoje} disabled={semanaAtual.eh_semana_atual}>
            <Home className="mr-2 h-4 w-4" />
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={proximaSemana}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Tarefa
          </Button>
          {!semanaAtual.eh_semana_atual && (
            <Button variant="outline" size="sm" onClick={() => arquivarSemana(semanaAtual.semana_an)}>
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[76px_repeat(7,minmax(128px,1fr))] border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-center border-r border-slate-200 p-3 dark:border-slate-800">
                  <Clock className="h-4 w-4 text-slate-400" />
                </div>
                {diasDaSemana.map(({ dia, data }) => {
                  const hoje = format(new Date(), 'yyyy-MM-dd') === format(data, 'yyyy-MM-dd');
                  return (
                    <div
                      key={dia}
                      className={`border-r border-slate-200 p-3 text-center last:border-r-0 dark:border-slate-800 ${
                        hoje ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                      }`}
                    >
                      <p className={`text-xs font-semibold uppercase ${hoje ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {DIAS_SEMANA_ABREV[dia]}
                      </p>
                      <p className={`mt-0.5 text-lg font-bold ${hoje ? 'text-blue-700 dark:text-blue-200' : 'text-slate-900 dark:text-slate-100'}`}>
                        {format(data, 'dd/MM', { locale: ptBR })}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-[76px_repeat(7,minmax(128px,1fr))] border-b-2 border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex items-center justify-center border-r border-slate-200 p-2 dark:border-slate-800">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Dia todo</span>
                </div>
                {diasDaSemana.map(({ dia }) => {
                  const list = tarefasSemHorarioPorDia.get(dia) || [];
                  return (
                    <div
                      key={dia}
                      onClick={() => handleOpenDialog(dia, '')}
                      className="min-h-[76px] border-r border-slate-200 p-2 text-left transition hover:bg-slate-100/70 last:border-r-0 dark:border-slate-800 dark:hover:bg-slate-800/60"
                    >
                      <div className="space-y-2">
                        {list.map((tarefa) => (
                          <TarefaCard key={tarefa.id} tarefa={tarefa} compact />
                        ))}
                        {list.length === 0 && (
                          <div className="flex h-12 items-center justify-center rounded border border-dashed border-slate-200 text-slate-300 dark:border-slate-800 dark:text-slate-600">
                            <Plus className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="max-h-[640px] overflow-y-auto">
                {HORARIOS.map((horario) => (
                  <div
                    key={horario}
                    className="grid grid-cols-[76px_repeat(7,minmax(128px,1fr))] border-b border-slate-100 dark:border-slate-800"
                  >
                    <div className="border-r border-slate-200 p-2 pt-3 text-center dark:border-slate-800">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{horario}</span>
                    </div>
                    {diasDaSemana.map(({ dia }) => {
                      const key = `${dia}-${horario}`;
                      const list = tarefasPorSlot.get(key) || [];

                      return (
                        <div
                          key={key}
                          onClick={() => handleOpenDialog(dia, horario)}
                          className="group min-h-[78px] border-r border-slate-100 p-2 text-left transition hover:bg-blue-50/60 last:border-r-0 dark:border-slate-800 dark:hover:bg-blue-950/20"
                        >
                          <div className="space-y-2">
                            {list.map((tarefa) => (
                              <TarefaCard key={tarefa.id} tarefa={tarefa} />
                            ))}
                            {list.length === 0 && (
                              <div className="flex h-12 items-center justify-center rounded border border-dashed border-transparent text-slate-300 opacity-0 transition group-hover:border-slate-200 group-hover:opacity-100 dark:text-slate-600 dark:group-hover:border-slate-700">
                                <Plus className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
            <DialogDescription>Escolha o dia e o horario para encaixar a tarefa no planner.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Titulo *</label>
              <Input
                placeholder="Ex: Ligar para cliente"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Dia</label>
                <Select
                  value={formData.dia_semana.toString()}
                  onValueChange={(value) => setFormData({ ...formData, dia_semana: parseInt(value, 10) as DiaSemana })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {([1, 2, 3, 4, 5, 6, 7] as DiaSemana[]).map((dia) => (
                      <SelectItem key={dia} value={dia.toString()}>
                        {DIAS_SEMANA[dia]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Horario</label>
                <Input
                  type="time"
                  value={formData.horario}
                  onChange={(e) => setFormData({ ...formData, horario: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Prioridade</label>
              <Select
                value={formData.prioridade}
                onValueChange={(value) => setFormData({ ...formData, prioridade: value as PlannerFormData['prioridade'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Categoria</label>
              <Input
                placeholder="geral"
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Descricao</label>
              <Textarea
                placeholder="Detalhes da tarefa..."
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                Criar Tarefa
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Excluir Tarefa
            </DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir esta tarefa? Esta acao nao pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            A tarefa sera removida permanentemente.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir Tarefa
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
