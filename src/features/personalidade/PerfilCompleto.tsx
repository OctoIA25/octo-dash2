/**
 * "Meu Perfil" — tela de descoberta do corretor a partir dos 3 testes que existem.
 * Orquestra o fetch unificado e as seções de apresentação. Substitui MeuResumoCompleto.
 *
 * Só apresentação: nenhum cálculo ou regra de negócio. Cada seção é renderizada
 * apenas quando o respectivo teste tem resultado (degrada graciosamente).
 */

import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePerfilCompleto } from './hooks/usePerfilCompleto';
import { PerfilHero } from './components/PerfilHero';
import { DiscSection } from './components/DiscSection';
import { MbtiSection } from './components/MbtiSection';
import { EneagramaSection } from './components/EneagramaSection';
import { DesenvolvimentoSection } from './components/DesenvolvimentoSection';
import { ValidadeTestesBadge } from './components/ValidadeTestesBadge';
import { RelatoriosElaine } from '@/features/agentes-ia/components/RelatoriosElaine';

export function PerfilCompleto() {
  const { user } = useAuth();
  const { loading, perfil, vazio } = usePerfilCompleto();
  const nome = user?.name ?? 'Você';
  const datasTestes = [perfil.disc?.data_teste, perfil.eneagrama?.data_teste, perfil.mbti?.data_teste];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: 'hsl(var(--text-secondary))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>Montando seu perfil…</p>
        </div>
      </div>
    );
  }

  if (vazio) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'hsl(var(--text-secondary))' }} />
          <h3 className="text-lg font-bold mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
            Seu perfil ainda está em branco
          </h3>
          <p className="text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>
            Faça os testes de DISC, Eneagrama e MBTI para descobrir como você age, pensa e se desenvolve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 sm:p-10" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
      <div className="max-w-4xl mx-auto space-y-10">
        <PerfilHero nome={nome} perfil={perfil} />
        <ValidadeTestesBadge datas={datasTestes} />
        {perfil.disc && <DiscSection disc={perfil.disc} />}
        {perfil.mbti && <MbtiSection mbti={perfil.mbti} />}
        {perfil.eneagrama && <EneagramaSection eneagrama={perfil.eneagrama} />}
        {perfil.eneagrama && <DesenvolvimentoSection eneagrama={perfil.eneagrama} />}
        <RelatoriosElaine subjectEmail={user?.email ?? null} />
      </div>
    </div>
  );
}

export default PerfilCompleto;
