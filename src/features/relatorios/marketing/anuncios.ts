/**
 * Relatório de anúncios (P3.6) — as contas, fora do componente.
 *
 * A regra que atravessa o arquivo: TAXA NUNCA APARECE SOZINHA. Medido em
 * produção em 21/09, de 5.303 leads apenas 13 chegaram a Visita agendada — a
 * coluna sai 0,2%. Sozinha, ela faz comparar corretor por ruído; com o número
 * cru ao lado, diz na hora que o funil é que não é atualizado.
 */

export interface LinhaDaMatriz {
  quem: string;
  recebidos: number;
  atendidos_1h: number;
  com_tempo: number;
  minutos_medio: number | null;
  visita: number;
  proposta: number;
  venda: number;
}

export interface Matriz {
  de: string;
  ate: string;
  por: 'corretor' | 'equipe';
  origem: string | null;
  linhas: LinhaDaMatriz[];
  totais: {
    leads: number;
    sem_responsavel: number;
    atendidos_1h: number;
    visita: number;
    proposta: number;
    venda: number;
  };
  equipes_sem_membro: number;
  vendas_na_planilha: number;
}

export interface Taxa {
  pct: number | null;
  /** "0,2% (13 de 5.303)" — nunca só "0,2%". */
  texto: string;
}

export function taxa(parte: number, total: number): Taxa {
  if (!Number.isFinite(total) || total <= 0) {
    return { pct: null, texto: '—' };
  }
  const pct = Math.round((parte / total) * 1000) / 10;
  const cru = `${parte.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
  return { pct, texto: `${String(pct).replace('.', ',')}% (${cru})` };
}

export type Faixa = 'boa' | 'media' | 'ruim' | 'sem';

/**
 * A cor de uma taxa. As faixas são as mesmas para todas as colunas de
 * porcentagem da matriz, para o gestor não ter de reaprender a cor em cada uma.
 *
 * Taxa sem denominador não é ruim — é ausente, e fica sem cor. Pintar de
 * vermelho quem não recebeu lead nenhum acusaria a pessoa pelo que não fez
 * porque não lhe deram o que fazer.
 */
export function corDaTaxa(t: Taxa, bom = 60, medio = 30): Faixa {
  if (t.pct == null) return 'sem';
  if (t.pct >= bom) return 'boa';
  if (t.pct >= medio) return 'media';
  return 'ruim';
}

/**
 * O semáforo de conversão, por campanha.
 *
 * Sem alvo cadastrado, NÃO pinta. Um alvo inventado faria a tela recomendar
 * desligar campanha com base num número que ninguém escolheu.
 */
export function semaforo(
  custoPorQualificado: number | null | undefined,
  alvo: number | null | undefined,
  limite: number | null | undefined
): { cor: Faixa; texto: string } {
  if (alvo == null || !(alvo > 0)) {
    return { cor: 'sem', texto: 'alvo de custo por qualificado não cadastrado' };
  }
  if (custoPorQualificado == null || !Number.isFinite(custoPorQualificado)) {
    return { cor: 'sem', texto: 'ainda não há lead qualificado nesta campanha' };
  }
  if (custoPorQualificado <= alvo) return { cor: 'boa', texto: `dentro do alvo de ${alvo}` };
  const teto = limite != null && limite > 0 ? limite : alvo * 1.5;
  if (custoPorQualificado <= teto) return { cor: 'media', texto: `acima do alvo, abaixo do limite de ${teto}` };
  return { cor: 'ruim', texto: `acima do limite de ${teto}` };
}

export interface Verba {
  id: string;
  mes: string;
  empreendimento: string | null;
  campaign_id: string | null;
  plataforma: string;
  valor: number;
}

/**
 * Quanto da verba já foi consumido.
 *
 * Passar de 100% não é erro a esconder: é o fato que o gestor precisa ver, e
 * a barra para em 100% enquanto o texto diz o quanto passou.
 */
export function consumoDaVerba(
  planejado: number,
  gasto: number
): { pct: number | null; larguraDaBarra: number; estado: Faixa; texto: string } {
  if (!Number.isFinite(planejado) || planejado <= 0) {
    return { pct: null, larguraDaBarra: 0, estado: 'sem', texto: 'sem verba planejada' };
  }
  const pct = Math.round((gasto / planejado) * 100);
  if (pct > 100) {
    return {
      pct,
      larguraDaBarra: 100,
      estado: 'ruim',
      texto: `estourou em ${pct - 100}%`,
    };
  }
  return {
    pct,
    larguraDaBarra: pct,
    // Perto do fim do mês, 90% é bom; no começo, é sinal de que vai estourar.
    // A tela não sabe o dia, então a faixa é só sobre o consumo.
    estado: pct >= 90 ? 'media' : 'boa',
    texto: `${pct}% consumido`,
  };
}

export interface LinhaDeToque {
  origem: string;
  leads: number;
  primeiro_toque: number;
  ultimo_toque: number;
  /** Positivo: a origem traz. Negativo: ela reencontra o que outra trouxe. */
  saldo: number;
}

/**
 * O que o saldo de toques significa, em palavras.
 *
 * O número sozinho não diz nada a quem não montou a conta — e é justamente
 * esta leitura que muda decisão de verba.
 */
export function leituraDoSaldo(l: LinhaDeToque): string | null {
  if (l.saldo > 0) return `traz ${l.saldo} cliente(s) a mais do que reencontra`;
  if (l.saldo < 0) return `reencontra ${-l.saldo} cliente(s) que outra origem trouxe`;
  return null;
}

/** Vale mostrar a tela de toques? Sem cliente repetido, ela é uma lista sem graça. */
export function valeOlharToques(resumo: { clientes_repetidos: number; trocaram_de_origem: number }): boolean {
  return (resumo?.trocaram_de_origem ?? 0) > 0;
}
