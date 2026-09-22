/**
 * Rotas do aceite de contrato (P4.3):
 *   POST /api/v1/contratos/aceitar   — registra o aceite com IP e aparelho
 *
 * POR QUE ISTO NÃO É UM RPC CHAMADO PELO NAVEGADOR: o plano pede que o aceite
 * grave o IP. O navegador não enxerga o próprio endereço público, e se ele o
 * informasse, o aceitante estaria declarando o próprio IP — um registro assim
 * não prova nada. Quem enxerga a conexão é o servidor.
 *
 * Por isso `contrato_aceitar` NÃO tem permissão para `authenticated` no banco:
 * só a chave de serviço a executa, e só por aqui, depois de validar o token.
 *
 * Auth idêntica ao eNPS e ao kpis: Bearer → supabase.auth.getUser → req.userId.
 */

/** Mesmo helper dos dois entrypoints: o cabeçalho pode vir repetido. */
const firstHeaderValue = (value) => (Array.isArray(value) ? value[0] : value);

/**
 * O endereço de quem está aceitando.
 *
 * `x-forwarded-for` primeiro porque a Dash roda atrás de proxy e `req.ip`
 * devolveria o endereço do próprio proxy. Nenhum dos entrypoints liga
 * `trust proxy`, então o cabeçalho é lido à mão — é o mesmo padrão já usado no
 * feed do Zap e no registro do VRSync.
 *
 * O cabeçalho pode trazer a cadeia inteira ("cliente, proxy1, proxy2"): o
 * primeiro é o cliente.
 */
export function ipDoPedido(req) {
  const encaminhado = firstHeaderValue(req.headers?.['x-forwarded-for']);
  const primeiro = typeof encaminhado === 'string' ? encaminhado.split(',')[0] : '';
  return (primeiro || '').trim() || req.ip || '';
}

export function makeRequireSupabaseAuth(supabase) {
  return async function requireSupabaseAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'missing_authorization' });
      }
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: 'invalid_token' });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[contratos] erro validando token:', err);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function makeAceitarHandler(supabase) {
  return async function aceitar(req, res) {
    const atribuicaoId = (req.body?.atribuicao_id || '').trim();
    if (!atribuicaoId) {
      return res.status(400).json({ ok: false, error: 'atribuicao_id_obrigatorio' });
    }

    const ip = ipDoPedido(req);
    if (!ip) {
      // Sem endereço não há o que registrar. Melhor recusar do que gravar um
      // aceite que não prova de onde veio.
      return res.status(400).json({ ok: false, error: 'sem_endereco_de_origem' });
    }

    try {
      // O USUÁRIO VEM DO TOKEN, nunca do corpo. É a mesma lição do IDOR que a
      // configuração da Meta documenta: o identificador de quem age tem uma
      // fonte só.
      const { data, error } = await supabase.rpc('contrato_aceitar', {
        p_atribuicao_id: atribuicaoId,
        p_user_id: req.userId,
        p_ip: ip,
        p_user_agent: String(req.headers?.['user-agent'] || '').slice(0, 500),
      });

      if (error) {
        // O banco recusa por regra (contrato de outra pessoa, exige assinatura
        // eletrônica). O texto dele é o que a tela mostra.
        const dele = error.message || 'erro_ao_aceitar';
        const status = /outra pessoa/i.test(dele) ? 403 : 400;
        return res.status(status).json({ ok: false, error: dele });
      }

      if (!data) return res.status(404).json({ ok: false, error: 'contrato_nao_encontrado' });

      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error('[contratos] erro ao registrar aceite:', err);
      return res.status(500).json({ ok: false, error: 'erro_interno' });
    }
  };
}

export function registerContratosRoutes(app, supabase) {
  const requireSupabaseAuth = makeRequireSupabaseAuth(supabase);
  app.post('/api/v1/contratos/aceitar', requireSupabaseAuth, makeAceitarHandler(supabase));
}
