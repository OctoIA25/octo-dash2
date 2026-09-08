/**
 * ⏰ Jobs agendados do recrutamento (spec do Dash, §9).
 *
 *   5 min      SLA de primeiro contato  → notifica a Lia (ou o Erick, se a Lia estiver fora)
 *   Diário 18h Confirmação de reunião   → dispara o script 4
 *   Diário 09h Prazo de matrícula       → vence hoje: lembrete · venceu: encerra
 *   Diário 09h Resgate por silêncio     → 72h sem resposta: uma tentativa · depois encerra
 *   Diário     Marcos de ativação       → alerta ao Coordenador
 *
 * CANAL DE SAÍDA: enquanto a Lia recrutadora não existe, tudo que a spec manda
 * enviar ao CANDIDATO vira notificação in-app para quem toca o processo, com o
 * candidato identificado — o Erick manda a mensagem pela fila, onde o WhatsApp
 * está a um clique. Os jobs 1 e 5 já são internos na própria spec ("notifica a
 * Lia ou o Erick", "alerta ao Coordenador"). Quando existir canal, só o
 * `notificar()` abaixo muda de destino.
 *
 * Roda para TODOS os tenants (service_role). Reentrante: cada aviso carrega uma
 * chave em metadata e não é repetido.
 */
import { recordHeartbeat } from '../observability/heartbeat.js';

const MOTIVO_PRAZO = 'nao_pagou_matricula';
const MOTIVO_SUMIU = 'sumiu';
const ESTAGIOS_ABERTOS = ['lead', 'interacao', 'qualificado', 'reuniao_realizada', 'matricula'];
const LOTE = 200;

const isoDoDia = (now) => new Date(now).toISOString().slice(0, 10);
const horasAtras = (now, h) => new Date(now() - h * 3_600_000).toISOString();

/** Admin/owner do tenant — quem toca recrutamento hoje. */
async function destinatarios(supabase, tenantId) {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'owner']);
  if (error) throw error;
  return (data || []).map((m) => m.user_id).filter(Boolean);
}

/**
 * Notificação in-app, uma vez só por chave. A chave é o que impede o job de
 * 5 minutos de avisar a mesma coisa 288 vezes por dia.
 */
async function notificar(supabase, { tenantId, chave, titulo, corpo, candidatoId, extras = {} }) {
  const { data: jaExiste, error: erroBusca } = await supabase
    .from('notifications')
    .select('id')
    .eq('tenant_id', tenantId)
    .contains('metadata', { chave })
    .limit(1);
  if (erroBusca) throw erroBusca;
  if (jaExiste && jaExiste.length > 0) return false;

  const destinos = await destinatarios(supabase, tenantId);
  if (destinos.length === 0) return false;

  const { error } = await supabase.from('notifications').insert(
    destinos.map((userId) => ({
      tenant_id: tenantId,
      user_id: userId,
      title: titulo,
      body: corpo,
      type: 'warning',
      link_type: 'recrutamento',
      link_id: candidatoId,
      metadata: { chave, job: chave.split(':')[0], ...extras },
    })),
  );
  if (error) throw error;
  return true;
}

/** 1 · SLA de primeiro contato: candidatura sem contato há mais de 1 hora. */
export async function slaPrimeiroContato(supabase, { now = Date.now } = {}) {
  const { data, error } = await supabase
    .from('recrut_candidato')
    .select('id, tenant_id, nome, ts_candidatura')
    .eq('estagio', 'lead')
    .is('ts_primeiro_contato', null)
    .lt('ts_candidatura', horasAtras(now, 1))
    .limit(LOTE);
  if (error) throw error;

  let avisados = 0;
  for (const c of data || []) {
    const enviou = await notificar(supabase, {
      tenantId: c.tenant_id,
      chave: `sla_primeiro_contato:${c.id}`,
      titulo: 'Candidatura sem primeiro contato',
      corpo: `${c.nome} se candidatou há mais de 1 hora e ninguém respondeu.`,
      candidatoId: c.id,
    });
    if (enviou) avisados += 1;
  }
  return { avisados };
}

/** 2 · Confirmação de reunião: as de amanhã que ninguém confirmou. */
export async function confirmacaoReuniao(supabase, { now = Date.now } = {}) {
  const amanha = isoDoDia(now() + 86_400_000);
  const { data, error } = await supabase
    .from('vw_recrut_fila_acao')
    .select('id, tenant_id, nome, desde, motivo')
    .eq('motivo', 'confirmar_reuniao')
    .limit(LOTE);
  if (error) throw error;

  let avisados = 0;
  for (const c of data || []) {
    const hora = new Date(c.desde).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
    const enviou = await notificar(supabase, {
      tenantId: c.tenant_id,
      chave: `confirmar_reuniao:${c.id}:${amanha}`,
      titulo: 'Reunião amanhã sem confirmação',
      corpo: `Confirme com ${c.nome} a reunião de amanhã às ${hora} (script 4).`,
      candidatoId: c.id,
      extras: { data_reuniao: amanha },
    });
    if (enviou) avisados += 1;
  }
  return { avisados };
}

/**
 * 3 · Prazo de matrícula: vence hoje → lembrete; venceu → encerra.
 * O encerramento é o que transforma o gate de iniciativa em teste de verdade:
 * sem ele, o caso não é aprovado nem reprovado e fica pendurado.
 */
export async function prazoMatricula(supabase, { now = Date.now } = {}) {
  const hoje = isoDoDia(now());

  const { data: vencendo, error: erroHoje } = await supabase
    .from('recrut_candidato')
    .select('id, tenant_id, nome')
    .eq('prazo_matricula', hoje)
    .is('ts_matricula', null)
    .in('estagio', ESTAGIOS_ABERTOS)
    .limit(LOTE);
  if (erroHoje) throw erroHoje;

  let lembretes = 0;
  for (const c of vencendo || []) {
    const enviou = await notificar(supabase, {
      tenantId: c.tenant_id,
      chave: `prazo_matricula_hoje:${c.id}`,
      titulo: 'Prazo da matrícula vence hoje',
      corpo: `Último dia de ${c.nome} para se matricular. Um lembrete, e só.`,
      candidatoId: c.id,
    });
    if (enviou) lembretes += 1;
  }

  const { data: vencidos, error } = await supabase
    .from('recrut_candidato')
    .select('id, nome, tenant_id')
    .lt('prazo_matricula', hoje)
    .is('ts_matricula', null)
    .in('estagio', ESTAGIOS_ABERTOS)
    .limit(LOTE);
  if (error) throw error;

  let encerrados = 0;
  let falhas = 0;
  for (const c of vencidos || []) {
    try {
      await encerrar(supabase, c.id, MOTIVO_PRAZO, 'job_prazo_matricula');
      encerrados += 1;
    } catch (err) {
      falhas += 1;
      console.error(`[recrutamento] encerrar ${c.id}: ${err?.message}`);
    }
  }
  return { lembretes, encerrados, falhas };
}

/**
 * 4 · Resgate por silêncio: 72h sem resposta depois de interesse declarado.
 * Uma tentativa; se já houve resgate, encerra com 'sumiu'.
 */
export async function resgatePorSilencio(supabase, { now = Date.now } = {}) {
  const { data, error } = await supabase
    .from('recrut_candidato')
    .select('id, tenant_id, nome, updated_at')
    .in('estagio', ['interacao', 'qualificado'])
    .not('ts_primeira_resposta', 'is', null)
    .lt('updated_at', horasAtras(now, 72))
    .limit(LOTE);
  if (error) throw error;

  let tentativas = 0;
  let encerrados = 0;
  for (const c of data || []) {
    const { data: jaResgatou, error: erroBusca } = await supabase
      .from('notifications')
      .select('id')
      .eq('tenant_id', c.tenant_id)
      .contains('metadata', { chave: `resgate_silencio:${c.id}` })
      .limit(1);
    if (erroBusca) throw erroBusca;

    if (jaResgatou && jaResgatou.length > 0) {
      // Segunda passagem: já teve a tentativa, agora fecha o card.
      try {
        await encerrar(supabase, c.id, MOTIVO_SUMIU, 'job_resgate_silencio');
        encerrados += 1;
      } catch (err) {
        console.error(`[recrutamento] encerrar por silêncio ${c.id}: ${err?.message}`);
      }
      continue;
    }

    const enviou = await notificar(supabase, {
      tenantId: c.tenant_id,
      chave: `resgate_silencio:${c.id}`,
      titulo: 'Candidato em silêncio há 3 dias',
      corpo: `${c.nome} demonstrou interesse e parou de responder. Uma tentativa (script 9) antes de encerrar.`,
      candidatoId: c.id,
    });
    if (enviou) tentativas += 1;
  }
  return { tentativas, encerrados };
}

/** 5 · Marcos de ativação vencidos → alerta ao Coordenador. */
export async function marcosAtrasados(supabase, { now = Date.now } = {}) {
  const hoje = isoDoDia(now());
  const { data, error } = await supabase
    .from('recrut_ativacao_marco')
    .select('id, marco, prazo, candidato_id, recrut_candidato (id, nome, tenant_id)')
    .is('concluido_em', null)
    .lt('prazo', hoje)
    .limit(LOTE);
  if (error) throw error;

  let avisados = 0;
  for (const m of data || []) {
    const candidato = m.recrut_candidato;
    if (!candidato) continue;
    const enviou = await notificar(supabase, {
      tenantId: candidato.tenant_id,
      chave: `marco_atrasado:${m.id}`,
      titulo: 'Marco de ativação atrasado',
      corpo: `${candidato.nome}: "${String(m.marco).replace(/_/g, ' ')}" venceu em ${m.prazo}.`,
      candidatoId: candidato.id,
      extras: { marco: m.marco },
    });
    if (enviou) avisados += 1;
  }
  return { avisados };
}

/** Motivo ANTES do evento: a constraint recusa a ordem inversa. */
async function encerrar(supabase, candidatoId, motivo, origem) {
  const { error: upErr } = await supabase
    .from('recrut_candidato')
    .update({ motivo_perda: motivo })
    .eq('id', candidatoId);
  if (upErr) throw upErr;

  const { error: evErr } = await supabase.from('recrut_evento').insert({
    candidato_id: candidatoId,
    tipo: 'encerrado',
    autor: 'sistema',
    payload: { motivo_perda: motivo, origem },
  });
  if (evErr) throw evErr;
}

/** Os três de manhã, numa passada só. */
export async function jobsDiarios(supabase, opts = {}) {
  const [prazo, resgate, marcos] = await Promise.all([
    prazoMatricula(supabase, opts),
    resgatePorSilencio(supabase, opts),
    marcosAtrasados(supabase, opts),
  ]);
  return { prazo, resgate, marcos };
}

/**
 * Cron. Flag-gated pelo chamador (RECRUTAMENTO_SCHEDULER=1) para rodar em UM
 * processo — mesmo padrão de eNPS/Kenlo/C2S/Santa Ângela.
 */
export async function startRecrutamentoScheduler(supabase, options = {}) {
  const env = options.processEnv || process.env;
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[recrutamento] node-cron não instalado — agendamento desabilitado.'); return null; }
  }

  const rodar = (nome, fn) => () => {
    const inicio = Date.now();
    Promise.resolve(fn())
      .then((r) => {
        console.log(`[recrutamento] {"event":"recrut.${nome}","resultado":${JSON.stringify(r)}}`);
        return recordHeartbeat(supabase, `recrutamento_${nome}`, { result: r, ok: true, durationMs: Date.now() - inicio });
      })
      .catch((e) => console.error(`[recrutamento] job ${nome} falhou: ${e?.message}`));
  };

  // Fuso EXPLÍCITO: os horários da spec ("diário 18h", "diário 09h") são de
  // quem trabalha em Jundiaí, não do servidor. Sem isto, num host em UTC o
  // aviso da véspera chega às 15h e o da manhã às 6h.
  const tz = { timezone: env.RECRUTAMENTO_TZ || 'America/Sao_Paulo' };

  return [
    cron.schedule(env.RECRUTAMENTO_CRON_SLA || '*/5 * * * *',
      rodar('sla_primeiro_contato', () => slaPrimeiroContato(supabase, options)), tz),
    cron.schedule(env.RECRUTAMENTO_CRON_MANHA || '0 9 * * *',
      rodar('diarios', () => jobsDiarios(supabase, options)), tz),
    cron.schedule(env.RECRUTAMENTO_CRON_CONFIRMACAO || '0 18 * * *',
      rodar('confirmacao_reuniao', () => confirmacaoReuniao(supabase, options)), tz),
  ];
}
