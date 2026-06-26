/**
 * Linha leve de corretor na lista da equipe: nome + chips de progresso (quais dos
 * 3 testes fez) com nomes humanos quando disponíveis. Clicável → abre o drawer.
 */

interface CorretorRowProps {
  nome: string;
  chips: string[];     // ex.: ['Dominância', 'O Arquiteto'] (só os que existem)
  totalFeitos: number; // 0–3
  onClick: () => void;
}

export function CorretorRow({ nome, chips, totalFeitos, onClick }: CorretorRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
      style={{ border: '1px solid hsl(var(--border))' }}
    >
      <div
        className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-teal-500"
        aria-hidden="true"
      >
        {iniciais(nome)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--text-primary))' }}>{nome}</p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {chips.length > 0 ? (
            chips.map((c) => (
              <span key={c} className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--bg-secondary))', color: 'hsl(var(--text-secondary))' }}>
                {c}
              </span>
            ))
          ) : (
            <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>Sem testes</span>
          )}
        </div>
      </div>

      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'hsl(var(--text-secondary))' }}>
        {totalFeitos}/3
      </span>
    </button>
  );
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
