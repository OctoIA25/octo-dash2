/**
 * Modal de Personalização do Dashboard
 * Permite ao corretor escolher quais abas exibir e sua ordem
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useDashboardConfig, TabId } from '@/hooks/useDashboardConfig';
import { 
  Filter, 
  Target, 
  BarChart3, 
  GraduationCap, 
  Users, 
  CheckSquare2,
  Settings2,
  Save,
  X,
  GripVertical
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABS_INFO: { id: TabId; label: string; icon: any; descricao: string }[] = [
  { id: 'funil', label: 'Funil', icon: Filter, descricao: 'Visualize a distribuição de leads por etapa' },
  { id: 'okrs', label: 'OKRs', icon: Target, descricao: 'Objetivos e Resultados-Chave' },
  { id: 'kpis', label: 'KPIs', icon: BarChart3, descricao: 'Indicadores-chave de performance' },
  { id: 'pdi', label: 'PDI', icon: GraduationCap, descricao: 'Plano de Desenvolvimento Individual' },
  { id: 'meus-leads', label: 'Meus Leads', icon: Users, descricao: 'Leads atribuídos a você' },
  { id: 'tarefas-semana', label: 'Tarefas da Semana', icon: CheckSquare2, descricao: 'Organize suas atividades semanais' }
];

export const DashboardCustomizer = ({ open, onOpenChange }: DashboardCustomizerProps) => {
  const { config, isLoading, toggleAbaVisibilidade, reordenarAbas } = useDashboardConfig();
  const [localConfig, setLocalConfig] = useState(config);
  const [isSaving, setIsSaving] = useState(false);

  // Sincronizar config local quando mudar
  useState(() => {
    setLocalConfig(config);
  });

  const handleToggleAba = (tabId: TabId) => {
    if (!localConfig) return;
    
    const abasVisiveis = [...localConfig.abas_visiveis];
    const index = abasVisiveis.indexOf(tabId);

    if (index > -1) {
      // Não permitir remover se for a única aba
      if (abasVisiveis.length > 1) {
        abasVisiveis.splice(index, 1);
      } else {
        alert('Você precisa manter pelo menos uma aba visível!');
        return;
      }
    } else {
      abasVisiveis.push(tabId);
    }

    setLocalConfig({
      ...localConfig,
      abas_visiveis: abasVisiveis
    });
  };

  const handleSave = async () => {
    if (!localConfig || !config) return;

    try {
      setIsSaving(true);
      
      // Atualizar cada aba que mudou
      for (const tabId of localConfig.abas_visiveis) {
        if (!config.abas_visiveis.includes(tabId)) {
          await toggleAbaVisibilidade(tabId);
        }
      }
      
      // Remover abas que foram desmarcadas
      for (const tabId of config.abas_visiveis) {
        if (!localConfig.abas_visiveis.includes(tabId)) {
          await toggleAbaVisibilidade(tabId);
        }
      }
      
      onOpenChange(false);
    } catch (err) {
      console.error('Erro ao salvar:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const abasVisiveis = localConfig?.abas_visiveis || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Settings2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-xl">Personalizar Dashboard</DialogTitle>
              <DialogDescription>
                Escolha quais abas você deseja exibir no seu dashboard
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">
            Carregando configurações...
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Status */}
            <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Abas Visíveis
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {abasVisiveis.length} de {TABS_INFO.length} abas ativas
                </p>
              </div>
              <Badge variant="outline" className="text-lg font-bold">
                {abasVisiveis.length}/{TABS_INFO.length}
              </Badge>
            </div>

            {/* Lista de Abas */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Selecione as Abas
              </h3>
              
              {TABS_INFO.map((tab) => {
                const Icon = tab.icon;
                const isVisible = abasVisiveis.includes(tab.id);
                
                return (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                      isVisible
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                  >
                    {/* Drag Handle (futuro) */}
                    <div className="cursor-move opacity-40 hover:opacity-100 transition-opacity">
                      <GripVertical className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Ícone */}
                    <div className={`p-2 rounded-lg ${
                      isVisible 
                        ? 'bg-blue-100 dark:bg-blue-800/50' 
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        isVisible 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <Label htmlFor={`toggle-${tab.id}`} className="text-base font-medium cursor-pointer">
                        {tab.label}
                      </Label>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {tab.descricao}
                      </p>
                    </div>

                    {/* Switch */}
                    <Switch
                      id={`toggle-${tab.id}`}
                      checked={isVisible}
                      onCheckedChange={() => handleToggleAba(tab.id)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              
              <Button
                onClick={handleSave}
                disabled={isSaving || abasVisiveis.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

