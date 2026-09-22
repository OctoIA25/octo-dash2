/**
 * As rotas pelas quais a LIA estrutura uma ata de reunião (P4.8).
 *
 * Mesma divisão do P4.7 e da base de conhecimento: a Dash guarda a transcrição
 * e faz a revisão; quem lê é a LIA, que roda em servidor próprio. Esta Dash não
 * chama modelo nenhum, medido em 22/09/2026.
 *
 * A REGRA DO PLANO VIVE AQUI: "revisão humana antes de criar as tarefas".
 * Estas rotas escrevem o conteúdo da ata e a deixam em "lida" — nunca criam
 * tarefa na agenda de ninguém. Quem cria é uma pessoa, e a função de criar
 * recusa chamada sem `auth.uid()`.
 *
 * Registrar nos DOIS entrypoints antes do catch-all 404.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TAREFAS = 100;
const MAX_LISTA = 50;
const MAX_TEXTO = 4000;
const MAX_LINHA = 500;
/** A transcrição inteira volta para a LIA ler; o teto protege a resposta. */
const MAX_TRANSCRICAO = 400_000;

const erro = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });

const linha = (v) => String(v ?? '').trim().slice(0, MAX_LINHA);

/** Lista de texto vinda do corpo: sempre array, sempre com teto, sem vazios. */
const listaDeTexto = (v) =>
  (Array.isArray(v) ? v : []).map(linha).filter(Boolean).slice(0, MAX_LISTA);

export function registerAtasRoutes(app, supabase, validateApiKey) {
  /** A fila: atas esperando alguém ler. */
  app.get('/api/v1/atas/pendentes', validateApiKey, async (req, res) => {
    try {
      const limite = Math.min(Number(req.query.limite) || 10, 50);
      const { data, error } = await supabase
        .from('atas')
        .select('id, titulo, data_reuniao, criado_em')
        .eq('tenant_id', req.tenantId)
        .eq('status', 'enviada')
        .order('criado_em', { ascending: true })
        .limit(limite);
      if (error) throw error;
      return res.json({ success: true, data: { atas: data ?? [] } });
    } catch (err) {
      console.error('[atas] erro listando pendentes:', err?.message);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });

  /**
   * A transcrição de uma ata, para a LIA ler.
   *
   * Só o texto — nem os vínculos nem quem criou. A LIA precisa do que foi dito,
   * e mais nada.
   */
  app.get('/api/v1/atas/:id/transcricao', validateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return erro(res, 400, 'INVALID_ID', 'id inválido');

      const { data, error } = await supabase
        .from('atas')
        .select('id, titulo, data_reuniao, transcricao, status')
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return erro(res, 404, 'NOT_FOUND', 'ata não encontrada');

      return res.json({
        success: true,
        data: {
          id: data.id,
          titulo: data.titulo,
          data_reuniao: data.data_reuniao,
          transcricao: String(data.transcricao ?? '').slice(0, MAX_TRANSCRICAO),
          // O formato que a resposta deve ter. Dizê-lo aqui evita que cada
          // integração invente o seu — é o mesmo papel do esquema no P4.7.
          formato_esperado: {
            titulo: 'string',
            data: 'YYYY-MM-DD',
            participantes: ['string'],
            resumo: 'string',
            decisoes: ['string'],
            riscos: ['string'],
            tarefas: [{ descricao: 'string', responsavel: 'string', prazo: 'YYYY-MM-DD' }],
            mapa: [{ nivel: 'number', texto: 'string' }],
          },
        },
      });
    } catch (err) {
      console.error('[atas] erro lendo transcrição:', err?.message);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });

  /**
   * O conteúdo estruturado chega.
   *
   * O `responsavel` de cada tarefa entra como TEXTO, do jeito que foi dito na
   * reunião ("a Ana", "o jurídico"). A LIA não aponta pessoa: apontar é da
   * revisão humana, porque um nome solto não é ninguém e a tarefa nasceria no
   * colo de quem o sistema adivinhasse.
   */
  app.post('/api/v1/atas/:id/conteudo', validateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return erro(res, 400, 'INVALID_ID', 'id inválido');

      const corpo = req.body ?? {};
      if (typeof corpo !== 'object' || Array.isArray(corpo)) {
        return erro(res, 400, 'CORPO_INVALIDO', 'mande um objeto com resumo, decisoes, tarefas…');
      }

      const { data: ata, error: erroAta } = await supabase
        .from('atas')
        .select('id, tenant_id, status')
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .maybeSingle();
      if (erroAta) throw erroAta;
      if (!ata) return erro(res, 404, 'NOT_FOUND', 'ata não encontrada');

      const tarefas = (Array.isArray(corpo.tarefas) ? corpo.tarefas : [])
        .slice(0, MAX_TAREFAS)
        .map((t) => ({
          descricao: linha(t?.descricao),
          responsavel: linha(t?.responsavel),
          prazo: linha(t?.prazo),
        }))
        .filter((t) => t.descricao);

      const mapa = (Array.isArray(corpo.mapa) ? corpo.mapa : [])
        .slice(0, 200)
        .map((m) => ({
          // Fora de 1–6 vira 1: um nível inventado quebraria a indentação da
          // tela sem que ninguém entendesse por quê.
          nivel: Number.isInteger(m?.nivel) && m.nivel >= 1 && m.nivel <= 6 ? m.nivel : 1,
          texto: linha(m?.texto),
        }))
        .filter((m) => m.texto);

      const conteudo = {
        titulo: linha(corpo.titulo),
        data: linha(corpo.data),
        participantes: listaDeTexto(corpo.participantes),
        resumo: String(corpo.resumo ?? '').trim().slice(0, MAX_TEXTO),
        decisoes: listaDeTexto(corpo.decisoes),
        riscos: listaDeTexto(corpo.riscos),
        tarefas,
        mapa,
      };

      const { data, error } = await supabase.rpc('ata_conteudo_recebido', {
        p_ata_id: ata.id, p_conteudo: conteudo,
      });
      if (error) throw error;

      return res.json({
        success: true,
        data: {
          ata_id: ata.id,
          ...(data ?? {}),
          // Quem integra não pode concluir que acabou: as tarefas ainda não
          // existem, e não vão existir sem uma pessoa apontar os responsáveis.
          aviso: 'A ata foi estruturada. As tarefas só vão para a agenda depois que uma pessoa revisar e apontar cada responsável.',
        },
      });
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.includes('já foram criadas')) {
        return erro(res, 409, 'JA_REVISADA', 'as tarefas desta ata já foram criadas');
      }
      console.error('[atas] erro gravando conteúdo:', msg);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });

  /** A LIA avisa que não conseguiu estruturar. */
  app.post('/api/v1/atas/:id/erro', validateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return erro(res, 400, 'INVALID_ID', 'id inválido');
      const motivo = linha(req.body?.motivo);
      if (!motivo) return erro(res, 400, 'MOTIVO_OBRIGATORIO', 'mande { motivo }');

      const { data: ata, error: erroAta } = await supabase
        .from('atas').select('id').eq('id', id).eq('tenant_id', req.tenantId).maybeSingle();
      if (erroAta) throw erroAta;
      if (!ata) return erro(res, 404, 'NOT_FOUND', 'ata não encontrada');

      const { error } = await supabase.rpc('ata_leitura_falhou', {
        p_ata_id: ata.id, p_motivo: motivo,
      });
      if (error) throw error;

      console.warn('[atas] leitura falhou em %s: %s', ata.id, motivo);
      return res.json({
        success: true,
        data: { ata_id: ata.id, aviso: 'Registrado. A ata continua aberta para ser escrita à mão.' },
      });
    } catch (err) {
      console.error('[atas] erro registrando falha:', err?.message);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });
}
