/**
 * O motor do simulador de fluxo de pagamento (P2.2).
 *
 * Uma função, sem dependência de React, de Supabase ou de rede: a tela usa
 * para recalcular a cada tecla, o PDF usa para imprimir e o servidor pode usar
 * se um dia precisar. Uma fonte para a conta.
 *
 * TUDO EM CENTAVOS, INTEIROS.
 * `0.1 + 0.2 !== 0.3` em ponto flutuante, e aqui o número sai num PDF com o
 * logo da casa, na mão do cliente. Centavo inteiro não tem esse problema, e o
 * resto da divisão é distribuído de propósito (ver `dividirCentavos`) para que
 * a soma das parcelas seja EXATAMENTE o total — e não um centavo a menos.
 *
 * O QUE ESTE MOTOR SE RECUSA A FAZER
 * O plano manda, em letras maiúsculas, não inventar regra de construtora.
 * Quando a condição pede algo que não dá para calcular sem a regra escrita da
 * construtora, a função devolve `impedimentos` e NÃO devolve fluxo. Simular
 * errado é pior do que não simular: o número errado vira promessa.
 */

export type MensaisTipo = 'fixas' | 'decrescentes';

/** Os limites que a construtora impõe. Espelha `condicoes_pagamento`. */
export interface Condicao {
  id?: string;
  nome: string;
  vigente_de?: string;
  vigente_ate?: string | null;
  entrada_min_pct?: number | null;
  ato_min_valor?: number | null;
  mensais_max_qtd?: number | null;
  mensais_tipo: MensaisTipo;
  permite_balao: boolean;
  balao_max_qtd?: number | null;
  balao_meses_permitidos?: number[] | null;
  financiamento_pct_max?: number | null;
  indice_obra?: string | null;
  indice_pos_chaves?: string | null;
  juros_pos_chaves_am?: number | null;
  desconto_a_vista_pct?: number | null;
  observacoes?: string | null;
}

export interface Balao {
  /** Mês do fluxo em que cai, contado a partir do ato (1 = um mês depois). */
  mes: number;
  valorCentavos: number;
}

export interface Entradas {
  valorUnidadeCentavos: number;
  /** Nulo quando o corretor não perguntou. Sem ela, não há "% da renda". */
  rendaFamiliarCentavos?: number | null;
  atoCentavos: number;
  /** Data do ato, ISO `YYYY-MM-DD`. É o marco zero do fluxo. */
  atoData: string;
  mensaisQtd: number;
  baloes: Balao[];
  fgtsCentavos: number;
  financiadoCentavos: number;
  /**
   * Saldo que a construtora carrega DEPOIS da entrega, quando carrega.
   *
   * É entrada explícita, e não sobra de conta: quem absorve o resto da divisão
   * são as mensais até as chaves — é isso que "nº de mensais" quer dizer.
   * Deixar o pós-chaves ser o resto faria a tela mover dinheiro entre as duas
   * fases sozinha, e o corretor descobriria na frente do cliente.
   */
  posChavesCentavos?: number;
  /** Em quantos meses o pós-chaves é pago. Zero = valor único na entrega. */
  posChavesQtd?: number;
}

export type TipoParcela = 'ato' | 'mensal' | 'balao' | 'financiamento' | 'pos_chaves';

export interface Parcela {
  /** 0 = o ato. */
  mes: number;
  data: string;
  tipo: TipoParcela;
  valorCentavos: number;
}

export interface Aviso {
  campo: string;
  texto: string;
}

export interface Fluxo {
  parcelas: Parcela[];
  /** Ato + mensais + balões: o que sai do bolso antes de pegar a chave. */
  totalAteChavesCentavos: number;
  /** A mensal fixa até as chaves. Zero quando não há mensais. */
  mensalAteChavesCentavos: number;
  /** Percentual da renda comprometido pela mensal. Nulo sem renda declarada. */
  pctDaRenda: number | null;
  /** O que sobra para o banco financiar na entrega. */
  financiamentoCentavos: number;
  /** O que sobra DEPOIS do financiamento e do FGTS: o pós-chaves. */
  saldoPosChavesCentavos: number;
  dataDasChaves: string;
  /** Quebras de regra da condição. Não impedem calcular — impedem vender. */
  avisos: Aviso[];
  /**
   * O que impede o cálculo. Com qualquer impedimento, `parcelas` vem vazia:
   * é a recusa deliberada de chutar.
   */
  impedimentos: Aviso[];
}

/**
 * Divide um valor em n parcelas sem perder nem criar centavo.
 *
 * `Math.round(total / n)` repetido n vezes erra até n/2 centavos no total — o
 * erro clássico de divisão de dinheiro. Aqui o resto vai para as PRIMEIRAS
 * parcelas, um centavo em cada: é a convenção que faz a soma fechar e deixa a
 * última parcela nunca maior que as outras, que é como as tabelas de
 * construtora costumam imprimir.
 */
export function dividirCentavos(totalCentavos: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** Soma meses a uma data ISO, sem fuso: `2026-01-31` + 1 mês = `2026-02-28`. */
export function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  // Dia 31 em mês de 30 vira o último dia do mês, e não o dia 1 do seguinte.
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Parcela do sistema Price: prestação constante com juros compostos.
 *
 * Isto NÃO é regra de construtora — é a fórmula de tabela Price, a mesma em
 * qualquer banco. A condição diz a taxa; a fórmula é universal.
 */
export function parcelaPrice(saldoCentavos: number, jurosAoMesPct: number, n: number): number {
  if (n <= 0) return 0;
  if (jurosAoMesPct <= 0) return Math.round(saldoCentavos / n);
  const i = jurosAoMesPct / 100;
  const fator = Math.pow(1 + i, n);
  return Math.round((saldoCentavos * i * fator) / (fator - 1));
}

export function calcularFluxo(entradas: Entradas, condicao: Condicao): Fluxo {
  const avisos: Aviso[] = [];
  const impedimentos: Aviso[] = [];
  const {
    valorUnidadeCentavos, rendaFamiliarCentavos, atoCentavos, atoData,
    mensaisQtd, baloes, fgtsCentavos, financiadoCentavos,
    posChavesCentavos = 0, posChavesQtd = 0,
  } = entradas;

  // ---- o que impede calcular ---------------------------------
  if (condicao.mensais_tipo === 'decrescentes' && mensaisQtd > 0) {
    // "Decrescentes" tem mais de uma convenção de mercado: pode ser saldo
    // amortizado constante (SAC), pode ser redução fixa por parcela, pode ser
    // escalonamento por faixa. Escolher uma sem a tabela da construtora é
    // exatamente o que o plano proíbe.
    impedimentos.push({
      campo: 'mensais_tipo',
      texto: `A tabela "${condicao.nome}" é de mensais decrescentes, e a regra de decréscimo não está cadastrada. Peça à construtora como a parcela cai e cadastre antes de simular.`,
    });
  }
  if (valorUnidadeCentavos <= 0) {
    impedimentos.push({ campo: 'valor', texto: 'Escolha a tipologia: sem o valor da unidade não há o que dividir.' });
  }
  if (impedimentos.length) {
    return {
      parcelas: [], totalAteChavesCentavos: 0, mensalAteChavesCentavos: 0,
      pctDaRenda: null, financiamentoCentavos: 0, saldoPosChavesCentavos: 0,
      dataDasChaves: atoData, avisos, impedimentos,
    };
  }

  // ---- o fluxo -----------------------------------------------
  const totalBaloesCentavos = baloes.reduce((s, b) => s + b.valorCentavos, 0);
  // As mensais até as chaves são o que sobra. É a única grandeza que o corretor
  // informa em QUANTIDADE e não em valor, então é ela que absorve o resto.
  const jaAlocadoCentavos = atoCentavos + totalBaloesCentavos + financiadoCentavos
    + fgtsCentavos + posChavesCentavos;
  const aPrazoCentavos = Math.max(0, valorUnidadeCentavos - jaAlocadoCentavos);
  // Sem saldo a prazo não há mensal: 36 linhas de R$ 0,00 no fluxo seriam
  // ruído, e no PDF pareceriam promessa de parcela que não existe.
  const mensaisValores = aPrazoCentavos > 0 ? dividirCentavos(aPrazoCentavos, mensaisQtd) : [];
  const mensalAteChavesCentavos = mensaisValores[0] ?? 0;

  const parcelas: Parcela[] = [{ mes: 0, data: atoData, tipo: 'ato', valorCentavos: atoCentavos }];
  mensaisValores.forEach((v, i) =>
    parcelas.push({ mes: i + 1, data: somarMeses(atoData, i + 1), tipo: 'mensal', valorCentavos: v }));
  baloes.forEach((b) =>
    parcelas.push({ mes: b.mes, data: somarMeses(atoData, b.mes), tipo: 'balao', valorCentavos: b.valorCentavos }));

  // As chaves saem no mês da última mensal — é o prazo que a própria condição
  // define. Um balão marcado depois disso empurra a data.
  const mesDasChaves = Math.max(mensaisQtd, ...baloes.map((b) => b.mes), 0);
  const dataDasChaves = somarMeses(atoData, mesDasChaves);

  if (financiadoCentavos > 0) {
    parcelas.push({ mes: mesDasChaves, data: dataDasChaves, tipo: 'financiamento', valorCentavos: financiadoCentavos });
  }

  const saldoPosChavesCentavos = posChavesCentavos;
  if (saldoPosChavesCentavos > 0) {
    if (posChavesQtd > 0) {
      const p = parcelaPrice(saldoPosChavesCentavos, condicao.juros_pos_chaves_am ?? 0, posChavesQtd);
      for (let i = 1; i <= posChavesQtd; i++) {
        parcelas.push({
          mes: mesDasChaves + i, data: somarMeses(atoData, mesDasChaves + i),
          tipo: 'pos_chaves', valorCentavos: p,
        });
      }
      if (!condicao.juros_pos_chaves_am) {
        avisos.push({ campo: 'pos_chaves', texto: 'A tabela não traz juros de pós-chaves, então o saldo foi dividido sem juros. Confirme com a construtora.' });
      }
    } else {
      parcelas.push({ mes: mesDasChaves, data: dataDasChaves, tipo: 'pos_chaves', valorCentavos: saldoPosChavesCentavos });
      avisos.push({ campo: 'pos_chaves', texto: `Sobrou ${reais(saldoPosChavesCentavos)} sem prazo combinado. Informe em quantos meses o pós-chaves é pago.` });
    }
  }

  parcelas.sort((x, y) => x.mes - y.mes || x.tipo.localeCompare(y.tipo));

  // ---- o que a condição não permite --------------------------
  const entradaCentavos = atoCentavos + totalBaloesCentavos + aPrazoCentavos + fgtsCentavos;
  if (condicao.entrada_min_pct != null) {
    const minimo = Math.round((valorUnidadeCentavos * condicao.entrada_min_pct) / 100);
    if (entradaCentavos < minimo) {
      avisos.push({
        campo: 'entrada',
        texto: `A entrada soma ${reais(entradaCentavos)}, e a tabela "${condicao.nome}" exige no mínimo ${condicao.entrada_min_pct}% (${reais(minimo)}).`,
      });
    }
  }
  if (condicao.ato_min_valor != null && atoCentavos < Math.round(condicao.ato_min_valor * 100)) {
    avisos.push({ campo: 'ato', texto: `O ato mínimo desta tabela é ${reais(Math.round(condicao.ato_min_valor * 100))}.` });
  }
  if (condicao.mensais_max_qtd != null && mensaisQtd > condicao.mensais_max_qtd) {
    avisos.push({ campo: 'mensais', texto: `Esta tabela vai até ${condicao.mensais_max_qtd} mensais; foram pedidas ${mensaisQtd}.` });
  }
  if (baloes.length > 0 && !condicao.permite_balao) {
    avisos.push({ campo: 'baloes', texto: `A tabela "${condicao.nome}" não permite balão.` });
  } else if (baloes.length > 0) {
    if (condicao.balao_max_qtd != null && baloes.length > condicao.balao_max_qtd) {
      avisos.push({ campo: 'baloes', texto: `São permitidos até ${condicao.balao_max_qtd} balões; foram lançados ${baloes.length}.` });
    }
    const permitidos = condicao.balao_meses_permitidos;
    if (permitidos && permitidos.length > 0) {
      const fora = baloes.filter((b) => !permitidos.includes(b.mes)).map((b) => b.mes);
      if (fora.length) {
        avisos.push({ campo: 'baloes', texto: `Balão só nos meses ${permitidos.join(', ')}. Fora da regra: ${fora.join(', ')}.` });
      }
    }
  }
  if (condicao.financiamento_pct_max != null) {
    const teto = Math.round((valorUnidadeCentavos * condicao.financiamento_pct_max) / 100);
    if (financiadoCentavos > teto) {
      avisos.push({
        campo: 'financiamento',
        texto: `Esta tabela financia no máximo ${condicao.financiamento_pct_max}% (${reais(teto)}); foram lançados ${reais(financiadoCentavos)}.`,
      });
    }
  }
  if (jaAlocadoCentavos > valorUnidadeCentavos) {
    avisos.push({
      campo: 'total',
      texto: `Ato, balões, FGTS, financiamento e pós-chaves somam ${reais(jaAlocadoCentavos)} e já passam do valor da unidade (${reais(valorUnidadeCentavos)}).`,
    });
  } else {
    // Rede de segurança: aqui a soma TEM de fechar no centavo. Se este aviso
    // aparecer, o errado é o motor, não quem digitou.
    const somaTudo = jaAlocadoCentavos + aPrazoCentavos;
    if (somaTudo !== valorUnidadeCentavos) {
      avisos.push({ campo: 'total', texto: `A soma do fluxo (${reais(somaTudo)}) não fecha com o valor da unidade (${reais(valorUnidadeCentavos)}).` });
    }
  }

  const totalAteChavesCentavos = atoCentavos + aPrazoCentavos + totalBaloesCentavos;
  const pctDaRenda = rendaFamiliarCentavos && rendaFamiliarCentavos > 0
    ? Number(((mensalAteChavesCentavos / rendaFamiliarCentavos) * 100).toFixed(1))
    : null;
  if (pctDaRenda != null && pctDaRenda > 30) {
    avisos.push({ campo: 'renda', texto: `A mensal compromete ${pctDaRenda}% da renda declarada. Bancos costumam recusar acima de 30%.` });
  }

  return {
    parcelas, totalAteChavesCentavos, mensalAteChavesCentavos, pctDaRenda,
    financiamentoCentavos: financiadoCentavos, saldoPosChavesCentavos,
    dataDasChaves, avisos, impedimentos,
  };
}
