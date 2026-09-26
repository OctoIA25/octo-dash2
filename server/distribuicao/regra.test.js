/**
 * De quem é este lead — a regra como consulta.
 *
 * Decidido em 19/09/2026: a Lia continua distribuindo e o Octo responde. Estes
 * testes travam as quatro decisões daquele dia, e a mais importante delas é a
 * que DIVERGE do plano: captador que não atende em 1h manda o lead para a
 * ROLETA, não para o bolsão.
 */
import { describe, it, expect } from 'vitest';
import { decidirDestino, proximoDaRoleta, podeReceber, tipoDoLead, foiAtendido, expirou, atendePool, montarFila, MOTIVOS } from './regra.js';

const c = (id, extra = {}) => ({ id, ...extra });
const FILA = [c('ana'), c('bruno'), c('carla')];

describe('tipoDoLead', () => {
  it('reconhece lançamento e terceiros, com ou sem acento', () => {
    expect(tipoDoLead({ tipoImovel: 'lançamento' })).toBe('lancamento');
    expect(tipoDoLead({ tipo_imovel: 'LANCAMENTO' })).toBe('lancamento');
    expect(tipoDoLead({ tipoImovel: 'Catálogo' })).toBe('terceiros');
  });

  it('sem tipo declarado, o código do imóvel decide', () => {
    expect(tipoDoLead({ codigoImovel: 'AP0961' })).toBe('terceiros');
    expect(tipoDoLead({})).toBe('indefinido');
  });
});

describe('podeReceber', () => {
  it('pausado, no limite ou sem permissão não recebe', () => {
    expect(podeReceber(c('x'))).toBe(true);
    expect(podeReceber(c('x', { pausado: true }))).toBe(false);
    expect(podeReceber(c('x', { noLimite: true }))).toBe(false);
    expect(podeReceber(c('x', { semPermissao: true }))).toBe(false);
    expect(podeReceber(null)).toBe(false);
  });
});

describe('a roleta é rodízio em ordem, não sorteio', () => {
  it('cada um recebe na sua vez, e a fila dá a volta', () => {
    expect(proximoDaRoleta(FILA, -1).corretor.id).toBe('ana');
    expect(proximoDaRoleta(FILA, 0).corretor.id).toBe('bruno');
    expect(proximoDaRoleta(FILA, 1).corretor.id).toBe('carla');
    expect(proximoDaRoleta(FILA, 2).corretor.id).toBe('ana');
  });

  it('quem está pausado é PULADO e MANTÉM a vez', () => {
    const fila = [c('ana'), c('bruno', { pausado: true }), c('carla')];
    // Depois da Ana viria o Bruno; ele está pausado, então vai para a Carla.
    const r = proximoDaRoleta(fila, 0);
    expect(r.corretor.id).toBe('carla');
    // E o ponteiro passa a ser o da Carla — o Bruno não "gastou" a vez dele.
    expect(r.posicao).toBe(2);
  });

  it('quem está no limite de leads também é pulado', () => {
    const fila = [c('ana'), c('bruno', { noLimite: true }), c('carla')];
    expect(proximoDaRoleta(fila, 0).corretor.id).toBe('carla');
  });

  it('quem não tem permissão sai da fila, não só pula a vez', () => {
    const fila = [c('ana'), c('bruno', { semPermissao: true }), c('carla')];
    // Com o Bruno fora, a fila tem dois: depois da Ana (0) vem a Carla (1).
    expect(proximoDaRoleta(fila, 0).corretor.id).toBe('carla');
    expect(proximoDaRoleta(fila, 1).corretor.id).toBe('ana');
  });

  it('ninguém disponível devolve null, em vez de escolher quem não podia', () => {
    expect(proximoDaRoleta([c('a', { pausado: true }), c('b', { noLimite: true })], -1)).toBeNull();
    expect(proximoDaRoleta([], 0)).toBeNull();
    expect(proximoDaRoleta(null, 0)).toBeNull();
  });
});

describe('imóvel de TERCEIROS', () => {
  it('a Lia atende PRIMEIRO, mesmo tendo captador — decisão de 22/09', () => {
    // Antes desta data, lead de terceiros ia direto ao captador. Perguntado ao
    // chefe: "a LIA atende primeiro também os leads de terceiros?" — "todos
    // vão para a LIA primeiro".
    const r = decidirDestino({ lead: { codigoImovel: 'AP0961' }, captador: c('ana'), participantes: FILA });
    expect(r).toMatchObject({ destino: 'lia', corretorId: null, motivo: MOTIVOS.LIA_PRIMEIRO, tipo: 'terceiros' });
  });

  it('lead SEM tipo nenhum também espera a Lia', () => {
    const r = decidirDestino({ lead: {}, participantes: FILA });
    expect(r).toMatchObject({ destino: 'lia', motivo: MOTIVOS.LIA_PRIMEIRO, tipo: 'indefinido' });
  });

  it('depois que a Lia passa, vai para o captador do imóvel', () => {
    const r = decidirDestino({ lead: { codigoImovel: 'AP0961', liaPassou: true }, captador: c('ana'), participantes: FILA });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'ana', motivo: MOTIVOS.CAPTADOR });
  });

  it('SEM captador cadastrado vai para a roleta geral — decisão de 19/09', () => {
    // São 7 dos 29 imóveis da Lotus, medido no mesmo dia.
    const r = decidirDestino({ lead: { codigoImovel: 'AP0961', liaPassou: true }, captador: null, participantes: FILA, ultimaPosicao: 0 });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'bruno', motivo: MOTIVOS.SEM_CAPTADOR });
  });

  it('captador pausado NÃO segura o lead: ele vai para a roleta', () => {
    const r = decidirDestino({
      lead: { codigoImovel: 'AP0961', liaPassou: true },
      captador: c('ana', { pausado: true }),
      participantes: FILA,
      ultimaPosicao: 0,
    });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'bruno', motivo: MOTIVOS.CAPTADOR_INDISPONIVEL });
  });

  it('o captador NÃO consome a vez da roleta', () => {
    // Sem `posicao`, quem chama não move o ponteiro — e o próximo lead de
    // roleta continua indo para quem era a vez. Se o captador gastasse a vez
    // de alguém, um imóvel muito procurado puniria a fila inteira.
    const r = decidirDestino({ lead: { codigoImovel: 'AP0961', liaPassou: true }, captador: c('ana'), participantes: FILA });
    expect(r.posicao).toBeUndefined();
  });

  it('a roleta, essa sim, devolve a posição para o ponteiro andar', () => {
    const r = decidirDestino({ lead: { codigoImovel: 'X', liaPassou: true }, captador: null, participantes: FILA, ultimaPosicao: 0 });
    expect(r.posicao).toBe(1);
  });

  it('o motivo distingue "sem captador" de "captador indisponível"', () => {
    const sem = decidirDestino({ lead: { codigoImovel: 'X', liaPassou: true }, captador: null, participantes: FILA });
    const ind = decidirDestino({ lead: { codigoImovel: 'X', liaPassou: true }, captador: c('ana', { noLimite: true }), participantes: FILA });
    expect(sem.motivo).not.toBe(ind.motivo);
  });
});

describe('LANÇAMENTO', () => {
  it('a Lia atende primeiro — não vai para corretor nenhum', () => {
    const r = decidirDestino({ lead: { tipoImovel: 'lancamento' }, participantes: FILA });
    expect(r).toMatchObject({ destino: 'lia', corretorId: null, motivo: MOTIVOS.LIA_PRIMEIRO });
  });

  it('quando a Lia passa, entra a roleta em ordem', () => {
    const r = decidirDestino({ lead: { tipoImovel: 'lancamento', liaPassou: true }, participantes: FILA, ultimaPosicao: 1 });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'carla', motivo: MOTIVOS.ROLETA });
  });

  it('o captador do imóvel NÃO tem preferência em lançamento', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'lancamento', liaPassou: true },
      captador: c('ana'),
      participantes: FILA,
      ultimaPosicao: 0,
    });
    expect(r.corretorId).toBe('bruno');
  });
});

describe('lead que não bate em nenhuma regra', () => {
  it('cai na roleta geral', () => {
    const r = decidirDestino({ lead: { liaPassou: true }, participantes: FILA, ultimaPosicao: -1 });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'ana', tipo: 'indefinido' });
  });

  it('sem ninguém disponível, a resposta é "ninguém" — e não um chute', () => {
    const r = decidirDestino({ lead: { liaPassou: true }, participantes: [c('a', { pausado: true })] });
    expect(r).toMatchObject({ destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_CORRETOR });
  });
});

describe('"atendido" é mensagem ou atividade — não abrir a ficha', () => {
  it('mensagem enviada conta', () => {
    expect(foiAtendido({ mensagemEnviadaEm: '2026-09-19T12:00:00Z' })).toBe(true);
  });

  it('atividade agendada conta', () => {
    expect(foiAtendido({ atividadeAgendadaEm: '2026-09-19T12:00:00Z' })).toBe(true);
  });

  it('arrastar o card no kanban NÃO conta', () => {
    // Foi exatamente essa confusão que fez o tempo de resposta medir o
    // arrastar de um card em vez da conversa.
    expect(foiAtendido({ first_response_at: '2026-09-19T12:00:00Z' })).toBe(false);
    expect(foiAtendido({})).toBe(false);
    expect(foiAtendido(null)).toBe(false);
  });
});

describe('expirou', () => {
  it('compara o agora com o prazo já calculado pela janela', () => {
    const prazo = new Date('2026-09-19T13:00:00Z');
    expect(expirou({ prazo, agora: new Date('2026-09-19T12:59:00Z') })).toBe(false);
    expect(expirou({ prazo, agora: new Date('2026-09-19T13:01:00Z') })).toBe(true);
  });

  it('sem prazo válido, NÃO expira — não tira lead de ninguém por dado ruim', () => {
    expect(expirou({ prazo: null, agora: new Date() })).toBe(false);
    expect(expirou({ prazo: new Date('nada'), agora: new Date() })).toBe(false);
  });
});

// ============================================================
// Achados da revisão de 19/09/2026, cada um virando teste.
// ============================================================
describe('o ponteiro ancora em QUEM recebeu, não no índice', () => {
  it('quem entra na equipe não faz o seguinte perder a vez', () => {
    const antes = [c('ana'), c('bruno'), c('carla')];
    // Depois da Ana (posição 0) viria o Bruno.
    expect(proximoDaRoleta(antes, { posicao: 0, corretorId: 'ana' }).corretor.id).toBe('bruno');

    // Entra alguém ANTES da Ana na ordem. Pelo índice cru, a posição 0 agora é
    // o novato e o "próximo" viraria a Ana de novo.
    const depois = [c('novo'), c('ana'), c('bruno'), c('carla')];
    expect(proximoDaRoleta(depois, { posicao: 0, corretorId: 'ana' }).corretor.id).toBe('bruno');
    // E é isso que o índice sozinho faria de errado:
    expect(proximoDaRoleta(depois, 0).corretor.id).toBe('ana');
  });

  it('quando quem recebeu saiu da equipe, o índice serve de reserva', () => {
    const fila = [c('ana'), c('bruno'), c('carla')];
    expect(proximoDaRoleta(fila, { posicao: 1, corretorId: 'quem_saiu' }).corretor.id).toBe('carla');
  });

  it('continua aceitando o número cru, para quem chama do jeito antigo', () => {
    expect(proximoDaRoleta([c('ana'), c('bruno')], 0).corretor.id).toBe('bruno');
  });
});

describe('ATUAÇÃO — o defeito que fez a roleta antiga ser desligada', () => {
  // Em 14/09 a distribuição do Octo foi desligada na Lotus porque a roleta
  // mandava lead de lançamento para corretor de prontos.
  const lancamentos = c('lu', { atuacoes: ['lancamentos'] });
  const prontos = c('pe', { atuacoes: ['prontos'] });
  const tudo = c('ana');

  it('lead de LANÇAMENTO não vai para quem só atende prontos', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'lancamento', liaPassou: true },
      participantes: [prontos, lancamentos],
      ultimaPosicao: -1,
    });
    expect(r.corretorId).toBe('lu');
  });

  it('lead de TERCEIROS não vai para quem só atende lançamento', () => {
    const r = decidirDestino({
      lead: { codigoImovel: 'AP0961', liaPassou: true },
      participantes: [lancamentos, prontos],
      ultimaPosicao: -1,
    });
    expect(r.corretorId).toBe('pe');
  });

  it('quem não tem atuação declarada atende tudo — falha ABERTO', () => {
    // 111 membros da base não têm atuação gravada; fechar aqui esvaziaria a fila.
    expect(atendePool(tudo, 'lancamentos')).toBe(true);
    expect(atendePool(tudo, 'prontos')).toBe(true);
    expect(atendePool(c('x', { atuacoes: [] }), 'lancamentos')).toBe(true);
  });

  it('"prontos" cobre alugados, como no motor antigo', () => {
    expect(atendePool(c('x', { atuacoes: ['alugados'] }), 'prontos')).toBe(true);
    expect(atendePool(c('x', { atuacoes: ['alugados'] }), 'lancamentos')).toBe(false);
  });

  it('ninguém com a atuação certa devolve "ninguem", não um chute', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'lancamento', liaPassou: true },
      participantes: [prontos],
    });
    expect(r).toMatchObject({ destino: 'ninguem', corretorId: null });
  });
});

describe('montarFila — a MESMA fila para o servidor e para o simulador', () => {
  const m = (id, extra = {}) => ({ user_id: id, role: 'corretor', permissions: {}, name: `N${id}`, ...extra });

  it('só corretor e líder entram; admin fica de fora', () => {
    const fila = montarFila([m('1'), m('2', { role: 'admin' }), m('3', { role: 'team_leader' })]);
    expect(fila.map((c) => c.id)).toEqual(['1', '3']);
  });

  it('a roleta CURADA manda quando existe', () => {
    const fila = montarFila([m('1'), m('2'), m('3')], ['3']);
    expect(fila.map((c) => c.id)).toEqual(['3']);
  });

  it('roleta curada vazia = ninguém curou: valem todos', () => {
    expect(montarFila([m('1'), m('2')], []).map((c) => c.id)).toEqual(['1', '2']);
  });

  it('bloqueio do bolsão ainda válido marca pausado; vencido, não', () => {
    const agora = Date.parse('2026-09-19T12:00:00Z');
    const futuro = m('1', { permissions: { bolsao_blocked_until: '2026-09-19T13:00:00Z' } });
    const passado = m('2', { permissions: { bolsao_blocked_until: '2026-09-19T11:00:00Z' } });
    const fila = montarFila([futuro, passado], [], agora);
    expect(fila[0].pausado).toBe(true);
    expect(fila[1].pausado).toBe(false);
  });

  it('quem não recebe leads sai da fila', () => {
    const fila = montarFila([m('1', { permissions: { nao_recebe_leads: true } }), m('2')]);
    expect(fila[0].semPermissao).toBe(true);
    expect(proximoDaRoleta(fila, -1).corretor.id).toBe('2');
  });

  it('a atuação vem junto, e sem ela atende tudo', () => {
    const fila = montarFila([
      m('1', { permissions: { atuacao: 'lancamentos' } }),
      m('2', { permissions: { atuacao: 'prontos' } }),
      m('3'),
    ]);
    expect(fila[0].atuacoes).toEqual(['lancamentos']);
    expect(fila[1].atuacoes).toEqual(['prontos', 'alugados']);
    expect(fila[2].atuacoes).toEqual(['lancamentos', 'prontos', 'alugados']);
  });

  it('a ordem recebida é preservada — é a da data de entrada', () => {
    expect(montarFila([m('c'), m('a'), m('b')]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

/**
 * Os dois tipos de dono fixo (24/09).
 *
 * Pedido do chefe: "colocar a opção de lead de recrutamento (devem vir pra
 * mim) e de vendedores (deve ir para a gestora de terceiros - Mariana)".
 *
 * O que estes casos protegem não é o caminho feliz — é a OMISSÃO. Sem dono
 * configurado, o lead NÃO pode cair na roleta: cair na roleta é exatamente o
 * problema que ele pediu para resolver, e cairia calado.
 */
describe('tipos com dono fixo', () => {
  const fila = [
    { id: 'c1', nome: 'Ana', atuacao: ['lancamentos', 'prontos'] },
    { id: 'c2', nome: 'Bruno', atuacao: ['lancamentos', 'prontos'] },
  ];
  const destinos = { recrutamento: 'erick-id', vendedores: 'mariana-id' };

  it('recrutamento vai para quem está configurado, e não para a roleta', () => {
    const d = decidirDestino({
      lead: { tipoImovel: 'recrutamento', liaPassou: true },
      participantes: fila,
      destinoPorTipo: destinos,
    });
    expect(d.tipo).toBe('recrutamento');
    expect(d.destino).toBe('corretor');
    expect(d.corretorId).toBe('erick-id');
    expect(d.motivo).toBe(MOTIVOS.DONO_FIXO);
    // e não consome a vez de ninguém na fila
    expect(d.posicao).toBeUndefined();
  });

  it('vendedor vai para a gestora de terceiros', () => {
    const d = decidirDestino({
      lead: { tipoImovel: 'vendedores', liaPassou: true },
      participantes: fila,
      destinoPorTipo: destinos,
    });
    expect(d.corretorId).toBe('mariana-id');
    expect(d.motivo).toBe(MOTIVOS.DONO_FIXO);
  });

  it('SEM dono configurado, não cai na roleta — fica em ninguém, e diz por quê', () => {
    for (const tipoImovel of ['recrutamento', 'vendedores']) {
      const d = decidirDestino({
        lead: { tipoImovel, liaPassou: true },
        participantes: fila,
        destinoPorTipo: null,
      });
      expect(d.destino).toBe('ninguem');
      expect(d.motivo).toBe(MOTIVOS.SEM_DONO_FIXO);
      expect(d.corretorId).toBeNull();
    }
  });

  it('a Lia continua atendendo primeiro — "sempre passa pela mão dela"', () => {
    const d = decidirDestino({
      lead: { tipoImovel: 'recrutamento' },   // sem liaPassou
      participantes: fila,
      destinoPorTipo: destinos,
    });
    expect(d.destino).toBe('lia');
    expect(d.motivo).toBe(MOTIVOS.LIA_PRIMEIRO);
  });

  it('o dono fixo recebe mesmo pausado: pausa é da roleta, não do cargo dele', () => {
    const d = decidirDestino({
      lead: { tipoImovel: 'recrutamento', liaPassou: true },
      participantes: [{ id: 'erick-id', nome: 'Erick', pausado: true, atuacao: ['prontos'] }],
      destinoPorTipo: destinos,
    });
    expect(d.corretorId).toBe('erick-id');
  });

  it('não confunde com os tipos que continuam na roleta', () => {
    const d = decidirDestino({
      lead: { tipoImovel: 'lancamento', liaPassou: true },
      participantes: fila,
      destinoPorTipo: destinos,
    });
    expect(d.motivo).toBe(MOTIVOS.ROLETA);
    expect(['c1', 'c2']).toContain(d.corretorId);
  });

  it('aceita as grafias que alguém digitaria: proprietário conta como vendedor', () => {
    for (const t of ['vendedor', 'proprietario', 'proprietário', 'VENDEDORES']) {
      expect(tipoDoLead({ tipoImovel: t })).toBe('vendedores');
    }
  });
});

/*
 * A ROLETA DESLIGADA — achado pela equipe da Lia em 26/09.
 *
 * A Lotus está com `roleta_enabled = false` desde 14/09, e a rota respondia
 * `roleta_em_ordem` assim mesmo: uma resposta plausível e falsa, que é a pior
 * espécie. A regra não consultava a chave em ponto nenhum.
 *
 * A guarda ficou num lugar só. Os três ramos chamavam a roleta cada um por sua
 * conta, e guarda repetida três vezes é a que um ramo novo nasce sem.
 */
describe('a roleta desligada não devolve corretor', () => {
  const desligada = { participantes: FILA, ultimaPosicao: -1, roletaLigada: false };

  it.each([
    ['lancamento', { tipoImovel: 'lancamento', liaPassou: true }],
    ['terceiros sem captador', { tipoImovel: 'terceiros', liaPassou: true }],
    ['indefinido', { liaPassou: true }],
  ])('%s cai em ninguém, e o motivo diz que a roleta está desligada', (_nome, lead) => {
    const r = decidirDestino({ lead, ...desligada });
    expect(r.destino).toBe('ninguem');
    expect(r.motivo).toBe(MOTIVOS.ROLETA_DESLIGADA);
    expect(r.corretorId).toBeNull();
  });

  /*
   * O CASO QUE SUSTENTA ESTE BLOCO. "Não há fila" e "há fila e ninguém pode
   * receber" levam a decisões opostas de quem pergunta: no primeiro caso
   * ligar a roleta resolve, no segundo não. Um motivo só para os dois faria a
   * Lia tratar os dois igual.
   */
  it('desligada é diferente de ninguém disponível', () => {
    const lead = { tipoImovel: 'lancamento', liaPassou: true };
    const semNinguem = decidirDestino({ lead, participantes: [], ultimaPosicao: -1 });
    const desl = decidirDestino({ lead, ...desligada });

    expect(semNinguem.motivo).toBe(MOTIVOS.SEM_CORRETOR);
    expect(desl.motivo).toBe(MOTIVOS.ROLETA_DESLIGADA);
    expect(semNinguem.motivo).not.toBe(desl.motivo);
  });

  /*
   * Desligar a roleta não desliga o resto. O captador e o dono fixo não
   * dependem do rodízio, e barrá-los junto tiraria lead de quem tem dono
   * declarado — sem ninguém ter pedido isso.
   */
  it('o captador continua recebendo com a roleta desligada', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'terceiros', codigoImovel: 'AP0961', liaPassou: true },
      captador: c('davi'), ...desligada,
    });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'davi', motivo: MOTIVOS.CAPTADOR });
  });

  it('o dono fixo continua recebendo com a roleta desligada', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'recrutamento', liaPassou: true },
      destinoPorTipo: { recrutamento: 'elis' }, ...desligada,
    });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'elis', motivo: MOTIVOS.DONO_FIXO });
  });

  /*
   * Ausência de configuração vale LIGADA. A coluna é NOT NULL DEFAULT true e
   * 5 das 9 imobiliárias não têm linha em `tenant_bolsao_config`: tratar
   * ausência como desligada apagaria o rodízio delas de uma vez.
   */
  it('sem a chave, a roleta continua ligada', () => {
    const lead = { tipoImovel: 'lancamento', liaPassou: true };
    expect(decidirDestino({ lead, participantes: FILA, ultimaPosicao: -1 }).motivo).toBe(MOTIVOS.ROLETA);
    expect(decidirDestino({ lead, participantes: FILA, ultimaPosicao: -1, roletaLigada: undefined }).motivo)
      .toBe(MOTIVOS.ROLETA);
  });

  it('a roleta ligada segue como antes, inclusive a posição', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'lancamento', liaPassou: true },
      participantes: FILA, ultimaPosicao: 0, roletaLigada: true,
    });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'bruno', posicao: 1, motivo: MOTIVOS.ROLETA });
  });
});
