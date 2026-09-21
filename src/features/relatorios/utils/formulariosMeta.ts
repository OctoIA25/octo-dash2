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
