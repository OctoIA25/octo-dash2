/**
 * 💡 Dicas para melhorar o cadastro do imóvel.
 *
 * Só apresenta: as regras vêm do completômetro (`propertyTips` deriva do
 * `PropertyCompletenessResult` já calculado). Nenhuma request, nenhuma IA.
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Images,
  Lightbulb,
  MapPin,
  Ruler,
  Tag,
  View,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  CompletenessSection,
  PropertyCompletenessResult,
} from '@/features/imoveis/utils/propertyCompleteness';
import { buildPropertyTips, TIPS_VISIVEIS, type PropertyTip } from '@/features/imoveis/utils/propertyTips';

interface PropertyTipsProps {
  result: PropertyCompletenessResult;
  /** Abre e rola até a seção do formulário. Sem ele, a dica não vira ação. */
  onFocusSection?: (section: CompletenessSection) => void;
}

const ICONES: Record<string, LucideIcon> = {
  basicas: ClipboardList,
  preco: Tag,
  endereco: MapPin,
  descricao: FileText,
  imagens: Images,
  caracteristicas: Ruler,
  video: Video,
  tour: View,
};

/** Só a prioridade alta ganha destaque; o resto é melhoria, não erro. */
const corDoIcone = (priority: PropertyTip['priority']): string =>
  priority === 'alta' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';

interface TipItemProps {
  tip: PropertyTip;
  onFocusSection?: (section: CompletenessSection) => void;
}

const TipItem = ({ tip, onFocusSection }: TipItemProps) => {
  const Icone = ICONES[tip.categoryKey] ?? Lightbulb;
  const pontos = Math.round(tip.points);

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <Icone aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${corDoIcone(tip.priority)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold">{tip.title}</span>
            {tip.priority === 'baixa' && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                Recomendado
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{tip.description}</p>

          <div className="mt-2 flex items-center gap-2">
            {onFocusSection && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11.5px]"
                onClick={() => onFocusSection(tip.section)}
              >
                Adicionar agora
              </Button>
            )}
            {pontos > 0 && (
              <span className="text-[10.5px] text-muted-foreground tabular-nums">
                +{pontos} {pontos === 1 ? 'ponto' : 'pontos'} em {tip.categoryLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

export const PropertyTips = ({ result, onFocusSection }: PropertyTipsProps) => {
  const [verTodas, setVerTodas] = useState(false);
  const tips = useMemo(() => buildPropertyTips(result), [result]);

  if (result.isComplete) {
    return (
      <section
        aria-labelledby="dicas-imovel-titulo"
        className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
      >
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
        <div>
          <h3 id="dicas-imovel-titulo" className="text-[13px] font-semibold">
            Cadastro completo
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Todas as informações recomendadas para este imóvel foram preenchidas.
          </p>
        </div>
      </section>
    );
  }

  const visiveis = verTodas ? tips : tips.slice(0, TIPS_VISIVEIS);
  const quaseLa = result.percentage >= 90;

  return (
    <section aria-labelledby="dicas-imovel-titulo" className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Lightbulb aria-hidden="true" className="h-4 w-4 text-amber-500" />
        <h3 id="dicas-imovel-titulo" className="text-[13px] font-semibold">
          {quaseLa ? 'Quase lá — últimas melhorias' : 'Como melhorar seu imóvel'}
        </h3>
      </div>

      <ul className="space-y-2">
        {visiveis.map((tip) => (
          <TipItem key={tip.id} tip={tip} onFocusSection={onFocusSection} />
        ))}
      </ul>

      {tips.length > TIPS_VISIVEIS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11.5px]"
          onClick={() => setVerTodas((atual) => !atual)}
        >
          {verTodas ? 'Ver menos' : `Ver todas as dicas (${tips.length})`}
        </Button>
      )}
    </section>
  );
};
