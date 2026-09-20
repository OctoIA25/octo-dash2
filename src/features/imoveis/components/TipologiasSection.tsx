/**
 * O bloco de Tipologias no formulário do lançamento (P2.1).
 *
 * Hoje "2 e 3 dorms (1 suíte)" e "131 e 164" moram em campos de texto, e a
 * LIA lê a prosa. Aqui cada tipologia vira linha com números, e a LIA passa a
 * consultar "2 dorms, 64 m², a partir de R$ 389.000".
 *
 * O CARD DO SITE MOSTRA O RESULTADO AO VIVO, logo abaixo da tabela. Quem
 * cadastra precisa ver o que o cliente vai ver — sem isso, a diferença entre
 * o que se digitou e o que aparece no site só se descobre no site.
 */

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  paraOCard, type Tipologia, type TextoDoLancamento,
} from '../utils/tipologias';

interface Props {
  tipologias: Tipologia[];
  onChange: (lista: Tipologia[]) => void;
  /** O texto de hoje, que serve de reserva enquanto não há tipologia. */
  texto: TextoDoLancamento;
  disabled?: boolean;
}

const NOVA: Tipologia = {
  nome: '', dormitorios: null, suites: null, banheiros: null, vagas: null,
  area_privativa_m2: null, preco_a_partir: null, disponivel: true, ordem: 0,
};

const Num = ({ valor, onChange, rotulo, disabled, passo = '1' }: {
  valor: number | null | undefined;
  onChange: (n: number | null) => void;
  rotulo: string; disabled?: boolean; passo?: string;
}) => (
  <input
    type="number"
    min={0}
    step={passo}
    aria-label={rotulo}
    placeholder="—"
    disabled={disabled}
    value={valor ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums disabled:opacity-50"
  />
);

export function TipologiasSection({ tipologias, onChange, texto, disabled }: Props) {
  const cartao = useMemo(() => paraOCard(tipologias, texto), [tipologias, texto]);

  const mexer = (i: number, campo: keyof Tipologia, valor: unknown) => {
    const copia = [...tipologias];
    copia[i] = { ...copia[i], [campo]: valor };
    onChange(copia);
  };

  const mover = (i: number, passo: -1 | 1) => {
    const j = i + passo;
    if (j < 0 || j >= tipologias.length) return;
    const copia = [...tipologias];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(copia.map((t, k) => ({ ...t, ordem: k })));
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Tipologias</h2>
        <p className="text-xs text-text-secondary mt-1">
          Uma linha por planta do empreendimento. É daqui que saem os dormitórios e o
          “a partir de” do card do site — e é isto que a Lia consulta quando o cliente pergunta
          metragem ou valor.
        </p>
      </div>

      {tipologias.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-[13px] text-text-secondary">
          Nenhuma tipologia cadastrada. Enquanto não houver, o card do site continua mostrando o
          que está em “Dados do Portal” — nada some do ar por causa disto.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="w-8" />
                <th className="px-2 py-2 font-semibold">Nome</th>
                <th className="px-2 py-2 font-semibold">Dorms</th>
                <th className="px-2 py-2 font-semibold">Suítes</th>
                <th className="px-2 py-2 font-semibold">Vagas</th>
                <th className="px-2 py-2 font-semibold">Área m²</th>
                <th className="px-2 py-2 font-semibold">A partir de R$</th>
                <th className="px-2 py-2 font-semibold">Disponível</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tipologias.map((t, i) => (
                <tr key={t.id ?? `nova-${i}`} className="border-b border-border/50 last:border-0">
                  <td className="px-1 py-1.5">
                    <div className="flex flex-col">
                      <button
                        type="button" aria-label="Subir" disabled={disabled || i === 0}
                        onClick={() => mover(i, -1)}
                        className="text-text-secondary hover:text-foreground disabled:opacity-30"
                      >▲</button>
                      <button
                        type="button" aria-label="Descer" disabled={disabled || i === tipologias.length - 1}
                        onClick={() => mover(i, 1)}
                        className="text-text-secondary hover:text-foreground disabled:opacity-30"
                      >▼</button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Nome da tipologia ${i + 1}`}
                      placeholder="Ex: 2 dorms c/ suíte"
                      value={t.nome ?? ''}
                      disabled={disabled}
                      onChange={(e) => mexer(i, 'nome', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    <Num rotulo={`Dormitórios ${i + 1}`} valor={t.dormitorios} disabled={disabled}
                      onChange={(n) => mexer(i, 'dormitorios', n)} />
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    <Num rotulo={`Suítes ${i + 1}`} valor={t.suites} disabled={disabled}
                      onChange={(n) => mexer(i, 'suites', n)} />
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    <Num rotulo={`Vagas ${i + 1}`} valor={t.vagas} disabled={disabled}
                      onChange={(n) => mexer(i, 'vagas', n)} />
                  </td>
                  <td className="px-2 py-1.5 w-24">
                    <Num rotulo={`Área ${i + 1}`} valor={t.area_privativa_m2} passo="0.01" disabled={disabled}
                      onChange={(n) => mexer(i, 'area_privativa_m2', n)} />
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    <Num rotulo={`Preço ${i + 1}`} valor={t.preco_a_partir} passo="1000" disabled={disabled}
                      onChange={(n) => mexer(i, 'preco_a_partir', n)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Disponível ${i + 1}`}
                      checked={t.disponivel !== false}
                      disabled={disabled}
                      onChange={(e) => mexer(i, 'disponivel', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      aria-label={`Remover tipologia ${i + 1}`}
                      disabled={disabled}
                      onClick={() => onChange(tipologias.filter((_, k) => k !== i))}
                      className="text-rose-600 hover:text-rose-700 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...tipologias, { ...NOVA, ordem: tipologias.length }])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Tipologia
      </button>

      {/* O que o cliente vai ver. Sem isto, a diferença entre o que se digitou
          e o que aparece no site só se descobre no site. */}
      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          No card do site
        </p>
        <p className="mt-1 text-[13px]">
          {cartao.dormitorios || cartao.preco || cartao.area ? (
            <>
              {[cartao.dormitorios, cartao.area, cartao.preco].filter(Boolean).join(' · ')}
            </>
          ) : (
            <span className="text-text-secondary">nada a mostrar ainda</span>
          )}
        </p>
        <p className="mt-1 text-[11px] text-text-secondary">
          {cartao.origem === 'tipologias'
            ? 'vindo das tipologias acima'
            : cartao.origem === 'texto'
              ? 'ainda vindo dos campos de “Dados do Portal” — cadastre uma tipologia para o card passar a sair daqui'
              : 'preencha uma tipologia ou os campos de “Dados do Portal”'}
        </p>
      </div>
    </section>
  );
}
