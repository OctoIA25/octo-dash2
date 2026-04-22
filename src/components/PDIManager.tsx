/**
 * Gerenciador de PDI (Plano de Desenvolvimento Individual) com CRUD completo
 * Suporta 3 tipos: Individual, Dinamo e Personalizado
 */

import { useState } from 'react';
import { usePDI, PDI, NivelCompetencia, StatusPDI, TipoPDI } from '@/hooks/usePDI';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  GraduationCap, 
  Plus, 
  Trash2, 
  Edit2,
  CheckSquare2,
  X,
  Save,
  TrendingUp,
  Zap,
  Settings2,
  User
} from 'lucide-react';

// Tipos para PDI Dinamo/Personalizado
export type PDIType = 'individual' | 'dinamo' | 'personalizado';

export interface PDIDinamoRow {
  id: string;
  col1: string; // Qual?/Corretor
  col2: string; // Inicio/Data
  col3: string; // Término/Imóvel
  col4?: string; // Visto do Corretor (checkbox)
  vistoCorretor?: boolean;
}

export interface PDIDinamoSection {
  id: string;
  titulo: string;
  tituloOriginal: string; // Para detectar se foi editado
  campos: ('qual' | 'inicio' | 'termino' | 'corretor' | 'data' | 'imovel' | 'visto')[];
  rows: PDIDinamoRow[];
}

// Seções padrão do PDI Dinamo
const DEFAULT_DINAMO_SECTIONS: PDIDinamoSection[] = [
  {
    id: '1',
    titulo: '1 - Treinamentos Online - Disponibilidade: Diária',
    tituloOriginal: '1 - Treinamentos Online - Disponibilidade: Diária',
    campos: ['qual', 'inicio', 'termino'],
    rows: []
  },
  {
    id: '2',
    titulo: '2 - Acompanhar 5 corretores diferentes nas primeiras visitas de captação deste corretor',
    tituloOriginal: '2 - Acompanhar 5 corretores diferentes nas primeiras visitas de captação deste corretor',
    campos: ['corretor', 'data', 'imovel', 'visto'],
    rows: []
  },
  {
    id: '3',
    titulo: '3 - Realizar 5 visitas com clientes compradores',
    tituloOriginal: '3 - Realizar 5 visitas com clientes compradores',
    campos: ['corretor', 'data', 'imovel', 'visto'],
    rows: []
  },
  {
    id: '4',
    titulo: '4 - Assistir 5 apresentações de Estudo de Mercado com corretores diferentes',
    tituloOriginal: '4 - Assistir 5 apresentações de Estudo de Mercado com corretores diferentes',
    campos: ['corretor', 'data', 'imovel', 'visto'],
    rows: []
  },
  {
    id: '5',
    titulo: '5 - Preparar 5 ACM\'s (Análise Corporativa de Mercado) para o seu gerente',
    tituloOriginal: '5 - Preparar 5 ACM\'s (Análise Corporativa de Mercado) para o seu gerente',
    campos: ['corretor', 'data', 'imovel', 'visto'],
    rows: []
  }
];

// Seção vazia para PDI Personalizado
const EMPTY_PERSONALIZADO_SECTION: PDIDinamoSection = {
  id: '',
  titulo: '',
  tituloOriginal: '',
  campos: ['corretor', 'data', 'imovel', 'visto'],
  rows: []
};

export const PDIManager = () => {
  const { 
    pdis, 
    isLoading, 
    criarPDI, 
    atualizarPDI, 
    adicionarAcao,
    toggleAcao,
    removerAcao,
    deletarPDI, 
    estatisticas 
  } = usePDI();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acaoDialogOpen, setAcaoDialogOpen] = useState(false);
  const [editingPDI, setEditingPDI] = useState<PDI | null>(null);
  const [selectedPDIId, setSelectedPDIId] = useState<number | null>(null);
  const [novaAcaoDescricao, setNovaAcaoDescricao] = useState('');
  const [novaAcaoPrazo, setNovaAcaoPrazo] = useState('');
  
  // Estados para abas do popup
  const [activeTab, setActiveTab] = useState<PDIType>('individual');
  const [dinamoSections, setDinamoSections] = useState<PDIDinamoSection[]>(
    JSON.parse(JSON.stringify(DEFAULT_DINAMO_SECTIONS))
  );
  const [personalizadoSections, setPersonalizadoSections] = useState<PDIDinamoSection[]>([
    { ...EMPTY_PERSONALIZADO_SECTION, id: Date.now().toString() }
  ]);
  const [pdiTitulo, setPdiTitulo] = useState('');
  const [wasConvertedToPersonalizado, setWasConvertedToPersonalizado] = useState(false);
  
  // Form state para PDI Individual
  const [formData, setFormData] = useState({
    competencia: '',
    nivel_atual: 'iniciante' as NivelCompetencia,
    nivel_desejado: 'intermediario' as NivelCompetencia,
    status: 'planejado' as StatusPDI,
    prazo: '',
    observacoes: ''
  });

  const resetForm = () => {
    setFormData({
      competencia: '',
      nivel_atual: 'iniciante',
      nivel_desejado: 'intermediario',
      status: 'planejado',
      prazo: '',
      observacoes: ''
    });
    setEditingPDI(null);
    setActiveTab('individual');
    setDinamoSections(JSON.parse(JSON.stringify(DEFAULT_DINAMO_SECTIONS)));
    setPersonalizadoSections([{ ...EMPTY_PERSONALIZADO_SECTION, id: Date.now().toString() }]);
    setPdiTitulo('');
    setWasConvertedToPersonalizado(false);
  };

  const handleOpenDialog = (pdi?: PDI) => {
    if (pdi) {
      setEditingPDI(pdi);
      setFormData({
        competencia: pdi.competencia,
        nivel_atual: pdi.nivel_atual,
        nivel_desejado: pdi.nivel_desejado,
        status: pdi.status,
        prazo: pdi.prazo || '',
        observacoes: pdi.observacoes || ''
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

  // Funções para PDI Dinamo/Personalizado
  const handleTituloChange = (sectionId: string, novoTitulo: string, isDinamo: boolean) => {
    if (isDinamo) {
      const section = dinamoSections.find(s => s.id === sectionId);
      if (section && novoTitulo !== section.tituloOriginal) {
        // Converteu para personalizado ao editar título
        setWasConvertedToPersonalizado(true);
        setActiveTab('personalizado');
        setPersonalizadoSections(dinamoSections.map(s => 
          s.id === sectionId ? { ...s, titulo: novoTitulo } : s
        ));
      } else {
        setDinamoSections(prev => prev.map(s => 
          s.id === sectionId ? { ...s, titulo: novoTitulo } : s
        ));
      }
    } else {
      setPersonalizadoSections(prev => prev.map(s => 
        s.id === sectionId ? { ...s, titulo: novoTitulo } : s
      ));
    }
  };

  const addRowToSection = (sectionId: string, isDinamo: boolean) => {
    const newRow: PDIDinamoRow = {
      id: Date.now().toString(),
      col1: '',
      col2: '',
      col3: '',
      col4: '',
      vistoCorretor: false
    };

    if (isDinamo) {
      setDinamoSections(prev => prev.map(s => 
        s.id === sectionId ? { ...s, rows: [...s.rows, newRow] } : s
      ));
    } else {
      setPersonalizadoSections(prev => prev.map(s => 
        s.id === sectionId ? { ...s, rows: [...s.rows, newRow] } : s
      ));
    }
  };

  const updateRowInSection = (sectionId: string, rowId: string, field: keyof PDIDinamoRow, value: string | boolean, isDinamo: boolean) => {
    const updateFn = (sections: PDIDinamoSection[]) => 
      sections.map(s => 
        s.id === sectionId 
          ? { 
              ...s, 
              rows: s.rows.map(r => 
                r.id === rowId ? { ...r, [field]: value } : r
              ) 
            } 
          : s
      );

    if (isDinamo) {
      setDinamoSections(prev => updateFn(prev));
    } else {
      setPersonalizadoSections(prev => updateFn(prev));
    }
  };

  const removeRowFromSection = (sectionId: string, rowId: string, isDinamo: boolean) => {
    const removeFn = (sections: PDIDinamoSection[]) => 
      sections.map(s => 
        s.id === sectionId 
          ? { ...s, rows: s.rows.filter(r => r.id !== rowId) } 
          : s
      );

    if (isDinamo) {
      setDinamoSections(prev => removeFn(prev));
    } else {
      setPersonalizadoSections(prev => removeFn(prev));
    }
  };

  const addPersonalizadoSection = () => {
    setPersonalizadoSections(prev => [
      ...prev,
      { 
        ...EMPTY_PERSONALIZADO_SECTION, 
        id: Date.now().toString(),
        campos: ['corretor', 'data', 'imovel', 'visto']
      }
    ]);
  };

  const removePersonalizadoSection = (sectionId: string) => {
    setPersonalizadoSections(prev => prev.filter(s => s.id !== sectionId));
  };

  const getCampoLabel = (campo: string) => {
    const labels: Record<string, string> = {
      qual: 'Qual?',
      inicio: 'Início',
      termino: 'Término',
      corretor: 'Corretor',
      data: 'Data',
      imovel: 'Imóvel',
      visto: 'Visto do Corretor'
    };
    return labels[campo] || campo;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.competencia.trim()) {
      alert('Digite uma competência');
      return;
    }

    try {
      if (editingPDI?.id) {
        await atualizarPDI(editingPDI.id, { ...formData, tipo: 'individual' });
      } else {
        await criarPDI({
          ...formData,
          tipo: 'individual',
          progresso: 0,
          acoes: [],
          ordem: pdis.length
        });
      }
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao salvar PDI:', err);
    }
  };

  // Salvar PDI Dinamo
  const handleSaveDinamo = async () => {
    try {
      await criarPDI({
        tipo: 'dinamo',
        competencia: 'PDI Dinamo',
        nivel_atual: 'iniciante',
        nivel_desejado: 'avancado',
        progresso: 0,
        acoes: [],
        status: 'em_andamento',
        ordem: pdis.length,
        sections: dinamoSections
      });
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao salvar PDI Dinamo:', err);
    }
  };

  // Salvar PDI Personalizado
  const handleSavePersonalizado = async () => {
    try {
      await criarPDI({
        tipo: 'personalizado',
        competencia: 'PDI Personalizado',
        nivel_atual: 'iniciante',
        nivel_desejado: 'avancado',
        progresso: 0,
        acoes: [],
        status: 'em_andamento',
        ordem: pdis.length,
        sections: personalizadoSections
      });
      handleCloseDialog();
    } catch (err) {
      console.error('Erro ao salvar PDI Personalizado:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Tem certeza que deseja excluir este PDI?')) {
      await deletarPDI(id);
    }
  };

  const handleOpenAcaoDialog = (pdiId: number) => {
    setSelectedPDIId(pdiId);
    setNovaAcaoDescricao('');
    setNovaAcaoPrazo('');
    setAcaoDialogOpen(true);
  };

  const handleAdicionarAcao = async () => {
    if (!selectedPDIId || !novaAcaoDescricao.trim()) return;
    
    await adicionarAcao(selectedPDIId, novaAcaoDescricao, novaAcaoPrazo || undefined);
    setAcaoDialogOpen(false);
    setNovaAcaoDescricao('');
    setNovaAcaoPrazo('');
  };

  const getNivelLabel = (nivel: NivelCompetencia) => {
    const labels = {
      iniciante: 'Iniciante',
      intermediario: 'Intermediário',
      avancado: 'Avançado',
      expert: 'Expert'
    };
    return labels[nivel];
  };

  const getNivelColor = (nivel: NivelCompetencia) => {
    const cores = {
      iniciante: 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 text-gray-700 dark:text-slate-300 dark:text-gray-400',
      intermediario: 'bg-blue-100 dark:bg-blue-950/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 dark:text-blue-400',
      avancado: 'bg-purple-100 dark:bg-purple-950/60 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 dark:text-purple-400',
      expert: 'bg-green-100 dark:bg-green-950/60 dark:bg-green-900/30 text-green-700 dark:text-green-300 dark:text-green-400'
    };
    return cores[nivel];
  };

  const getStatusColor = (status: StatusPDI) => {
    switch (status) {
      case 'planejado':
        return 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 text-gray-700 dark:text-slate-300 dark:text-gray-400';
      case 'em_andamento':
        return 'bg-blue-100 dark:bg-blue-950/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 dark:text-blue-400';
      case 'concluido':
        return 'bg-green-100 dark:bg-green-950/60 dark:bg-green-900/30 text-green-700 dark:text-green-300 dark:text-green-400';
      case 'pausado':
        return 'bg-yellow-100 dark:bg-yellow-950/60 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 dark:text-yellow-400';
      default:
        return 'bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 text-gray-700 dark:text-slate-300 dark:text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-slate-400">
        Carregando PDI...
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header com Estatísticas */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
            PDI - Plano de Desenvolvimento Individual
          </h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
            Progresso médio: {estatisticas.progressoMedio}% • {estatisticas.em_andamento} em andamento
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {estatisticas.total} competências
          </Badge>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Competência
          </Button>
        </div>
      </div>

      {/* Lista de PDIs */}
      {pdis.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <GraduationCap className="h-20 w-20 text-gray-300 dark:text-gray-600 mx-auto mb-6" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
              Nenhuma competência definida
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-6">
              Comece criando seu plano de desenvolvimento profissional
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Competência
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pdis.map((pdi) => (
            <Card key={pdi.id}>
              <CardContent className="p-6">
                {/* Header do PDI */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                        {pdi.competencia}
                      </h3>
                      <Badge variant="outline" className={
                        pdi.tipo === 'dinamo' ? 'border-blue-500 text-blue-600 dark:text-blue-300' :
                        pdi.tipo === 'personalizado' ? 'border-purple-500 text-purple-600 dark:text-purple-300' :
                        'border-gray-500 text-gray-600 dark:text-slate-400'
                      }>
                        {pdi.tipo === 'dinamo' ? 'Dinamo' : pdi.tipo === 'personalizado' ? 'Personalizado' : 'Individual'}
                      </Badge>
                      <Badge className={getStatusColor(pdi.status)}>
                        {pdi.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    
                    {/* Níveis - apenas para PDI Individual */}
                    {pdi.tipo === 'individual' && (
                      <div className="flex items-center gap-3 mb-3">
                        <div>
                          <p className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">Nível Atual</p>
                          <Badge className={getNivelColor(pdi.nivel_atual)}>
                            {getNivelLabel(pdi.nivel_atual)}
                          </Badge>
                        </div>
                        <TrendingUp className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                        <div>
                          <p className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">Nível Desejado</p>
                          <Badge className={getNivelColor(pdi.nivel_desejado)}>
                            {getNivelLabel(pdi.nivel_desejado)}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Seções - para PDI Dinamo/Personalizado */}
                    {(pdi.tipo === 'dinamo' || pdi.tipo === 'personalizado') && pdi.sections && (
                      <div className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-2">
                        {pdi.sections.length} seções • {pdi.sections.reduce((acc, s) => acc + s.rows.length, 0)} registros
                      </div>
                    )}

                    {pdi.prazo && (
                      <p className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400">
                        Prazo: {new Date(pdi.prazo).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  
                  {/* Ações */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(pdi)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => pdi.id && handleDelete(pdi.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-300" />
                    </Button>
                  </div>
                </div>

                {/* Progresso */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-700 dark:text-slate-300 dark:text-gray-300">Progresso</span>
                    <span className="font-semibold text-gray-900 dark:text-slate-100 dark:text-white">{pdi.progresso}%</span>
                  </div>
                  <Progress value={pdi.progresso} className="h-2" />
                </div>

                {/* Observações */}
                {pdi.observacoes && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-slate-300 dark:text-gray-300">
                      {pdi.observacoes}
                    </p>
                  </div>
                )}

                {/* Ações do PDI */}
                <div className="pt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                      Plano de Ação ({pdi.acoes.length})
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => pdi.id && handleOpenAcaoDialog(pdi.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar Ação
                    </Button>
                  </div>
                  
                  {pdi.acoes.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-slate-400 dark:text-gray-400 italic">
                      Nenhuma ação definida ainda
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {pdi.acoes.map((acao) => (
                        <li key={acao.id} className="flex items-start gap-3">
                          <button
                            onClick={() => pdi.id && toggleAcao(pdi.id, acao.id)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all mt-0.5 ${
                              acao.concluida
                                ? 'border-green-500 bg-green-500'
                                : 'border-gray-400 hover:border-green-500'
                            }`}
                          >
                            {acao.concluida && <CheckSquare2 className="h-4 w-4 text-white" />}
                          </button>
                          <div className="flex-1">
                            <span className={`text-sm ${
                              acao.concluida
                                ? 'text-gray-500 dark:text-slate-400 dark:text-gray-400 line-through'
                                : 'text-gray-900 dark:text-slate-100 dark:text-white'
                            }`}>
                              {acao.descricao}
                            </span>
                            {acao.prazo && (
                              <p className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400 mt-1">
                                Prazo: {new Date(acao.prazo).toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => pdi.id && removerAcao(pdi.id, acao.id)}
                          >
                            <X className="h-4 w-4 text-red-600 dark:text-red-300" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Criar/Editar PDI com 3 Abas */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-4xl h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingPDI ? 'Editar PDI' : 'Novo PDI'}
            </DialogTitle>
            <DialogDescription>
              Escolha o tipo de PDI que deseja criar
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PDIType)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="individual" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                PDI Individual
              </TabsTrigger>
              <TabsTrigger value="dinamo" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                PDI Dinamo
              </TabsTrigger>
              <TabsTrigger value="personalizado" className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                PDI Personalizado
              </TabsTrigger>
            </TabsList>

            {/* ========== ABA PDI INDIVIDUAL ========== */}
            <TabsContent value="individual" className="flex-1 overflow-auto">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                    Competência *
                  </label>
                  <Input
                    placeholder="Ex: Técnicas de fechamento de vendas"
                    value={formData.competencia}
                    onChange={(e) => setFormData({ ...formData, competencia: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                      Nível Atual
                    </label>
                    <Select
                      value={formData.nivel_atual}
                      onValueChange={(value) => setFormData({ ...formData, nivel_atual: value as NivelCompetencia })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iniciante">Iniciante</SelectItem>
                        <SelectItem value="intermediario">Intermediário</SelectItem>
                        <SelectItem value="avancado">Avançado</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                      Nível Desejado
                    </label>
                    <Select
                      value={formData.nivel_desejado}
                      onValueChange={(value) => setFormData({ ...formData, nivel_desejado: value as NivelCompetencia })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iniciante">Iniciante</SelectItem>
                        <SelectItem value="intermediario">Intermediário</SelectItem>
                        <SelectItem value="avancado">Avançado</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                      Status
                    </label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as StatusPDI })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planejado">Planejado</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                        <SelectItem value="pausado">Pausado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                      Prazo
                    </label>
                    <Input
                      type="date"
                      value={formData.prazo}
                      onChange={(e) => setFormData({ ...formData, prazo: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                    Observações
                  </label>
                  <Textarea
                    placeholder="Anotações sobre o desenvolvimento desta competência..."
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  
                  <Button type="submit">
                    <Save className="h-4 w-4 mr-2" />
                    {editingPDI ? 'Atualizar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* ========== ABA PDI DINAMO ========== */}
            <TabsContent value="dinamo" className="flex-1 overflow-y-auto mt-0 data-[state=active]:mt-0">
              <div className="space-y-4 pb-4">
                {dinamoSections.map((section) => (
                  <div key={section.id} className="border border-gray-200 dark:border-slate-800 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 dark:bg-gray-900">
                    {/* Título da Seção - Editável */}
                    <div className="border-b border-gray-200 dark:border-slate-800 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-slate-950 dark:bg-gray-800">
                      <Input
                        value={section.titulo}
                        onChange={(e) => handleTituloChange(section.id, e.target.value, true)}
                        className="border-none bg-transparent font-semibold text-sm text-gray-900 dark:text-slate-100 dark:text-white placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                        placeholder="Digite o título da seção..."
                      />
                    </div>
                      
                      {/* Header da Tabela */}
                      <div className="bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 border-b border-gray-200 dark:border-slate-800 dark:border-gray-700">
                        <div className={`grid ${section.campos.includes('visto') ? 'grid-cols-4' : 'grid-cols-3'} gap-2 p-2`}>
                          {section.campos.map((campo) => (
                            <div key={campo} className="text-xs font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300 px-2">
                              {getCampoLabel(campo)}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Linhas da Tabela */}
                      <div className="divide-y divide-gray-200 dark:divide-slate-800 dark:divide-gray-700">
                        {section.rows.map((row) => (
                          <div key={row.id} className={`grid ${section.campos.includes('visto') ? 'grid-cols-4' : 'grid-cols-3'} gap-2 p-2 items-center group`}>
                            <Input
                              value={row.col1}
                              onChange={(e) => updateRowInSection(section.id, row.id, 'col1', e.target.value, true)}
                              className="h-8 text-sm"
                              placeholder={section.campos[0] === 'qual' ? 'Nome do curso...' : 'Nome do corretor...'}
                            />
                            <Input
                              type={section.campos[1] === 'data' ? 'date' : 'date'}
                              value={row.col2}
                              onChange={(e) => updateRowInSection(section.id, row.id, 'col2', e.target.value, true)}
                              className="h-8 text-sm"
                            />
                            <Input
                              type={section.campos[2] === 'termino' ? 'date' : 'text'}
                              value={row.col3}
                              onChange={(e) => updateRowInSection(section.id, row.id, 'col3', e.target.value, true)}
                              className="h-8 text-sm"
                              placeholder={section.campos[2] === 'imovel' ? 'Código do imóvel...' : ''}
                            />
                            {section.campos.includes('visto') && (
                              <div className="flex items-center justify-between">
                                <Checkbox
                                  checked={row.vistoCorretor || false}
                                  onCheckedChange={(checked) => updateRowInSection(section.id, row.id, 'vistoCorretor', !!checked, true)}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                  onClick={() => removeRowFromSection(section.id, row.id, true)}
                                >
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            )}
                            {!section.campos.includes('visto') && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 absolute right-2"
                                onClick={() => removeRowFromSection(section.id, row.id, true)}
                              >
                                <X className="h-3 w-3 text-red-500" />
                              </Button>
                            )}
                          </div>
                        ))}
                        
                      {/* Botão Adicionar Linha */}
                      <div className="p-2 bg-gray-50/50 dark:bg-gray-800/50">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          onClick={() => addRowToSection(section.id, true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar linha
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                
                <Button type="button" onClick={handleSaveDinamo}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar PDI Dinamo
                </Button>
              </div>
            </TabsContent>

            {/* ========== ABA PDI PERSONALIZADO ========== */}
            <TabsContent value="personalizado" className="flex-1 overflow-y-auto mt-0 data-[state=active]:mt-0">
              <div className="space-y-4 pb-4">
                {personalizadoSections.map((section, index) => (
                  <div key={section.id} className="border border-gray-200 dark:border-slate-800 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 dark:bg-gray-900 relative">
                    {/* Botão Remover Seção */}
                    {personalizadoSections.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 z-10 h-6 w-6 p-0 hover:bg-red-500/10"
                        onClick={() => removePersonalizadoSection(section.id)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                    
                    {/* Título da Seção - Editável */}
                    <div className="border-b border-gray-200 dark:border-slate-800 dark:border-gray-700 px-4 py-3 pr-10 bg-gray-50 dark:bg-slate-950 dark:bg-gray-800">
                      <Input
                        value={section.titulo}
                        onChange={(e) => handleTituloChange(section.id, e.target.value, false)}
                        className="border-none bg-transparent font-semibold text-sm text-gray-900 dark:text-slate-100 dark:text-white placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                        placeholder={`${index + 1} - Digite o título do plano de desenvolvimento...`}
                      />
                    </div>
                      
                      {/* Header da Tabela */}
                      <div className="bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 border-b border-gray-200 dark:border-slate-800 dark:border-gray-700">
                        <div className="grid grid-cols-4 gap-2 p-2">
                          {section.campos.map((campo) => (
                            <div key={campo} className="text-xs font-semibold text-gray-700 dark:text-slate-300 dark:text-gray-300 px-2">
                              {getCampoLabel(campo)}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Linhas da Tabela */}
                      <div className="divide-y divide-gray-200 dark:divide-slate-800 dark:divide-gray-700">
                        {section.rows.map((row) => (
                          <div key={row.id} className="grid grid-cols-4 gap-2 p-2 items-center group">
                            <Input
                              value={row.col1}
                              onChange={(e) => updateRowInSection(section.id, row.id, 'col1', e.target.value, false)}
                              className="h-8 text-sm"
                              placeholder="Nome do corretor..."
                            />
                            <Input
                              type="date"
                              value={row.col2}
                              onChange={(e) => updateRowInSection(section.id, row.id, 'col2', e.target.value, false)}
                              className="h-8 text-sm"
                            />
                            <Input
                              value={row.col3}
                              onChange={(e) => updateRowInSection(section.id, row.id, 'col3', e.target.value, false)}
                              className="h-8 text-sm"
                              placeholder="Código do imóvel..."
                            />
                            <div className="flex items-center justify-between">
                              <Checkbox
                                checked={row.vistoCorretor || false}
                                onCheckedChange={(checked) => updateRowInSection(section.id, row.id, 'vistoCorretor', !!checked, false)}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                onClick={() => removeRowFromSection(section.id, row.id, false)}
                              >
                                <X className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        {/* Botão Adicionar Linha */}
                        <div className="p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            onClick={() => addRowToSection(section.id, false)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar linha
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Botão Adicionar Nova Seção */}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed"
                    onClick={addPersonalizadoSection}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Nova Seção
                  </Button>
                </div>
              
              <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                
                <Button type="button" onClick={handleSavePersonalizado}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar PDI Personalizado
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Dialog de Adicionar Ação */}
      <Dialog open={acaoDialogOpen} onOpenChange={setAcaoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Ação</DialogTitle>
            <DialogDescription>
              Defina uma ação concreta para desenvolver esta competência
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                Descrição da Ação *
              </label>
              <Textarea
                placeholder="Ex: Fazer curso online sobre técnicas de negociação"
                value={novaAcaoDescricao}
                onChange={(e) => setNovaAcaoDescricao(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2 block">
                Prazo (opcional)
              </label>
              <Input
                type="date"
                value={novaAcaoPrazo}
                onChange={(e) => setNovaAcaoPrazo(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={() => setAcaoDialogOpen(false)}>
                Cancelar
              </Button>
              
              <Button onClick={handleAdicionarAcao} disabled={!novaAcaoDescricao.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


