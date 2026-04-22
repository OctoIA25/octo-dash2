/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Seletor de Corretor para Gestão de Liderados
 * Função: Modal para admins selecionarem corretor para análise de gestão
 */

import { useState, useEffect } from 'react';
import { Users, ChevronRight, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

interface GestaoLideradosCorretorSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCorretor: (corretorNome: string) => void;
  isDarkMode: boolean;
}

interface CorretorInfo {
  id: number;
  nome: string;
  temDISC: boolean;
  temEneagrama: boolean;
  temMBTI: boolean;
}

export const GestaoLideradosCorretorSelector = ({
  isOpen,
  onClose,
  onSelectCorretor,
  isDarkMode
}: GestaoLideradosCorretorSelectorProps) => {
  const [corretores, setCorretores] = useState<CorretorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (isOpen) {
      carregarCorretores();
    }
  }, [isOpen]);

  const carregarCorretores = async () => {
    setLoading(true);
    try {
      const config = getSupabaseConfig();
      const headers = getAuthenticatedHeaders();
      
      // Buscar todos os corretores com informações de testes
      const response = await fetch(
        `${config.url}/rest/v1/Corretores?select=id,nm_corretor,disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo&order=nm_corretor.asc`,
        {
          method: 'GET',
          headers: headers
        }
      );

      if (!response.ok) {
        throw new Error(`Erro ao buscar corretores: ${response.status}`);
      }

      const data = await response.json();
      
      const corretoresInfo: CorretorInfo[] = data.map((c: any) => ({
        id: c.id,
        nome: c.nm_corretor,
        temDISC: !!c.disc_tipo_principal,
        temEneagrama: !!c.eneagrama_tipo_principal,
        temMBTI: !!c.mbti_tipo
      }));

      setCorretores(corretoresInfo);
    } catch (error) {
      console.error('Erro ao carregar corretores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (corretorNome: string) => {
    onSelectCorretor(corretorNome);
    onClose();
  };

  const corretoresFiltrados = corretores
    .filter(c => busca === '' || c.nome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      const testsA = [a.temDISC, a.temEneagrama, a.temMBTI].filter(Boolean).length;
      const testsB = [b.temDISC, b.temEneagrama, b.temMBTI].filter(Boolean).length;
      if (testsB !== testsA) return testsB - testsA;
      return a.nome.localeCompare(b.nome);
    });

  if (!isOpen) return null;

  const bgCard = isDarkMode ? 'var(--bg-card)' : '#ffffff';
  const border = isDarkMode ? 'var(--border)' : '#e5e7eb';
  const textPrimary = isDarkMode ? 'var(--text-primary)' : '#0f172a';
  const textSecondary = isDarkMode ? 'var(--text-secondary)' : '#64748b';
  const accentBlue = '#3b82f6';

  return (
    <div className="octo-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <Card 
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300"
        style={{ 
          backgroundColor: bgCard,
          borderColor: border
        }}
      >
        {/* Header */}
        <div 
          className="sticky top-0 z-10 border-b px-5 py-3"
          style={{ 
            backgroundColor: bgCard,
            borderColor: border
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 
                className="text-lg font-bold mb-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent"
              >
                Gestão de Liderados
              </h2>
              <p 
                className="text-xs"
                style={{ color: isDarkMode ? 'var(--text-secondary)' : '#6b7280' }}
              >
                Selecione um corretor para análise
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 active:bg-red-200 dark:active:bg-red-900/50 transition-all flex items-center justify-center"
              style={{ 
                backgroundColor: isDarkMode ? 'var(--bg-secondary)' : 'white', 
                border: isDarkMode ? '2px solid rgba(254, 226, 226, 0.3)' : '2px solid #fee2e2' 
              }}
              title="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#f1f5f9' : '#000000'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', minWidth: '20px', flexShrink: 0 }}>
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <CardContent className="p-4">
          {/* Busca */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: textSecondary }} />
              <Input
                type="text"
                placeholder="Buscar corretor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-9 text-sm"
                style={{ 
                  backgroundColor: isDarkMode ? 'var(--bg-secondary)' : '#f8fafc', 
                  borderColor: border,
                  color: textPrimary
                }}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: `${accentBlue}30`, borderTopColor: accentBlue }}></div>
                <p style={{ color: textSecondary }} className="text-xs">Carregando corretores...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 max-h-[55vh] overflow-y-auto pr-1">
              {corretoresFiltrados.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ color: textSecondary }} />
                  <p style={{ color: textSecondary }} className="text-xs">
                    {busca ? `Nenhum corretor encontrado com "${busca}"` : 'Nenhum corretor disponível'}
                  </p>
                </div>
              ) : (
                corretoresFiltrados.map((corretor) => {
                  const testesCompletos = [corretor.temDISC, corretor.temEneagrama, corretor.temMBTI].filter(Boolean).length;
                  
                  return (
                    <div
                      key={corretor.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer hover:shadow-sm transition-all duration-150 group"
                      style={{ 
                        backgroundColor: isDarkMode ? 'var(--bg-secondary)' : '#ffffff', 
                        borderColor: testesCompletos > 0 ? accentBlue : border
                      }}
                      onClick={() => handleSelect(corretor.nome)}
                    >
                      <div className="flex-1 min-w-0">
                        <p style={{ color: textPrimary }} className="font-semibold text-sm truncate">{corretor.nome}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {corretor.temDISC && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-black bg-blue-200">DISC</span>
                          )}
                          {corretor.temEneagrama && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-black bg-purple-200">Enea</span>
                          )}
                          {corretor.temMBTI && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-black bg-indigo-200">MBTI</span>
                          )}
                          {testesCompletos === 0 && (
                            <span className="text-[10px]" style={{ color: textSecondary }}>Sem testes</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 flex-shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform" style={{ color: accentBlue }} />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

