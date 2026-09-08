/**
 * Os seis estágios do funil de recrutamento (spec do Erick):
 *   Lead · Interação · Qualificado · Reunião realizada · Matrícula · Onboard
 * mais 'perdido', que é saída, não etapa.
 *
 * Fonte única de vocabulário para serviço, página e gráficos. Os ids são os
 * mesmos do enum recrut_estagio no banco.
 */
export const ESTAGIOS = [
  { id: 'lead', label: 'Lead' },
  { id: 'interacao', label: 'Interação' },
  { id: 'qualificado', label: 'Qualificado' },
  { id: 'reuniao_realizada', label: 'Reunião realizada' },
  { id: 'matricula', label: 'Matrícula' },
  { id: 'onboard', label: 'Onboard' },
] as const;

export type EstagioId = (typeof ESTAGIOS)[number]['id'] | 'perdido';

export const LABEL_ESTAGIO: Record<EstagioId, string> = {
  ...Object.fromEntries(ESTAGIOS.map((e) => [e.id, e.label])),
  perdido: 'Perdido',
} as Record<EstagioId, string>;

export const ESTAGIO_POR_LABEL: Record<string, EstagioId> = Object.fromEntries(
  (Object.entries(LABEL_ESTAGIO) as [EstagioId, string][]).map(([id, label]) => [label, id]),
);

/**
 * Quão longe o candidato chegou. 'perdido' não diz ONDE parou — o motivo da
 * perda diz por quê, não em que etapa —, então conta só como entrada no funil.
 */
export function nivelAlcancado(estagio: string | null | undefined): number {
  if (!estagio || estagio === 'perdido') return 0;
  const i = ESTAGIOS.findIndex((e) => e.id === estagio);
  return i < 0 ? 0 : i;
}

/**
 * Contagem CUMULATIVA por etapa: quem chegou ao Onboard continua contando em
 * Lead, Interação e nas demais. Contar "está atualmente em" era o que fazia o
 * painel imprimir 0·0·0·1 sempre que ninguém estava parado no meio.
 */
export function contarEtapas(candidatos: ReadonlyArray<{ estagio?: string | null }>): number[] {
  return ESTAGIOS.map((_, nivel) => candidatos.filter((c) => nivelAlcancado(c.estagio) >= nivel).length);
}

/**
 * O evento que leva a cada estágio. A UI nunca escreve `estagio`: ela grava um
 * evento e o trigger do banco recalcula. Por isso 'lead' não tem evento — o
 * funil só anda para frente, não se "volta" um candidato para Lead.
 */
export const EVENTO_PARA_ESTAGIO: Record<EstagioId, { tipo: string; payload?: Record<string, unknown> } | null> = {
  lead: null,
  interacao: { tipo: 'resposta_candidato' },
  qualificado: { tipo: 'condicoes_respondidas' },
  reuniao_realizada: { tipo: 'reuniao_realizada' },
  matricula: { tipo: 'matricula_confirmada' },
  onboard: { tipo: 'marco_ativacao', payload: { marco: 'primeiro_plantao' } },
  perdido: { tipo: 'encerrado' },
};

/** Nome legível de cada evento, para a timeline da ficha. */
export const LABEL_EVENTO: Record<string, string> = {
  candidatura_recebida: 'Candidatura recebida',
  primeiro_contato: 'Primeiro contato',
  resposta_candidato: 'Candidato respondeu',
  condicoes_respondidas: 'Três condições verificadas',
  reuniao_agendada: 'Reunião agendada',
  reuniao_confirmada: 'Reunião confirmada',
  reuniao_realizada: 'Reunião realizada',
  no_show: 'Não compareceu',
  decisao: 'Decisão',
  link_matricula_enviado: 'Link da matrícula enviado',
  matricula_confirmada: 'Matrícula confirmada',
  prazo_matricula_vencido: 'Prazo da matrícula vencido',
  marco_ativacao: 'Marco de ativação',
  encerrado: 'Encerrado',
};

/**
 * Taxonomia fechada de motivo de perda (enum recrut_motivo_perda). A spec a
 * exige para fechar qualquer card: "Sem isso, o VISÃO não tem o que calibrar e
 * este diagnóstico precisa ser refeito à mão daqui a três meses."
 */
export const MOTIVOS_PERDA = [
  { id: 'fora_de_regiao', label: 'Fora da região' },
  { id: 'sem_tempo', label: 'Sem tempo disponível' },
  { id: 'sem_verba', label: 'Sem sustento para o período' },
  { id: 'nao_pagou_matricula', label: 'Não pagou a matrícula' },
  { id: 'sumiu', label: 'Sumiu' },
  { id: 'escolheu_concorrente', label: 'Escolheu concorrente' },
  { id: 'reprovado_por_nos', label: 'Reprovado por nós' },
] as const;

/** As três condições de entrada, na ordem em que a spec manda perguntar. */
export const CONDICOES = [
  { id: 'cond_regiao', label: 'Região', pergunta: 'Mora em Jundiaí ou Itupeva?' },
  { id: 'cond_tempo', label: 'Tempo', pergunta: '1 plantão por semana + 1 fim de semana por mês?' },
  { id: 'cond_verba', label: 'Verba', pergunta: 'Tem sustento até a primeira venda entrar?' },
] as const;

export const SITUACOES_CONDICAO = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'aprovado', label: 'Aprovado' },
  { id: 'reprovado', label: 'Reprovado' },
  { id: 'decisao_erick', label: 'Decisão do Erick' },
] as const;

/**
 * O que cada linha da fila de ação quer dizer, em português de gente. Os ids
 * vêm dos cinco blocos da view vw_recrut_fila_acao (spec §6).
 */
export function descreveMotivoFila(motivo: string): string {
  if (motivo?.startsWith('marco_atrasado:')) {
    const marco = motivo.slice('marco_atrasado:'.length).replace(/_/g, ' ');
    return `Marco de ativação atrasado: ${marco}`;
  }
  return {
    sla_primeiro_contato: 'Candidatura sem primeiro contato',
    sem_resposta_24h: 'Respondeu e ficou sem retorno',
    confirmar_reuniao: 'Reunião amanhã, sem confirmação enviada',
    prazo_matricula: 'Prazo da matrícula vencido',
  }[motivo] ?? motivo;
}

/** Dias corridos entre uma data e hoje. */
export function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Os cinco marcos da ativação de 30 dias, na ordem em que a spec os lista. */
export const MARCOS_ATIVACAO = [
  { id: 'matricula', label: 'Matrícula paga', dias: 5 },
  { id: 'primeiro_plantao', label: 'Primeiro plantão', dias: 7 },
  { id: 'primeira_lista_leads', label: 'Primeira lista de leads', dias: 7 },
  { id: 'primeira_visita', label: 'Primeira visita acompanhada', dias: 15 },
  { id: 'checkpoint_30d', label: 'Checkpoint com o Coordenador', dias: 30 },
] as const;

export const LABEL_MARCO: Record<string, string> = Object.fromEntries(
  MARCOS_ATIVACAO.map((m) => [m.id, m.label]),
);
