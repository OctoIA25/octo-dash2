/**
 * A rota pela qual a LIA indexa a base de conhecimento (P2.3).
 *
 * A DIVISÃO, decidida pelo chefe em 20/09/2026: a Dash guarda os documentos e
 * faz a busca; a LIA — que roda em servidor próprio — extrai o texto do PDF e
 * gera o embedding, porque não existe provedor de embeddings nesta Dash (a
 * única IA configurada é a Anthropic, que não tem essa API).
 *
 * Enquanto a LIA não indexa, a busca funciona POR PALAVRA e já responde. O
 * embedding só a melhora — nada aqui é pré-requisito para a tela funcionar.
 *
 * `kb_trechos` não aceita escrita pelo navegador: quem grava é a chave de
 * serviço, por esta rota. Trecho que o usuário pode escrever deixa de ser o
 * que o documento diz e passa a ser o que alguém digitou.
 *
 * Registrar nos DOIS entrypoints (api-server.js e proxy-production.js) antes
 * do catch-all 404, senão funciona em dev e dá 404 em produção.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ~800 caracteres é o tamanho que o plano pede; o teto protege o banco. */
const MAX_TEXTO = 4000;
const MAX_TRECHOS = 500;

export function registerBaseConhecimentoRoutes(app, supabase, validateApiKey) {
  /**
   * A LIA devolve os trechos de um documento já indexado.
   *
   * Substitui os trechos anteriores do documento, sempre: reindexar é
   * refazer, e somar geraria duplicata que apareceria duas vezes na busca.
   */
  app.post('/api/v1/kb/documentos/:id/trechos', validateApiKey, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'id inválido' } });
      }

      const bruto = Array.isArray(req.body?.trechos) ? req.body.trechos : null;
      if (!bruto) {
        return res.status(400).json({
          success: false,
          error: { code: 'TRECHOS_OBRIGATORIOS', message: 'mande { trechos: [{ texto, embedding? }] }' },
        });
      }
      if (bruto.length > MAX_TRECHOS) {
        return res.status(400).json({
          success: false,
          error: { code: 'TRECHOS_DEMAIS', message: `no máximo ${MAX_TRECHOS} trechos por documento` },
        });
      }

      // O documento manda o tenant e o lançamento — quem chama não escolhe
      // nenhum dos dois. Aceitar isso do corpo deixaria a LIA gravar trecho
      // de um empreendimento no outro.
      const { data: doc, error: erroDoc } = await supabase
        .from('kb_documentos')
        .select('id, tenant_id, lancamento_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (erroDoc) throw erroDoc;
      if (!doc) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'documento não encontrado' } });
      }

      const linhas = [];
      for (let i = 0; i < bruto.length; i += 1) {
        const texto = String(bruto[i]?.texto ?? '').trim().slice(0, MAX_TEXTO);
        if (!texto) continue;
        const emb = bruto[i]?.embedding;
        linhas.push({
          tenant_id: doc.tenant_id,
          documento_id: doc.id,
          lancamento_id: doc.lancamento_id,
          ordem: i,
          texto,
          // Embedding é OPCIONAL: sem ele o trecho ainda serve para a busca
          // por palavra, que é o que funciona hoje.
          embedding: Array.isArray(emb) && emb.length > 0 ? `[${emb.map(Number).join(',')}]` : null,
        });
      }

      if (linhas.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'TRECHOS_VAZIOS', message: 'nenhum trecho com texto' },
        });
      }

      // Reindexar é REFAZER: apaga os anteriores antes de gravar.
      const { error: erroApagar } = await supabase.from('kb_trechos').delete().eq('documento_id', doc.id);
      if (erroApagar) throw erroApagar;

      const { error: erroInserir } = await supabase.from('kb_trechos').insert(linhas);
      if (erroInserir) throw erroInserir;

      const comEmbedding = linhas.filter((l) => l.embedding).length;
      await supabase
        .from('kb_documentos')
        .update({
          status_indexacao: 'indexado',
          qtd_trechos: linhas.length,
          erro_indexacao: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      return res.json({
        success: true,
        data: {
          documento_id: doc.id,
          trechos: linhas.length,
          com_embedding: comEmbedding,
          // O eco diz qual busca este documento sustenta agora. Sem ele, quem
          // integra não descobre que mandou os trechos sem embedding.
          busca: comEmbedding > 0 ? 'significado' : 'palavra',
        },
      });
    } catch (err) {
      console.error('[kb] erro gravando trechos:', err?.message);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'erro inesperado' } });
    }
  });

  /** A LIA avisa que a indexação falhou, para o gestor ver na tela. */
  app.post('/api/v1/kb/documentos/:id/erro', validateApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'id inválido' } });
      }
      const motivo = String(req.body?.motivo ?? '').trim().slice(0, 500) || 'falha não descrita';

      const { data, error } = await supabase
        .from('kb_documentos')
        .update({ status_indexacao: 'erro', erro_indexacao: motivo, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'documento não encontrado' } });
      }
      return res.json({ success: true, data: { documento_id: data.id } });
    } catch (err) {
      console.error('[kb] erro marcando falha:', err?.message);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'erro inesperado' } });
    }
  });

  /** O que falta indexar. A LIA pergunta isto para saber o que fazer. */
  app.get('/api/v1/kb/pendentes', validateApiKey, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('kb_documentos')
        .select('id, lancamento_id, titulo, tipo, arquivo_url, conteudo')
        .eq('tenant_id', req.tenantId)
        .eq('status_indexacao', 'pendente')
        .eq('ativo', true)
        .limit(100);
      if (error) throw error;
      return res.json({ success: true, data: data ?? [] });
    } catch (err) {
      console.error('[kb] erro listando pendentes:', err?.message);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'erro inesperado' } });
    }
  });
}
