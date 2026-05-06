/**
 * Página de Tarefas - Sistema Kanban Semanal
 * Substitui a página antiga que usava TaskManager
 */

import { useState } from 'react';
import { KanbanSemanalTarefas } from '@/components/KanbanSemanalTarefas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  CalendarDays, 
  History, 
  Settings, 
  BarChart3,
  Plus,
  Archive,
  RotateCcw,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTarefasSemanais } from '@/hooks/useTarefasSemanais';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const TarefasPage = () => {
  const {
    semanaAtual,
    estatisticas,
    historico,
    carregarHistorico,
    arquivarSemana,
  } = useTarefasSemanais();

  const [activeTab, setActiveTab] = useState('kanban');
  const [showArquivarDialog, setShowArquivarDialog] = useState(false);
  const [isArquivando, setIsArquivando] = useState(false);
  const { toast } = useToast();

  const handleArquivarSemana = async () => {
    setIsArquivando(true);
    try {
      await arquivarSemana(semanaAtual.semana_an);
      await carregarHistorico();
      setShowArquivarDialog(false);
      toast({
        title: "Semana arquivada com sucesso!",
        description: `A semana "${semanaAtual.nome}" foi arquivada e movida para o histórico.`,
        duration: 4000,
      });
    } catch (err) {
      console.error('Erro ao arquivar semana:', err);
      toast({
        title: "Erro ao arquivar semana",
        description: "Não foi possível arquivar a semana. Tente novamente.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsArquivando(false);
    }
  };

  const EstatisticasCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Estatísticas da Semana
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{estatisticas.total}</div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{estatisticas.concluidas}</div>
            <div className="text-sm text-gray-600">Concluídas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{estatisticas.pendentes}</div>
            <div className="text-sm text-gray-600">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{estatisticas.taxaConclusao}%</div>
            <div className="text-sm text-gray-600">Taxa</div>
          </div>
        </div>
        
        {estatisticas.urgentes > 0 && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-sm font-medium">
                {estatisticas.urgentes} tarefa{estatisticas.urgentes > 1 ? 's' : ''} urgente{estatisticas.urgentes > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
        
        {estatisticas.recorrentes > 0 && (
          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <RotateCcw className="h-4 w-4" />
              <span className="text-sm font-medium">
                {estatisticas.recorrentes} tarefa{estatisticas.recorrentes > 1 ? 's' : ''} recorrente{estatisticas.recorrentes > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const HistoricoTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Histórico de Semanas</h3>
        <Button variant="outline" size="sm" onClick={carregarHistorico}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>
      
      {historico.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Nenhuma semana arquivada
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              As semanas serão arquivadas automaticamente quando você passar para a próxima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {historico.map((semana) => (
            <Card key={semana.semana_an}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">
                      Semana {format(new Date(semana.data_inicio), 'dd/MM')} - {format(new Date(semana.data_fim), 'dd/MM/yyyy')}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Arquivado em {format(new Date(semana.arquivado_em), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-semibold">{semana.tarefas_concluidas}/{semana.total_tarefas}</div>
                      <div className="text-sm text-gray-600">{semana.taxa_conclusao}%</div>
                    </div>
                    <div className="w-16 h-16">
                      <div className="relative w-full h-full">
                        <svg className="transform -rotate-90 w-16 h-16">
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            className="text-gray-200 dark:text-gray-700"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - semana.taxa_conclusao / 100)}`}
                            className="text-green-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-medium">{semana.taxa_conclusao}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Tarefas Semanais
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Organize suas tarefas por dia da semana
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {!semanaAtual.eh_semana_atual && (
            <Dialog open={showArquivarDialog} onOpenChange={setShowArquivarDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Archive className="h-4 w-4 mr-2" />
                  Arquivar Semana
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Arquivar Semana
                  </DialogTitle>
                  <DialogDescription>
                    Tem certeza que deseja arquivar a semana <span className="font-semibold">"{semanaAtual.nome}"</span>?
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-orange-800 dark:text-orange-200">
                        <p className="font-medium mb-1">Esta ação irá:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>Mover todas as tarefas desta semana para o histórico</li>
                          <li>Limpar a visão atual do Kanban</li>
                          <li>Manter os dados no histórico para consulta futura</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowArquivarDialog(false)}
                    disabled={isArquivando}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleArquivarSemana}
                    disabled={isArquivando}
                  >
                    {isArquivando ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Arquivando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Arquivar Semana
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="kanban" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Kanban
          </TabsTrigger>
          <TabsTrigger value="estatisticas" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Estatísticas
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="space-y-6">
          <KanbanSemanalTarefas />
        </TabsContent>

        <TabsContent value="estatisticas" className="space-y-6">
          <EstatisticasCard />
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <HistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
