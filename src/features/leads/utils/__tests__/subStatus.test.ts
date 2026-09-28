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

/*
 * A DONA É A PRÓPRIA LIA — pedido da equipe da LIA em 28/09/2026.
 *
 * Desde 17/09 todo lead novo da Lotus nasce com a conta da Lia como dona no
 * CRM. Medido em produção: 77 leads ativos assim, todos mostrando "Com o
 * corretor" com o nome "Lia" embaixo, e contados como atendidos por gente no
 * gráfico por equipe.
 */
describe('quando a dona do lead é a própria Lia', () => {
  it('vence o "tem corretor" — é o caso dos 77 cards', () => {
    expect(subStatusDoLead('Lia', false, true, true)).toBe('com_lia');
  });

  /*
   * O CASO QUE SUSTENTA O ARQUIVO. 76 dos 77 já têm `lia.lead_distribuido`
   * ("a Lia atribuiu o lead à Lia"), que a regra lê como "a Lia passou".
   * Sem a pergunta ZERO eles cairiam em "Aguardando corretor" — e o gestor
   * iria cobrar uma entrega que não é devida.
   */
  it('vence também o "a Lia passou", que é o caso de 76 dos 77', () => {
    expect(subStatusDoLead('Lia', true, true, true)).toBe('com_lia');
  });

  it('o selo aparece no card — "Com o corretor" é o único que não ganha selo', () => {
    const selo = seloDeSubStatus('Lia', true, true, true);
    expect(selo?.estado).toBe('com_lia');
    expect(selo?.texto).toBe('Com a Lia');
  });

  it('sem a marca, nada muda: corretor de verdade segue com o lead', () => {
    expect(subStatusDoLead('Mariana Mamede', true, true, false)).toBe('com_corretor');
    // Ausente é o mesmo que falso: casa sem assistente cadastrado.
    expect(subStatusDoLead('Mariana Mamede', true, true)).toBe('com_corretor');
  });

  /*
   * A tela NÃO decide quem é a Lia. Se um dia alguém tentar por nome, este
   * caso quebra: é a mesma confusão de identidade do P0.2, onde a mesma
   * pessoa aparecia como texto em quatro grafias.
   */
  it('não é pelo nome: uma corretora chamada Lia continua sendo corretora', () => {
    expect(subStatusDoLead('Lia', false, false, false)).toBe('com_corretor');
  });
});
