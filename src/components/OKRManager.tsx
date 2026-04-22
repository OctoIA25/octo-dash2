/**
 * Gerenciador de OKRs (Objectives and Key Results) com CRUD completo
 */

import { useState } from 'react';
import { useOKRs, OKR, StatusOKR, KeyResult, calcularProgressoKR } from '@/hooks/useOKRs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
  Target, 
  Plus, 
  Trash2, 
  Edit2,
  X,
  Save
} from 'lucide-react';

export const OKRManager = () => {
  const { 
    okrs, 
    isLoading, 
    criarOKR, 
    atualizarOKR, 
    removerKeyResult,
    deletarOKR, 
    estatisticas 
  } = useOKRs();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOKR, setEditingOKR] = useState<OKR | null>(null);
  
  // Estrutura inicial para Key Results no formulário
  const criarKRVazio = (): KeyResult => ({
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    titulo: '',
    meta: 0,
    alcancadoQ1: 0,
    alcancadoQ2: 0,
    alcancadoQ3: 0,
    alcancadoQ4: 0,
    concluido: false,
    progresso: 0
  });

  // Form state
  const [formData, setFormData] = useState({
    titulo: '',
    trimestre: 'Q1',
    ano: new Date().getFullYear(),
    status: 'planejado' as StatusOKR,
    cor: 'red',
    key_results: [criarKRVazio(), criarKRVazio(), criarKRVazio()] as KeyResult[]
  });

  const resetForm = () => {
    setFormData({
      titulo: '',
      trimestre: 'Q1',
      ano: new Date().getFullYear(),
      status: 'planejado',
      cor: 'red',
      key_results: [criarKRVazio(), criarKRVazio(), criarKRVazio()]
    });
    setEditingOKR(null);
  };

  const handleOpenDialog = (okr?: OKR) => {
    if (okr) {
      setEditingOKR(okr);
      // Garantir que key_results tenha pelo menos 3 itens
      const krs = okr.key_results.length >= 3 
        ? okr.key_results 
        : [...okr.key_results, ...Array(3 - okr.key_results.length).fill(null).map(() => criarKRVazio())];
      setFormData({
        titulo: okr.titulo,
        trimestre: okr.trimestre,
        ano: okr.ano,
        status: okr.status,
        cor: okr.cor,
        key_results: krs
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
      alert('Digite um título para o OKR');
      return;
    }

    // Filtrar apenas KRs com título preenchido e calcular progresso de cada um
    const krsValidos = formData.key_results
      .filter(kr => kr.titulo.trim())
      .map(kr => ({
        ...kr,
        progresso: calcularProgressoKR(kr),
        concluido: calcularProgressoKR(kr) >= 100
      }));

    // Calcular progresso geral do OKR (média dos KRs)
    const progressoGeral = krsValidos.length > 0
      ? Math.round(krsValidos.reduce((acc, kr) => acc + kr.progresso, 0) / krsValidos.length)
      : 0;

    try {
      if (editingOKR?.id) {
        await atualizarOKR(editingOKR.id, {
          ...formData,
          key_results: krsValidos,
          progresso: progressoGeral
        });
      } else {
        await criarOKR({
          ...formData,
          progresso: progressoGeral,
          key_results: krsValidos,
          ordem: okrs.length
        });
      }
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao salvar OKR:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Tem certeza que deseja excluir este OKR?')) {
      await deletarOKR(id);
    }
  };

  const getStatusColor = (status: StatusOKR) => {
    switch (status) {
      case 'planejado':
        return 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 text-gray-700 dark:text-slate-300 dark:text-gray-400';
      case 'em_andamento':
        return 'bg-blue-100 dark:bg-blue-950/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 dark:text-blue-400';
      case 'concluido':
        return 'bg-green-100 dark:bg-green-950/60 dark:bg-green-900/30 text-green-700 dark:text-green-300 dark:text-green-400';
      case 'cancelado':
        return 'bg-red-100 dark:bg-red-950/60 dark:bg-red-900/30 text-red-700 dark:text-red-300 dark:text-red-400';
      default:
        return 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 text-gray-700 dark:text-slate-300 dark:text-gray-400';
    }
  };

  const getCorBorda = (cor: string) => {
    const cores = {
      orange: 'border-l-orange-500',
      blue: 'border-l-blue-500',
      green: 'border-l-green-500',
      purple: 'border-l-purple-500',
      red: 'border-l-red-500'
    };
    return cores[cor as keyof typeof cores] || 'border-l-orange-500';
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-slate-400">
        Carregando OKRs...
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header com Estatísticas */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
            OKRs - Objectives and Key Results
          </h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
            Progresso médio: {estatisticas.progressoMedio}% • {estatisticas.em_andamento} em andamento
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {estatisticas.total} OKRs
          </Badge>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Novo OKR
          </Button>
        </div>
      </div>

      {/* Lista de OKRs */}
      {okrs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Target className="h-20 w-20 text-gray-300 dark:text-gray-600 mx-auto mb-6" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
              Nenhum OKR encontrado
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-6">
              Comece definindo seus objetivos e resultados-chave
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro OKR
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {okrs.map((okr) => (
            <Card key={okr.id} className={`border-l-4 ${getCorBorda(okr.cor)}`}>
              <CardContent className="p-6">
                {/* Header do OKR */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                        {okr.titulo}
                      </h3>
                      <Badge className={getStatusColor(okr.status)}>
                        {okr.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {okr.descricao && (
                      <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-2">
                        {okr.descricao}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {okr.trimestre} {okr.ano}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Ações */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(okr)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => okr.id && handleDelete(okr.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-300" />
                    </Button>
                  </div>
                </div>

                {/* Progresso */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-700 dark:text-slate-300 dark:text-gray-300">Progresso</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100 dark:text-white">{okr.progresso}%</span>
                  </div>
                  <Progress value={okr.progresso} className="h-2" />
                </div>

                {/* Key Results - Nova visualização com Meta e Quarters */}
                <div className="pt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                      Key Results ({okr.key_results.length})
                    </h4>
                  </div>
                  
                  {okr.key_results.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-slate-400 dark:text-gray-400 italic">
                      Nenhum Key Result definido ainda
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {/* Header da tabela */}
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-slate-400 dark:text-gray-400 px-2 py-1 bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 rounded">
                        <div className="col-span-4">Key Result</div>
                        <div className="col-span-1 text-center">Meta</div>
                        <div className="col-span-1 text-center">Q1</div>
                        <div className="col-span-1 text-center">Q2</div>
                        <div className="col-span-1 text-center">Q3</div>
                        <div className="col-span-1 text-center">Q4</div>
                        <div className="col-span-2 text-center">% Alcançado</div>
                        <div className="col-span-1"></div>
                      </div>
                      
                      {/* Linhas de Key Results */}
                      {okr.key_results.map((kr) => {
                        const progresso = calcularProgressoKR(kr);
                        return (
                          <div key={kr.id} className="grid grid-cols-12 gap-2 items-center px-2 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 dark:hover:bg-gray-800 rounded">
                            <div className="col-span-4 flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                progresso >= 100 ? 'bg-green-500' : progresso >= 50 ? 'bg-yellow-500' : 'bg-gray-300'
                              }`} />
                              <span className={`text-sm truncate ${
                                progresso >= 100
                                  ? 'text-gray-500 dark:text-slate-400 dark:text-gray-400 line-through'
                                  : 'text-gray-900 dark:text-slate-100 dark:text-white'
                              }`}>
                                {kr.titulo}
                              </span>
                            </div>
                            <div className="col-span-1 text-center text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300">
                              {kr.meta || '-'}
                            </div>
                            <div className="col-span-1 text-center text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              {kr.alcancadoQ1 || '-'}
                            </div>
                            <div className="col-span-1 text-center text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              {kr.alcancadoQ2 || '-'}
                            </div>
                            <div className="col-span-1 text-center text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              {kr.alcancadoQ3 || '-'}
                            </div>
                            <div className="col-span-1 text-center text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              {kr.alcancadoQ4 || '-'}
                            </div>
                            <div className="col-span-2 flex justify-center">
                              <Badge 
                                variant={progresso >= 100 ? "default" : "outline"}
                                className={`text-xs ${
                                  progresso >= 100 ? 'bg-green-500 text-white' : 
                                  progresso >= 50 ? 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300 border-yellow-300' : ''
                                }`}
                              >
                                {progresso.toFixed(1)}%
                              </Badge>
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => okr.id && removerKeyResult(okr.id, kr.id)}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Criar/Editar OKR */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingOKR ? 'Editar OKR' : 'Novo OKR'}
            </DialogTitle>
            <DialogDescription>
              {editingOKR ? 'Atualize as informações do OKR' : 'Defina um novo objetivo e seus resultados-chave'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Título */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                Objetivo *
              </label>
              <Input
                placeholder="Ex: Aumentar conversão em 25%"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                required
              />
            </div>

            {/* Key Results */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white">
                  Key Results (3-5 resultados)
                </label>
                {formData.key_results.length < 5 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData({
                      ...formData,
                      key_results: [...formData.key_results, criarKRVazio()]
                    })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar
                  </Button>
                )}
              </div>
              
              {/* Header da tabela */}
              <div className="grid grid-cols-12 gap-1 text-xs font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400 px-1">
                <div className="col-span-3">Key Result</div>
                <div className="col-span-1 text-center">Meta</div>
                <div className="col-span-1 text-center">Q1</div>
                <div className="col-span-1 text-center">Q2</div>
                <div className="col-span-1 text-center">Q3</div>
                <div className="col-span-1 text-center">Q4</div>
                <div className="col-span-2 text-center">% Alcançado</div>
                <div className="col-span-2"></div>
              </div>

              {/* Linhas de Key Results */}
              {formData.key_results.map((kr, index) => {
                const progresso = calcularProgressoKR(kr);
                return (
                  <div key={kr.id} className="grid grid-cols-12 gap-1 items-center">
                    <div className="col-span-3">
                      <Input
                        placeholder={`KR ${index + 1}`}
                        value={kr.titulo}
                        onChange={(e) => {
                          const novosKRs = [...formData.key_results];
                          novosKRs[index] = { ...kr, titulo: e.target.value };
                          setFormData({ ...formData, key_results: novosKRs });
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        placeholder="Meta"
                        value={kr.meta || ''}
                        onChange={(e) => {
                          const novosKRs = [...formData.key_results];
                          novosKRs[index] = { ...kr, meta: parseFloat(e.target.value) || 0 };
                          setFormData({ ...formData, key_results: novosKRs });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        placeholder="Q1"
                        value={kr.alcancadoQ1 || ''}
                        onChange={(e) => {
                          const novosKRs = [...formData.key_results];
                          novosKRs[index] = { ...kr, alcancadoQ1: parseFloat(e.target.value) || 0 };
                          setFormData({ ...formData, key_results: novosKRs });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        placeholder="Q2"
                        value={kr.alcancadoQ2 || ''}
                        onChange={(e) => {
                          const novosKRs = [...formData.key_results];
                          novosKRs[index] = { ...kr, alcancadoQ2: parseFloat(e.target.value) || 0 };
                          setFormData({ ...formData, key_results: novosKRs });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        placeholder="Q3"
                        value={kr.alcancadoQ3 || ''}
                        onChange={(e) => {
                          const novosKRs = [...formData.key_results];
                          novosKRs[index] = { ...kr, alcancadoQ3: parseFloat(e.target.value) || 0 };
                          setFormData({ ...formData, key_results: novosKRs });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        placeholder="Q4"
                        value={kr.alcancadoQ4 || ''}
                        onChange={(e) => {
                          const novosKRs = [...formData.key_results];
                          novosKRs[index] = { ...kr, alcancadoQ4: parseFloat(e.target.value) || 0 };
                          setFormData({ ...formData, key_results: novosKRs });
                        }}
                        className="h-8 text-xs text-center"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <Badge 
                        variant={progresso >= 100 ? "default" : "outline"}
                        className={`text-xs ${progresso >= 100 ? 'bg-green-500' : progresso >= 50 ? 'bg-yellow-500' : ''}`}
                      >
                        {progresso.toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {formData.key_results.length > 3 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const novosKRs = formData.key_results.filter((_, i) => i !== index);
                            setFormData({ ...formData, key_results: novosKRs });
                          }}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trimestre e Ano */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                  Trimestre
                </label>
                <Select
                  value={formData.trimestre}
                  onValueChange={(value) => setFormData({ ...formData, trimestre: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                    <SelectItem value="Q2">Q2 (Abr-Jun)</SelectItem>
                    <SelectItem value="Q3">Q3 (Jul-Set)</SelectItem>
                    <SelectItem value="Q4">Q4 (Out-Dez)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                  Ano
                </label>
                <Input
                  type="number"
                  value={formData.ano}
                  onChange={(e) => setFormData({ ...formData, ano: parseInt(e.target.value) })}
                  min={2024}
                  max={2030}
                />
              </div>
            </div>

            {/* Status e Cor */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                  Status
                </label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as StatusOKR })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planejado">Planejado</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                  Prioridades
                </label>
                <Select
                  value={formData.cor}
                  onValueChange={(value) => setFormData({ ...formData, cor: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="red">🔴 Alta</SelectItem>
                    <SelectItem value="yellow">🟡 Média</SelectItem>
                    <SelectItem value="green">🟢 Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              
              <Button type="submit">
                <Save className="h-4 w-4 mr-2" />
                {editingOKR ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
};


