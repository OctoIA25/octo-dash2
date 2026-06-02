import { useMemo, useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Users, Target, Percent, Info, type LucideIcon } from 'lucide-react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLeadSourceCosts } from '../hooks/useLeadSourceCosts';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const brlCents = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formata um número para o valor inicial do input, em notação pt-BR
 * (vírgula decimal, sem separador de milhar) — consistente com o parser
 * usado no onBlur. 0 vira string vazia (placeholder).
 */
function toInputValue(v: number): string {
  return v ? v.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 2 }) : '';
}

const ROLES_EDIT = ['admin', 'team_leader', 'owner'];

function isConvertido(l: ProcessedLead): boolean {
  const etapa = (l.etapa_atual || '').toLowerCase();
  return etapa.includes('assinada') || etapa.includes('fechamento') || etapa.includes('contrato');
}

function receitaDoLead(l: ProcessedLead): number {
  return Number(l.valor_final_venda) || Number(l.valor_imovel) || 0;
}

const DEFAULT_ORIGEM_LABEL = 'Não informado';

/** Rótulo de exibição: origem sem espaços nas bordas, ou o padrão se vazia. */
function origemLabel(raw: string | undefined): string {
  return (raw || '').trim() || DEFAULT_ORIGEM_LABEL;
}

/**
 * Chave de deduplicação: case-insensitive (e sem espaços nas bordas).
 * Assim "ZAP Imoveis" e "Zap Imoveis" são tratadas como a MESMA origem.
 */
function origemKey(raw: string | undefined): string {
  return origemLabel(raw).toLowerCase();
}

type Periodo = 'mensal' | 'anual';

interface OrigemRow {
  key: string; // chave normalizada (lowercase) — usada para o custo
  origem: string; // rótulo canônico para exibição
  leads: number;
  convertidos: number;
  receita: number;
  investimento: number; // já normalizado para o período selecionado
  cpl: number | null;
  cac: number | null;
  roi: number | null;
}

interface FinanceiroTabProps {
  leads: ProcessedLead[];
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export function FinanceiroTab({ leads }: FinanceiroTabProps) {
  const { user, isOwner } = useAuth();
  const { toast } = useToast();
  const { costs, loading, saving, saveCost } = useLeadSourceCosts();

  const canEdit = Boolean(isOwner) || ROLES_EDIT.includes(String(user?.systemRole || ''));

  const [periodo, setPeriodo] = useState<Periodo>('mensal');
  // rascunho dos inputs (string) por chave de origem, para edição controlada
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Custos indexados pela chave normalizada (case-insensitive), para que
  // linhas salvas com capitalizações diferentes não fiquem órfãs.
  const costsByKey = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(costs).forEach(([origem, valor]) => {
      map[origemKey(origem)] = Number(valor) || 0;
    });
    return map;
  }, [costs]);

  // Sincroniza rascunho quando os custos salvos carregam/mudam
  useEffect(() => {
    setDraft(
      Object.fromEntries(Object.entries(costsByKey).map(([k, v]) => [k, toInputValue(v)]))
    );
  }, [costsByKey]);

  // Janela de tempo do período selecionado (mês atual ou ano atual)
  const now = new Date();
  const prefixo =
    periodo === 'mensal'
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      : `${now.getFullYear()}`;
  const multiplicador = periodo === 'mensal' ? 1 : 12;

  // Origens distintas em TODO o conjunto de leads, deduplicadas por chave
  // normalizada. O rótulo exibido é a variante de capitalização mais
  // frequente (ex: "ZAP Imoveis" prevalece sobre "zap imoveis").
  const origensDistintas = useMemo(() => {
    // key -> { variante de exibição -> contagem }
    const variantesPorChave = new Map<string, Map<string, number>>();
    leads.forEach((l) => {
      const label = origemLabel(l.origem_lead);
      const key = label.toLowerCase();
      if (!variantesPorChave.has(key)) variantesPorChave.set(key, new Map());
      const variantes = variantesPorChave.get(key)!;
      variantes.set(label, (variantes.get(label) || 0) + 1);
    });

    return Array.from(variantesPorChave.entries())
      .map(([key, variantes]) => {
        let origem = '';
        let melhor = -1;
        variantes.forEach((count, variante) => {
          // mais frequente vence; empate -> ordem alfabética (estável)
          if (count > melhor || (count === melhor && variante.localeCompare(origem, 'pt-BR') < 0)) {
            melhor = count;
            origem = variante;
          }
        });
        return { key, origem };
      })
      .sort((a, b) => a.origem.localeCompare(b.origem, 'pt-BR'));
  }, [leads]);

  // Leads dentro da janela do período
  const leadsJanela = useMemo(
    () => leads.filter((l) => (l.data_entrada || '').startsWith(prefixo)),
    [leads, prefixo]
  );

  const rows: OrigemRow[] = useMemo(() => {
    return origensDistintas
      .map(({ key, origem }) => {
        const doOrigem = leadsJanela.filter((l) => origemKey(l.origem_lead) === key);
        const convertidosArr = doOrigem.filter(isConvertido);
        const receita = convertidosArr.reduce((acc, l) => acc + receitaDoLead(l), 0);
        const investimento = (costsByKey[key] || 0) * multiplicador;
        const leadsCount = doOrigem.length;
        const convertidos = convertidosArr.length;
        return {
          key,
          origem,
          leads: leadsCount,
          convertidos,
          receita,
          investimento,
          cpl: leadsCount > 0 ? investimento / leadsCount : null,
          cac: convertidos > 0 ? investimento / convertidos : null,
          roi: investimento > 0 ? (receita - investimento) / investimento : null,
        };
      })
      .sort((a, b) => b.investimento - a.investimento || b.leads - a.leads);
  }, [origensDistintas, leadsJanela, costsByKey, multiplicador]);

  // KPIs agregados
  const totais = useMemo(() => {
    const investimento = rows.reduce((acc, r) => acc + r.investimento, 0);
    const leadsTotal = rows.reduce((acc, r) => acc + r.leads, 0);
    const convertidos = rows.reduce((acc, r) => acc + r.convertidos, 0);
    const receita = rows.reduce((acc, r) => acc + r.receita, 0);
    return {
      investimento,
      leadsTotal,
      convertidos,
      receita,
      cplMedio: leadsTotal > 0 ? investimento / leadsTotal : null,
      cacMedio: convertidos > 0 ? investimento / convertidos : null,
      roi: investimento > 0 ? (receita - investimento) / investimento : null,
    };
  }, [rows]);

  const handleBlurSave = async (key: string, label: string) => {
    const raw = (draft[key] || '').replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(raw) || 0;
    if (valor === (costsByKey[key] || 0)) return; // nada mudou
    // Salva pela chave normalizada -> uma única linha por origem no banco
    const ok = await saveCost(key, valor);
    toast(
      ok
        ? { title: 'Investimento atualizado', description: `${label}: ${brl.format(valor)}/mês`, duration: 2500 }
        : { title: 'Erro ao salvar', description: `Não foi possível salvar o custo de ${label}.`, variant: 'destructive', duration: 3000 }
    );
  };

  const fmtRoi = (roi: number | null) =>
    roi === null ? '—' : `${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(0)}%`;

  return (
    <div className="space-y-6">
      {/* Cabeçalho + seletor de período */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Financeiro — Investimento por Origem</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Cadastre quanto a imobiliária gasta por mês com cada origem de leads. Apenas as origens que
            aparecem nos seus leads são listadas.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 p-0.5 bg-gray-50 dark:bg-slate-800 self-start">
          {(['mensal', 'anual'] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                periodo === p
                  ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
              }`}
            >
              {p === 'mensal' ? 'Mensal' : 'Anual'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} color="blue" label={`Investimento (${periodo})`} value={brl.format(totais.investimento)} />
        <KpiCard icon={Users} color="indigo" label="Custo por Lead (CPL)" value={totais.cplMedio === null ? '—' : brlCents.format(totais.cplMedio)} />
        <KpiCard icon={Target} color="emerald" label="Custo por Conversão (CAC)" value={totais.cacMedio === null ? '—' : brlCents.format(totais.cacMedio)} />
        <KpiCard icon={TrendingUp} color="green" label="Receita de vendas" value={brl.format(totais.receita)} />
        <KpiCard icon={Percent} color={totais.roi !== null && totais.roi < 0 ? 'red' : 'purple'} label="ROI" value={fmtRoi(totais.roi)} />
      </div>

      {/* Tabela de origens */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Origens de leads</h3>
          {!canEdit && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
              <Info className="h-3.5 w-3.5" /> Somente admin, gestor ou líder podem editar
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Nenhuma origem de lead encontrada para este tenant.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                  <th className="px-5 py-3 font-medium">Origem</th>
                  <th className="px-5 py-3 font-medium text-right">Investimento (R$/mês)</th>
                  <th className="px-5 py-3 font-medium text-right">Leads</th>
                  <th className="px-5 py-3 font-medium text-right">Convertidos</th>
                  <th className="px-5 py-3 font-medium text-right">CPL</th>
                  <th className="px-5 py-3 font-medium text-right">CAC</th>
                  <th className="px-5 py-3 font-medium text-right">Receita</th>
                  <th className="px-5 py-3 font-medium text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-medium text-gray-800 dark:text-slate-200">{r.origem}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="relative inline-flex items-center">
                        <span className="absolute left-2.5 text-xs text-gray-400">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={!canEdit || saving}
                          value={draft[r.key] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                          onBlur={() => canEdit && handleBlurSave(r.key, r.origem)}
                          placeholder="0"
                          className="w-28 pl-8 pr-2 py-1.5 text-right rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300">{r.leads.toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300">{r.convertidos.toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300">{r.cpl === null ? '—' : brlCents.format(r.cpl)}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300">{r.cac === null ? '—' : brlCents.format(r.cac)}</td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300">{r.receita > 0 ? brl.format(r.receita) : '—'}</td>
                    <td className={`px-5 py-3 text-right font-medium ${r.roi === null ? 'text-gray-400' : r.roi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtRoi(r.roi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800 flex items-start gap-2 text-xs text-gray-400 dark:text-slate-500">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            O valor é sempre cadastrado por mês. Na visão <strong>Anual</strong>, o investimento é multiplicado por 12 e os
            indicadores (leads, conversões, receita) consideram {periodo === 'anual' ? 'o ano corrente' : 'o mês corrente'}.
            CPL = investimento ÷ leads · CAC = investimento ÷ convertidos · ROI = (receita − investimento) ÷ investimento.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
};

function KpiCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium truncate">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}
