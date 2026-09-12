/**
 * Descobre a QUAL lançamento um código de lead se refere.
 *
 * Lead de lançamento não traz código de catálogo: o Meta manda o nome do
 * empreendimento em `property_code` ('RESERVA CASTANHEIRA', 'RESIDENCIAL
 * VIGORE') e o ZAP manda o código interno da equipe ('L014', via
 * `lancamento_anuncios`). Os dois casam aqui: primeiro por `lancamentos.codigos`
 * — os L0NN da planilha, preenchidos no cadastro do lançamento —, depois pelo
 * nome normalizado, que é o único jeito de resolver o que o Meta manda.
 */
import { supabase } from '@/lib/supabaseClient';

export interface LancamentoRef {
  id: string;
  nome: string;
  /** Códigos da planilha da equipe (L0NN), um por anúncio no portal. */
  codigos?: string[] | null;
}

/** Maiúsculas, sem acento, só letras/números separados por espaço. */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

/**
 * O lançamento com aquele código, ou aquele cujo nome é o código — 'RESIDENCIAL
 * VIGORE' é o 'Vigóre'. O código vem primeiro: é identificação, o nome é
 * heurística. A comparação por nome é por palavra inteira de propósito:
 * `includes` solto casaria 'Epic' dentro de qualquer palavra e mandaria o
 * corretor para o empreendimento errado.
 */
export function acharLancamentoPorCodigo(
  codigo: string,
  lancamentos: LancamentoRef[],
): LancamentoRef | undefined {
  const alvo = normalizar(codigo);
  if (!alvo) return undefined;

  // Código é igualdade, nunca sufixo: 'L1' não pode virar 'L14'.
  const porCodigo = lancamentos.filter((l) =>
    (l.codigos ?? []).some((c) => normalizar(c) === alvo),
  );
  // Dois cadastros com o mesmo código é erro de digitação, e nenhum banco
  // segura isso em coluna de array. Aqui a saída é não linkar nada: código
  // ambíguo volta cru na tela, que é melhor que apontar para o errado.
  if (porCodigo.length === 1) return porCodigo[0];
  if (porCodigo.length > 1) return undefined;

  // Nome mais longo primeiro: entre 'Vila Itália' e 'Vila', ganha o específico.
  return [...lancamentos]
    .sort((a, b) => b.nome.length - a.nome.length)
    .find((l) => {
      const nome = normalizar(l.nome);
      if (!nome) return false;
      return alvo === nome || alvo.endsWith(` ${nome}`) || alvo.startsWith(`${nome} `);
    });
}

/** Lançamentos do tenant (id, nome, códigos). RLS já limita ao tenant do usuário. */
export async function fetchLancamentosRef(tenantId: string): Promise<LancamentoRef[]> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, nome, codigos')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[lancamentos] erro ao listar:', error.code, error.message);
    return [];
  }
  return (data ?? []) as LancamentoRef[];
}
