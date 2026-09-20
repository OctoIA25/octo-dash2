/**
 * Filtro da lista de conversas — a única regra da tela que ESCONDE conversa.
 * Cobre o cruzamento categoria × busca e o caso 'Sem categoria'.
 */
import { describe, expect, it } from 'vitest';
import { filtrarConversas } from './ConversationList';
import type { WhatsappConversation } from '../types';

const conversa = (over: Partial<WhatsappConversation>): WhatsappConversation =>
  ({
    id: over.id ?? '1',
    tenant_id: 't1',
    contact_phone: '5511988887777',
    contact_name: null,
    contact_profile_name: null,
    last_message_preview: null,
    last_message_at: null,
    unread_count: 0,
    assigned_user_id: null,
    lead_id: null,
    category: null,
    archived_at: null,
    created_at: '2026-08-23T00:00:00Z',
    updated_at: '2026-08-23T00:00:00Z',
    ...over,
  }) as WhatsappConversation;

const lista = [
  conversa({ id: 'c1', contact_name: 'Ana Compradora', category: 'comprador' }),
  conversa({ id: 'c2', contact_name: 'Beto Vendedor', category: 'vendedor' }),
  conversa({ id: 'c3', contact_name: 'Carla Locação', category: 'locacao' }),
  conversa({ id: 'c4', contact_name: 'Davi Corretor', category: 'corretor' }),
  conversa({ id: 'c5', contact_name: 'Elza Sem Categoria', contact_phone: '5511911112222' }),
];

const ids = (r: WhatsappConversation[]) => r.map((c) => c.id);

describe('filtrarConversas', () => {
  it('sem filtro nem busca devolve tudo', () => {
    expect(ids(filtrarConversas(lista, '', 'todas'))).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('filtra por cada categoria', () => {
    expect(ids(filtrarConversas(lista, '', 'comprador'))).toEqual(['c1']);
    expect(ids(filtrarConversas(lista, '', 'vendedor'))).toEqual(['c2']);
    expect(ids(filtrarConversas(lista, '', 'locacao'))).toEqual(['c3']);
    expect(ids(filtrarConversas(lista, '', 'corretor'))).toEqual(['c4']);
  });

  it("'sem' traz só as não categorizadas", () => {
    expect(ids(filtrarConversas(lista, '', 'sem'))).toEqual(['c5']);
  });

  it('busca continua valendo por nome e telefone, combinada com a categoria', () => {
    expect(ids(filtrarConversas(lista, 'beto', 'todas'))).toEqual(['c2']);
    expect(ids(filtrarConversas(lista, '911112222', 'todas'))).toEqual(['c5']);
    expect(ids(filtrarConversas(lista, 'beto', 'comprador'))).toEqual([]);
  });
});

// ============================================================
// Os recortes novos (P1.9): Meus clientes, Não lidas, Recrutamento e a busca
// dentro do conteúdo das mensagens.
// ============================================================
import { naoLida, type ExtrasDaConversa } from './ConversationList';

const EU = 'user-eu';
const c = (over: Partial<WhatsappConversation>) => conversa(over);

describe('não lida é POR USUÁRIO', () => {
  const comMensagem = c({ id: 'x', last_message_at: '2026-09-20T10:00:00Z' });

  it('nunca aberta por mim é não lida', () => {
    expect(naoLida(comMensagem, {})).toBe(true);
    expect(naoLida(comMensagem, undefined)).toBe(true);
  });

  it('aberta por mim DEPOIS da última mensagem é lida', () => {
    expect(naoLida(comMensagem, { lidaEm: '2026-09-20T11:00:00Z' })).toBe(false);
  });

  it('aberta por mim ANTES da última mensagem volta a ser não lida', () => {
    // É o caso que importa: eu li, o cliente respondeu, preciso ver de novo.
    expect(naoLida(comMensagem, { lidaEm: '2026-09-20T09:00:00Z' })).toBe(true);
  });

  it('conversa SEM mensagem nenhuma nunca é não lida', () => {
    // São 1.279 cascas na Lotus — conversas criadas e nunca usadas. Contá-las
    // encheria o contador de nada e o gestor pararia de olhar para ele.
    expect(naoLida(c({ id: 'y', last_message_at: null }), {})).toBe(false);
  });
});

describe('recortes da tela', () => {
  const lista2 = [
    c({ id: 'meu', assigned_user_id: EU, last_message_at: '2026-09-20T10:00:00Z' }),
    c({ id: 'outro', assigned_user_id: 'user-outro', last_message_at: '2026-09-20T10:00:00Z' }),
    c({ id: 'cand', assigned_user_id: null, last_message_at: '2026-09-20T10:00:00Z' }),
  ];
  const extras: Record<string, ExtrasDaConversa> = {
    meu: { lidaEm: '2026-09-20T12:00:00Z' },
    cand: { ehRecrutamento: true },
  };

  it('"Meus clientes" traz só o que é meu', () => {
    const r = filtrarConversas(lista2, '', { categoria: 'todas', apenasMeus: true, meuUserId: EU }, extras);
    expect(r.map((x) => x.id)).toEqual(['meu']);
  });

  it('"Meus clientes" sem saber quem sou eu não traz tudo por engano', () => {
    // Fail-closed: mostrar a lista inteira rotulada "Meus clientes" seria
    // pior do que mostrar vazio.
    const r = filtrarConversas(lista2, '', { categoria: 'todas', apenasMeus: true, meuUserId: null }, extras);
    expect(r).toEqual([]);
  });

  it('"Não lidas" tira a que eu já abri', () => {
    const r = filtrarConversas(lista2, '', { categoria: 'todas', apenasNaoLidas: true }, extras);
    expect(r.map((x) => x.id)).toEqual(['outro', 'cand']);
  });

  it('Recrutamento traz só conversa de candidato', () => {
    const r = filtrarConversas(lista2, '', { categoria: 'todas', apenasRecrutamento: true }, extras);
    expect(r.map((x) => x.id)).toEqual(['cand']);
  });

  it('os recortes se combinam, sem um anular o outro', () => {
    const r = filtrarConversas(
      lista2, '', { categoria: 'todas', apenasMeus: true, meuUserId: EU, apenasNaoLidas: true }, extras
    );
    expect(r).toEqual([]); // a minha está lida
  });
});

describe('busca dentro do conteúdo das mensagens', () => {
  const lista3 = [
    c({ id: 'nome', contact_name: 'Santa Clara' }),
    c({ id: 'conteudo', contact_name: 'Zulmira' }),
    c({ id: 'fora', contact_name: 'Ninguém' }),
  ];

  it('conversa que casa pelo CONTEÚDO entra, mesmo sem casar pelo nome', () => {
    const r = filtrarConversas(lista3, 'santa ang', { categoria: 'todas', idsPorConteudo: new Set(['conteudo']) });
    expect(r.map((x) => x.id)).toEqual(['conteudo']);
  });

  it('sem busca por conteúdo, quem casa pelo nome continua aparecendo', () => {
    // `undefined` = não houve busca no servidor. Tratá-lo como conjunto vazio
    // esconderia as conversas que casam pelo nome enquanto a busca carrega.
    const r = filtrarConversas(lista3, 'santa', { categoria: 'todas', idsPorConteudo: undefined });
    expect(r.map((x) => x.id)).toEqual(['nome']);
  });

  it('busca com conteúdo NÃO esconde quem casa pelo nome', () => {
    const r = filtrarConversas(lista3, 'santa', { categoria: 'todas', idsPorConteudo: new Set(['conteudo']) });
    expect(r.map((x) => x.id).sort()).toEqual(['conteudo', 'nome']);
  });

  it('telefone digitado com formatação acha o número guardado sem ela', () => {
    const r = filtrarConversas([c({ id: 'tel', contact_phone: '5511988887777' })], '(11) 98888', { categoria: 'todas' });
    expect(r.map((x) => x.id)).toEqual(['tel']);
  });
});
