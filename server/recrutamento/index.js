/**
 * 🎯 Recrutamento — rotas /api/v1/recrutamento/*.
 *
 * Spec do Erick (artifact "Funil de Recrutamento Lotus", seção 8 · API). As
 * rotas lá estão escritas como /recrutamento/*; aqui ganham o prefixo /api/v1
 * do resto do repo. Contrato e nomes são os dela.
 *
 *   POST  /candidatos              — cria. Idempotente por telefone.
 *   POST  /candidatos/:id/eventos  — ÚNICO caminho para mudar estágio.
 *   PATCH /candidatos/:id/condicoes— as três condições + dias_semana.
 *   POST  /candidatos/:id/encerrar — exige motivo_perda (422 sem ele).
 *   GET   /funil?de=&ate=&canal=   — funil cumulativo.
 *   GET   /fila-acao               — a tela que o Erick abre de manhã.
 *   GET   /candidatos/:id          — ficha: candidato + timeline + marcos.
 *
 * SEGURANÇA: service_role bypassa RLS — o isolamento por tenant é deste código.
 * O tenant SEMPRE sai do JWT (resolveTenant), nunca de body/param, e todo
 * SELECT/UPDATE leva `.eq('tenant_id', ...)`. Candidato é dado pessoal de quem
 * não trabalha aqui: o gate é admin/owner, o mesmo da RLS da tabela.
 */
import { makeRequireSupabaseAuth, resolveTenant } from '../kpis/index.js';
import { normalizePhone } from '../utils/phone.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

const CANAIS = new Set(['indicacao', 'anuncio_meta', 'portal_vagas', 'panfletagem', 'linkedin', 'instagram', 'site', 'outro']);
const AUTORES = new Set(['lia', 'erick', 'coordenador', 'sistema']);
const CONDICOES = new Set(['pendente', 'aprovado', 'reprovado', 'decisao_erick']);
const MOTIVOS = new Set(['fora_de_regiao', 'sem_tempo', 'sem_verba', 'nao_pagou_matricula', 'sumiu', 'escolheu_concorrente', 'reprovado_por_nos']);
const EVENTOS = new Set([
  'candidatura_recebida', 'primeiro_contato', 'resposta_candidato',
  'condicoes_respondidas', 'reuniao_agendada', 'reuniao_confirmada',
  'reuniao_realizada', 'no_show', 'decisao', 'link_matricula_enviado',
  'matricula_confirmada', 'prazo_matricula_vencido', 'marco_ativacao', 'encerrado',
]);
const CAMPOS_COND = ['cond_regiao', 'cond_tempo', 'cond_verba'];
const FILA_LIMIT = 500; // PostgREST corta em 1000 sem avisar; teto explícito + flag.

const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
// 22P02 = uuid malformado no :id. Para o cliente isso é "não existe", não erro.
const isNotFound = (error) => !error || error.code === '22P02';

/**
 * E.164 sem "+", como a tabela documenta: 5511999999999.
 * Usa o normalizePhone do repo (tira DDI duplicado, insere o 9º dígito, prefixa
 * 55) — é o mesmo canônico do módulo WhatsApp. Sem isso "(11) 99999-8888" da UI
 * e "5511999998888" da Lia viram DOIS candidatos, e a idempotência por telefone
 * que a spec pede não vale nada.
 */
function normalizaTelefone(raw) {
  const phone = normalizePhone(raw, { withCountryCode: true });
  return phone.length >= 12 && phone.length <= 15 ? phone : null;
}

async function isAdminOrOwner(supabase, req, tenantId) {
  if (isPlatformOwner(req.userEmail)) return true;
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', req.userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === 'admin' || data?.role === 'owner';
}

export function registerRecrutamentoRoutes(app, supabase) {
  const requireAuth = makeRequireSupabaseAuth(supabase);

  /** Resolve tenant + gate de papel. Responde e devolve null quando barra. */
  async function gate(req, res) {
    const resolved = await resolveTenant(supabase, req);
    if (resolved.error) {
      res.status(resolved.status).json({ ok: false, error: resolved.error });
      return null;
    }
    if (!(await isAdminOrOwner(supabase, req, resolved.tenantId))) {
      res.status(403).json({ ok: false, error: 'forbidden' });
      return null;
    }
    return resolved.tenantId;
  }

  /** Candidato do tenant, ou null. Toda rota com :id passa por aqui. */
  async function buscaCandidato(tenantId, id, colunas = '*') {
    const { data, error } = await supabase
      .from('recrut_candidato')
      .select(colunas)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error && !isNotFound(error)) throw error;
    return data || null;
  }

  async function gravaEvento(candidatoId, tipo, autor = 'sistema', payload = {}) {
    const { error } = await supabase
      .from('recrut_evento')
      .insert({ candidato_id: candidatoId, tipo, autor, payload });
    if (error) throw error;
  }

  /**
   * As constraints da tabela recusam 'perdido' sem motivo e 'onboard' sem
   * coordenador (regra D062). Isso chega aqui como 23514 e é erro do chamador,
   * não falha do servidor — 409 com o que faltou, nunca 500.
   */
  function respondeErroDeEvento(res, err, tag) {
    if (err?.code === '23514') {
      return res.status(409).json({ ok: false, error: 'estado_invalido', detalhe: err.message });
    }
    console.error(`[recrutamento] ${tag}:`, err.message);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }

  app.post('/api/v1/recrutamento/candidatos', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      const nome = String(req.body?.nome || '').trim();
      const telefone = normalizaTelefone(req.body?.telefone);
      if (!nome) return res.status(400).json({ ok: false, error: 'nome_obrigatorio' });
      if (!telefone) return res.status(400).json({ ok: false, error: 'telefone_invalido' });

      const canal = req.body?.canal ?? 'outro';
      if (!CANAIS.has(canal)) return res.status(400).json({ ok: false, error: 'canal_invalido' });

      const autor = AUTORES.has(req.body?.autor) ? req.body.autor : 'sistema';
      const novo = {
        tenant_id: tenantId,
        nome,
        telefone,
        canal,
        email: req.body?.email || null,
        indicado_por: req.body?.indicado_por || null,
        cidade: req.body?.cidade || null,
        bairro: req.body?.bairro || null,
      };

      // Idempotente por telefone (spec). A corrida entre dois webhooks da Lia
      // cai no unique (tenant_id, telefone) e vira o mesmo caminho do "já existe".
      let candidato = await (async () => {
        const { data } = await supabase
          .from('recrut_candidato').select('*')
          .eq('tenant_id', tenantId).eq('telefone', telefone).maybeSingle();
        return data || null;
      })();
      let criado = false;

      if (!candidato) {
        const { data, error } = await supabase.from('recrut_candidato').insert(novo).select().maybeSingle();
        if (error?.code === '23505') {
          candidato = await (async () => {
            const { data: d } = await supabase
              .from('recrut_candidato').select('*')
              .eq('tenant_id', tenantId).eq('telefone', telefone).maybeSingle();
            return d || null;
          })();
        } else if (error) {
          throw error;
        } else {
          candidato = data;
          criado = true;
        }
      }
      if (!candidato) throw new Error('candidato_nao_persistido');

      await gravaEvento(candidato.id, 'candidatura_recebida', autor, req.body?.payload || {});
      res.status(criado ? 201 : 200).json({ ok: true, criado, candidato });
    } catch (err) {
      console.error('[recrutamento] criar candidato:', err.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/v1/recrutamento/candidatos/:id/eventos', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      const tipo = req.body?.tipo;
      if (!EVENTOS.has(tipo)) return res.status(400).json({ ok: false, error: 'tipo_invalido' });
      const autor = AUTORES.has(req.body?.autor) ? req.body.autor : 'sistema';

      const candidato = await buscaCandidato(tenantId, req.params.id, 'id');
      if (!candidato) return res.status(404).json({ ok: false, error: 'not_found' });

      await gravaEvento(candidato.id, tipo, autor, req.body?.payload || {});
      res.status(201).json({ ok: true });
    } catch (err) {
      respondeErroDeEvento(res, err, 'gravar evento');
    }
  });

  app.patch('/api/v1/recrutamento/candidatos/:id/condicoes', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      const patch = {};
      for (const campo of CAMPOS_COND) {
        const valor = req.body?.[campo];
        if (valor === undefined) continue;
        if (!CONDICOES.has(valor)) return res.status(400).json({ ok: false, error: `${campo}_invalido` });
        patch[campo] = valor;
      }
      if (req.body?.dias_semana !== undefined) {
        const dias = Number(req.body.dias_semana);
        if (!Number.isInteger(dias) || dias < 0 || dias > 7) {
          return res.status(400).json({ ok: false, error: 'dias_semana_invalido' });
        }
        patch.dias_semana = dias;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: 'nada_para_atualizar' });
      }

      const { data, error } = await supabase
        .from('recrut_candidato')
        .update(patch)
        .eq('id', req.params.id)
        .eq('tenant_id', tenantId)
        .select('id, cond_regiao, cond_tempo, cond_verba, dias_semana, ts_qualificado')
        .maybeSingle();
      if (error && !isNotFound(error)) throw error;
      if (!data) return res.status(404).json({ ok: false, error: 'not_found' });

      // As três aprovadas disparam o evento que qualifica — uma vez só, senão
      // cada PATCH repetido empilharia evento na timeline.
      const todasAprovadas = CAMPOS_COND.every((c) => data[c] === 'aprovado');
      if (todasAprovadas && !data.ts_qualificado) {
        await gravaEvento(data.id, 'condicoes_respondidas', AUTORES.has(req.body?.autor) ? req.body.autor : 'sistema');
      }
      res.json({ ok: true, qualificado: todasAprovadas });
    } catch (err) {
      respondeErroDeEvento(res, err, 'atualizar condicoes');
    }
  });

  app.post('/api/v1/recrutamento/candidatos/:id/encerrar', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      const motivo = req.body?.motivo_perda;
      if (!MOTIVOS.has(motivo)) return res.status(422).json({ ok: false, error: 'motivo_perda_obrigatorio' });

      const { data, error } = await supabase
        .from('recrut_candidato')
        .update({ motivo_perda: motivo, observacoes: req.body?.observacoes ?? undefined })
        .eq('id', req.params.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle();
      if (error && !isNotFound(error)) throw error;
      if (!data) return res.status(404).json({ ok: false, error: 'not_found' });

      await gravaEvento(data.id, 'encerrado', AUTORES.has(req.body?.autor) ? req.body.autor : 'sistema', { motivo_perda: motivo });
      res.json({ ok: true });
    } catch (err) {
      respondeErroDeEvento(res, err, 'encerrar');
    }
  });

  app.get('/api/v1/recrutamento/funil', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      const { de, ate, canal } = req.query;
      if (de && !isDate(de)) return res.status(400).json({ ok: false, error: 'de_invalido' });
      if (ate && !isDate(ate)) return res.status(400).json({ ok: false, error: 'ate_invalido' });
      if (canal && !CANAIS.has(canal)) return res.status(400).json({ ok: false, error: 'canal_invalido' });

      const { data, error } = await supabase.rpc('recrut_funil', {
        p_tenant_id: tenantId,
        p_de: de || null,
        p_ate: ate || null,
        p_canal: canal || null,
      });
      if (error) throw error;
      const funil = Array.isArray(data) ? data[0] : data;
      res.json({ ok: true, funil: funil || null });
    } catch (err) {
      console.error('[recrutamento] funil:', err.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.get('/api/v1/recrutamento/fila-acao', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      const { data, error } = await supabase
        .from('vw_recrut_fila_acao')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('prioridade', { ascending: true })
        .order('desde', { ascending: true })
        .limit(FILA_LIMIT);
      if (error) throw error;
      const itens = data || [];
      res.json({ ok: true, itens, truncated: itens.length === FILA_LIMIT });
    } catch (err) {
      console.error('[recrutamento] fila-acao:', err.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.get('/api/v1/recrutamento/candidatos/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = await gate(req, res);
      if (!tenantId) return;

      // Candidato PRIMEIRO: só depois de confirmar que ele é deste tenant é que
      // se lê timeline e marcos. Buscar tudo em paralelo devolveria eventos de
      // candidato de outro tenant para quem chutasse o uuid.
      const candidato = await buscaCandidato(tenantId, req.params.id);
      if (!candidato) return res.status(404).json({ ok: false, error: 'not_found' });

      const [eventos, marcos] = await Promise.all([
        supabase.from('recrut_evento').select('*').eq('candidato_id', candidato.id).order('created_at', { ascending: true }),
        supabase.from('recrut_ativacao_marco').select('*').eq('candidato_id', candidato.id).order('prazo', { ascending: true }),
      ]);
      if (eventos.error) throw eventos.error;
      if (marcos.error) throw marcos.error;

      res.json({ ok: true, candidato, eventos: eventos.data || [], marcos: marcos.data || [] });
    } catch (err) {
      console.error('[recrutamento] ficha:', err.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
