/**
 * Custo de IA (P2.8) — como os números se leem na tela.
 *
 * A regra que atravessa tudo: **ausência nunca vira zero.** Custo "—" é
 * "ninguém reportou o uso"; custo "US$ 0,00" seria "rodou e não custou nada".
 * Confundir os dois faz o gestor achar que a IA é barata quando, na verdade,
 * a medição é que não existe.
 */

export interface TotalDeCusto {
  chamadas: number;
  com_uso: number;
  sem_uso: number;
  sem_preco: number;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache: number;
  custo_usd: number | null;
  leads_atendidos: number;
  documentos: number;
  precos_nao_conferidos: number;
}

export interface LinhaPorAgente {
  agente: string;
  chamadas: number;
  sem_uso: number;
  tokens: number;
  custo_usd: number | null;
  leads: number;
}

export interface PainelDeCusto {
  de: string;
  ate: string;
  total: TotalDeCusto;
  por_agente: LinhaPorAgente[];
  por_etapa: Array<{ etapa: string; chamadas: number; custo_usd: number | null }>;
  por_modelo: Array<{
    modelo: string;
    chamadas: number;
    tokens: number;
    custo_usd: number | null;
    tem_preco: boolean;
    preco_conferido: boolean;
  }>;
}

/** "US$ 12,3456" com casas suficientes para custo de IA, que é centavo de centavo. */
export function dinheiro(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  if (usd === 0) return 'US$ 0,00';
  const casas = usd < 0.01 ? 4 : 2;
  return `US$ ${usd.toFixed(casas).replace('.', ',')}`;
}

/** 1.234.567 → "1,2 M". Token vira número grande rápido. */
export function tokens(n: number | null | undefined): string {
  const v = Number(n) || 0;
  // Arredondamento explícito, e não `toFixed(1)`: 1.450.000 / 1e6 é 1,4499…
  // em ponto flutuante, e `toFixed` devolveria "1,4". Número que o gestor lê
  // não pode depender de como o float caiu.
  const uma = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
  if (v >= 1_000_000) return `${uma(v / 1_000_000)} M`;
  if (v >= 1_000) return `${uma(v / 1_000)} mil`;
  return String(v);
}

/**
 * Custo por lead. Null quando não dá para afirmar — e são dois motivos
 * diferentes: não houve custo calculável, ou não houve lead atendido.
 */
export function custoPorLead(t: TotalDeCusto | null): number | null {
  if (!t || t.custo_usd == null || !t.leads_atendidos) return null;
  return t.custo_usd / t.leads_atendidos;
}

export function custoPorDocumento(t: TotalDeCusto | null): number | null {
  if (!t || t.custo_usd == null || !t.documentos) return null;
  return t.custo_usd / t.documentos;
}

export interface Confianca {
  /** 0 a 100: quanto das chamadas do período tem uso reportado. */
  cobertura: number;
  texto: string;
  alerta: boolean;
}

/**
 * O quanto dá para confiar no custo mostrado.
 *
 * É o número mais importante da tela, e o que faltava: em 21/09/2026, das 19
 * chamadas registradas, ZERO tinham uso — o custo aparecia como "—" e ninguém
 * sabia se era porque a IA é barata ou porque ninguém contou.
 */
export function confianca(t: TotalDeCusto | null): Confianca {
  if (!t || t.chamadas === 0) {
    return { cobertura: 0, texto: 'Nenhuma chamada de IA registrada no período.', alerta: false };
  }
  const cobertura = Math.round((t.com_uso / t.chamadas) * 100);
  if (cobertura === 0) {
    return {
      cobertura,
      texto: `Nenhuma das ${t.chamadas} chamadas reportou uso — o custo não pode ser calculado. Quem chama a IA precisa devolver o "usage" da resposta.`,
      alerta: true,
    };
  }
  if (cobertura < 100) {
    return {
      cobertura,
      texto: `${t.sem_uso} de ${t.chamadas} chamadas não reportaram uso: o custo abaixo é só dos ${t.com_uso} que reportaram, e o real é maior.`,
      alerta: true,
    };
  }
  if (t.sem_preco > 0) {
    return {
      cobertura,
      texto: `${t.sem_preco} chamada(s) usaram modelo sem preço cadastrado — não entram na soma.`,
      alerta: true,
    };
  }
  return { cobertura, texto: 'Todas as chamadas do período reportaram uso.', alerta: false };
}

/**
 * O que dizer sobre a fatura do provedor.
 *
 * O plano pede que o custo "bata (±5%) com a fatura". Medido em 21/09: a Lotus
 * está em assinatura Claude Max, onde **não existe fatura por token** — o custo
 * marginal de um token ali é zero, e o próprio código anula o valor em dólar de
 * propósito, guardando só o percentual da janela.
 *
 * Então a tela diz o que cada coisa é, em vez de somar duas naturezas.
 */
export function sobreAFatura(modo: 'api' | 'max' | null, percentual: number | null): string {
  if (modo === 'max') {
    const quanto = percentual == null ? '' : ` Hoje, ${percentual}% da janela semanal foi consumida.`;
    return (
      'A LIA roda em assinatura (Claude Max): não há fatura por token para conferir, ' +
      'e o custo abaixo é uma referência do consumo, não o que foi pago.' + quanto
    );
  }
  if (modo === 'api') {
    return 'Cobrança por token: o custo abaixo deve bater com a fatura do provedor. Diferença grande costuma ser chamada que não reportou uso.';
  }
  return 'Provedor não configurado nesta imobiliária — o custo abaixo vem só do que os agentes reportaram.';
}
