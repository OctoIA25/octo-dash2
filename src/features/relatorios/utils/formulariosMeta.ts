/**
 * Formulários da Meta (P2.7) — o que cada número da tela significa.
 *
 * Funções puras. Os contadores vêm do banco; o que mora aqui é o TEXTO que
 * explica cada um — porque "Sem direcionamento: 2" não diz nada sozinho.
 */

import type { ContadoresDaMeta, FormularioDaMeta } from '../services/formulariosMetaService';

export interface ContadorExplicado {
  chave: string;
  rotulo: string;
  valor: number | string;
  /** A legenda que o plano pede em cada contador. */
  legenda: string;
  alerta?: boolean;
}

/** "há 12 min", "há 3 h", "há 5 dias", "nunca". */
export function desde(iso: string | null | undefined, agora: number = Date.now()): string {
  if (!iso) return 'nunca';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'nunca';
  const min = Math.max(0, Math.round((agora - t) / 60000));
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 48) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} dias`;
}

export function contadores(c: ContadoresDaMeta | null, agora: number = Date.now()): ContadorExplicado[] {
  if (!c) return [];
  return [
    {
      chave: 'captando',
      rotulo: 'Captando agora',
      valor: `${c.captando} de ${c.formularios}`,
      legenda:
        'Formulários cuja captação está ligada. Desligar não descarta o lead: ele entra marcado e não é distribuído.',
    },
    {
      chave: 'lia',
      rotulo: 'LIA atende',
      valor: `${c.lia_atende} de ${c.formularios}`,
      legenda: 'Onde a LIA fala com o lead assim que ele chega. Desligado, o lead vai direto para a fila.',
    },
    {
      chave: 'sem_direcionamento',
      rotulo: 'Sem direcionamento',
      valor: c.sem_direcionamento,
      legenda:
        'Formulários sem empreendimento amarrado. O lead deles não bate na regra do lançamento e cai na roleta geral (pega-tudo).',
      alerta: c.sem_direcionamento > 0,
    },
    {
      chave: 'leads',
      rotulo: 'Leads na base',
      valor: c.leads_na_base,
      legenda: `Total já recebido destes formulários. ${c.novos_24h} nas últimas 24 h.`,
    },
    {
      chave: 'sem_campanha',
      rotulo: 'Sem campanha',
      valor: c.sem_campanha,
      legenda:
        'Leads que entraram sem campanha nem anúncio gravados. "Baixar leads" recupera isso — a Meta guarda os últimos 90 dias.',
      alerta: c.sem_campanha > 0,
    },
    {
      chave: 'sincronizado',
      rotulo: 'Última sincronização',
      valor: desde(c.sincronizado_em, agora),
      legenda: 'Quando a lista de formulários foi buscada na Meta pela última vez. Só nomes — não baixa lead.',
      alerta: !c.sincronizado_em,
    },

    // ----------------------------------------------------------------
    // A conferência com o outro lado (item 6, 23/09/2026).
    //
    // Até aqui esta tela mostrava um lado só: "Leads na base" é contagem da
    // Dash contra NADA. Não havia, em lugar nenhum dela, o número da Meta —
    // embora ele já chegasse na resposta da API e fosse descartado ao salvar.
    // ----------------------------------------------------------------
    {
      chave: 'nao_migraram',
      rotulo: 'Não migraram',
      valor: c.eventos_travados + c.eventos_parados,
      // ESTE é o alerta, e não a diferença de contagem. Aqui a Meta avisou,
      // guardamos o aviso, e o lead não chegou a existir: não há leitura
      // inocente, não depende de quando a integração começou.
      legenda: c.eventos_travados + c.eventos_parados > 0
        ? `A Meta avisou e o lead não chegou a existir: ${c.eventos_travados} falharam e ${c.eventos_parados} estão parados há mais de uma hora. O motivo aparece na linha do formulário.`
        : 'Nenhum aviso da Meta ficou pelo caminho. Todo lead anunciado virou lead aqui.',
      alerta: c.eventos_travados + c.eventos_parados > 0,
    },
    {
      chave: 'meta_conta',
      rotulo: 'A Meta conta',
      valor: c.formularios_conferidos === 0
        ? 'não perguntado'
        : `${c.leads_na_meta} · aqui ${c.leads_na_base}`,
      // Sem alerta de propósito: o número da Meta é o total da VIDA INTEIRA
      // do formulário, e o nosso começa no dia em que a integração entrou no
      // ar. Num formulário antigo a diferença é enorme e não é perda — é
      // história anterior. Pintar isso de vermelho treinaria a equipe a
      // ignorar o vermelho em duas semanas.
      legenda: c.formularios_conferidos === 0
        ? 'Nenhum formulário foi conferido com a Meta ainda. Use “Buscar formulários na Meta”.'
        : `Conferido em ${c.formularios_conferidos} de ${c.formularios} formulários, ${desde(c.conferido_em, agora)}. ` +
          'O número da Meta é o total da vida inteira do formulário; o daqui começa quando a integração entrou no ar — a diferença num formulário antigo é história, não perda.',
    },
    {
      chave: 'fora_desta_tela',
      rotulo: 'Fora desta tela',
      valor: c.campanhas_sem_formulario,
      // O contador existe para a tela dizer o que ela NÃO sabe. Medido na
      // Lotus em 23/09: das quatro campanhas ativas, três entregam por
      // conversa de WhatsApp — R$ 1.902 de R$ 4.148, 46% do gasto. Uma
      // conferência que só olhasse formulário diria "está tudo certo" e
      // estaria cega para a metade mais cara.
      legenda: c.campanhas_sem_formulario > 0
        ? `${c.campanhas_sem_formulario} campanha(s) dos últimos 30 dias entregam por conversa de WhatsApp, não por formulário. Elas não passam por aqui, e esta conferência não fala sobre elas.`
        : 'Todas as campanhas dos últimos 30 dias entregam por formulário — esta tela cobre o que está sendo pago.',
      alerta: c.campanhas_sem_formulario > 0,
    },
  ];
}

/** O aviso que o plano manda mostrar junto do interruptor de captação. */
export const AVISO_DA_CAPTACAO =
  'Ligar a captação vale a partir de agora. Leads antigos só entram por "Baixar leads".';

export function destinoDoFormulario(f: FormularioDaMeta): string {
  return f.destino === 'lancamento' && f.empreendimento_codigo
    ? `Roleta de ${f.empreendimento_codigo}`
    : 'Roleta geral (pega-tudo)';
}

/**
 * Vale a pena baixar o histórico deste formulário?
 *
 * Diz por quê, para o botão não ser um convite a gastar consulta à Meta sem
 * motivo. Nunca baixado é sempre "vale"; depois disso, só quando há lead sem
 * campanha para completar.
 */
export function motivoParaBaixar(f: FormularioDaMeta): string | null {
  if (!f.baixado_ate) return 'nunca baixado — traz o que a Meta guarda dos últimos 90 dias';
  if (f.sem_campanha > 0) {
    return `${f.sem_campanha} lead${f.sem_campanha > 1 ? 's' : ''} sem campanha — baixar completa`;
  }
  return null;
}
