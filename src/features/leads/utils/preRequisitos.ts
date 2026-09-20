/**
 * Pré-requisitos por etapa (P1.6).
 *
 * O plano pede que o quão rígido é o processo seja um interruptor em
 * Configurações, e não regra fixa no código. Aqui mora só a REGRA, pura:
 * recebe a etapa de destino, o que se sabe do lead e as chaves ligadas, e
 * devolve O QUE FALTA. Quem busca o dado é o serviço; quem avisa é a tela.
 *
 * DECIDIDO PELO CHEFE EM 20/09/2026: falta de pré-requisito AVISA, DEIXA
 * PASSAR e registra. Não bloqueia. Por isso esta função devolve uma lista de
 * pendências e nunca um "pode/não pode" — quem chama não tem a opção de
 * barrar, e isso é de propósito.
 *
 * AS FONTES NÃO SÃO AS ÓBVIAS. `leads.visit_date` e `leads.property_value`
 * parecem servir e não servem: estão vazias em 1.678 de 1.678 leads da Lotus
 * e nenhuma tela do sistema as escreve (conferido em 20/09/2026). Exigir um
 * campo que ninguém consegue preencher tornaria a etapa inalcançável. Cada
 * requisito aponta para a fonte que o sistema DE FATO enche — e, junto,
 * carrega ONDE preencher, porque um aviso que não diz o caminho é só um
 * obstáculo.
 */

/** O que a imobiliária ligou. Espelha `tenant_etapa_config`. */
export interface ChavesDeEtapa {
  exigir_visita_agendada: boolean;
  exigir_dados_da_proposta: boolean;
  exigir_proposta_assinada: boolean;
  relato_minimo_caracteres: number;
  registrar_hora_da_assinatura: boolean;
}

export const CHAVES_PADRAO: ChavesDeEtapa = {
  exigir_visita_agendada: false,
  exigir_dados_da_proposta: false,
  exigir_proposta_assinada: false,
  relato_minimo_caracteres: 20,
  registrar_hora_da_assinatura: false,
};

/** O que se sabe do lead na hora de mover. Tudo opcional: o que falta, falta. */
export interface ContextoDoLead {
  /** Compromisso de visita na agenda, com data e imóvel. */
  visita?: { data?: string | null; imovelRef?: string | null } | null;
  /** A proposta vinculada ao lead. */
  proposta?: {
    value?: number | null;
    property_reference?: string | null;
    payment_method?: string | null;
    signed_at?: string | null;
  } | null;
  /** Quantos documentos estão anexados ao lead. */
  documentos?: number;
  /** O relato do corretor (`leads.comments`). */
  relato?: string | null;
}

export interface Pendencia {
  /** Chave estável, para o extrato e para teste. */
  id: string;
  /** O que falta, em português de gente. */
  texto: string;
  /** Onde resolver. Aviso sem caminho é só obstáculo. */
  onde: string;
}

const ETAPAS_DE_PROPOSTA = new Set([
  'proposta-criada',
  'proposta-enviada',
  'proposta-assinada',
]);

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/**
 * A forma de pagamento que o sistema crava sozinho ao espelhar um lead em
 * proposta. Todas as 56 propostas ligadas a lead na Lotus têm exatamente este
 * valor (20/09/2026), e ele é TIPO DE NEGÓCIO, não forma de pagamento.
 * Aceitá-lo faria a chave passar sempre — e um requisito que nunca reprova é
 * pior do que nenhum, porque dá garantia falsa.
 */
const PAGAMENTO_PADRAO_DO_ESPELHO = 'compra e venda';

/**
 * O que falta para este lead entrar nesta etapa.
 *
 * Lista vazia = nada a avisar. Nunca lança: a etapa muda de qualquer jeito.
 */
export function pendenciasDaEtapa(
  etapaDestino: string,
  ctx: ContextoDoLead = {},
  chaves: ChavesDeEtapa = CHAVES_PADRAO
): Pendencia[] {
  const faltam: Pendencia[] = [];
  const etapa = String(etapaDestino ?? '').trim();

  if (chaves.exigir_visita_agendada && etapa === 'visita-agendada') {
    if (vazio(ctx.visita?.data)) {
      faltam.push({
        id: 'visita_sem_data',
        texto: 'não há visita agendada com data para este lead',
        onde: 'na ficha do lead, em Atividades, crie uma "Visita agendada" com data e hora',
      });
    }
    if (vazio(ctx.visita?.imovelRef)) {
      faltam.push({
        id: 'visita_sem_imovel',
        texto: 'a visita agendada não diz qual é o imóvel',
        onde: 'na ficha do lead, em Atividades, preencha o imóvel da visita',
      });
    }
  }

  if (chaves.exigir_dados_da_proposta && ETAPAS_DE_PROPOSTA.has(etapa)) {
    const p = ctx.proposta;
    if (!p) {
      faltam.push({
        id: 'sem_proposta',
        texto: 'não existe proposta vinculada a este lead',
        onde: 'abra a ficha do lead e crie a proposta',
      });
    } else {
      if (!(Number(p.value) > 0)) {
        faltam.push({
          id: 'proposta_sem_valor',
          texto: 'a proposta está sem valor',
          onde: 'na Proposta, preencha o valor',
        });
      }
      if (vazio(p.property_reference)) {
        faltam.push({
          id: 'proposta_sem_codigo',
          texto: 'a proposta está sem o código do imóvel',
          onde: 'na Proposta, preencha o código do imóvel',
        });
      }
      const pgto = String(p.payment_method ?? '').trim().toLowerCase();
      if (pgto === '' || pgto === PAGAMENTO_PADRAO_DO_ESPELHO) {
        faltam.push({
          id: 'proposta_sem_forma_de_pagamento',
          texto: pgto === ''
            ? 'a proposta está sem forma de pagamento'
            : 'a forma de pagamento ainda é a que o sistema preencheu sozinho',
          onde: 'na Proposta, escolha a forma de pagamento',
        });
      }
    }
  }

  if (chaves.exigir_proposta_assinada && etapa === 'proposta-assinada') {
    if (!(Number(ctx.documentos) > 0)) {
      faltam.push({
        id: 'sem_documento_anexado',
        texto: 'nenhum documento foi anexado ao lead',
        onde: 'na ficha do lead, anexe a proposta assinada em Documentos',
      });
    }
    const minimo = Math.max(0, Number(chaves.relato_minimo_caracteres) || 0);
    if (minimo > 0 && String(ctx.relato ?? '').trim().length < minimo) {
      faltam.push({
        id: 'relato_curto',
        texto: `o relato tem menos de ${minimo} caracteres`,
        onde: 'na ficha do lead, escreva o que foi combinado no campo Observação',
      });
    }
  }

  return faltam;
}

/**
 * A etapa de destino pede o carimbo da hora da assinatura?
 *
 * Não é pendência: é uma AÇÃO que a chave liga. Só carimba quando ainda não
 * há hora gravada — regravar apagaria o registro de quando de fato assinou.
 */
export function deveCarimbarAssinatura(
  etapaDestino: string,
  ctx: ContextoDoLead = {},
  chaves: ChavesDeEtapa = CHAVES_PADRAO
): boolean {
  if (!chaves.registrar_hora_da_assinatura) return false;
  if (String(etapaDestino ?? '').trim() !== 'proposta-assinada') return false;
  return !ctx.proposta?.signed_at;
}

/** O aviso, numa frase. Vazio quando não há o que avisar. */
export function textoDoAviso(pendencias: Pendencia[]): string {
  if (pendencias.length === 0) return '';
  if (pendencias.length === 1) return `Etapa mudada, mas ${pendencias[0].texto}.`;
  return `Etapa mudada, mas ${pendencias.length} pendências: ${pendencias.map((p) => p.texto).join('; ')}.`;
}
