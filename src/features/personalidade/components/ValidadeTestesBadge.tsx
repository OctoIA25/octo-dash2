/**
 * Selo de validade do perfil comportamental. Mesma peça para o corretor (Meu
 * Perfil) e para o gestor (drawer da equipe), para que os dois leiam a mesma
 * informação: quando os testes vencem e se já venceram.
 *
 * ponytail: só dois estados (válido / vencido). Um estado "vence em breve" só
 * vale a pena quando alguém pedir aviso antecipado.
 */

import { AlertTriangle } from 'lucide-react';
import { calcularValidadeTestes, formatarDataBr } from '../validadeTestes';

interface ValidadeTestesBadgeProps {
  /** Datas de conclusão dos 3 testes (disc/eneagrama/mbti); nulos são ignorados. */
  datas: Array<string | null | undefined>;
  /** Texto na 2ª pessoa (perfil do próprio corretor) ou 3ª (visão do gestor). */
  pessoa?: 'propria' | 'terceiro';
}

export function ValidadeTestesBadge({ datas, pessoa = 'propria' }: ValidadeTestesBadgeProps) {
  const validade = calcularValidadeTestes(datas);
  const venceEm = formatarDataBr(validade.venceEm);
  if (!venceEm) return null;

  if (!validade.vencido) {
    return (
      <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
        Testes válidos até {venceEm}
      </p>
    );
  }

  return (
    <div
      className="inline-flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium"
      style={{
        backgroundColor: 'hsl(38 92% 50% / 0.12)',
        border: '1px solid hsl(38 92% 50% / 0.35)',
        color: 'hsl(var(--text-primary))',
      }}
      role="status"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" style={{ color: 'hsl(38 92% 40%)' }} aria-hidden="true" />
      <span>
        Perfil vencido em {venceEm}.{' '}
        {pessoa === 'propria'
          ? 'Refaça DISC, Eneagrama e MBTI para atualizar seus relatórios.'
          : 'Peça ao corretor para refazer DISC, Eneagrama e MBTI.'}
      </span>
    </div>
  );
}
