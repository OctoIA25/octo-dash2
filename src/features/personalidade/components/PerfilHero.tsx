/**
 * Hero "Quem você é": avatar (iniciais), nome e os 3 perfis em linguagem humana
 * como chips. Sem frase-síntese inventada — apenas rótulos que já existem nos dados.
 */

import { DISC_PROFILES } from '@/data/discQuestions';
import { MBTI_TIPOS } from '@/data/mbtiQuestions';
import type { PerfilCompleto } from '../hooks/usePerfilCompleto';

interface PerfilHeroProps {
  nome: string;
  perfil: PerfilCompleto;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function dataMaisRecente(perfil: PerfilCompleto): string | null {
  const datas = [perfil.disc?.data_teste, perfil.eneagrama?.data_teste, perfil.mbti?.data_teste]
    .filter((d): d is string => Boolean(d))
    .sort();
  const ultima = datas[datas.length - 1];
  if (!ultima) return null;
  const d = new Date(ultima);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
}

interface Chip {
  emoji: string;
  rotulo: string;
  tecnico: string;
}

function chips(perfil: PerfilCompleto): Chip[] {
  const out: Chip[] = [];
  if (perfil.disc) {
    const p = DISC_PROFILES[perfil.disc.tipo_principal];
    if (p) out.push({ emoji: '🎯', rotulo: p.nome.charAt(0) + p.nome.slice(1).toLowerCase(), tecnico: `DISC ${perfil.disc.tipo_principal}` });
  }
  if (perfil.mbti) {
    const base = perfil.mbti.tipo_mbti.split('-')[0];
    const t = MBTI_TIPOS[base];
    if (t) out.push({ emoji: t.emoji, rotulo: t.nome, tecnico: perfil.mbti.tipo_mbti });
  }
  if (perfil.eneagrama) {
    out.push({ emoji: '⭐', rotulo: perfil.eneagrama.nome_tipo, tecnico: `Tipo ${perfil.eneagrama.tipo_principal}` });
  }
  return out;
}

export function PerfilHero({ nome, perfil }: PerfilHeroProps) {
  const data = dataMaisRecente(perfil);
  const lista = chips(perfil);

  return (
    <header className="flex flex-col sm:flex-row sm:items-center gap-5">
      <div
        className="w-20 h-20 shrink-0 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg bg-gradient-to-br from-indigo-500 to-teal-500"
        aria-hidden="true"
      >
        {iniciais(nome)}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--text-secondary))' }}>
          Seu perfil
        </p>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-3" style={{ color: 'hsl(var(--text-primary))' }}>
          {nome}
        </h1>

        <div className="flex flex-wrap gap-2">
          {lista.map((c) => (
            <span
              key={c.tecnico}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
              style={{ backgroundColor: 'hsl(var(--bg-secondary))', color: 'hsl(var(--text-primary))', border: '1px solid hsl(var(--border))' }}
            >
              <span aria-hidden="true">{c.emoji}</span>
              {c.rotulo}
              <span className="text-[10px] font-bold opacity-60">{c.tecnico}</span>
            </span>
          ))}
        </div>

        {data && (
          <p className="text-xs mt-3" style={{ color: 'hsl(var(--text-secondary))' }}>
            Atualizado em {data}
          </p>
        )}
      </div>
    </header>
  );
}
