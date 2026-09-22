/**
 * A rota que a Lia consulta.
 *
 * Decidido em 19/09/2026: a Lia distribui, o Octo responde. Estes testes
 * travam três coisas que só aparecem na rota, não na regra pura:
 *
 * 1. A rota NÃO escreve em `leads`. Quem atribui é a Lia — se um dia alguém
 *    "melhorar" isso gravando a atribuição aqui, passam a existir duas
 *    verdades sobre o mesmo lead.
 * 2. O prazo de 525.600 minutos que a Lotus tem gravado ("nunca expira") não
 *    pode virar uma data em 2027.
 * 3. Evento sem motivo é recusado: a pergunta que o extrato existe para
 *    responder é "por quê", não "o quê".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerDistribuicaoRoutes } from './routes.js';

/** Estado do banco falso, montado por teste. */
let tabelas;
let gravados;

/**
 * `not(coluna, 'is', null)` sobre jsonb, com a semântica do Postgres.
 *
 * Isto NÃO é firula: a primeira versão do código usava `detalhes->posicao` e
 * o jsonb `null` passava pelo filtro, fazendo a roleta reiniciar no primeiro
 * corretor. Um falso que trate `not` como no-op deixa esse defeito passar —
 * foi o que aconteceu, e por isso o falso aprendeu a diferença:
 *
 *   detalhes->posicao   (jsonb)  jsonb null NÃO é SQL NULL  -> a linha PASSA
 *   detalhes->>posicao  (texto)  jsonb null VIRA SQL NULL   -> a linha é excluída
 */
function aplicaNotIsNull(linhas, coluna) {
  const setaDupla = coluna.includes('->>');
  const [campo, chave] = coluna.split(/->>?/).map((x) => x.trim());
  return linhas.filter((l) => {
    const valor = l?.[campo]?.[chave];
    if (valor === undefined) return false;          // chave ausente: SQL NULL nas duas
    if (valor === null) return !setaDupla;          // jsonb null: só a seta simples deixa passar
    return true;
  });
}

function fakeSupabase() {
  const builder = (tabela) => {
    const filtros = {};
    let notIsNull = null;
    const chain = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'ilike']) {
      chain[m] = (...args) => {
        if (m === 'eq') filtros[args[0]] = args[1];
        return chain;
      };
    }
    chain.not = (coluna, op, valor) => {
      if (op === 'is' && valor === null) notIsNull = coluna;
      return chain;
    };
    chain.insert = (linha) => {
      gravados.push({ tabela, linha });
      return Promise.resolve({ error: tabela === '__falha__' ? { code: 'x', message: 'y' } : null });
    };
    chain.update = () => { gravados.push({ tabela, update: true }); return chain; };
    const linhas = () => {
      const base = tabelas[tabela] ?? [];
      // `eq` FILTRA. Um falso que o tratasse como no-op devolveria a primeira
      // linha da tabela para qualquer busca — foi assim que a busca do
      // captador por `user_id` passou a achar o membro errado sem ninguém ver.
      // Colunas que a linha do teste não declara são ignoradas: o teste que
      // não monta `tenant_id` não está exercitando escopo de tenant.
      const filtrado = base.filter((l) =>
        Object.entries(filtros).every(([c, v]) => !(c in (l ?? {})) || l[c] === v)
      );
      return notIsNull ? aplicaNotIsNull(filtrado, notIsNull) : filtrado;
    };
    chain.maybeSingle = () => Promise.resolve({ data: linhas()[0] ?? null, error: null });
    chain.then = (resolve) => Promise.resolve({ data: linhas(), error: null }).then(resolve);
    return chain;
  };
  return { from: builder };
}

/** Express mínimo: guarda as rotas e deixa chamá-las. */
function fakeApp() {
  const rotas = new Map();
  return {
    post: (caminho, _auth, handler) => rotas.set(caminho, handler),
    async chamar(caminho, body, tenantId = 't1') {
      const handler = rotas.get(caminho);
      if (!handler) throw new Error(`rota não registrada: ${caminho}`);
      let status = 200;
      let corpo = null;
      const res = {
        status(c) { status = c; return res; },
        json(j) { corpo = j; return res; },
      };
      await handler({ tenantId, body }, res);
      return { status, corpo };
    },
    rotas,
  };
}

const membro = (id, extra = {}) => ({
  user_id: id, role: 'corretor', permissions: {}, created_at: `2026-01-0${id.slice(-1)}`, ...extra,
});

beforeEach(() => {
  gravados = [];
  tabelas = {
    tenant_bolsao_config: [{ horario_funcionamento: {}, tempo_expiracao_exclusivo: 60 }],
    tenant_memberships: [membro('1'), membro('2'), membro('3')],
    // Vazia = ninguém curou a roleta ainda; valem todos os membros.
    roleta_participantes: [],
    imoveis_locais: [],
    distribuicao_eventos: [],
  };
});

const montar = () => {
  const app = fakeApp();
  registerDistribuicaoRoutes(app, fakeSupabase(), (req, res, next) => next());
  return app;
};

describe('POST /api/v1/distribuicao/destino', () => {
  it('as duas rotas ficam registradas', () => {
    const app = montar();
    expect([...app.rotas.keys()].sort()).toEqual([
      '/api/v1/distribuicao/destino',
      '/api/v1/distribuicao/evento',
    ]);
  });

  it('SEM o handoff da Lia, a rota responde "lia" — decisão de 22/09', async () => {
    // Todo lead passa pela Lia primeiro. Este caso é o portão: se ele cair, a
    // rota voltou a mandar lead direto para corretor.
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', {});
    expect(corpo.data.destino).toBe('lia');
    expect(corpo.data.corretor_id).toBeNull();
    expect(corpo.data.motivo).toBe('atendido_pela_lia_primeiro');
  });

  it('lead sem imóvel cai na roleta e recebe um corretor', async () => {
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.destino).toBe('corretor');
    expect(corpo.data.corretor_id).toBe('1');
  });

  it('lançamento sem a Lia ter passado vai para a Lia, sem corretor e sem prazo', async () => {
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { tipo_imovel: 'lancamento' });
    expect(corpo.data).toMatchObject({ destino: 'lia', corretor_id: null, prazo_ate: null });
  });

  it('imóvel com captador vai para o captador', async () => {
    tabelas.imoveis_locais = [{ captador_id: '9' }];
    tabelas.tenant_memberships.push(membro('9'));
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: 'AP0961', lia_passou: true });
    expect(corpo.data).toMatchObject({ destino: 'corretor', corretor_id: '9', motivo: 'captador_do_imovel' });
  });

  it('CAPTADOR PAUSADO manda o lead para a roleta — decisão de 19/09', async () => {
    // Este era o defeito: `captadorDoImovel` devolvia `{ id }` sem as flags,
    // então `podeReceber` dizia sempre que sim e o lead ficava com quem não
    // podia atender. `captador_indisponivel` nunca chegava a acontecer.
    tabelas.imoveis_locais = [{ captador_id: '9' }];
    tabelas.tenant_memberships.push(membro('9', { permissions: { bolsao_pausado: true } }));
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: 'AP0961', lia_passou: true });
    expect(corpo.data.motivo).toBe('captador_indisponivel');
    expect(corpo.data.corretor_id).toBe('1');
  });

  it('captador que não é mais da imobiliária manda o lead para a roleta', async () => {
    // Sem membership não há a quem atribuir: o lead tem de voltar para a fila
    // em vez de ficar com quem saiu.
    tabelas.imoveis_locais = [{ captador_id: '9' }];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: 'AP0961', lia_passou: true });
    expect(corpo.data.motivo).toBe('imovel_sem_captador');
    expect(corpo.data.corretor_id).toBe('1');
  });

  it('CAPTADOR FORA DO RODÍZIO ainda recebe o que captou', async () => {
    // 15 dos 22 imóveis com captador da Lotus estão neste caso (20/09/2026).
    // Buscar o captador na roleta em vez de na equipe tiraria o lead deles.
    tabelas.imoveis_locais = [{ captador_id: '9' }];
    tabelas.tenant_memberships.push(membro('9'));
    tabelas.roleta_participantes = [{ broker_id: '1' }, { broker_id: '2' }];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: 'AP0961', lia_passou: true });
    expect(corpo.data).toMatchObject({ corretor_id: '9', motivo: 'captador_do_imovel' });
  });

  it('imóvel SEM captador cai na roleta — decisão de 19/09', async () => {
    tabelas.imoveis_locais = [{ captador_id: null }];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: 'AP0961', lia_passou: true });
    expect(corpo.data.motivo).toBe('imovel_sem_captador');
    expect(corpo.data.corretor_id).toBe('1');
  });

  it('A ROTA NÃO ESCREVE EM `leads` — quem atribui é a Lia', async () => {
    await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(gravados.some((g) => g.tabela === 'leads')).toBe(false);
    expect(gravados.every((g) => g.tabela === 'distribuicao_eventos')).toBe(true);
  });

  it('grava a consulta no extrato, com motivo e posição', async () => {
    await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    const e = gravados[0].linha;
    expect(e).toMatchObject({ tenant_id: 't1', evento: 'consultado', origem: 'lia', motivo: 'roleta_em_ordem' });
    expect(e.detalhes).toMatchObject({ posicao: 0, participantes: 3, disponiveis: 3 });
  });

  it('o prazo é calculado e devolvido quando há corretor', async () => {
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.prazo_ate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('OS 525.600 MINUTOS DA LOTUS não viram uma data em 2027', async () => {
    // É o valor gravado hoje para "nunca expira". Tratá-lo como prazo real
    // daria um prazo de 365 dias e o lead nunca sairia de ninguém.
    tabelas.tenant_bolsao_config = [{ horario_funcionamento: {}, tempo_expiracao_exclusivo: 525600 }];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    const prazo = new Date(corpo.data.prazo_ate);
    const daquiUmMes = new Date(Date.now() + 31 * 86400000);
    expect(prazo.getTime()).toBeLessThan(daquiUmMes.getTime());
    expect(gravados[0].linha.detalhes.prazo_minutos).toBe(60);
  });

  it('só corretor e líder entram no rodízio — admin não', async () => {
    tabelas.tenant_memberships = [
      { user_id: 'adm', role: 'admin', permissions: {}, created_at: '2026-01-01' },
      membro('2'),
    ];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.corretor_id).toBe('2');
  });

  it('quem está bloqueado do bolsão é pulado', async () => {
    const futuro = new Date(Date.now() + 3600_000).toISOString();
    tabelas.tenant_memberships = [
      membro('1', { permissions: { bolsao_blocked_until: futuro } }),
      membro('2'),
    ];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.corretor_id).toBe('2');
  });

  it('sem ninguém disponível a resposta é "ninguem" — nunca um chute', async () => {
    tabelas.tenant_memberships = [membro('1', { permissions: { nao_recebe_leads: true } })];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data).toMatchObject({ destino: 'ninguem', corretor_id: null, prazo_ate: null });
  });

  it('a resposta diz se a consulta ficou registrada', async () => {
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.registrado).toBe(true);
  });
});

describe('POST /api/v1/distribuicao/evento', () => {
  it('a Lia consegue contar o que fez', async () => {
    const { status, corpo } = await montar().chamar('/api/v1/distribuicao/evento', {
      evento: 'enviado', corretor_id: '1', motivo: 'roleta_em_ordem', lead_id: 'L1',
    });
    expect(status).toBe(200);
    expect(corpo.success).toBe(true);
    expect(gravados[0].linha).toMatchObject({ evento: 'enviado', corretor_id: '1', tenant_id: 't1' });
  });

  it('evento fora da lista é recusado, e a mensagem diz quais valem', async () => {
    const { status, corpo } = await montar().chamar('/api/v1/distribuicao/evento', {
      evento: 'inventado', motivo: 'x',
    });
    expect(status).toBe(400);
    expect(corpo.error).toContain('enviado');
    expect(gravados.length).toBe(0);
  });

  it('evento SEM motivo é recusado — o extrato existe para responder "por quê"', async () => {
    const { status } = await montar().chamar('/api/v1/distribuicao/evento', { evento: 'enviado' });
    expect(status).toBe(400);
    expect(gravados.length).toBe(0);
  });
});


// ============================================================
// Achados da revisão de 19/09/2026.
// ============================================================
describe('curinga no código do imóvel não vira "qualquer imóvel"', () => {
  it('código com %, _, * ou barra é recusado antes de consultar o banco', async () => {
    // O PostgREST lê `*` como `%`, então escapar a barra não bastava: `\\*`
    // vira `\\%` e o curinga sobrevive. Recusar resolve a classe inteira.
    tabelas.imoveis_locais = [{ captador_id: '9' }];
    for (const codigo of ['%', '_', '*', 'AP*', 'AP%', 'AP\\_1']) {
      const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: codigo, lia_passou: true });
      expect(corpo.data.corretor_id, `curinga "${codigo}" nao pode achar captador`).not.toBe('9');
    }
  });

  it('código normal continua achando o captador', async () => {
    tabelas.imoveis_locais = [{ captador_id: '9' }];
    tabelas.tenant_memberships.push(membro('9'));
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { codigo_imovel: 'AP0961', lia_passou: true });
    expect(corpo.data.corretor_id).toBe('9');
  });
});

describe('a fila é a roleta CURADA pelo admin', () => {
  it('só quem está na roleta ativa entra no rodízio', async () => {
    // Sem isto o simulador mostraria uma fila que a tela de configuração não
    // controla — e o gestor não reconheceria o resultado.
    tabelas.roleta_participantes = [{ broker_id: '3' }];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.corretor_id).toBe('3');
  });

  it('roleta vazia = ninguém curou: valem todos os membros', async () => {
    tabelas.roleta_participantes = [];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.corretor_id).toBe('1');
  });
});


describe('o ponteiro ignora as linhas sem posição gravada', () => {
  it('lead de captador (posicao null) NÃO vira o ponteiro', async () => {
    // O extrato guarda, do mais recente para o mais antigo: uma consulta de
    // captador (sem posicao) e antes dela a roleta parada na posicao 1.
    tabelas.distribuicao_eventos = [
      { corretor_id: '9', detalhes: { posicao: null } },
      { corretor_id: '2', detalhes: { posicao: 1 } },
    ];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    // Com o ponteiro certo (1), o próximo é o terceiro da fila.
    expect(corpo.data.corretor_id).toBe('3');
  });

  it('posição ZERO é posição, não ausência', async () => {
    tabelas.distribuicao_eventos = [{ corretor_id: '1', detalhes: { posicao: 0 } }];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.corretor_id).toBe('2');
  });

  it('extrato vazio começa do primeiro', async () => {
    tabelas.distribuicao_eventos = [];
    const { corpo } = await montar().chamar('/api/v1/distribuicao/destino', { lia_passou: true });
    expect(corpo.data.corretor_id).toBe('1');
  });
});
