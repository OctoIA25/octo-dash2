/**
 * As rotas pelas quais a LIA devolve a leitura de um documento (P4.7).
 *
 * A MESMA DIVISÃO QUE JÁ VALE PARA A BASE DE CONHECIMENTO (server/baseConhecimento):
 * a Dash guarda o arquivo e faz a conferência; quem lê o documento é a LIA, que
 * roda em servidor próprio. Medido em 22/09/2026: esta Dash não chama modelo
 * nenhum — os dois caminhos OpenAI do repositório são código morto, não há
 * visão nem OCR, e o `.env.example` nem tem chave. Ligar um aqui seria criar a
 * primeira chamada de modelo dentro da Dash para um fluxo que ainda não tem um
 * único documento enviado.
 *
 * A REGRA 1 DO PLANO VIVE AQUI: "a IA nunca grava direto". Esta rota escreve
 * em `valor_sugerido` e põe o documento em `lido` — nunca em `conferido`.
 * Quem confirma é uma pessoa, pela tela, e a função de confirmar recusa
 * chamada sem `auth.uid()`.
 *
 * Registrar nos DOIS entrypoints (api-server.js e proxy-production.js) antes
 * do catch-all 404, senão funciona em dev e dá 404 em produção.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CAMPOS = 60;
const MAX_VALOR = 500;
/** A âncora é a regra aprendida do layout; não precisa ser um romance. */
const MAX_ANCORA = 300;

const erro = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });

export function registerDocumentosRoutes(app, supabase, validateApiKey) {
  /**
   * O esquema fixo do tipo (Regra 4).
   *
   * A LIA pede antes de ler, e só pode responder nos campos que vierem aqui.
   * Sem esse contrato cada leitura devolveria um formato diferente e a
   * conferência viraria texto livre.
   */
  app.get('/api/v1/documentos/esquema/:tipo', validateApiKey, async (req, res) => {
    try {
      const { data, error } = await supabase.rpc('documento_esquema', { p_tipo: req.params.tipo });
      if (error) throw error;
      if (!data) return erro(res, 404, 'TIPO_DESCONHECIDO', 'tipo de documento não cadastrado');
      return res.json({ success: true, data });
    } catch (err) {
      console.error('[documentos] erro no esquema:', err?.message);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });

  /**
   * A fila: documentos que chegaram e ninguém leu ainda.
   *
   * É por aqui que a LIA descobre o que fazer, sem precisar de webhook. Fila
   * curta de propósito — quem não coube volta na próxima chamada.
   */
  app.get('/api/v1/documentos/pendentes', validateApiKey, async (req, res) => {
    try {
      const limite = Math.min(Number(req.query.limite) || 20, 100);
      const { data, error } = await supabase
        .from('documentos_cliente')
        .select('id, tipo, arquivo, arquivo_nome, enviado_em')
        .eq('tenant_id', req.tenantId)
        .eq('status', 'enviado')
        .order('enviado_em', { ascending: true })
        .limit(limite);
      if (error) throw error;
      return res.json({ success: true, data: { documentos: data ?? [] } });
    } catch (err) {
      console.error('[documentos] erro listando pendentes:', err?.message);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });

  /**
   * A leitura chega.
   *
   * Substitui a leitura anterior: reler é refazer. Campo fora do esquema é
   * descartado e DITO na resposta — quem integra precisa descobrir que mandou
   * um campo que a Dash não conhece, em vez de achar que gravou.
   */
  app.post('/api/v1/documentos/:id/campos', validateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return erro(res, 400, 'INVALID_ID', 'id inválido');

      const bruto = Array.isArray(req.body?.campos) ? req.body.campos : null;
      if (!bruto) {
        return erro(res, 400, 'CAMPOS_OBRIGATORIOS',
          'mande { campos: [{ campo, valor, confianca?, ancora? }] }');
      }
      if (bruto.length > MAX_CAMPOS) {
        return erro(res, 400, 'CAMPOS_DEMAIS', `no máximo ${MAX_CAMPOS} campos por documento`);
      }

      // O DOCUMENTO manda o tenant — quem chama não escolhe. Aceitar isso do
      // corpo deixaria a LIA gravar leitura no documento de outra imobiliária.
      const { data: doc, error: erroDoc } = await supabase
        .from('documentos_cliente')
        .select('id, tenant_id, status')
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .maybeSingle();
      if (erroDoc) throw erroDoc;
      if (!doc) return erro(res, 404, 'NOT_FOUND', 'documento não encontrado');

      const campos = bruto
        .map((c) => ({
          campo: String(c?.campo ?? '').trim(),
          valor: String(c?.valor ?? '').trim().slice(0, MAX_VALOR),
          // Fora de 0–1 vira nulo: confiança inventada pintaria de amarelo o
          // que está certo, ou deixaria passar o que está duvidoso.
          confianca: Number.isFinite(Number(c?.confianca))
            && Number(c.confianca) >= 0 && Number(c.confianca) <= 1
            ? Number(c.confianca) : null,
          ancora: String(c?.ancora ?? '').trim().slice(0, MAX_ANCORA) || null,
        }))
        .filter((c) => c.campo);

      if (campos.length === 0) return erro(res, 400, 'CAMPOS_VAZIOS', 'nenhum campo com nome');

      const lidoPor = req.body?.lido_por === 'regra' ? 'regra' : 'ia';
      const { data, error } = await supabase.rpc('documento_leitura_recebida', {
        p_documento_id: doc.id, p_campos: campos, p_lido_por: lidoPor,
      });
      if (error) throw error;

      return res.json({
        success: true,
        data: {
          documento_id: doc.id,
          ...(data ?? {}),
          // O eco diz o que acontece agora. Quem integra não pode concluir que
          // o documento ficou pronto: ele ficou LIDO, esperando uma pessoa.
          status: 'lido',
          aviso: 'A leitura entrou como sugestão. O documento só vale depois que uma pessoa confirmar.',
        },
      });
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.includes('já foi conferido')) {
        return erro(res, 409, 'JA_CONFERIDO', 'este documento já foi conferido por uma pessoa');
      }
      console.error('[documentos] erro gravando leitura:', msg);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });

  /** A LIA avisa que não conseguiu ler, para a pessoa não ficar esperando. */
  app.post('/api/v1/documentos/:id/erro', validateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) return erro(res, 400, 'INVALID_ID', 'id inválido');
      const motivo = String(req.body?.motivo ?? '').trim().slice(0, 500);
      if (!motivo) return erro(res, 400, 'MOTIVO_OBRIGATORIO', 'mande { motivo }');

      const { data: doc, error: erroDoc } = await supabase
        .from('documentos_cliente')
        .select('id, status')
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .maybeSingle();
      if (erroDoc) throw erroDoc;
      if (!doc) return erro(res, 404, 'NOT_FOUND', 'documento não encontrado');
      if (doc.status === 'conferido') {
        return erro(res, 409, 'JA_CONFERIDO', 'este documento já foi conferido por uma pessoa');
      }

      // NÃO marca como recusado: recusar é decisão de gente. O documento volta
      // para a fila humana com os campos em branco, que é como ele já
      // funcionava antes de existir leitura automática.
      const { error } = await supabase
        .from('documentos_cliente')
        .update({ status: 'enviado', lido_por: null, lido_em: null })
        .eq('id', doc.id);
      if (error) throw error;

      console.warn('[documentos] leitura falhou em %s: %s', doc.id, motivo);
      return res.json({
        success: true,
        data: { documento_id: doc.id, status: 'enviado',
                aviso: 'Registrado. O documento continua na fila para conferência à mão.' },
      });
    } catch (err) {
      console.error('[documentos] erro registrando falha:', err?.message);
      return erro(res, 500, 'INTERNAL_ERROR', 'erro inesperado');
    }
  });
}
