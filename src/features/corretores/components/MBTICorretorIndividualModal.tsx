/**
 * Modal (admin): resultado MBTI de um corretor específico.
 * Apresentação unificada via MbtiSection — a mesma seção da tela "Meu Perfil" do
 * corretor — para consistência visual. O modal só provê a moldura (backdrop/header)
 * e o fetch; toda a visualização vem de MbtiSection.
 */

import { useEffect, useState } from 'react';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import type { MBTICorretorProfile } from '../services/mbtiResultsService';
import { MbtiSection } from '@/features/personalidade/components/MbtiSection';

interface MBTICorretorIndividualModalProps {
  isOpen: boolean;
  onClose: () => void;
  corretorId: number;
  corretorNome: string;
}

export const MBTICorretorIndividualModal = ({
  isOpen,
  onClose,
  corretorId,
  corretorNome,
}: MBTICorretorIndividualModalProps) => {
  const [mbti, setMbti] = useState<MBTICorretorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !corretorId) {
      setMbti(null);
      setLoading(true);
      return;
    }

    let cancelado = false;
    const carregar = async () => {
      setLoading(true);
      try {
        const config = getSupabaseConfig();
        const headers = getAuthenticatedHeaders();
        const response = await fetch(
          `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity`,
          { method: 'GET', headers }
        );
        if (!response.ok) throw new Error(`Erro ao buscar resultado: ${response.status}`);

        const data = await response.json();
        const row = data?.[0];
        if (!row || !row.mbti_tipo) {
          if (!cancelado) setMbti(null);
          return;
        }

        // Mapeamento direto (Mind←mind, Energy←energy...), igual ao fluxo do corretor.
        if (!cancelado) {
          setMbti({
            corretor_id: row.id,
            corretor_nome: row.nm_corretor ?? corretorNome,
            tipo_mbti: row.mbti_tipo,
            descricao: '',
            cor: '',
            emoji: '',
            percentuais: {
              Mind: row.mbti_percent_mind ?? 50,
              Energy: row.mbti_percent_energy ?? 50,
              Nature: row.mbti_percent_nature ?? 50,
              Tactics: row.mbti_percent_tactics ?? 50,
              Identity: row.mbti_percent_identity ?? 50,
            },
            data_teste: '',
            historico_testes: 1,
          });
        }
      } catch (error) {
        console.error('❌ Erro ao carregar resultado MBTI:', error);
        if (!cancelado) setMbti(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    carregar();
    return () => {
      cancelado = true;
    };
  }, [isOpen, corretorId, corretorNome]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full h-full max-w-4xl max-h-[95vh] overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300"
        style={{ backgroundColor: 'hsl(var(--bg-primary))' }}
      >
        <div
          className="sticky top-0 z-50 border-b px-6 py-4 flex items-center justify-between shadow-sm"
          style={{ backgroundColor: 'hsl(var(--bg-primary))', borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-xl font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
            Resultado MBTI — {corretorNome}
          </h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg hover:bg-red-100 active:bg-red-200 transition-all flex items-center justify-center"
            style={{ backgroundColor: 'white', border: '2px solid #fee2e2' }}
            title="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(95vh - 73px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--border))', borderTopColor: 'hsl(var(--text-secondary))' }} />
            </div>
          ) : mbti ? (
            <MbtiSection mbti={mbti} />
          ) : (
            <p className="text-center py-20" style={{ color: 'hsl(var(--text-secondary))' }}>
              Nenhum resultado MBTI encontrado para este corretor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
