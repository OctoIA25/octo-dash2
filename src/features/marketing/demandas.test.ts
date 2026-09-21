/**
 * Kanban de demandas de marketing (P3.7).
 *
 * Os casos que carregam o arquivo são os de aviso: ninguém é notificado da
 * própria ação. Receber notificação do que você acabou de fazer é a forma mais
 * rápida de ensinar alguém a ignorar notificação.
 */

import { describe, it, expect } from 'vitest';
import {
  avisoDeAprovacao, diasAte, estaAtrasada, faltaParaPedir, pedidoParaOCaio,
  porColuna, quemAvisar, textoDoPrazo, type Demanda,
} from './demandas';

const HOJE = '2026-09-21';

const demanda = (over: Partial<Demanda> = {}): Demanda => ({
  id: 'd1',
  titulo: 'Post do Gioviale',
  tipo: 'post',
  status: 'solicitado',
  prioridade: 'media',
  prazo: '2026-09-30',
  ordem: 0,
  objetivo: '',
  publico: '',
  formato: '',
  texto_base: '',
  referencias: [],
  anexos: [],
  lancamento_id: null,
  empreendimento: null,
  solicitante_id: 'u-ana',
  solicitante: 'Ana',
  responsavel_id: null,
  responsavel: null,
  criada_em: '2026-09-20T12:00:00Z',
  ...over,
});

describe('estaAtrasada', () => {
  it('prazo vencido com trabalho em aberto é atraso', () => {
    expect(estaAtrasada({ prazo: '2026-09-20', status: 'producao' }, HOJE)).toBe(true);
  });

  /**
   * Depois de pronta, prazo vencido é história. Pintar de vermelho faria o
   * quadro parecer em chamas por trabalho que já saiu.
   */
  it('publicada e aprovada não ficam vermelhas', () => {
    expect(estaAtrasada({ prazo: '2026-01-01', status: 'publicado' }, HOJE)).toBe(false);
    expect(estaAtrasada({ prazo: '2026-01-01', status: 'aprovado' }, HOJE)).toBe(false);
  });

  it('vencer hoje ainda não é atraso', () => {
    expect(estaAtrasada({ prazo: HOJE, status: 'producao' }, HOJE)).toBe(false);
  });
});

describe('diasAte e textoDoPrazo', () => {
  it('conta os dias sem deixar o fuso mexer', () => {
    expect(diasAte('2026-09-30', HOJE)).toBe(9);
    expect(diasAte('2026-09-21', HOJE)).toBe(0);
    expect(diasAte('2026-09-18', HOJE)).toBe(-3);
    // Atravessando o mês e o ano.
    expect(diasAte('2026-10-01', '2026-09-30')).toBe(1);
    expect(diasAte('2027-01-01', '2026-12-31')).toBe(1);
  });

  it('fala em português, e no singular quando é um só', () => {
    expect(textoDoPrazo({ prazo: '2026-09-18', status: 'producao' }, HOJE)).toBe('3 dias atrasada');
    expect(textoDoPrazo({ prazo: '2026-09-20', status: 'producao' }, HOJE)).toBe('1 dia atrasada');
    expect(textoDoPrazo({ prazo: HOJE, status: 'producao' }, HOJE)).toBe('vence hoje');
    expect(textoDoPrazo({ prazo: '2026-09-22', status: 'producao' }, HOJE)).toBe('vence amanhã');
    expect(textoDoPrazo({ prazo: '2026-09-30', status: 'producao' }, HOJE)).toBe('em 9 dias');
  });

  it('publicada não fala de prazo', () => {
    expect(textoDoPrazo({ prazo: '2026-01-01', status: 'publicado' }, HOJE)).toBe('publicado');
  });
});

describe('faltaParaPedir', () => {
  it('título e prazo são o mínimo', () => {
    expect(faltaParaPedir({})).toEqual(['título', 'prazo']);
    expect(faltaParaPedir({ titulo: 'Post', prazo: '2026-10-01' })).toEqual([]);
    expect(faltaParaPedir({ titulo: '   ', prazo: '2026-10-01' })).toEqual(['título']);
  });

  /**
   * Objetivo e público NÃO travam o pedido de propósito. Quem pede às vezes só
   * sabe "quero um post do Gioviale"; exigir o briefing completo faria a
   * pessoa desistir e mandar por WhatsApp — que é o que o quadro existe para
   * acabar.
   */
  it('não exige o briefing inteiro', () => {
    expect(faltaParaPedir({ titulo: 'Post do Gioviale', prazo: '2026-10-01' })).toEqual([]);
  });
});

describe('pedidoParaOCaio', () => {
  it('monta o pedido com o que existe', () => {
    const p = pedidoParaOCaio(demanda({
      titulo: 'Lançamento Gioviale',
      empreendimento: 'Gioviale',
      objetivo: 'Gerar visitas',
      publico: 'Famílias de Jundiaí',
      tipo: 'reels',
    }));
    expect(p).toContain('Tipo: Reels');
    expect(p).toContain('Tema: Lançamento Gioviale');
    expect(p).toContain('Empreendimento: Gioviale');
    expect(p).toContain('Objetivo: Gerar visitas');
    expect(p).toContain('Público: Famílias de Jundiaí');
  });

  /** "Público: (vazio)" ensinaria a IA a ignorar o campo. */
  it('campo em branco não entra no texto', () => {
    const p = pedidoParaOCaio(demanda({ titulo: 'Post', objetivo: '', publico: '   ' }));
    expect(p).not.toContain('Objetivo:');
    expect(p).not.toContain('Público:');
    expect(p).toContain('Tema: Post');
  });
});

describe('porColuna', () => {
  it('separa nas seis colunas e respeita a ordem', () => {
    const r = porColuna([
      demanda({ id: 'a', status: 'producao', ordem: 2 }),
      demanda({ id: 'b', status: 'producao', ordem: 1 }),
      demanda({ id: 'c', status: 'solicitado' }),
    ]);
    expect(r.producao.map((d) => d.id)).toEqual(['b', 'a']);
    expect(r.solicitado.map((d) => d.id)).toEqual(['c']);
    expect(r.publicado).toEqual([]);
  });

  it('empate na ordem desempata pelo prazo mais apertado', () => {
    const r = porColuna([
      demanda({ id: 'a', status: 'briefing', ordem: 0, prazo: '2026-10-10' }),
      demanda({ id: 'b', status: 'briefing', ordem: 0, prazo: '2026-09-25' }),
    ]);
    expect(r.briefing.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('lista vazia não quebra', () => {
    expect(porColuna([]).solicitado).toEqual([]);
  });
});

describe('quemAvisar', () => {
  it('avisa quem recebeu a demanda', () => {
    const a = quemAvisar(
      { status: 'solicitado', responsavel_id: null },
      { status: 'briefing', responsavel_id: 'u-bruno', titulo: 'Post do Gioviale' },
      'u-gestor'
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ userId: 'u-bruno' });
    expect(a[0].corpo).toContain('Post do Gioviale');
  });

  /**
   * Ninguém é avisado da própria ação. Quem se atribui a demanda já sabe que a
   * pegou — a notificação só ensina a ignorar notificação.
   */
  it('quem se atribuiu não recebe aviso', () => {
    expect(quemAvisar(
      { status: 'solicitado', responsavel_id: null },
      { status: 'briefing', responsavel_id: 'u-bruno', titulo: 'Post' },
      'u-bruno'
    )).toEqual([]);
  });

  it('responsável que não mudou não é avisado de novo', () => {
    expect(quemAvisar(
      { status: 'briefing', responsavel_id: 'u-bruno' },
      { status: 'producao', responsavel_id: 'u-bruno', titulo: 'Post' },
      'u-gestor'
    )).toEqual([]);
  });
});

describe('avisoDeAprovacao', () => {
  it('avisa quem pediu quando a peça é aprovada', () => {
    const a = avisoDeAprovacao(
      { status: 'revisao' },
      { status: 'aprovado', titulo: 'Post do Gioviale', solicitante_id: 'u-ana' },
      'u-gestor'
    );
    expect(a?.userId).toBe('u-ana');
    expect(a?.corpo).toContain('Post do Gioviale');
  });

  it('não avisa quem aprovou a própria demanda', () => {
    expect(avisoDeAprovacao(
      { status: 'revisao' },
      { status: 'aprovado', titulo: 'Post', solicitante_id: 'u-ana' },
      'u-ana'
    )).toBeNull();
  });

  /** Voltar para aprovado depois de publicado não é uma aprovação nova. */
  it('só a passagem PARA aprovado conta', () => {
    expect(avisoDeAprovacao(
      { status: 'aprovado' },
      { status: 'aprovado', titulo: 'Post', solicitante_id: 'u-ana' },
      'u-gestor'
    )).toBeNull();
    expect(avisoDeAprovacao(
      { status: 'revisao' },
      { status: 'producao', titulo: 'Post', solicitante_id: 'u-ana' },
      'u-gestor'
    )).toBeNull();
  });
});
