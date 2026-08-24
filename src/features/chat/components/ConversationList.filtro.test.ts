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
