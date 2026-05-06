// src/components/support/BugReportModal.tsx
import React, { useState, useRef } from 'react';
import type { BugReport, SupportConfig } from './types';
import { SupportService } from './SupportService';

import {
    ArrowUp,
    BugOff,
  Camera,
  Home,
  Lightbulb,
  MessageCircleQuestion,
  Rocket,
} from 'lucide-react';

type ReportTypeOption = {
  value: BugReport['type'];
  label: React.ReactNode;
  desc: string;
};

type PriorityOption = {
  value: BugReport['priority'];
  label: string;
};

const REPORT_TYPES: ReportTypeOption[] = [
  { value: 'bug', label: <><BugOff className="w-4 h-4 inline mr-2" />Bug</>, desc: 'Algo não está funcionando' },
  { value: 'feature', label: <><Lightbulb className="w-4 h-4 inline mr-2" />Funcionalidade</>, desc: 'Nova ideia' },
  { value: 'improvement', label: <><Rocket className='w-4 h-4 inline mr-2'/>Otimizar</>, desc: 'Otimizar algo existente' },
  { value: 'question', label: <><MessageCircleQuestion className='w-4 h-4 inline mr-2'/>Dúvida</>, desc: 'Precisa de ajuda' }
];

const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  config: SupportConfig;
}

export function BugReportModal({ isOpen, onClose, onMinimize, config }: BugReportModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<Partial<BugReport>>({
    type: 'bug',
    priority: 'medium',
    category: 'general',
    steps: ['']
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAcknowledge = () => {
    setSubmitted(false);
    onClose();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const supportService = SupportService.getInstance();
      const result = await supportService.sendBugReport(formData as Omit<BugReport, 'id' | 'status'>);

      if (result.success) {
        setSubmitted(true);
        // Reset form
        setFormData({
          type: 'bug',
          priority: 'medium',
          category: 'general',
          steps: ['']
        });
      } else {
        alert('Erro ao enviar report: ' + result.error);
      }
    } catch (error) {
      alert('Erro ao enviar report: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="scroll-bar-report bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {submitted ? 'Report enviado!' : 'Reportar um problema'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {submitted ? 'Agradecemos seu feedback!' : 'Nos ajude a melhorar o sistema'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Minimizar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Fechar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {submitted ? (
            <div className="text-center py-8">
              <div className="bg-green-100 dark:bg-green-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Recebemos seu report!
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Nossa equipe vai analisar e responder em breve.
              </p>
              <button
                onClick={handleAcknowledge}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Entendido
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Tipo de Report */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de report
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {REPORT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: type.value })}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        formData.type === type.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{type.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{type.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Título e Descrição */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Título *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700"
                  placeholder="Descreva o problema em uma linha"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Descrição detalhada *
                </label>
                <textarea
                  required
                  rows={4}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700"
                  placeholder="Explique o que aconteceu, quando acontece, etc."
                />
              </div>

              {/* Prioridade */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Prioridade
                </label>
                <select
                  value={formData.priority || 'medium'}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as BugReport['priority'] })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700"
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority.value} value={priority.value}>{priority.label}</option>
                  ))}
                </select>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categoria
                </label>
                <select
                  value={formData.category || 'general'}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700"
                >
                  <option value="general">Geral</option>
                  <option value="ui">Interface</option>
                  <option value="performance">Performance</option>
                  <option value="login">Login/Autenticação</option>
                  <option value="data">Dados/Relatórios</option>
                  <option value="mobile">Mobile</option>
                </select>
              </div>

              {/* Passos para reproduzir (apenas para bugs) */}
              {formData.type === 'bug' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Passos para reproduzir
                  </label>
                  {formData.steps?.map((step, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <span className="flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full text-sm font-medium">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => {
                          const newSteps = [...(formData.steps || [])];
                          newSteps[index] = e.target.value;
                          setFormData({ ...formData, steps: newSteps });
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700"
                        placeholder={`Passo ${index + 1}`}
                      />
                      {formData.steps!.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newSteps = formData.steps!.filter((_, i) => i !== index);
                            setFormData({ ...formData, steps: newSteps });
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, steps: [...(formData.steps || []), ''] })}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    + Adicionar passo
                  </button>
                </div>
              )}

              {/* Screenshots (se permitido) */}
              {config.allowScreenshots && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Screenshots (opcional)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setFormData({ ...formData, screenshots: files });
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Camera className="w-4 h-4 inline mr-2" /> Anexar screenshots
                  </button>
                  {formData.screenshots && formData.screenshots.length > 0 && (
                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {formData.screenshots.length} arquivo(s) selecionado(s)
                    </div>
                  )}
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex gap-3 pt-4 border-t dark:border-gray-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar Report'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
