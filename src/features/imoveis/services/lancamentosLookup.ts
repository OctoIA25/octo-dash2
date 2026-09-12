/**
 * Descobre a QUAL lançamento um código de lead se refere.
 *
 * Lead de lançamento não traz código de catálogo: o Meta manda o nome do
 * empreendimento em `property_code` ('RESERVA CASTANHEIRA', 'RESIDENCIAL
 * VIGORE') e o ZAP manda o código interno da equipe ('L014', via
 * `lancamento_anuncios`). Só o primeiro caso tem como virar link — `lancamentos`
 * não guarda o L0NN, então é pelo nome que dá para casar.
 *
 * ponytail: casamento por nome normalizado, sem tabela de de-para. Se um dia
 * `lancamentos` ganhar a coluna `codigo` (L0NN), o lookup passa a ser por ela e
 * o nome vira só o fallback.
 */
import { supabase } from '@/lib/supabaseClient';

export interface LancamentoRef {
  id: string;
  nome: string;
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
 * O lançamento cujo nome é o código, ou o final/início dele — 'RESIDENCIAL
 * VIGORE' é o 'Vigóre'. A comparação é por palavra inteira de propósito:
 * `includes` solto casaria 'Epic' dentro de qualquer palavra e mandaria o
 * corretor para o empreendimento errado.
 */
export function acharLancamentoPorCodigo(
  codigo: string,
  lancamentos: LancamentoRef[],
): LancamentoRef | undefined {
  const alvo = normalizar(codigo);
  if (!alvo) return undefined;

  // Nome mais longo primeiro: entre 'Vila Itália' e 'Vila', ganha o específico.
  return [...lancamentos]
    .sort((a, b) => b.nome.length - a.nome.length)
    .find((l) => {
      const nome = normalizar(l.nome);
      if (!nome) return false;
      return alvo === nome || alvo.endsWith(` ${nome}`) || alvo.startsWith(`${nome} `);
    });
}

/** Lançamentos do tenant (id + nome). RLS já limita ao tenant do usuário. */
export async function fetchLancamentosRef(tenantId: string): Promise<LancamentoRef[]> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, nome')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[lancamentos] erro ao listar:', error.code, error.message);
    return [];
  }
  return (data ?? []) as LancamentoRef[];
}
