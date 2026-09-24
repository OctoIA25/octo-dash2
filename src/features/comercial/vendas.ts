/**
 * Conferência de vendas (P4.4) — as contas, fora do componente.
 *
 * A venda NASCE DA PROPOSTA ASSINADA, e não da planilha. A medição que decidiu
 * isto, em produção em 21/09: ligar as 37 vendas da planilha a um lead pelo
 * nome do cliente recupera 3; construir a venda a partir das propostas
 * assinadas recupera 37. A planilha vira histórico; o CRM manda.
 *
 * Duas regras atravessam o arquivo:
 *
 * 1. O QUE FOI CALCULADO NA HORA DA VENDA NÃO MUDA DEPOIS. O nível do corretor
 *    fica congelado em `vendas.nivel_corretor`, e o de cada pessoa do repasse
 *    em `venda_repasses.nivel`. Promover alguém em outubro não pode reescrever
 *    o que a casa pagou em setembro.
 *
 * 2. O CÁLCULO MANDA, E A DIFERENÇA APARECE. Quando a comissão que veio na
 *    proposta discorda da calculada, a tela mostra as duas — decidido com o
 *    chefe. Esconder a divergência faria a conferência perder a função.
 */

import {
  calcularComissao, nivelValido, NIVEIS,
  type Entrada, type Nivel, type Papel, type ResultadoComissao,
} from '@/features/comissionamento/commissionRules';

// O formatador exato vem do relatório de anúncios de propósito: em dinheiro de
// comissão o centavo é a unidade de trabalho, e ter dois formatadores de real
// na mesma Dash é o começo de dois números diferentes para o mesmo valor.
export { reaisExatos } from '@/features/relatorios/marketing/campanhas';

export type StatusDaVenda = 'a_faturar' | 'faturado' | 'recebido' | 'divergente';

export interface VendaNaLista {
  id: string;
  data_venda: string;
  empreendimento: string;
  construtora: string | null;
  tipo: 'lancamento' | 'terceiros';
  corretor: string;
  corretor_id: string | null;
  nivel_corretor: string | null;
  lead_id: string | null;
  vgv: number;
  comissao_pct: number;
  comissao_bruta: number;
  imposto_pct: number;
  imposto_valor: number;
  /**
   * O que sobra para a casa: bruta menos os repasses de corretor e líder.
   * Decidido pelo chefe em 23/09, e o imposto NÃO entra ("ainda").
   *
   * `null` enquanto a folha não foi calculada — e é diferente de zero e de
   * "igual à bruta". Deixá-la na bruta afirmaria que a casa fica com 100% da
   * comissão: um número redondo, plausível e errado.
   */
  comissao_liquida: number | null;
  /** O que a proposta trazia escrito. Null quando ela não trazia nada. */
  comissao_da_proposta: number | null;
  nf_numero: string | null;
  nf_data: string | null;
  recebimento_previsto_em: string | null;
  recebido_em: string | null;
  valor_recebido: number | null;
  diferenca: number;
  status: StatusDaVenda;
  repasses: number;
  repasses_pagos: number;
}

export interface TotaisDaConferencia {
  vendas: number;
  vgv: number;
  comissao_bruta: number;
  imposto: number;
  /** Soma do que sobra para a casa, ignorando as vendas sem folha calculada. */
  comissao_liquida: number;
  recebido: number;
  a_receber: number;
  divergentes: number;
  sem_percentual: number;
  sem_repasse: number;
}

export interface Conferencia {
  de: string;
  ate: string;
  linhas: VendaNaLista[];
  totais: TotaisDaConferencia;
}

export const ROTULO_DO_STATUS: Record<StatusDaVenda, string> = {
  a_faturar: 'A faturar',
  faturado: 'Faturado',
  recebido: 'Recebido',
  divergente: 'Divergente',
};

/** Cor do chip. O divergente é o único vermelho — é o que pede ação. */
export const COR_DO_STATUS: Record<StatusDaVenda, string> = {
  a_faturar: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  faturado: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  recebido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  divergente: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};

/** Um centavo. A mesma tolerância que o banco usa para marcar `divergente`. */
const CENTAVO = 0.01;

/**
 * A leitura da divergência entre o previsto e o recebido.
 *
 * Devolve `null` enquanto nada foi recebido — antes do recebimento não existe
 * divergência, existe espera, e pintar de vermelho quem só não recebeu ainda
 * treinaria todo mundo a ignorar o vermelho.
 *
 * O previsto é a comissão BRUTA: é o que a construtora deposita. O imposto é
 * pago depois, pela casa. Comparar contra a líquida acusava divergência
 * justamente no caso normal — o recebimento certo virava alarme.
 */
export function divergencia(v: Pick<VendaNaLista, 'valor_recebido' | 'comissao_bruta'>): {
  valor: number;
  sentido: 'a_menos' | 'a_mais';
  texto: string;
} | null {
  if (v?.valor_recebido == null) return null;
  const d = v.valor_recebido - v.comissao_bruta;
  if (Math.abs(d) <= CENTAVO) return null;
  const sentido = d < 0 ? 'a_menos' : 'a_mais';
  return {
    valor: d,
    sentido,
    texto: sentido === 'a_menos'
      ? `Entrou ${formatar(Math.abs(d))} a MENOS do que a comissão bruta calculada.`
      : `Entrou ${formatar(d)} a MAIS do que a comissão bruta calculada.`,
  };
}

/**
 * A comissão da proposta discorda da calculada?
 *
 * A proposta traz um total digitado por quem a montou; a venda calcula pelo
 * percentual da construtora. Quando divergem, quem confere precisa ver as
 * duas para decidir qual está errada — e quase sempre é a construtora que
 * mudou de percentual sem ninguém atualizar o cadastro.
 */
export function avisoDaComissaoDaProposta(
  v: Pick<VendaNaLista, 'comissao_da_proposta' | 'comissao_bruta' | 'comissao_pct'>
): string | null {
  if (!v || v.comissao_da_proposta == null) return null;
  const d = v.comissao_bruta - v.comissao_da_proposta;
  if (Math.abs(d) <= CENTAVO) return null;
  return `A proposta trazia ${formatar(v.comissao_da_proposta)} de comissão; ` +
    `o cálculo por ${percentual(v.comissao_pct)} dá ${formatar(v.comissao_bruta)}. ` +
    'Vale o cálculo — confira o percentual da construtora no cadastro.';
}

/**
 * Os totais do rodapé batem com a soma das linhas?
 *
 * É o terceiro critério de pronto do plano, e a tela confere em vez de
 * prometer: o rodapé e as linhas vêm da MESMA consulta no banco, então
 * divergir aqui significa que algo se perdeu no caminho — e é melhor a tela
 * dizer isso do que exibir dois números e deixar quem confere escolher.
 */
export function totaisConferem(
  linhas: VendaNaLista[],
  totais: TotaisDaConferencia | null | undefined
): { confere: boolean; campo?: string; soma?: number; rodape?: number } {
  if (!totais) return { confere: true };
  const campos: Array<[keyof TotaisDaConferencia, (v: VendaNaLista) => number]> = [
    ['vgv', (v) => v.vgv],
    ['comissao_bruta', (v) => v.comissao_bruta],
    ['imposto', (v) => v.imposto_valor],
    ['comissao_liquida', (v) => v.comissao_liquida],
  ];
  for (const [campo, pega] of campos) {
    const soma = (linhas ?? []).reduce((s, v) => s + (pega(v) || 0), 0);
    const rodape = Number(totais[campo] ?? 0);
    if (Math.abs(soma - rodape) > CENTAVO) {
      return { confere: false, campo: String(campo), soma, rodape };
    }
  }
  return { confere: true };
}

export interface PessoaDoRepasse {
  user_id: string;
  nome: string;
  nivel: Nivel | null;
  leader_user_id: string | null;
}

/**
 * Monta a entrada do motor de comissão a partir da venda.
 *
 * O NÍVEL VEM DA VENDA, não do cadastro: é o congelado no dia da assinatura.
 * Buscar o nível atual aqui desfaria, na hora de pagar, a garantia que o banco
 * protege — e ninguém notaria, porque o número continuaria plausível.
 *
 * A BASE DO RATEIO É A COMISSÃO BRUTA. Medido na planilha da Lotus em 21/09:
 * nas 31 vendas com comissão, `valor_vgc` e `comissao_total_venda` são o mesmo
 * número, e em 26 delas corretor + líder dão exatamente 60% dele — a casa fica
 * com 40%, e é dos 40% que sai o imposto.
 *
 * Eu havia construído isto sobre a LÍQUIDA, o que paga 6% a menos a cada
 * corretor: numa comissão de R$ 42.500, o júnior receberia R$ 15.980 em vez de
 * R$ 17.000. O erro não apareceria na tela, porque a folha fechava.
 */
export function entradaDoMotor(
  venda: Pick<VendaNaLista, 'tipo' | 'corretor' | 'corretor_id' | 'nivel_corretor' | 'comissao_bruta'>,
  equipe: PessoaDoRepasse[]
): { entrada: Entrada } | { impedimento: string } {
  const nivel = nivelValido(venda.nivel_corretor);
  if (!nivel) {
    return {
      impedimento: `${venda.corretor || 'O corretor'} não tinha nível de comissão no cadastro quando a venda foi registrada. ` +
        'Defina o nível em Gestão de Equipe e registre o repasse manualmente — mudar o cadastro agora NÃO altera esta venda, de propósito.',
    };
  }
  if (!(venda.comissao_bruta > 0)) {
    return { impedimento: 'A venda está com comissão zerada. Confira o percentual da construtora antes de gerar os repasses.' };
  }

  const eu = equipe.find((p) => p.user_id === venda.corretor_id);
  const liderCru = eu?.leader_user_id ? equipe.find((p) => p.user_id === eu.leader_user_id) : null;
  // O motor bloqueia (D062) quando quem não é Sênior/Coordenador fica sem
  // Líder Direto. Deixamos o bloqueio acontecer com o motivo dele, em vez de
  // inventar um líder aqui: a regra é da spec de comissão, não desta tela.
  const liderDireto = liderCru && nivelValido(liderCru.nivel)
    ? { nome: liderCru.nome, nivel: nivelValido(liderCru.nivel)! }
    : null;

  const corretor = { nome: venda.corretor || 'Corretor', nivel, liderDireto };

  return {
    entrada: {
      // Lançamento não tem ponta de captação — ela é direta com a construtora.
      // Venda de terceiros é revenda para o motor, e aí as duas pontas existem.
      tipo: venda.tipo === 'lancamento' ? 'lancamento' : 'revenda',
      comissaoTotal: venda.comissao_bruta,
      captacao: venda.tipo === 'lancamento' ? null : corretor,
      intermediacao: corretor,
    },
  };
}

export interface RepasseParaGravar {
  papel: Papel;
  parte: string;
  nivel: Nivel | null;
  percentual: number;
  valor: number;
}

/**
 * Calcula os repasses da venda. Devolve o impedimento quando não dá — e nunca
 * uma lista parcial: meia folha de pagamento é pior que nenhuma.
 */
export function repassesDaVenda(
  venda: Parameters<typeof entradaDoMotor>[0],
  equipe: PessoaDoRepasse[]
): { linhas: RepasseParaGravar[]; resultado: ResultadoComissao } | { impedimento: string } {
  const entrada = entradaDoMotor(venda, equipe);
  if ('impedimento' in entrada) return entrada;

  const resultado = calcularComissao(entrada.entrada);
  if (resultado.bloqueio) {
    return { impedimento: `${resultado.bloqueio.motivo} (${resultado.bloqueio.codigo})` };
  }

  const linhas = resultado.linhas.map((l) => ({
    papel: l.papel,
    parte: l.parte,
    nivel: l.nivel ?? null,
    percentual: l.percentual,
    valor: Math.round(l.valor * 100) / 100,
  }));
  return { linhas, resultado };
}

/** O rótulo do nível como a spec de comissão o escreve. */
export const rotuloDoNivel = (n: string | null | undefined): string => {
  const v = nivelValido(n);
  return v ? NIVEIS[v].label : 'sem nível';
};

const formatar = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
    .replace(/\u00A0/g, ' ');

const percentual = (v: number) => `${String(v).replace('.', ',')}%`;
