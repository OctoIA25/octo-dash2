/**
 * O sub-status do atendimento: de quem é a bola.
 *
 * O caso que estes testes existem para travar é o do "Não atribuído": o campo
 * de corretor NUNCA chega vazio nesta base — quando não há corretor, o
 * sistema grava essa frase. Um teste do tipo "tem nome preenchido?" responde
 * sim para todo mundo, e foi exatamente assim que o card "Encaminhados Aos
 * Corretores" anunciou 2.553 leads encaminhados numa imobiliária onde nenhum
 * lead tem corretor.
 */
import { describe, it, expect } from 'vitest';
import { subStatusDoLead, seloDeSubStatus, temCorretor } from '../subStatus';

describe('"Não atribuído" não é um corretor', () => {
  it.each(['Não atribuído', 'não atribuído', 'NÃO ATRIBUÍDO', '  Não atribuído  '])(
    'recusa %s',
    (nome) => expect(temCorretor(nome)).toBe(false)
  );

  it('recusa vazio, espaço e nulo', () => {
    expect(temCorretor('')).toBe(false);
    expect(temCorretor('   ')).toBe(false);
    expect(temCorretor(null)).toBe(false);
    expect(temCorretor(undefined)).toBe(false);
  });

  it('aceita uma pessoa de verdade', () => {
    expect(temCorretor('ana.corretora@e2e.dev')).toBe(true);
    expect(temCorretor('FABIO GONCALVES')).toBe(true);
  });
});

describe('a ordem das perguntas é a decisão', () => {
  it('ter corretor vence tudo — inclusive a Lia ter passado', () => {
    // Um lead que a Lia passou E que já tem corretor está COM O CORRETOR.
    // Chamá-lo de "aguardando" faria o gestor cobrar uma entrega já feita.
    expect(subStatusDoLead('ana@octo.dev', true, true)).toBe('com_corretor');
  });

  it('sem corretor, mas a Lia passou: aguardando corretor', () => {
    expect(subStatusDoLead('Não atribuído', true, true)).toBe('aguardando_corretor');
  });

  it('sem corretor e a Lia só atendeu: com a Lia', () => {
    expect(subStatusDoLead(null, false, true)).toBe('com_lia');
  });

  it('sem corretor e sem Lia: sem ninguém', () => {
    expect(subStatusDoLead(null, false, false)).toBe('sem_ninguem');
  });

  it('sem informação da Lia não vira "com a Lia" por acidente', () => {
    // O lead que não tem linha no banco chega com os dois indefinidos. O
    // estado honesto é "sem ninguém", não "a Lia está cuidando".
    expect(subStatusDoLead(null, undefined, undefined)).toBe('sem_ninguem');
  });
});

describe('o selo no card', () => {
  it('"com o corretor" NÃO desenha selo — o nome já está no card', () => {
    expect(seloDeSubStatus('ana@octo.dev', true, true)).toBeNull();
  });

  it('os outros três desenham, cada um com cor própria', () => {
    const selos = [
      seloDeSubStatus(null, true, true),
      seloDeSubStatus(null, false, true),
      seloDeSubStatus(null, false, false),
    ];
    expect(selos.every((s) => s !== null)).toBe(true);
    expect(new Set(selos.map((s) => s!.classe)).size).toBe(3);
    expect(new Set(selos.map((s) => s!.texto)).size).toBe(3);
  });

  it('cada selo se explica, sem jargão de banco', () => {
    for (const s of [seloDeSubStatus(null, true, true), seloDeSubStatus(null, false, true)]) {
      expect(s!.explicacao.length).toBeGreaterThan(20);
      expect(s!.explicacao).not.toMatch(/lia_passou|handoff|null|undefined/);
    }
  });
});
