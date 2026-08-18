/**
 * 📊 Completômetro do imóvel — barra geral + cards por categoria.
 *
 * Só renderiza: todas as regras vivem em `propertyCompleteness.ts`. O cálculo
 * é local (memoizado sobre o estado do formulário) — nenhuma request extra.
 */

import { useMemo } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { PropertyTips } from './PropertyTips';
import {
  calculatePropertyCompleteness,
  type CompletenessCategoryResult,
  type CompletenessSection,
  type PropertyCompletenessInput,
} from '@/features/imoveis/utils/propertyCompleteness';

interface PropertyCompletenessProps {
  property: PropertyCompletenessInput;
  /** Leva o usuário até a seção do formulário da categoria clicada. */
  onFocusSection?: (section: CompletenessSection) => void;
}

/** Mensagem geral por faixa (primeira que casa vence). */
const MENSAGENS_GERAIS = [
  { min: 100, texto: 'Imóvel completo — pronto para anunciar.' },
  { min: 80, texto: 'Quase lá: faltam apenas pequenos ajustes.' },
  { min: 50, texto: 'Complete as categorias prioritárias abaixo.' },
  { min: 0, texto: 'Preencha os dados principais para melhorar o anúncio.' },
];

interface CategoriaCardProps {
  categoria: CompletenessCategoryResult;
  onFocusSection?: (section: CompletenessSection) => void;
}

const CategoriaCard = ({ categoria, onFocusSection }: CategoriaCardProps) => {
  const percentual = Math.round(categoria.percentage);
  const Icone = categoria.isComplete ? CheckCircle2 : Circle;

  // Todo card navega para a sua seção — inclusive o completo, para revisão.
  // Nada de `disabled` aqui: o CSS global (public/styles/clickup-icons.css)
  // pinta `button:disabled svg` de cinza com !important e apagaria o check verde.
  return (
    <button
      type="button"
      onClick={() => onFocusSection?.(categoria.section)}
      aria-label={`${categoria.label}: ${percentual}% completo. ${categoria.message}`}
      className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-slate-300 dark:hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1.5">
        <Icone
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 ${
            categoria.isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          }`}
        />
        <span className="text-[12.5px] font-semibold truncate">{categoria.label}</span>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[18px] font-bold tabular-nums leading-none">{percentual}%</span>
        <span className="text-[10.5px] text-muted-foreground tabular-nums">
          {Math.round(categoria.earnedPoints)}/{categoria.maxPoints} pts
        </span>
      </div>

      <div aria-hidden="true" className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${
            categoria.isComplete ? 'bg-emerald-500' : 'bg-primary'
          }`}
          style={{ width: `${percentual}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{categoria.message}</p>
    </button>
  );
};

export const PropertyCompleteness = ({ property, onFocusSection }: PropertyCompletenessProps) => {
  const resultado = useMemo(() => calculatePropertyCompleteness(property), [property]);
  const percentual = Math.round(resultado.percentage);
  const mensagem = MENSAGENS_GERAIS.find((faixa) => percentual >= faixa.min)?.texto ?? '';

  return (
    <div className="space-y-3">
      <section
        aria-labelledby="completude-imovel-titulo"
        className="rounded-xl border bg-card p-4 space-y-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {resultado.isComplete && (
              <CheckCircle2
                aria-hidden="true"
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              />
            )}
            <h3 id="completude-imovel-titulo" className="text-[13px] font-semibold">
              Completude do imóvel
            </h3>
          </div>
          <span className="text-[22px] font-bold tabular-nums leading-none">{percentual}%</span>
        </div>

        <Progress
          value={percentual}
          aria-label={`Completude do imóvel: ${percentual} por cento`}
          className="h-2"
        />

        <p className="text-[12px] text-muted-foreground">{mensagem}</p>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {resultado.categories.map((categoria) => (
            <CategoriaCard
              key={categoria.key}
              categoria={categoria}
              onFocusSection={onFocusSection}
            />
          ))}
        </div>
      </section>

      {/* Dicas derivadas do MESMO resultado — sem recalcular nem duplicar regra. */}
      <PropertyTips result={resultado} onFocusSection={onFocusSection} />
    </div>
  );
};
