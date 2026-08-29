/**
 * Porta JS mínima do motor Lotus (commissionRules.ts) para o job do espelho.
 * SÓ o caminho lançamento sem parceria: ponta única de intermediação.
 *
 * ponytail: duplicação deliberada e pinada — o motor oficial é TS e o server é
 * node puro sem build. O teste src/features/comissionamento/reportMotorParity.test.ts
 * quebra se as regras divergirem. Se o server ganhar build TS um dia, apagar
 * este arquivo e importar commissionRules direto.
 */

/** Tabela §2 — manter idêntica a NIVEIS de commissionRules.ts. */
export const NIVEIS = {
  estagiario: { label: 'Estagiário', percentual: 30 },
  junior: { label: 'Junior', percentual: 40 },
  pleno: { label: 'Pleno', percentual: 45 },
  senior: { label: 'Sênior', percentual: 50 },
  coordenador: { label: 'Coordenador', percentual: 60 },
};

const NIVEIS_PROPRIO_LIDER = ['senior', 'coordenador'];

/**
 * Split de uma venda de lançamento sem parceria.
 * @param {{ comissao: number, corretor: {nome: string, nivel: string}|null, lider: {nome: string, nivel: string}|null }} venda
 * @returns {{ corretorValor: number, liderValor: number, lotusValor: number, bloqueio: 'L003'|'L007'|null }}
 */
export function calcularLinhaEspelho({ comissao, corretor, lider }) {
  const total = Number.isFinite(comissao) ? comissao : 0;
  if (!corretor) {
    // Sem corretor é caso normal, não anomalia — a ponta inteira fica com a
    // Lotus (distribuirPonta, commissionRules.ts:115-117). Sem bloqueio.
    return { corretorValor: 0, liderValor: 0, lotusValor: total, bloqueio: null };
  }
  if (!NIVEIS[corretor.nivel]) {
    // Nível não cadastrado — aqui sim escala (colapso sancionado do brief).
    return { corretorValor: 0, liderValor: 0, lotusValor: 0, bloqueio: 'L003' };
  }
  const pctCorretor = NIVEIS[corretor.nivel].percentual;
  const proprioLider = !lider || lider.nome === corretor.nome;
  if (!lider && !NIVEIS_PROPRIO_LIDER.includes(corretor.nivel)) {
    return { corretorValor: 0, liderValor: 0, lotusValor: 0, bloqueio: 'L003' };
  }
  if (!proprioLider && !NIVEIS[lider.nivel]) {
    return { corretorValor: 0, liderValor: 0, lotusValor: 0, bloqueio: 'L003' };
  }
  const teto = proprioLider ? pctCorretor : NIVEIS[lider.nivel].percentual;
  if (teto < pctCorretor) {
    return { corretorValor: 0, liderValor: 0, lotusValor: 0, bloqueio: 'L007' };
  }
  const corretorValor = (total * pctCorretor) / 100;
  const liderValor = proprioLider ? 0 : (total * (teto - pctCorretor)) / 100;
  const lotusValor = (total * (100 - teto)) / 100;
  return { corretorValor, liderValor, lotusValor, bloqueio: null };
}

/**
 * Comissão total da venda: override manual vence; senão regra do forecast
 * (lançamento 3,5% / terceiros 6% — espelho de comissao.ts, pinado por teste).
 * @param {number|string|null} valorNegocio
 * @param {string|string[]|null} classification
 * @param {number|null} override  proposals.commission_total
 * @returns {{ percentual: number|null, valor: number }}
 */
export function derivarComissaoTotal(valorNegocio, classification, override) {
  const overrideNum = typeof override === 'string' ? Number(override) : override;
  // Ruling: commission_total = 0 conta como "sem override" (cai na derivação) —
  // venda com comissão contratual zero não é representável via override.
  if (Number.isFinite(overrideNum) && overrideNum > 0) {
    return { percentual: null, valor: Math.round(overrideNum * 100) / 100 };
  }
  const valores = Array.isArray(classification) ? classification : classification ? [classification] : [];
  const normalizar = (v) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const lancamento = valores.some((v) => typeof v === 'string' && normalizar(v) === 'lancamento');
  const percentual = lancamento ? 3.5 : 6;
  const bruto = typeof valorNegocio === 'string' ? Number(valorNegocio) : valorNegocio;
  const base = Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
  return { percentual, valor: Math.round(base * percentual) / 100 };
}
