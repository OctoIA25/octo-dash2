import { supabase } from '@/lib/supabaseClient';
import { differenceInDays } from 'date-fns';
import {
  ESTAGIOS,
  ESTAGIO_POR_LABEL,
  EVENTO_PARA_ESTAGIO,
  LABEL_ESTAGIO,
  LABEL_EVENTO,
  contarEtapas,
  type EstagioId,
} from '../domain/recruitmentStages';

/**
 * 🎯 Serviço do módulo de Recrutamento.
 *
 * Lê e escreve `recrut_candidato` / `recrut_evento` (modelo de eventos da spec).
 * A tabela antiga `recruitment_candidates` continua no banco como legado, mas
 * nada aqui a toca — os dados foram migrados em 20260906_backfill_recrutamento_legado.
 *
 * REGRA DO MODELO: `estagio` nunca é escrito daqui. Para mover o candidato,
 * grava-se um EVENTO e o trigger do banco recalcula o estágio por "máximo
 * alcançado". É isso que faz o funil parar de imprimir 0·0·0·1.
 *
 * ponytail: `status`, `data_inscricao` e `fonte` continuam saindo daqui como a
 * página sempre esperou, traduzidos de `estagio`, `ts_candidatura` e `canal`.
 * É ponte, não arquitetura: quando a página passar a falar em estágio direto,
 * some. Sem ela, a migração viraria um diff de 1400 linhas na tela.
 */

export interface Candidato {
  id: string;
  tenant_id: string;
  nome: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  experiencia?: string;
  linkedin?: string;
  curriculo?: string;
  observacoes?: string;
  estagio: EstagioId;
  status: string;              // label de `estagio`, para a página
  data_inscricao: string;      // ts_candidatura
  fonte: string;               // label de `canal`
  creci?: string;              // situação: ativo | em_curso | nao_tem
  creci_numero?: string;
  dias_semana?: number;
  cond_regiao?: string;
  cond_tempo?: string;
  cond_verba?: string;
  motivo_perda?: string;
  created_at: string;
  updated_at: string;
}

export interface Etapa {
  id: string;
  etapa: string;
  data: string;
  responsavel?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
}

export interface CandidatoComEtapas extends Candidato {
  etapas: Etapa[];
}

export interface RecruitmentMetrics {
  total_candidates: number;
  lead_count: number;
  interaction_count: number;
  meeting_count: number;
  onboard_count: number;
  approved_count: number;
  rejected_count: number;
  conversion_rate: number;
  avg_process_days: number;
  tempoMedioProcesso: number;
  taxaRetencao: number;
  custoPorContratacao: number;
}

export interface ItemFilaAcao {
  id: string;
  nome: string;
  telefone: string;
  motivo: string;
  desde: string;
  prioridade: number;
}

export interface MarcoAtivacao {
  id: number;
  marco: string;
  prazo: string;
  concluido_em: string | null;
}

export interface IndicadorCanal {
  canal: string;
  candidaturas: number;
  qualificados: number;
  onboard: number;
}

export interface IndicadoresProcesso {
  medianaPrimeiroContatoMin: number | null;
  pctRespondeuPrimeiroContato: number | null;
  pctPassouTresCondicoes: number | null;
  pctReunioesAconteceram: number | null;
  pctMatriculaNoPrazo: number | null;
  porCanal: IndicadorCanal[];
  motivosPerda: { motivo: string; total: number }[];
}

export interface SearchParams {
  tenantId: string;
  query?: string;
  status?: string;
  cargo?: string;
  experiencia?: string;
  limit?: number;
  offset?: number;
}

/** As fontes que o formulário oferece, no vocabulário do enum recrut_canal. */
const CANAL_POR_FONTE: Record<string, string> = {
  LinkedIn: 'linkedin',
  Indicação: 'indicacao',
  Meta: 'anuncio_meta',
  'Site Institucional': 'site',
  'Email Marketing': 'email_marketing',
  Outros: 'outro',
};
const FONTE_POR_CANAL: Record<string, string> = {
  linkedin: 'LinkedIn',
  indicacao: 'Indicação',
  anuncio_meta: 'Meta',
  site: 'Site Institucional',
  portal_vagas: 'Portal de vagas',
  panfletagem: 'Panfletagem',
  instagram: 'Instagram',
  email_marketing: 'Email Marketing',
  outro: 'Outros',
};

const CAMPOS = `id, tenant_id, nome, email, telefone, cargo, experiencia, linkedin, curriculo,
  observacoes, estagio, canal, creci, creci_numero, dias_semana, score_cultural, score_aderencia,
  coordenador_id, prazo_matricula, cond_regiao, cond_tempo, cond_verba, motivo_perda,
  ts_candidatura, created_at, updated_at`;

/**
 * Canônico de telefone: mesma regra de server/utils/phone.js e do módulo de
 * WhatsApp. O banco tem UNIQUE (tenant_id, telefone) — sem normalizar, o mesmo
 * candidato entra duas vezes com grafias diferentes.
 */
function telefoneCanonico(valor?: string | null): string {
  let d = String(valor ?? '').replace(/\D+/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return d.length === 11 ? `55${d}` : d;
}

function paraCandidato(row: any): Candidato {
  return {
    ...row,
    status: LABEL_ESTAGIO[row.estagio as EstagioId] ?? row.estagio,
    data_inscricao: row.ts_candidatura,
    fonte: FONTE_POR_CANAL[row.canal] ?? 'Outros',
  };
}

/** Evento vira "etapa" no formato que a timeline da página já sabe desenhar. */
function paraEtapa(evento: any): Etapa {
  return {
    id: String(evento.id),
    etapa: LABEL_EVENTO[evento.tipo] ?? evento.tipo,
    data: evento.created_at,
    responsavel: evento.payload?.responsavel ?? evento.autor,
    notas: evento.payload?.notas ?? undefined,
    created_at: evento.created_at,
    updated_at: evento.created_at,
  };
}

/** Campos da página -> colunas do modelo novo. */
function paraColunas(dados: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  const direto = ['nome', 'email', 'cargo', 'experiencia', 'linkedin', 'curriculo', 'observacoes',
    'dias_semana', 'score_cultural', 'score_aderencia', 'coordenador_id', 'motivo_perda', 'prazo_matricula',
    'cond_regiao', 'cond_tempo', 'cond_verba'];
  for (const campo of direto) if (dados[campo] !== undefined) out[campo] = dados[campo];

  if (dados.telefone !== undefined) out.telefone = telefoneCanonico(dados.telefone);
  if (dados.fonte !== undefined) out.canal = CANAL_POR_FONTE[dados.fonte] ?? 'outro';
  if (dados.creci !== undefined) {
    const numero = String(dados.creci ?? '').trim();
    out.creci_numero = numero || null;
    out.creci = numero ? 'ativo' : 'nao_tem';
  }
  return out;
}

export class RecruitmentService {
  private supabase;

  constructor() {
    this.supabase = supabase;
  }

  async getCandidatos(params: SearchParams): Promise<{ data: CandidatoComEtapas[]; count: number }> {
    const { tenantId, query = '', status, cargo, experiencia, limit = 50, offset = 0 } = params;

    let busca = this.supabase
      .from('recrut_candidato')
      .select(`${CAMPOS}, recrut_evento (id, tipo, autor, payload, created_at)`, { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (query) busca = busca.or(`nome.ilike.%${query}%,email.ilike.%${query}%,cargo.ilike.%${query}%`);
    if (status) busca = busca.eq('estagio', ESTAGIO_POR_LABEL[status] ?? status);
    if (cargo) busca = busca.eq('cargo', cargo);
    if (experiencia) busca = busca.eq('experiencia', experiencia);

    const { data, error, count } = await busca
      .order('ts_candidatura', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return {
      data: (data || []).map((row: any) => ({
        ...paraCandidato(row),
        etapas: (row.recrut_evento || []).map(paraEtapa),
      })),
      count: count || 0,
    };
  }

  async getCandidatoById(id: string, tenantId: string): Promise<CandidatoComEtapas | null> {
    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .select(`${CAMPOS}, recrut_evento (id, tipo, autor, payload, created_at)`)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return { ...paraCandidato(data), etapas: ((data as any).recrut_evento || []).map(paraEtapa) };
  }

  async createCandidato(candidato: Record<string, any>, tenantId: string): Promise<Candidato> {
    const colunas = paraColunas(candidato);
    if (!colunas.telefone || colunas.telefone.length < 12) {
      throw new Error('Telefone é obrigatório e precisa ter DDD — é a chave que identifica o candidato.');
    }

    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .insert({ ...colunas, tenant_id: tenantId })
      .select(CAMPOS)
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Já existe um candidato com esse telefone.');
      throw error;
    }

    await this.supabase.from('recrut_evento').insert({
      candidato_id: data.id,
      tipo: 'candidatura_recebida',
      autor: 'erick',
      payload: { origem: 'cadastro_manual' },
    });
    return paraCandidato(data);
  }

  async updateCandidato(id: string, updates: Record<string, any>, tenantId: string): Promise<Candidato> {
    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .update(paraColunas(updates))
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(CAMPOS)
      .single();
    if (error) throw error;
    return paraCandidato(data);
  }

  async deleteCandidato(id: string, tenantId: string): Promise<void> {
    const { error } = await this.supabase
      .from('recrut_candidato')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
  }

  /**
   * Move o candidato gravando um EVENTO — nunca escrevendo `estagio`.
   * O banco recusa ativar sem Coordenador (regra D062) e encerrar sem motivo;
   * essas recusas viram mensagem para o usuário, não erro genérico.
   */
  async changeCandidateStatus(
    candidateId: string,
    newStatus: string,
    responsavel?: string,
    notas?: string,
  ): Promise<Candidato> {
    const estagio = (ESTAGIO_POR_LABEL[newStatus] ?? newStatus) as EstagioId;
    const evento = EVENTO_PARA_ESTAGIO[estagio];
    if (!evento) {
      throw new Error('O funil só anda para frente: não há como devolver um candidato para Lead.');
    }

    // O banco recusa Onboard sem Coordenador e Perdido sem motivo. A tela ainda
    // não tem esses dois campos, então sem preencher aqui os dois botões
    // falhariam sempre. Os valores não são chute:
    //  - Coordenador provisório = quem está ativando (admin/owner logado), a
    //    mesma regra que o backfill do legado usou. Trocável na ficha.
    //  - 'reprovado_por_nos' é literalmente o que um encerramento manual é;
    //    os outros motivos do enum descrevem o candidato desistindo.
    await this.completarObrigatorios(candidateId, estagio);

    const { error } = await this.supabase.from('recrut_evento').insert({
      candidato_id: candidateId,
      tipo: evento.tipo,
      autor: 'erick',
      payload: { ...(evento.payload || {}), responsavel: responsavel || 'Sistema', notas: notas || undefined },
    });
    if (error) {
      if (error.code === '23514' && estagio === 'onboard') {
        throw new Error('Defina o Coordenador do candidato antes de ativá-lo (regra D062).');
      }
      if (error.code === '23514' && estagio === 'perdido') {
        throw new Error('Registre o motivo da perda antes de encerrar o candidato.');
      }
      throw error;
    }

    const { data, error: leituraErr } = await this.supabase
      .from('recrut_candidato').select(CAMPOS).eq('id', candidateId).single();
    if (leituraErr) throw leituraErr;
    return paraCandidato(data);
  }

  /** Preenche o que as constraints do banco exigem antes de mover o estágio. */
  private async completarObrigatorios(candidateId: string, estagio: EstagioId): Promise<void> {
    if (estagio !== 'onboard' && estagio !== 'perdido') return;

    const { data: atual } = await this.supabase
      .from('recrut_candidato')
      .select('coordenador_id, motivo_perda')
      .eq('id', candidateId)
      .maybeSingle();
    if (!atual) return;

    if (estagio === 'onboard' && !atual.coordenador_id) {
      const { data: sessao } = await this.supabase.auth.getUser();
      if (sessao?.user?.id) {
        await this.supabase.from('recrut_candidato')
          .update({ coordenador_id: sessao.user.id }).eq('id', candidateId);
      }
    }
    if (estagio === 'perdido' && !atual.motivo_perda) {
      await this.supabase.from('recrut_candidato')
        .update({ motivo_perda: 'reprovado_por_nos' }).eq('id', candidateId);
    }
  }

  /**
   * A fila de ação (spec §6): quem está esperando alguma coisa, por prioridade.
   * Lê a view direto — ela é security_invoker, então a RLS já recorta por tenant;
   * o .eq() é a segunda camada, não a única.
   */
  async getFilaAcao(tenantId: string): Promise<ItemFilaAcao[]> {
    const { data, error } = await this.supabase
      .from('vw_recrut_fila_acao')
      .select('id, nome, telefone, motivo, desde, prioridade')
      .eq('tenant_id', tenantId)
      .order('prioridade', { ascending: true })
      .order('desde', { ascending: true })
      .limit(500);
    if (error) throw error;
    return (data || []) as ItemFilaAcao[];
  }

  /**
   * As três condições de entrada. Quando as três ficam aprovadas, grava o evento
   * que qualifica — uma vez só, senão cada salvada empilha evento na timeline.
   */
  async updateCondicoes(
    id: string,
    tenantId: string,
    patch: Record<string, any>,
  ): Promise<Candidato> {
    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .update(paraColunas(patch))
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(`${CAMPOS}, ts_qualificado`)
      .single();
    if (error) throw error;

    const tresAprovadas = ['cond_regiao', 'cond_tempo', 'cond_verba']
      .every((c) => (data as any)[c] === 'aprovado');
    if (tresAprovadas && !(data as any).ts_qualificado) {
      await this.supabase.from('recrut_evento').insert({
        candidato_id: id,
        tipo: 'condicoes_respondidas',
        autor: 'erick',
      });
    }
    return paraCandidato(data);
  }

  /** Encerra com um motivo da taxonomia — a spec não deixa fechar card sem ele. */
  async encerrar(id: string, tenantId: string, motivo: string, notas?: string): Promise<Candidato> {
    const { error } = await this.supabase
      .from('recrut_candidato')
      .update({ motivo_perda: motivo })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    return this.changeCandidateStatus(id, LABEL_ESTAGIO.perdido, undefined, notas);
  }

  /** Os marcos da ativação de 30 dias, criados pelo banco na decisão aprovada. */
  async getMarcos(candidatoId: string): Promise<MarcoAtivacao[]> {
    const { data, error } = await this.supabase
      .from('recrut_ativacao_marco')
      .select('id, marco, prazo, concluido_em')
      .eq('candidato_id', candidatoId)
      .order('prazo', { ascending: true });
    if (error) throw error;
    return (data || []) as MarcoAtivacao[];
  }

  /** Marca (ou desmarca) um marco como concluído. */
  async concluirMarco(marcoId: number, concluido: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('recrut_ativacao_marco')
      .update({ concluido_em: concluido ? new Date().toISOString() : null })
      .eq('id', marcoId);
    if (error) throw error;
  }

  /**
   * Os indicadores do painel (spec §10). Uma query só; a conta é em memória
   * porque o volume é de dezenas por trimestre.
   *
   * Falta um dos sete: "dias do sim à 1ª venda". Ele exige ligar o candidato ao
   * corretor que ele virou, e esse vínculo não existe — quando o candidato é
   * ativado, o corretor é criado sem guardar de qual candidato veio. Uma coluna
   * `usuario_id` em recrut_candidato destrava, e aí o indicador sai.
   */
  async getIndicadores(tenantId: string): Promise<IndicadoresProcesso> {
    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .select(`canal, estagio, motivo_perda, prazo_matricula, cond_regiao, cond_tempo, cond_verba,
               ts_candidatura, ts_primeiro_contato, ts_primeira_resposta,
               ts_reuniao_agendada, ts_reuniao_realizada, ts_matricula, ts_onboard`)
      .eq('tenant_id', tenantId);
    if (error) throw error;

    const linhas = (data || []) as any[];
    const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : null);

    // Mediana, não média: um candidato esquecido por 40 dias não pode fazer o
    // indicador parecer pior do que a rotina realmente é (nem melhor).
    const esperas = linhas
      .filter((c) => c.ts_primeiro_contato && c.ts_candidatura)
      .map((c) => (new Date(c.ts_primeiro_contato).getTime() - new Date(c.ts_candidatura).getTime()) / 60_000)
      .sort((a, b) => a - b);
    const meio = Math.floor(esperas.length / 2);
    const mediana = esperas.length === 0
      ? null
      : Math.round(esperas.length % 2 ? esperas[meio] : (esperas[meio - 1] + esperas[meio]) / 2);

    const contatados = linhas.filter((c) => c.ts_primeiro_contato).length;
    const responderam = linhas.filter((c) => c.ts_primeira_resposta).length;
    const qualificados = linhas.filter((c) =>
      c.cond_regiao === 'aprovado' && c.cond_tempo === 'aprovado' && c.cond_verba === 'aprovado').length;
    const agendadas = linhas.filter((c) => c.ts_reuniao_agendada).length;
    const realizadas = linhas.filter((c) => c.ts_reuniao_realizada).length;
    const comPrazo = linhas.filter((c) => c.prazo_matricula).length;
    const noPrazo = linhas.filter((c) => c.prazo_matricula && c.ts_matricula
      && c.ts_matricula.slice(0, 10) <= c.prazo_matricula).length;

    const canais = new Map<string, IndicadorCanal>();
    for (const c of linhas) {
      const nome = FONTE_POR_CANAL[c.canal] ?? 'Outros';
      const atual = canais.get(nome) ?? { canal: nome, candidaturas: 0, qualificados: 0, onboard: 0 };
      atual.candidaturas += 1;
      if (c.cond_regiao === 'aprovado' && c.cond_tempo === 'aprovado' && c.cond_verba === 'aprovado') atual.qualificados += 1;
      if (c.ts_onboard) atual.onboard += 1;
      canais.set(nome, atual);
    }

    const motivos = new Map<string, number>();
    for (const c of linhas) {
      if (!c.motivo_perda) continue;
      motivos.set(c.motivo_perda, (motivos.get(c.motivo_perda) ?? 0) + 1);
    }

    return {
      medianaPrimeiroContatoMin: mediana,
      pctRespondeuPrimeiroContato: pct(responderam, contatados),
      pctPassouTresCondicoes: pct(qualificados, linhas.length),
      pctReunioesAconteceram: pct(realizadas, agendadas),
      pctMatriculaNoPrazo: pct(noPrazo, comPrazo),
      porCanal: [...canais.values()].sort((a, b) => b.candidaturas - a.candidaturas),
      motivosPerda: [...motivos.entries()]
        .map(([motivo, total]) => ({ motivo, total }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async getCandidateSources(tenantId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .select('canal')
      .eq('tenant_id', tenantId);
    if (error) throw error;

    const fontes: Record<string, number> = {};
    for (const row of data || []) {
      const fonte = FONTE_POR_CANAL[(row as any).canal] ?? 'Outros';
      fontes[fonte] = (fontes[fonte] || 0) + 1;
    }
    return fontes;
  }

  async getMonthlyMetrics(tenantId: string, year: number = new Date().getFullYear()): Promise<any[]> {
    const inicio = new Date(year, 0, 1).toISOString();
    const fim = new Date(year, 11, 31, 23, 59, 59).toISOString();

    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .select('ts_candidatura, ts_onboard')
      .eq('tenant_id', tenantId)
      .gte('ts_candidatura', inicio)
      .lte('ts_candidatura', fim)
      .order('ts_candidatura');
    if (error) throw error;

    const porMes: Record<string, { candidatos: number; contratados: number }> = {};
    for (const row of (data || []) as any[]) {
      const mes = new Date(row.ts_candidatura).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      porMes[mes] ||= { candidatos: 0, contratados: 0 };
      porMes[mes].candidatos++;
      if (row.ts_onboard) porMes[mes].contratados++;
    }

    return Object.entries(porMes).map(([mes, s]) => ({
      mes,
      candidatos: s.candidatos,
      contratados: s.contratados,
      taxa: s.candidatos > 0 ? ((s.contratados / s.candidatos) * 100).toFixed(1) : '0',
    }));
  }

  async getAdvancedMetrics(tenantId: string): Promise<RecruitmentMetrics> {
    const { data, error } = await this.supabase
      .from('recrut_candidato')
      .select('estagio, ts_candidatura, ts_onboard')
      .eq('tenant_id', tenantId);
    if (error) throw error;

    const candidatos = (data || []) as any[];
    if (candidatos.length === 0) {
      return {
        total_candidates: 0, lead_count: 0, interaction_count: 0, meeting_count: 0,
        onboard_count: 0, approved_count: 0, rejected_count: 0, conversion_rate: 0,
        avg_process_days: 0, tempoMedioProcesso: 0, taxaRetencao: 0, custoPorContratacao: 0,
      };
    }

    // Cumulativo, como o funil — senão a tela mostra dois números diferentes
    // para a mesma pergunta.
    const [lead, interacao, , reuniao, , onboard] = contarEtapas(candidatos);
    const perdidos = candidatos.filter((c) => c.estagio === 'perdido').length;
    const avancaram = candidatos.filter((c) => c.estagio !== 'lead' && c.estagio !== 'perdido').length;

    // Do "sim" à ativação: só quem chegou lá tem os dois carimbos.
    const tempos = candidatos
      .filter((c) => c.ts_onboard && c.ts_candidatura)
      .map((c) => differenceInDays(new Date(c.ts_onboard), new Date(c.ts_candidatura)));
    const tempoMedioProcesso = tempos.length
      ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
      : 0;

    return {
      total_candidates: candidatos.length,
      lead_count: lead,
      interaction_count: interacao,
      meeting_count: reuniao,
      onboard_count: onboard,
      approved_count: onboard,
      rejected_count: perdidos,
      conversion_rate: Math.round((onboard / candidatos.length) * 100),
      avg_process_days: tempoMedioProcesso,
      tempoMedioProcesso,
      taxaRetencao: avancaram > 0 ? Math.round((onboard / avancaram) * 100) : 0,
      custoPorContratacao: 1.2, // placeholder herdado do módulo antigo
    };
  }
}

export const ESTAGIOS_DISPONIVEIS = ESTAGIOS;
export const recruitmentService = new RecruitmentService();
