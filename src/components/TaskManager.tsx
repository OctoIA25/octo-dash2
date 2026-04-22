/**
 * Gerenciador de Tarefas com CRUD completo
 */

import { useState } from 'react';
import { useTarefas, Tarefa, PrioridadeTarefa } from '@/hooks/useTarefas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  CheckSquare2, 
  Plus, 
  Trash2, 
  Edit2, 
  Calendar,
  Flag,
  X,
  Save
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskManagerProps {
  isWeekView?: boolean;
}

export const TaskManager = ({ isWeekView = false }: TaskManagerProps) => {
  const { tarefas, isLoading, criarTarefa, atualizarTarefa, toggleTarefaConcluida, deletarTarefa, estatisticas } = useTarefas();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Tarefa | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media' as PrioridadeTarefa,
    data_vencimento: '',
    categoria: 'geral'
  });

  const resetForm = () => {
    setFormData({
      titulo: '',
      descricao: '',
      prioridade: 'media',
      data_vencimento: '',
      categoria: 'geral'
    });
    setEditingTask(null);
  };

  const handleOpenDialog = (tarefa?: Tarefa) => {
    if (tarefa) {
      setEditingTask(tarefa);
      setFormData({
        titulo: tarefa.titulo,
        descricao: tarefa.descricao || '',
        prioridade: tarefa.prioridade,
        data_vencimento: tarefa.data_vencimento || '',
        categoria: tarefa.categoria
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.titulo.trim()) {
      alert('Digite um título para a tarefa');
      return;
    }

    try {
      if (editingTask?.id) {
        // Atualizar
        await atualizarTarefa(editingTask.id, formData);
      } else {
        // Criar
        await criarTarefa({
          ...formData,
          concluida: false,
          ordem: tarefas.length
        });
      }
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao salvar tarefa:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
      await deletarTarefa(id);
    }
  };

  const getPrioridadeColor = (prioridade: PrioridadeTarefa) => {
    switch (prioridade) {
      case 'urgente':
        return 'bg-red-100 dark:bg-red-950/60 dark:bg-red-900/30 text-red-700 dark:text-red-300 dark:text-red-400 border-red-300';
      case 'alta':
        return 'bg-orange-100 dark:bg-orange-950/60 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 dark:text-orange-400 border-orange-300';
      case 'media':
        return 'bg-yellow-100 dark:bg-yellow-950/60 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 dark:text-yellow-400 border-yellow-300';
      case 'baixa':
        return 'bg-blue-100 dark:bg-blue-950/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 dark:text-blue-400 border-blue-300';
      default:
        return 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 text-gray-700 dark:text-slate-300 dark:text-gray-400 border-gray-300';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'dd MMM', { locale: ptBR });
    } catch {
      return null;
    }
  };

  // Filtrar tarefas para a visão semanal
  const tarefasExibidas = isWeekView 
    ? tarefas.filter(t => {
        // Mostrar tarefas dos próximos 7 dias ou sem data
        if (!t.data_vencimento) return true;
        const vencimento = new Date(t.data_vencimento);
        const hoje = new Date();
        const proximaSemana = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
        return vencimento >= hoje && vencimento <= proximaSemana;
      })
    : tarefas;

  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-slate-400">
        Carregando tarefas...
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header com Estatísticas */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
            {isWeekView ? 'Tarefas da Semana' : 'Todas as Tarefas'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
            {estatisticas.concluidas} de {estatisticas.total} tarefas concluídas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {estatisticas.pendentes} pendentes
          </Badge>
          {estatisticas.urgentes > 0 && (
            <Badge className="bg-red-100 dark:bg-red-950/60 dark:bg-red-900/30 text-red-700 dark:text-red-300 dark:text-red-400 text-sm px-3 py-1">
              {estatisticas.urgentes} urgentes
            </Badge>
          )}
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Lista de Tarefas */}
      {tarefasExibidas.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckSquare2 className="h-20 w-20 text-gray-300 dark:text-gray-600 mx-auto mb-6" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
              Nenhuma tarefa encontrada
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-6">
              Comece criando sua primeira tarefa
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Tarefa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {tarefasExibidas.map((tarefa) => (
                <div
                  key={tarefa.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${
                    tarefa.concluida
                      ? 'bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50 opacity-60'
                      : 'bg-white dark:bg-slate-900 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/60 dark:hover:bg-gray-800/80'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => tarefa.id && toggleTarefaConcluida(tarefa.id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      tarefa.concluida
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-400 hover:border-green-500'
                    }`}
                  >
                    {tarefa.concluida && <CheckSquare2 className="h-4 w-4 text-white" />}
                  </button>

                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`text-sm font-medium ${
                              tarefa.concluida
                                ? 'text-gray-500 dark:text-slate-400 dark:text-gray-400 line-through'
                                : 'text-gray-900 dark:text-slate-100 dark:text-white'
                            }`}>
                              {tarefa.titulo}
                            </p>
                            {tarefa.atribuida_por_admin && (
                              <>
                                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/40 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 dark:text-blue-400 border-blue-300">
                                  {tarefa.criador_nome || 'Admin'}
                                </Badge>
                                {tarefa.editavel_por_corretor === false && (
                                  <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950/40 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 dark:text-yellow-400 border-yellow-300">
                                    <User className="h-3 w-3 mr-1" />
                                    Não editável
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          {tarefa.descricao && (
                            <p className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400 mt-1 truncate">
                              {tarefa.descricao}
                            </p>
                          )}
                        </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Prioridade */}
                    <Badge className={`${getPrioridadeColor(tarefa.prioridade)} text-xs`}>
                      <Flag className="h-3 w-3 mr-1" />
                      {tarefa.prioridade}
                    </Badge>

                    {/* Data */}
                    {tarefa.data_vencimento && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDate(tarefa.data_vencimento)}
                      </Badge>
                    )}

                    {/* Ações */}
                    {/* Verificar se pode editar: se foi atribuída por admin e editavel_por_corretor = false, não pode editar */}
                    {!(tarefa.atribuida_por_admin && tarefa.editavel_por_corretor === false) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(tarefa)}
                          title="Editar tarefa"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => tarefa.id && handleDelete(tarefa.id)}
                          className="text-red-600 dark:text-red-300 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Deletar tarefa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {tarefa.atribuida_por_admin && tarefa.editavel_por_corretor === false && (
                      <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950/40 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 dark:text-yellow-400 border-yellow-300">
                        <User className="h-3 w-3 mr-1" />
                        Somente leitura
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Criar/Editar */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
            </DialogTitle>
            <DialogDescription>
              {editingTask ? 'Atualize as informações da tarefa' : 'Preencha os dados da nova tarefa'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Título */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
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
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                Descrição
              </label>
              <Textarea
                placeholder="Detalhes da tarefa..."
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows={3}
              />
            </div>

            {/* Prioridade */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                Prioridade
              </label>
              <Select
                value={formData.prioridade}
                onValueChange={(value) => setFormData({ ...formData, prioridade: value as PrioridadeTarefa })}
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

            {/* Data de Vencimento */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                Data de Vencimento
              </label>
              <Input
                type="date"
                value={formData.data_vencimento}
                onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })}
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              
              <Button type="submit">
                <Save className="h-4 w-4 mr-2" />
                {editingTask ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};


