import { normalizePhone, phonesMatch } from './utils/phone.js';

/**
 * Pipeline de atribuição de corretor a leads (roleta, limites, exclusividade).
 *
 * Extraído de proxy-production.js na otimização do fluxo de criação de leads.
 * Dependências por injeção (mesmo padrão de webhookDispatch.js) para permitir
 * testes de regressão reais sem subir o servidor.
 *
 * Otimizações aplicadas — o COMPORTAMENTO (regras de distribuição, limites e
 * exclusividade) é idêntico ao código original:
 * - cache por requisição: ACL, config de limite e linhas de imóvel são
 *   carregados 1 única vez por criação de lead (antes: até 3x o ACL, N+2x a
 *   config de limite);
 * - consultas independentes rodam em Promise.all (antes: sequenciais);
 * - na roleta, os overrides de membership saem em 1 query batch (.in) no
 *   lugar de 1 query por corretor, e as checagens de limite rodam em paralelo
 *   (antes: loop serializado com ~4 queries por corretor).
 */
export function createLeadAssignment({ supabase }) {
  // Estado da roleta por tenant (round-robin em memória)
  const tenantRoletaState = new Map();

  // Cache por requisição: deduplica queries repetidas dentro da criação de UM
  // lead. Vive só durante a requisição — nunca serve dado velho entre leads.
  // Memoiza a promise (não o resultado): chamadas concorrentes disparadas via
  // Promise.all também colapsam em 1 única query.
  const createLeadLookupCache = () => new Map();

  const memo = (cache, key, fetcher) => {
    if (!cache) return fetcher();
    if (!cache.has(key)) cache.set(key, fetcher());
    return cache.get(key);
  };

  // ---------------------------------------------------------------------------
  // Loaders memoizados (1 query por tabela/chave por requisição)
  // ---------------------------------------------------------------------------

  // Linha do imóvel em properties_cache com a UNIÃO das colunas que o fluxo
  // usa (corretor responsável + foto), para uma única query servir tanto a
  // atribuição quanto a busca de foto.
  const getPropertyCacheRow = (tenantId, normalizedCode, cache) =>
    memo(cache, `properties_cache:${normalizedCode}`, async () => {
      const { data } = await supabase
        .from('properties_cache')
        .select('agent_name, agent_phone, agent_email, main_photo')
        .eq('tenant_id', tenantId)
        .eq('property_code', normalizedCode)
        .maybeSingle();
      return data ?? null;
    });

  // Linha do imóvel em imoveis_corretores (corretor manual + exclusividade).
  const getImovelCorretorRow = (tenantId, normalizedCode, cache) =>
    memo(cache, `imoveis_corretores:${normalizedCode}`, async () => {
      const { data } = await supabase
        .from('imoveis_corretores')
        .select('corretor_nome, corretor_id, corretor_telefone, corretor_email, exclusivo')
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', normalizedCode)
        .maybeSingle();
      return data ?? null;
    });

  const getImovelLocalRow = (tenantId, normalizedCode, cache) =>
    memo(cache, `imoveis_locais:${normalizedCode}`, async () => {
      const { data } = await supabase
        .from('imoveis_locais')
        .select('exclusivo')
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', normalizedCode)
        .maybeSingle();
      return data ?? null;
    });

  const getLeadLimitConfig = (tenantId, cache) =>
    memo(cache, 'tenant_lead_limit_config', async () => {
      const { data } = await supabase
        .from('tenant_lead_limit_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data ?? null;
    });

  const getBrokerMembership = (tenantId, brokerId, cache) =>
    memo(cache, `membership:${brokerId}`, async () => {
      const { data } = await supabase
        .from('tenant_memberships')
        .select('permissions')
        .eq('tenant_id', tenantId)
        .eq('user_id', brokerId)
        .maybeSingle();
      return data ?? null;
    });

  // ---------------------------------------------------------------------------
  // Exclusividade do imóvel
  // ---------------------------------------------------------------------------

  const resolvePropertyExclusivity = async (tenantId, propertyCode, cache) => {
    if (!tenantId || !propertyCode) {
      return false;
    }

    const normalizedCode = propertyCode.trim().toUpperCase();

    try {
      // As duas fontes são independentes → paralelo. A precedência continua a
      // mesma: imoveis_locais vence; imoveis_corretores é fallback.
      const [localProperty, brokerProperty] = await Promise.all([
        getImovelLocalRow(tenantId, normalizedCode, cache),
        getImovelCorretorRow(tenantId, normalizedCode, cache),
      ]);

      if (localProperty && typeof localProperty.exclusivo === 'boolean') {
        return localProperty.exclusivo;
      }

      if (brokerProperty && typeof brokerProperty.exclusivo === 'boolean') {
        return brokerProperty.exclusivo;
      }
    } catch (error) {
      console.warn('⚠️ Não foi possível resolver exclusividade do imóvel:', error.message);
    }

    return false;
  };

  // ---------------------------------------------------------------------------
  // ACL — corretores da aba "Acessos e Permissões"
  // ---------------------------------------------------------------------------

  /**
   * Busca todos os corretores da aba "Acessos e Permissões" (tenant_brokers + tenant_memberships)
   * Esta é a fonte de verdade para listar corretores do sistema
   */
  const getAllBrokersFromACL = (tenantId, cache) => memo(cache, 'acl_brokers', async () => {
    const brokerMap = new Map();

    try {
      // tenant_brokers e tenant_memberships são independentes → paralelo
      const [
        { data: tenantBrokers, error: brokersError },
        { data: members, error: membersError },
      ] = await Promise.all([
        supabase
          .from('tenant_brokers')
          .select('id, name, email, phone, photo_url, auth_user_id, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),
        supabase
          .from('tenant_memberships')
          .select('user_id, role')
          .eq('tenant_id', tenantId)
          .eq('role', 'corretor'),
      ]);

      if (brokersError) {
        console.error('❌ Erro ao buscar tenant_brokers:', brokersError);
      }
      if (membersError) {
        console.error('❌ Erro ao buscar tenant_memberships:', membersError);
      }

      // Adicionar corretores de tenant_brokers ao mapa
      (tenantBrokers || []).forEach(broker => {
        const key = broker.auth_user_id || broker.id;
        if (!brokerMap.has(key)) {
          brokerMap.set(key, {
            id: key,
            broker_id: broker.id,
            auth_user_id: broker.auth_user_id,
            name: broker.name,
            email: broker.email,
            phone: normalizePhone(broker.phone, { withCountryCode: true }),
            photo_url: broker.photo_url,
            status: broker.status
          });
        }
      });

      // Buscar dados dos usuários via user_profiles (view de auth.users)
      const memberUserIds = (members || []).map(m => m.user_id).filter(id => !brokerMap.has(id));

      if (memberUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, email, full_name, phone, avatar_url')
          .in('id', memberUserIds);

        if (profilesError) {
          console.error('❌ Erro ao buscar user_profiles:', profilesError);
        }

        (profiles || []).forEach(profile => {
          if (!brokerMap.has(profile.id)) {
            const memberRole = members?.find(m => m.user_id === profile.id)?.role || 'corretor';
            brokerMap.set(profile.id, {
              id: profile.id,
              auth_user_id: profile.id,
              name: profile.full_name || profile.email?.split('@')[0] || 'Usuário',
              email: profile.email,
              phone: normalizePhone(profile.phone, { withCountryCode: true }),
              photo_url: profile.avatar_url,
              status: 'active',
              role: memberRole
            });
          }
        });
      }

      return Array.from(brokerMap.values());
    } catch (error) {
      console.error('❌ Erro ao buscar corretores do ACL:', error);
      return [];
    }
  });

  /**
   * Busca corretor por nome, email ou telefone nas fontes do sistema
   * Ordem de busca: nome exato > email > telefone normalizado
   */
  const findBrokerByIdentifier = async (tenantId, { name, email, phone }, cache) => {
    // Buscar todos os corretores do ACL
    const allBrokers = await getAllBrokersFromACL(tenantId, cache);

    if (allBrokers.length === 0) return null;

    // 1. Buscar por nome (case insensitive)
    if (name) {
      const normalizedName = name.trim().toLowerCase();
      const byName = allBrokers.find(b => b.name?.toLowerCase() === normalizedName);
      if (byName) {
        console.log(`✅ Corretor encontrado por nome: ${byName.name}`);
        return byName;
      }
    }

    // 2. Buscar por email
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const byEmail = allBrokers.find(b => b.email?.toLowerCase() === normalizedEmail);
      if (byEmail) {
        console.log(`✅ Corretor encontrado por email: ${byEmail.name}`);
        return byEmail;
      }
    }

    // 3. Buscar por telefone (usando comparação normalizada)
    if (phone) {
      const byPhone = allBrokers.find(b => phonesMatch(b.phone, phone));
      if (byPhone) {
        console.log(`✅ Corretor encontrado por telefone: ${byPhone.name}`);
        return byPhone;
      }
    }

    return null;
  };

  // ---------------------------------------------------------------------------
  // Limite de leads por corretor
  // ---------------------------------------------------------------------------

  /**
   * Busca config de limite de leads do tenant + override do corretor.
   * Retorna { eligible, reason } indicando se o corretor pode receber novos leads.
   * Não bloqueia se a config estiver desativada.
   */
  const checkBrokerLeadLimitForTenant = async (tenantId, brokerId, cache) => {
    if (!tenantId || !brokerId) return { eligible: true };

    // Resultado memoizado por corretor: dentro de UMA criação de lead o mesmo
    // corretor pode ser checado 2x (ex.: attendedBy no limite → roleta).
    return memo(cache, `limit_check:${brokerId}`, async () => {
      try {
        // 1. Buscar config global do tenant
        const cfg = await getLeadLimitConfig(tenantId, cache);

        if (!cfg || !cfg.lead_limit_enabled) return { eligible: true };

        // 2. Buscar override do corretor em tenant_memberships.permissions->lead_limit
        const membership = await getBrokerMembership(tenantId, brokerId, cache);

        const override = membership?.permissions?.lead_limit || {};

        // Pausado: não recebe leads automáticos
        if (override.receives_auto_leads === false) {
          return { eligible: false, reason: `Corretor ${brokerId} pausado para recebimento automático` };
        }

        // Isento: sem limite
        if (override.limit_exempt === true) return { eligible: true };

        // Override habilita/desabilita individualmente
        const effectiveEnabled = override.lead_limit_enabled !== undefined
          ? override.lead_limit_enabled
          : cfg.lead_limit_enabled;
        if (!effectiveEnabled) return { eligible: true };

        // Limites efetivos
        const maxActive = override.custom_max_active_leads != null
          ? override.custom_max_active_leads
          : cfg.max_active_leads_per_broker;
        const maxPending = override.custom_max_pending_response_leads != null
          ? override.custom_max_pending_response_leads
          : cfg.max_pending_response_leads_per_broker;

        const pendingStatuses = Array.isArray(cfg.pending_statuses) && cfg.pending_statuses.length > 0
          ? cfg.pending_statuses
          : ['Novos Leads'];

        // 3. Contar leads ativos do corretor
        const [activeResult, pendingResult] = await Promise.all([
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('assigned_agent_id', brokerId)
            .neq('status', 'Arquivado'),
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('assigned_agent_id', brokerId)
            .in('status', pendingStatuses),
        ]);

        const activeCount = activeResult.count ?? 0;
        const pendingCount = pendingResult.count ?? 0;

        const mode = cfg.blocking_mode || 'both';
        const carteiraBloqueada = mode !== 'pendencia' && activeCount >= maxActive;
        const pendenciaBloqueada = mode !== 'carteira' && pendingCount >= maxPending;

        if (carteiraBloqueada && pendenciaBloqueada) {
          return {
            eligible: false,
            reason: `Carteira (${activeCount}/${maxActive}) e pendências (${pendingCount}/${maxPending}) no limite`,
          };
        }
        if (carteiraBloqueada) {
          return {
            eligible: false,
            reason: `Carteira no limite (${activeCount}/${maxActive} leads ativos)`,
          };
        }
        if (pendenciaBloqueada) {
          return {
            eligible: false,
            reason: `Muitas pendências (${pendingCount}/${maxPending} leads pendentes)`,
          };
        }

        return { eligible: true };
      } catch (err) {
        console.error('❌ Erro ao checar limite de leads:', err);
        return { eligible: true }; // fail-open: não bloqueia em erro
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Roleta
  // ---------------------------------------------------------------------------

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Pré-carrega os memberships da lista em 1 query batch (.in) no lugar de 1
   * query por corretor, memoizando em `cache` na mesma chave que
   * getBrokerMembership usa. Chamar duas vezes na mesma requisição não gera
   * query nova — a segunda encontra tudo em cache.
   *
   * IDs não-UUID ficam null direto: é o mesmo resultado do .eq() individual
   * antigo, que falhava e retornava null.
   */
  const preloadMemberships = async (tenantId, brokerList, cache) => {
    const pendingIds = [...new Set(
      brokerList.map(b => b.id || b.auth_user_id).filter(Boolean)
    )].filter(id => !cache.has(`membership:${id}`));

    const uuidIds = pendingIds.filter(id => UUID_RE.test(String(id)));
    pendingIds
      .filter(id => !UUID_RE.test(String(id)))
      .forEach(id => cache.set(`membership:${id}`, Promise.resolve(null)));

    if (uuidIds.length === 0) return;

    const { data: memberships } = await supabase
      .from('tenant_memberships')
      .select('user_id, permissions')
      .eq('tenant_id', tenantId)
      .in('user_id', uuidIds);

    // Chaves em minúsculas: o PostgREST serializa uuid canônico minúsculo,
    // e o .eq() antigo casava UUIDs em qualquer caixa via cast do Postgres.
    const byUserId = new Map((memberships || []).map(m => [String(m.user_id).toLowerCase(), { permissions: m.permissions }]));
    uuidIds.forEach(id => cache.set(`membership:${id}`, Promise.resolve(byUserId.get(String(id).toLowerCase()) ?? null)));
  };

  /**
   * Atuação do corretor: só 'lancamentos' e 'prontos' restringem. Ausente,
   * desconhecida ou sem membership → 'ambos'. Dado estranho no JSONB não pode
   * tirar corretor da roleta.
   */
  const atuacaoOf = (membership) => {
    const value = membership?.permissions?.atuacao;
    return value === 'lancamentos' || value === 'prontos' ? value : 'ambos';
  };

  /**
   * Roleta racional de corretores (Multi-tenant)
   * Fonte primária: roleta_participantes (corretores selecionados pelo admin)
   * Fallback 1: Acessos e Permissões (tenant_memberships + tenant_brokers)
   * Fallback 2: imoveis_corretores (para compatibilidade)
   */
  const getNextBrokerFromRoleta = async (tenantId, cache = createLeadLookupCache(), { atuacao } = {}) => {
    try {
      let brokerList = [];

      // 1. FONTE PRIMÁRIA: participantes ativos da roleta. A config de limite é
      // independente → busca em paralelo (e fica memoizada para o filtro abaixo).
      const [{ data: participantes, error: participantesError }, limitCfg] = await Promise.all([
        supabase
          .from('roleta_participantes')
          .select('broker_id, broker_name, broker_email, broker_phone')
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        getLeadLimitConfig(tenantId, cache),
      ]);

      if (!participantesError && participantes && participantes.length > 0) {
        brokerList = participantes.map(p => ({
          id: p.broker_id,
          name: p.broker_name,
          email: p.broker_email,
          phone: normalizePhone(p.broker_phone, { withCountryCode: true })
        }));
        console.log(`🎰 Roleta: ${brokerList.length} corretor(es) configurados na roleta`);
      }

      // 2. FALLBACK 1: Se não houver participantes configurados, usar ACL (todos os corretores)
      if (brokerList.length === 0) {
        console.log('⚠️ Nenhum corretor configurado na roleta, usando ACL...');
        brokerList = await getAllBrokersFromACL(tenantId, cache);
      }

      // 3. FALLBACK 2: Se não houver no ACL, tentar imoveis_corretores
      if (brokerList.length === 0) {
        console.log('⚠️ Nenhum corretor no ACL, tentando imoveis_corretores...');
        const { data: brokers } = await supabase
          .from('imoveis_corretores')
          .select('corretor_nome, corretor_id, corretor_telefone, corretor_email')
          .eq('tenant_id', tenantId)
          .not('corretor_nome', 'is', null);

        if (brokers && brokers.length > 0) {
          // Deduplicar por nome
          const seen = new Set();
          brokerList = brokers
            .filter(b => {
              if (seen.has(b.corretor_nome)) return false;
              seen.add(b.corretor_nome);
              return true;
            })
            .map(b => ({
              id: b.corretor_id,
              name: b.corretor_nome,
              phone: normalizePhone(b.corretor_telefone, { withCountryCode: true }),
              email: b.corretor_email
            }));
        }
      }

      if (brokerList.length === 0) {
        console.log('⚠️ Nenhum corretor disponível para roleta');
        return null;
      }

      // Pool completo, antes de qualquer estreitamento. O filtro de limite volta
      // para cá quando o pool de atuação inteiro está travado — sem isso, um
      // pool menor transformaria "corretor ocupado" em lead perdido.
      const poolCompleto = brokerList;
      let poolEstreitado = false;

      // Filtro de atuação: lead de lançamento não cai em corretor que só faz
      // imóvel pronto, e vice-versa. Sem `atuacao`, a roleta é a de sempre.
      if (atuacao === 'lancamentos' || atuacao === 'prontos') {
        await preloadMemberships(tenantId, brokerList, cache);

        const memberships = await Promise.all(
          brokerList.map(b => {
            const brokerId = b.id || b.auth_user_id;
            return brokerId ? getBrokerMembership(tenantId, brokerId, cache) : null;
          })
        );

        const matching = brokerList.filter((b, i) => {
          const a = atuacaoOf(memberships[i]);
          return a === 'ambos' || a === atuacao;
        });

        if (matching.length === 0) {
          // ponytail: fail-open — lead misroteado é ruim, lead perdido é pior.
          console.log(`⚠️ Roleta: nenhum corretor de ${atuacao} entre ${brokerList.length} — usando o pool inteiro`);
        } else {
          brokerList = matching;
          poolEstreitado = true;
          console.log(`🎰 Roleta ${atuacao}: ${brokerList.length} corretor(es)`);
        }
      }

      // Filtrar corretores bloqueados por limite de leads
      if (limitCfg?.lead_limit_enabled) {
        const filtrarElegiveis = async (lista) => {
          await preloadMemberships(tenantId, lista, cache);

          // Checagens em paralelo (antes: loop serializado, ~4 queries por corretor).
          // Promise.all preserva a ordem — a lista elegível sai na MESMA ordem do
          // loop antigo, então o round-robin não muda.
          const checks = await Promise.all(
            lista.map(b => checkBrokerLeadLimitForTenant(tenantId, b.id || b.auth_user_id, cache))
          );

          return lista.filter((b, i) => {
            if (checks[i].eligible) return true;
            console.log(`⚠️ Roleta: ${b.name} ignorado — ${checks[i].reason}`);
            return false;
          });
        };

        let eligibleList = await filtrarElegiveis(brokerList);

        // Fail-open: o filtro de atuação não pode transformar "os poucos do pool
        // estreitado estão ocupados" em lead perdido. Reavalia o pool inteiro
        // antes de desistir — memberships e checagens de limite já feitas saem
        // do cache da requisição, então a 2ª passada não gera query nova.
        if (eligibleList.length === 0 && poolEstreitado) {
          console.log(`⚠️ Roleta: todo o pool ${atuacao} no limite — reavaliando o pool inteiro`);
          brokerList = poolCompleto;
          eligibleList = await filtrarElegiveis(poolCompleto);
        }

        if (eligibleList.length === 0) {
          console.log('⚠️ Roleta: todos os corretores estão no limite de leads');
          return null;
        }
        brokerList = eligibleList;
        console.log(`🎰 Roleta após filtro de limite: ${brokerList.length} corretor(es) elegível(is)`);
      }

      // Estado da roleta por tenant E por pool (round-robin). Um índice único
      // para pools de tamanhos diferentes faria o rodízio repetir e pular
      // corretores ao alternar entre lançamento e pronto.
      const stateKey = `${tenantId}:${atuacao || 'all'}`;
      if (!tenantRoletaState.has(stateKey)) {
        tenantRoletaState.set(stateKey, { lastIndex: -1 });
      }

      const state = tenantRoletaState.get(stateKey);
      const nextIndex = (state.lastIndex + 1) % brokerList.length;
      state.lastIndex = nextIndex;

      const selectedBroker = brokerList[nextIndex];
      console.log(`🎰 Roleta: ${nextIndex + 1}/${brokerList.length} - ${selectedBroker.name}`);
      return selectedBroker;
    } catch (error) {
      console.error('❌ Erro na roleta:', error);
      return null;
    }
  };

  // ---------------------------------------------------------------------------
  // Pipeline de atribuição
  // ---------------------------------------------------------------------------

  /**
   * Pipeline de atribuição automática de corretor:
   * 1. raw_data.attendedBy (leads Kenlo) - busca no ACL por nome/email/telefone
   * 2. properties_cache (XML sincronizado) - busca corretor responsável no ACL
   * 3. imoveis_corretores (Meus Imóveis) - busca corretor responsável no ACL
   * 4. Roleta (fallback) - distribui entre corretores do ACL
   */
  const resolveBrokerForLead = async (propertyCode, tenantId, rawData = null, cache = createLeadLookupCache(), { atuacao } = {}) => {
    let broker = null;
    let method = null;

    // 1. Verificar se veio com attendedBy do Kenlo
    if (rawData?.attendedBy && Array.isArray(rawData.attendedBy) && rawData.attendedBy.length > 0) {
      const attendedBroker = rawData.attendedBy[0];
      if (attendedBroker?.name || attendedBroker?.email || attendedBroker?.phone) {
        // Buscar corretor no ACL por nome/email/telefone
        const foundBroker = await findBrokerByIdentifier(tenantId, {
          name: attendedBroker.name,
          email: attendedBroker.email,
          phone: attendedBroker.phone || attendedBroker.cel
        }, cache);

        if (foundBroker) {
          const limitCheck = await checkBrokerLeadLimitForTenant(tenantId, foundBroker.id || foundBroker.auth_user_id, cache);
          if (!limitCheck.eligible) {
            console.log(`⚠️ Corretor ${foundBroker.name} bloqueado por limite (Kenlo attendedBy): ${limitCheck.reason}. Tentando roleta...`);
          } else {
            broker = foundBroker;
            method = 'kenlo_attended_by';
            console.log(`✅ Corretor via Kenlo attendedBy (validado no ACL): ${broker.name}`);
            return { broker, method };
          }
        }

        // Se não encontrou no ACL, usar dados do Kenlo mesmo (sem checar limite — ID desconhecido)
        if (!broker && attendedBroker.name) {
          broker = {
            name: attendedBroker.name,
            id: attendedBroker.id?.toString() || null,
            phone: normalizePhone(attendedBroker.phone || attendedBroker.cel, { withCountryCode: true }),
            email: attendedBroker.email
          };
          method = 'kenlo_attended_by';
          console.log(`✅ Corretor via Kenlo attendedBy (não validado no ACL): ${broker.name}`);
          return { broker, method };
        }
      }
    }

    // 2. Buscar no cache/XML por código do imóvel
    if (propertyCode) {
      const code = propertyCode.trim().toUpperCase();

      // 2a (properties_cache/XML) e 2b (imoveis_corretores/Meus Imóveis) são
      // leituras independentes → paralelo. A precedência de uso continua 2a → 2b.
      const [cached, manual] = await Promise.all([
        getPropertyCacheRow(tenantId, code, cache),
        getImovelCorretorRow(tenantId, code, cache),
      ]);

      if (cached?.agent_name || cached?.agent_email || cached?.agent_phone) {
        // Buscar corretor no ACL por nome/email/telefone
        const foundBroker = await findBrokerByIdentifier(tenantId, {
          name: cached.agent_name,
          email: cached.agent_email,
          phone: cached.agent_phone
        }, cache);

        if (foundBroker) {
          const limitCheck = await checkBrokerLeadLimitForTenant(tenantId, foundBroker.id || foundBroker.auth_user_id, cache);
          if (!limitCheck.eligible) {
            console.log(`⚠️ Corretor ${foundBroker.name} bloqueado por limite (XML cache): ${limitCheck.reason}. Tentando roleta...`);
          } else {
            broker = foundBroker;
            method = 'xml_property_cache';
            console.log(`✅ Corretor via XML/cache (validado no ACL): ${broker.name}`);
            return { broker, method };
          }
        }

        // Se não encontrou no ACL, usar dados do XML mesmo (sem checar limite)
        if (!broker && cached.agent_name) {
          broker = {
            name: cached.agent_name,
            phone: normalizePhone(cached.agent_phone, { withCountryCode: true }),
            email: cached.agent_email
          };
          method = 'xml_property_cache';
          console.log(`✅ Corretor via XML/cache (não validado no ACL): ${broker.name}`);
          return { broker, method };
        }
      }

      if (manual?.corretor_nome || manual?.corretor_email || manual?.corretor_telefone) {
        // Buscar corretor no ACL por nome/email/telefone
        const foundBroker = await findBrokerByIdentifier(tenantId, {
          name: manual.corretor_nome,
          email: manual.corretor_email,
          phone: manual.corretor_telefone
        }, cache);

        if (foundBroker) {
          const limitCheck = await checkBrokerLeadLimitForTenant(tenantId, foundBroker.id || foundBroker.auth_user_id, cache);
          if (!limitCheck.eligible) {
            console.log(`⚠️ Corretor ${foundBroker.name} bloqueado por limite (Meus Imóveis): ${limitCheck.reason}. Tentando roleta...`);
          } else {
            broker = foundBroker;
            method = 'meus_imoveis';
            console.log(`✅ Corretor via Meus Imóveis (validado no ACL): ${broker.name}`);
            return { broker, method };
          }
        }

        // Se não encontrou no ACL, usar dados da tabela mesmo (sem checar limite)
        if (!broker && manual.corretor_nome) {
          broker = {
            name: manual.corretor_nome,
            id: manual.corretor_id,
            phone: normalizePhone(manual.corretor_telefone, { withCountryCode: true }),
            email: manual.corretor_email
          };
          method = 'meus_imoveis';
          console.log(`✅ Corretor via Meus Imóveis (não validado no ACL): ${broker.name}`);
          return { broker, method };
        }
      }
    }

    // 3. ROLETA - nenhum corretor responsável encontrado
    console.log(`⚙️ Código ${propertyCode || 'N/A'} sem corretor responsável, usando roleta...`);
    const roletaBroker = await getNextBrokerFromRoleta(tenantId, cache, { atuacao });

    if (roletaBroker) {
      broker = roletaBroker;
      method = 'roleta';
      console.log(`🎰 Corretor via roleta: ${broker.name}`);
      return { broker, method };
    }

    return { broker: null, method: null };
  };

  return {
    tenantRoletaState,
    createLeadLookupCache,
    getPropertyCacheRow,
    resolvePropertyExclusivity,
    getAllBrokersFromACL,
    findBrokerByIdentifier,
    checkBrokerLeadLimitForTenant,
    getNextBrokerFromRoleta,
    resolveBrokerForLead,
  };
}
