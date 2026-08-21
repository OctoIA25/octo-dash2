import { useId, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PREFERENCIAS_PADRAO, TODOS_TIPOS_IMOVEL } from '@/lib/tiposImovel';

/**
 * Preferências do lead — o que o cliente PROCURA (Apartamento, Sala Comercial...).
 *
 * Vocabulário ABERTO: os botões e o `<datalist>` sugerem os tipos do cadastro
 * de imóvel, mas o corretor digita o que quiser. Quem escreve normaliza
 * (`normalizarPreferencias`) — é a única defesa contra ' apartamento ' virar um
 * termo diferente de 'Apartamento'.
 *
 * Eixo diferente de `classification`: aquela é decidida por trigger e diz em
 * que balde do bolsão o lead cai; esta é marcação humana e não decide nada.
 */

export const MAX_PREFERENCIAS = 10;
const MAX_CHARS = 40;

/** Lê o valor cru do banco. NULL, string solta (linha antiga) ou array. */
export function preferenciasDe(valor?: string[] | string | null): string[] {
  if (Array.isArray(valor)) return valor.filter(Boolean);
  return valor ? [valor] : [];
}

/**
 * Normaliza o conjunto inteiro: tira espaço sobrando, corta em 40 chars,
 * remove repetido ignorando caixa (mantendo a primeira forma digitada) e limita
 * a 10 termos — o mesmo teto do CHECK da 20260819.
 *
 * Não corrige grafia: 'apto' e 'Apartamento' continuam sendo dois termos. É o
 * preço do vocabulário aberto, e o `<datalist>` é o empurrão para a forma boa.
 */
export function normalizarPreferencias(itens: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of itens) {
    const termo = String(bruto ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
    if (!termo) continue;
    const chave = termo.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(termo);
    if (saida.length === MAX_PREFERENCIAS) break;
  }
  return saida;
}

/** Adiciona ou remove um termo, sempre devolvendo o conjunto normalizado. */
export function togglePreferencia(atual: string[], termo: string): string[] {
  const chave = termo.trim().toLowerCase();
  const tem = atual.some((p) => p.toLowerCase() === chave);
  return normalizarPreferencias(
    tem ? atual.filter((p) => p.toLowerCase() !== chave) : [...atual, termo],
  );
}

/**
 * Badges para o card do Kanban. `max` existe porque a coluna é estreita: os
 * termos vêm por extenso ('Apartamento Garden') e três deles quebram o rodapé
 * do card. O que não coube vira '+N', e o `title` lista tudo.
 */
export function PreferenciasBadges({
  preferencias,
  max = 2,
  className,
}: {
  preferencias?: string[] | string | null;
  max?: number;
  className?: string;
}) {
  const todas = preferenciasDe(preferencias);
  if (todas.length === 0) return null;
  const visiveis = todas.slice(0, max);
  const resto = todas.length - visiveis.length;
  return (
    <span className={cn('flex items-center gap-1 min-w-0', className)} title={todas.join(' · ')}>
      {visiveis.map((termo) => (
        <Badge
          key={termo}
          variant="outline"
          className="text-[9px] px-1 py-0 h-4 max-w-[84px] truncate block border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          {termo}
        </Badge>
      ))}
      {resto > 0 && (
        <span className="text-[9px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
          +{resto}
        </span>
      )}
    </span>
  );
}

/**
 * Editor do modal: os padrões em um clique, o resto digitando.
 *
 * `<datalist>` em vez de combobox: autocomplete nativo, sem estado de dropdown
 * para manter e sem fechar por fora do popover do modal.
 */
export function PreferenciasEditor({
  valor,
  onChange,
  disabled,
}: {
  valor: string[];
  onChange: (novo: string[]) => void;
  disabled?: boolean;
}) {
  const [rascunho, setRascunho] = useState('');
  const listaId = useId();
  const cheio = valor.length >= MAX_PREFERENCIAS;

  const adicionar = (termo: string) => {
    const novo = normalizarPreferencias([...valor, termo]);
    setRascunho('');
    if (novo.length !== valor.length) onChange(novo);
  };

  return (
    <div className="space-y-2">
      {/* Marcadas — clicar no X remove */}
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((termo) => (
            <Badge
              key={termo}
              variant="outline"
              className="gap-1 pr-1 bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700"
            >
              {termo}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(valor.filter((p) => p !== termo))}
                aria-label={`Remover ${termo}`}
                className="rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Padrões em um clique — só os que ainda não estão marcados */}
      <div className="flex flex-wrap gap-1.5">
        {PREFERENCIAS_PADRAO.filter(
          (t) => !valor.some((p) => p.toLowerCase() === t.toLowerCase()),
        ).map((termo) => (
          <button
            key={termo}
            type="button"
            disabled={disabled || cheio}
            onClick={() => adicionar(termo)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-[11px] text-slate-500 dark:text-slate-400 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />
            {termo}
          </button>
        ))}
      </div>

      <input
        type="text"
        list={listaId}
        value={rascunho}
        disabled={disabled || cheio}
        maxLength={MAX_CHARS}
        placeholder={cheio ? `Máximo de ${MAX_PREFERENCIAS} preferências` : 'Outra preferência — Enter para adicionar'}
        onChange={(e) => {
          // Vírgula fecha o termo: quem cola "Casa, Terreno" espera dois chips.
          const texto = e.target.value;
          if (texto.includes(',')) {
            const partes = texto.split(',');
            onChange(normalizarPreferencias([...valor, ...partes.slice(0, -1)]));
            setRascunho(partes[partes.length - 1]);
            return;
          }
          setRascunho(texto);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            adicionar(rascunho);
          }
        }}
        onBlur={() => rascunho.trim() && adicionar(rascunho)}
        className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50"
      />
      <datalist id={listaId}>
        {TODOS_TIPOS_IMOVEL.map((tipo) => (
          <option key={tipo} value={tipo} />
        ))}
      </datalist>
    </div>
  );
}
