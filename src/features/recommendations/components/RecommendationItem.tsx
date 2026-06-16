/**
 * Linha de imóvel candidato no modal de recomendações: seleção, score e o
 * "porquê" (critérios atendidos), com ação de remover.
 */

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { MatchedCriterion, Finalidade } from '../engine/types';
import { formatLocalizacao, formatPreco } from '../email/imovelToEmail';

export interface Candidate {
  imovel: Imovel;
  score?: number;
  matched?: MatchedCriterion[];
  origin: 'auto' | 'manual';
}

interface RecommendationItemProps {
  candidate: Candidate;
  selected: boolean;
  finalidade?: Finalidade;
  onToggle: (referencia: string) => void;
  onRemove: (referencia: string) => void;
}

export const RecommendationItem = ({
  candidate,
  selected,
  finalidade,
  onToggle,
  onRemove,
}: RecommendationItemProps) => {
  const { imovel, score, matched, origin } = candidate;
  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(imovel.referencia)}
        className="mt-1"
        aria-label={`Selecionar ${imovel.titulo}`}
      />

      {imovel.fotos?.[0] ? (
        <img
          src={imovel.fotos[0]}
          alt={imovel.titulo}
          className="w-20 h-16 object-cover rounded-md flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-16 rounded-md bg-muted flex-shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Ref. {imovel.referencia}
          </span>
          {origin === 'auto' && typeof score === 'number' && (
            <Badge variant="secondary" className="text-[10px]">
              {score}% relevância
            </Badge>
          )}
          {origin === 'manual' && (
            <Badge variant="outline" className="text-[10px]">
              Adicionado manualmente
            </Badge>
          )}
        </div>
        <p className="font-semibold text-sm text-foreground truncate">{imovel.titulo}</p>
        <p className="text-xs text-muted-foreground truncate">{formatLocalizacao(imovel)}</p>
        <p className="text-sm font-bold text-primary">{formatPreco(imovel, finalidade)}</p>
        {matched && matched.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {matched.slice(0, 4).map((m) => (
              <span
                key={m.key}
                className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5"
              >
                {m.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(imovel.referencia)}
        aria-label={`Remover ${imovel.titulo}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
