/**
 * Plantão da LIA (P2.4) — funções puras.
 *
 * As perguntas dos casos são REAIS, copiadas do plantão de produção. Um
 * classificador validado só contra frase inventada acerta a frase inventada:
 * medido contra as 1.540 perguntas reais, este deixa 4,7% em "Outros".
 */

import { describe, it, expect } from 'vitest';
import {
  agruparPorTema, esperaDe, quemRecebeu, temaDaPergunta, tempoDeResposta,
  textoDaEspera, type PerguntaDoPlantao,
} from './plantao';

const base = (over: Partial<PerguntaDoPlantao> = {}): PerguntaDoPlantao => ({
  id: 'x',
  pergunta: 'pergunta',
  contexto: null,
  status: 'respondida',
  criado_em: '2026-09-20T10:00:00Z',
  respondida_em: '2026-09-20T11:00:00Z',
  resposta: 'resposta',
  nudges: 0,
  lead_id: null,
  lead_nome: null,
  corretor_id: null,
  corretor_nome: null,
  corretor_email: null,
  empreendimento_id: null,
  empreendimento_nome: null,
  kb_documento_id: null,
  aprovada_para_base: false,
  aprovada_em: null,
  fora_do_canal: false,
  ...over,
});

describe('temaDaPergunta', () => {
  it('classifica perguntas reais do plantão', () => {
    expect(temaDaPergunta('Cliente quer saber se o apartamento AP1191 tem elevador')).toBe('estrutura');
    expect(temaDaPergunta('Cliente só consegue visita hoje à tarde')).toBe('visita');
    expect(temaDaPergunta('Cliente pediu o endereço exato (rua e número) da casa')).toBe('localizacao');
    expect(temaDaPergunta('Cliente quer saber se a casa CA0688 está ocupada atualmente')).toBe('disponibilidade');
    expect(temaDaPergunta('Aceita pet de grande porte?')).toBe('pet');
    expect(temaDaPergunta('Qual o valor do condomínio e do IPTU?')).toBe('condominio');
  });

  it('não depende de acento nem de caixa', () => {
    expect(temaDaPergunta('QUAL O HORARIO DE VISITA?')).toBe('visita');
    expect(temaDaPergunta('qual o horário de visita?')).toBe('visita');
  });

  it('usa o contexto quando a pergunta sozinha não diz', () => {
    expect(temaDaPergunta('Pode confirmar?', 'Cliente perguntou se aceita pet')).toBe('pet');
  });

  it('o mais específico ganha: pet antes de contrato', () => {
    // "aceita" aparece nos dois; a ordem das regras é que decide.
    expect(temaDaPergunta('O contrato aceita pet?')).toBe('pet');
  });

  it('o que não casa é "outros", e outros é informação', () => {
    expect(temaDaPergunta('Cliente mandou um áudio pedindo retorno')).toBe('outros');
  });

  /**
   * Encontrado no navegador: "tem elevador?" caiu em "Chaves e acesso" porque o
   * contexto dizia "Parque Eloy Chaves" — um bairro de Jundiaí. Medido em
   * produção, 135 das 204 perguntas que casavam "chave" eram esse bairro, e as
   * outras eram o bairro Almerinda Chaves e o portal Chaves na Mão. O tema foi
   * removido; estes casos existem para ele não voltar.
   */
  it('nome de bairro não vira assunto — "Eloy Chaves" não é sobre chave', () => {
    expect(
      temaDaPergunta(
        'Cliente quer saber se o apartamento tem elevador',
        'Fabi procura locação até R$ 2.000 no Eloy Chaves'
      )
    ).toBe('estrutura');
    expect(temaDaPergunta('Confirmar disponibilidade', 'lead veio do portal Chaves na Mão')).toBe(
      'disponibilidade'
    );
  });

  it('portaria e porteiro são acesso para a visita', () => {
    expect(temaDaPergunta('Quem abre a portaria no domingo?')).toBe('visita');
  });
});

describe('agruparPorTema', () => {
  it('ordena do mais perguntado ao menos', () => {
    const g = agruparPorTema([
      base({ id: '1', pergunta: 'qual o horário de visita?' }),
      base({ id: '2', pergunta: 'dá pra visitar amanhã?' }),
      base({ id: '3', pergunta: 'aceita pet?' }),
    ]);
    expect(g[0].tema).toBe('visita');
    expect(g[0].total).toBe(2);
    expect(g[1].tema).toBe('pet');
  });

  it('não oferece para ensinar o que já está na base', () => {
    const g = agruparPorTema([
      base({ id: '1', pergunta: 'aceita pet?', aprovada_para_base: true }),
    ]);
    expect(g[0].total).toBe(1);
    expect(g[0].naBase).toBe(1);
    expect(g[0].ensinaveis).toHaveLength(0);
  });

  it('não oferece para ensinar "resolvida fora do canal"', () => {
    // São 331 das 1.540 reais. Salvar uma ensinaria a LIA a responder
    // "resolvida fora do canal" ao próximo cliente.
    const g = agruparPorTema([
      base({
        id: '1',
        pergunta: 'aceita pet?',
        fora_do_canal: true,
        resposta: '[resolvida fora do canal] Corretor falou direto',
      }),
    ]);
    expect(g[0].total).toBe(1);
    expect(g[0].ensinaveis).toHaveLength(0);
  });

  it('não oferece para ensinar o que ainda não foi respondido', () => {
    const g = agruparPorTema([
      base({ id: '1', pergunta: 'aceita pet?', status: 'pendente', resposta: null, respondida_em: null }),
    ]);
    expect(g[0].ensinaveis).toHaveLength(0);
  });
});

describe('esperaDe', () => {
  const agora = Date.parse('2026-09-20T12:00:00Z');

  it('conta os minutos e não estoura antes da régua', () => {
    const e = esperaDe('2026-09-20T11:45:00Z', 30, agora);
    expect(e?.minutos).toBe(15);
    expect(e?.estourou).toBe(false);
  });

  it('estoura quando passa da régua', () => {
    const e = esperaDe('2026-09-20T11:00:00Z', 30, agora);
    expect(e?.minutos).toBe(60);
    expect(e?.estourou).toBe(true);
    expect(e?.classe).toContain('rose');
  });

  it('avisa em âmbar quando está perto de estourar', () => {
    const e = esperaDe('2026-09-20T11:35:00Z', 30, agora); // 25 de 30
    expect(e?.estourou).toBe(false);
    expect(e?.classe).toContain('amber');
  });

  it('data inválida não vira alarme vermelho de 20.000 dias', () => {
    expect(esperaDe('não é data', 30, agora)).toBeNull();
    expect(esperaDe(null, 30, agora)).toBeNull();
  });

  it('data no futuro não vira espera negativa', () => {
    expect(esperaDe('2026-09-20T13:00:00Z', 30, agora)?.minutos).toBe(0);
  });
});

describe('textoDaEspera', () => {
  it('fala em minutos, horas e dias conforme o tamanho', () => {
    expect(textoDaEspera(0)).toBe('agora mesmo');
    expect(textoDaEspera(12)).toBe('há 12 min');
    expect(textoDaEspera(60)).toBe('há 1h');
    expect(textoDaEspera(163)).toBe('há 2h43'); // a mediana real do plantão
    expect(textoDaEspera(60 * 24 * 3)).toBe('há 3 dias');
  });
});

describe('tempoDeResposta', () => {
  it('diz quanto o corretor levou', () => {
    expect(tempoDeResposta(base())).toBe('em 1h');
  });

  it('é nulo enquanto não respondeu', () => {
    expect(tempoDeResposta(base({ respondida_em: null }))).toBeNull();
  });

  it('ignora o relógio invertido do n8n em vez de mostrar tempo negativo', () => {
    expect(
      tempoDeResposta(base({ criado_em: '2026-09-20T11:00:00Z', respondida_em: '2026-09-20T10:00:00Z' }))
    ).toBeNull();
  });
});

describe('quemRecebeu', () => {
  it('prefere o nome, cai no e-mail, e nunca mostra UUID', () => {
    expect(quemRecebeu(base({ corretor_nome: 'Ana', corretor_email: 'a@b.c' }))).toBe('Ana');
    expect(quemRecebeu(base({ corretor_nome: '  ', corretor_email: 'a@b.c' }))).toBe('a@b.c');
    expect(quemRecebeu(base({ corretor_id: '44f2af74-aa13-49f0-836a-f9ca03e5854b' }))).toBe(
      'sem corretor definido'
    );
  });
});
