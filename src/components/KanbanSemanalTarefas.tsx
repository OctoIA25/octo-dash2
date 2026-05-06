/**
 * Componente Kanban Semanal de Tarefas
 * Substitui o TaskManager antigo por um Kanban com dias da semana
 */

import { useState } from 'react';
import { useTarefasSemanais, DIAS_SEMANA, DIAS_SEMANA_ABREV, DiaSemana, CreateTarefaSemanal } from '@/hooks/useTarefasSemanais';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  RotateCcw,
  Archive,
  Home,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const KanbanSemanalTarefas = () => {
  const {
    tarefasPorDia,
    isLoading,
    semanaAtual,
    proximaSemana,
    semanaAnterior,
    irParaHoje,
    criarTarefa,
    atualizarTarefa,
    deletarTarefa,
    toggleConcluida,
    estatisticas,
    arquivarSemana,
  } = useTarefasSemanais();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CreateTarefaSemanal>({
    titulo: '',
    descricao: '',
    prioridade: 'media',
    categoria: 'geral',
    dia_semana: 1, // Segunda-feira
    recorrente: false,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tarefaParaDeletar, setTarefaParaDeletar] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const resetForm = () => {
    setFormData({
      titulo: '',
      descricao: '',
      prioridade: 'media',
      categoria: 'geral',
      dia_semana: 1,
      recorrente: false,
    });
  };

  const handleOpenDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.titulo.trim()) {
      return;
    }

    try {
      await criarTarefa(formData);
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
    }
  };

  const handleDelete = async (tarefaId: string) => {
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
        title: "Tarefa excluída!",
        description: "A tarefa foi removida com sucesso.",
        duration: 3000,
      });
    } catch (err) {
      console.error('Erro ao deletar tarefa:', err);
      toast({
        title: "Erro ao excluir tarefa",
        description: "Não foi possível excluir a tarefa. Tente novamente.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'urgente':
        return 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300';
      case 'alta':
        return 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-300';
      case 'media':
        return 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300 border-yellow-300';
      case 'baixa':
        return 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300';
    }
  };

  const TarefaCard = ({ tarefa }: { tarefa: any }) => {
    const [expanded, setExpanded] = useState(false);
    const hasLongTitle = tarefa.titulo.length > 50;
    const hasLongDescription = tarefa.descricao && tarefa.descricao.length > 100;

    return (
      <div className={`group bg-white dark:bg-gray-800 border rounded-xl p-4 mb-3 transition-all duration-200 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 ${
        tarefa.concluida 
          ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' 
          : 'hover:translate-y-[-1px] hover:shadow-xl'
      }`}>
        <div className="flex items-start gap-3">
          {/* Checkbox - Tamanho médio */}
          <button
            onClick={() => toggleConcluida(tarefa.id)}
            className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 ${
              tarefa.concluida
                ? 'border-blue-500 bg-blue-500 hover:border-blue-600'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
            }`}
          >
            {tarefa.concluida && <CheckCircle2 className="h-3 w-3 text-white" />}
          </button>

          {/* Conteúdo - Tamanho médio e corrigido */}
          <div className="flex-1 min-w-0">
            {/* Título - Tamanho médio */}
            <div className="mb-2">
              <h4 className={`text-sm font-semibold leading-normal ${
                tarefa.concluida
                  ? 'text-gray-500 dark:text-gray-400 line-through'
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {hasLongTitle && !expanded ? (
                  <>
                    {tarefa.titulo.substring(0, 60)}
                    <span className="text-blue-500 hover:text-blue-600 text-xs ml-1 cursor-pointer" onClick={() => setExpanded(true)}>
                      ...mais
                    </span>
                  </>
                ) : (
                  tarefa.titulo
                )}
              </h4>
            </div>
            
            {/* Descrição - Texto médio e corrigido */}
            {tarefa.descricao && (
              <div className="mb-3">
                {(hasLongDescription && !expanded) ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-normal">
                    {tarefa.descricao.substring(0, 120)}
                    <span className="text-blue-500 hover:text-blue-600 text-xs ml-1 cursor-pointer" onClick={() => setExpanded(true)}>
                      ...ver mais
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-normal whitespace-pre-wrap break-words">
                    {tarefa.descricao}
                  </p>
                )}
              </div>
            )}

            {/* Badges - Tamanho médio */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className={`${getPrioridadeColor(tarefa.prioridade)} text-xs px-2 py-1 rounded-full font-medium`}>
                <Flag className="h-3 w-3 mr-1" />
                {tarefa.prioridade}
              </Badge>

              {tarefa.recorrente && (
                <Badge variant="outline" className="text-xs px-2 py-1 rounded-full border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Rec
                </Badge>
              )}

              {tarefa.tags && tarefa.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tarefa.tags.slice(0, 2).map((tag: string, index: number) => (
                    <Badge key={index} variant="secondary" className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">
                      {tag}
                    </Badge>
                  ))}
                  {tarefa.tags.length > 2 && (
                    <Badge variant="secondary" className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      +{tarefa.tags.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Botão de colapso - Tamanho médio */}
            {expanded && (hasLongTitle || hasLongDescription) && (
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 underline transition-colors"
              >
                mostrar menos
              </button>
            )}
          </div>

          {/* Ações - Tamanho médio */}
          <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(tarefa.id)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
              title="Deletar tarefa"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const KanbanColumn = ({ dia, tarefas }: { dia: DiaSemana; tarefas: any[] }) => {
    const dataDia = new Date(semanaAtual.data_inicio);
    dataDia.setDate(dataDia.getDate() + (dia - 1));
    const ehHoje = format(new Date(), 'yyyy-MM-dd') === format(dataDia, 'yyyy-MM-dd');
    const passou = dataDia.getTime() < new Date().setHours(0, 0, 0, 0);

    return (
      <div className={`bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col h-full min-h-[500px] w-full transition-all duration-200 ${
        ehHoje 
          ? 'ring-3 ring-blue-500 border-blue-300 dark:border-blue-600 shadow-xl' 
          : passou 
            ? 'opacity-60' 
            : 'hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600'
      }`}>
        {/* Header da coluna - Maior */}
        <div className={`px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 ${
          ehHoje ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-white dark:bg-gray-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className={`font-bold text-base truncate ${
                ehHoje ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
              }`}>
                {DIAS_SEMANA_ABREV[dia]}
              </h3>
              <p className={`text-sm truncate ${
                ehHoje 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                {format(dataDia, 'dd/MM', { locale: ptBR })}
              </p>
            </div>
            <div className={`px-3 py-2 rounded-full text-sm font-bold flex-shrink-0 ml-3 ${
              ehHoje 
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' 
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {tarefas.length}
            </div>
          </div>
        </div>

        {/* Conteúdo da coluna - Maior */}
        <div className="flex-1 p-5 overflow-y-auto">
          <div className="space-y-3 min-h-full">
            {tarefas.map((tarefa) => (
              <TarefaCard key={tarefa.id} tarefa={tarefa} />
            ))}
            
            {tarefas.length === 0 && (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-base font-medium">Nenhuma tarefa</p>
                <p className="text-sm mt-2 opacity-60">Arraste ou crie aqui</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" />
        Carregando tarefas...
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header - Responsivo */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 lg:mb-2 truncate">
            {semanaAtual.nome}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>{estatisticas.concluidas} de {estatisticas.total} concluídas</span>
            <span>{(estatisticas.taxaConclusao || 0)}%</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto lg:ml-48">
          {/* Navegação */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={semanaAnterior} className="flex-shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={irParaHoje}
              disabled={semanaAtual.eh_semana_atual}
              className="flex-shrink-0"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={proximaSemana} className="flex-shrink-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Estatísticas */}
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant="outline" className="text-xs sm:text-sm">
              {estatisticas.pendentes} pendentes
            </Badge>
            {estatisticas.urgentes > 0 && (
              <Badge className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs sm:text-sm">
                {estatisticas.urgentes} urgentes
              </Badge>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1">
            <Button onClick={handleOpenDialog} className="flex-shrink-0 flex items-center justify-center">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Nova Tarefa</span>
            </Button>
            
            {!semanaAtual.eh_semana_atual && (
              <Button 
                variant="outline" 
                onClick={() => arquivarSemana(semanaAtual.semana_an)}
                className="flex-shrink-0 flex items-center justify-center"
              >
                <Archive className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Arquivar</span>
                <span className="sm:hidden">📁</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Kanban Grid - Responsivo com colunas mais largas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
        {([1, 2, 3, 4, 5, 6, 7] as DiaSemana[]).map((dia) => (
          <KanbanColumn 
            key={dia} 
            dia={dia} 
            tarefas={tarefasPorDia[dia] || []}
          />
        ))}
      </div>

      {/* Dialog de Criação */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
            <DialogDescription>
              Preencha os dados da nova tarefa para a semana atual
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Título */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">
                Título *
              </label>
              <Input
                placeholder="Ex: Ligar para cliente"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                required
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">
                Descrição
              </label>
              <Textarea
                placeholder="Detalhes da tarefa..."
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows={3}
              />
            </div>

            {/* Dia da Semana */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">
                Dia da Semana *
              </label>
              <Select
                value={formData.dia_semana.toString()}
                onValueChange={(value) => setFormData({ ...formData, dia_semana: parseInt(value) as DiaSemana })}
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

            {/* Prioridade */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">
                Prioridade
              </label>
              <Select
                value={formData.prioridade}
                onValueChange={(value) => setFormData({ ...formData, prioridade: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 block">
                Categoria
              </label>
              <Input
                placeholder="geral"
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              
              <Button type="submit">
                <Plus className="h-4 w-4 mr-2" />
                Criar Tarefa
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Delete */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Excluir Tarefa
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  <p className="font-medium mb-1">Esta ação irá:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Remover permanentemente a tarefa</li>
                    <li>Perder todos os dados associados</li>
                    <li>Não poderá ser desfeita</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
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
