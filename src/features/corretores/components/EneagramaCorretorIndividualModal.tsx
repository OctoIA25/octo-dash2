/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Modal: Estatísticas Individuais Eneagrama do Corretor
 * Função: Exibir resultado COMPLETO do teste Eneagrama (reutiliza TesteEneagrama)
 */

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TesteEneagrama } from './TesteEneagrama';

interface EneagramaCorretorIndividualModalProps {
  isOpen: boolean;
  onClose: () => void;
  corretorId: number;
  corretorNome: string;
}

export const EneagramaCorretorIndividualModal = ({
  isOpen,
  onClose,
  corretorId,
  corretorNome
}: EneagramaCorretorIndividualModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal com resultado completo */}
      <div className="relative w-full h-full max-w-7xl max-h-[95vh] overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 bg-white dark:bg-slate-900">
        {/* Header fixo com botão fechar */}
        <div className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
            Resultado Eneagrama - {corretorNome}
          </h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg hover:bg-red-100 active:bg-red-200 transition-all relative z-[110] flex items-center justify-center"
            style={{ backgroundColor: 'white', border: '2px solid #fee2e2' }}
            title="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', minWidth: '20px', flexShrink: 0 }}>
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>

        {/* Conteúdo: TesteEneagrama renderiza automaticamente o resultado completo */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)', backgroundColor: '#F8FAFC' }}>
          <div style={{ minHeight: '100%', position: 'relative' }}>
            <style>{`
              /* Sobrescrever fixed do TesteEneagrama quando dentro do modal */
              .eneagrama-resultado-wrapper > div[class*="fixed"] {
                position: relative !important;
                inset: 0 !important;
                z-index: auto !important;
              }
            `}</style>
            <div className="eneagrama-resultado-wrapper">
              <TesteEneagrama
                corretorId={corretorId.toString()}
                corretorNome={corretorNome}
                onConcluir={() => {}}
                onVoltar={onClose}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
