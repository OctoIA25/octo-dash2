/**
 * A fronteira tipada com a regra da distribuição.
 *
 * O simulador roda a MESMA função que a rota do servidor — importada direto de
 * `server/distribuicao/`, sem cópia em TypeScript. Uma regra só era o ponto do
 * módulo; duplicá-la aqui criaria a segunda verdade que ele existe para evitar,
 * e a tela passaria a mostrar um resultado que o servidor não confirma.
 *
 * Os dois módulos são ESM puro, sem um único import — por isso atravessam para
 * o navegador sem nada.
 *
 * Este arquivo NÃO implementa regra nenhuma: ele só descreve os tipos na
 * fronteira. Se a assinatura de lá mudar, o erro aparece em quem chama.
 */

// JS puro do servidor, sem tipos próprios: o projeto tem `noImplicitAny`
// desligado, então eles chegam como `any` e ganham forma nas assinaturas
// abaixo.
import {
  decidirDestino as decidirJs,
  montarFila as montarFilaJs,
  MOTIVOS as MOTIVOS_JS,
  TIPOS_COM_DONO_FIXO as TIPOS_FIXOS_JS,
} from '../../../server/distribuicao/regra.js';
import {
  janelaDaConfiguracao as janelaJs,
  prazoDeAtendimento as prazoJs,
  minutosDePrazo as minutosJs,
} from '../../../server/distribuicao/janela.js';

export interface ParticipanteDaRoleta {
  id: string;
  nome?: string;
  /** Pula a vez e a MANTÉM. */
  pausado?: boolean;
  /** Sai da fila. */
  semPermissao?: boolean;
  noLimite?: boolean;
  /** 'lancamentos' | 'prontos' | 'alugados'. Vazio = atende tudo. */
  atuacoes?: string[];
}

export interface LeadDoSimulador {
  codigoImovel?: string;
  tipoImovel?: string;
  liaPassou?: boolean;
}

export interface DecisaoDeDestino {
  destino: 'corretor' | 'lia' | 'ninguem';
  corretorId: string | null;
  motivo: string;
  tipo: 'terceiros' | 'lancamento' | 'indefinido';
  posicao?: number;
}

export interface PonteiroDaRoleta {
  posicao: number;
  corretorId: string | null;
}

export const decidirDestino: (args: {
  lead: LeadDoSimulador;
  captador?: { id: string } | null;
  participantes: ParticipanteDaRoleta[];
  ultimaPosicao?: number | PonteiroDaRoleta;
  /** `tenant_bolsao_config.destino_por_tipo` — quem recebe recrutamento e vendedores. */
  destinoPorTipo?: Record<string, string> | null;
}) => DecisaoDeDestino = decidirJs;

/**
 * Os tipos que têm dono fixo e não entram no rodízio (24/09). Exportado da
 * regra do servidor, e não escrito de novo aqui: uma segunda lista viraria
 * mentira no dia em que a primeira mudasse.
 */
export const TIPOS_COM_DONO_FIXO: string[] = TIPOS_FIXOS_JS;

export const MOTIVOS: Record<string, string> = MOTIVOS_JS;

/**
 * Monta a fila a partir das linhas do banco — a MESMA função que o servidor
 * usa. Sem isto o simulador mostraria uma ordem que a Lia não recebe.
 */
export const montarFila: (
  membros: Array<{ user_id: string; role: string; permissions?: unknown; name?: string; email?: string }>,
  curados?: string[],
  agora?: number,
) => ParticipanteDaRoleta[] = montarFilaJs;

/** Converte o `horario_funcionamento` CRU do banco. `{}` = janela padrão. */
export const janelaDaConfiguracao: (horario: unknown) => Array<{ inicio: number; fim: number } | null> = janelaJs;

export const prazoDeAtendimento: (
  chegada: Date,
  minutos: number,
  janela?: Array<{ inicio: number; fim: number } | null>,
) => Date | null = prazoJs;

export const minutosDePrazo: (config: { tempo_expiracao_exclusivo?: number | null } | null) => number = minutosJs;

/** O texto que a tela mostra para cada motivo. Desconhecido aparece como está. */
export const TEXTO_DO_MOTIVO: Record<string, string> = {
  captador_do_imovel: 'captador do imóvel',
  imovel_sem_captador: 'imóvel sem captador — roleta geral',
  captador_indisponivel: 'captador indisponível — roleta geral',
  atendido_pela_lia_primeiro: 'a Lia atende primeiro',
  // Nome antigo, de quando só lançamento esperava. Mantido para o extrato de
  // qualquer ambiente que já tenha gravado com ele.
  lancamento_atendido_pela_lia: 'lançamento: a Lia atende primeiro',
  roleta_em_ordem: 'roleta, em ordem',
  nenhum_corretor_disponivel: 'ninguém disponível na fila',
  // 24/09 — os dois tipos que não entram no rodízio.
  tipo_tem_dono_fixo: 'tipo com dono fixo — não entra na roleta',
  tipo_sem_dono_configurado: 'falta dizer quem recebe este tipo',
};
