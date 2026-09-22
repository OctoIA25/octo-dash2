import { describe, expect, it } from 'vitest';
import {
  comoFoiLida, mapaEmLista, nivelSeguro, podeCriarTarefas, porQueNaoPodeCriar,
  resumoDaAta, semResponsavel, tarefasVivas,
} from './atas';
import type { Ata, AtaNaLista, TarefaDaAta } from './atasService';

const tarefa = (o: Partial<TarefaDaAta> = {}): TarefaDaAta => ({
  id: 't1', descricao: 'Mandar a proposta', responsavel_texto: 'a Ana',
  responsavel_email: null, prazo: null, descartada: false, na_agenda: false, ...o,
});

const ata = (o: Partial<Ata> = {}): Ata => ({
  id: 'a1', titulo: 'Reunião', data_reuniao: '2026-09-21', participantes: [],
  resumo: '', decisoes: [], riscos: [], mapa: [], status: 'lida', lido_por: 'ia',
  erro_leitura: '', tarefas_criadas_em: null, equipe: '', lead_id: null,
  transcricao: '', tarefas: [], ...o,
});

describe('quais tarefas contam', () => {
  it('a descartada na revisão não conta', () => {
    expect(tarefasVivas([tarefa(), tarefa({ id: 't2', descartada: true })])).toHaveLength(1);
  });

  it('aguenta lista vazia e nula', () => {
    expect(tarefasVivas(null)).toEqual([]);
    expect(tarefasVivas(undefined)).toEqual([]);
  });
});

describe('quem ainda não foi apontado', () => {
  // "a Ana" é uma palavra, não uma pessoa. É esta distinção que o item inteiro
  // protege: criar tarefa a partir de palavra é criar tarefa para ninguém.
  it('o que a transcrição disse NÃO conta como responsável', () => {
    expect(semResponsavel([tarefa({ responsavel_texto: 'a Ana' })])).toHaveLength(1);
  });

  it('só o e-mail apontado por uma pessoa conta', () => {
    expect(semResponsavel([tarefa({ responsavel_email: 'ana@x.dev' })])).toHaveLength(0);
  });

  it('a que já está na agenda saiu da fila', () => {
    expect(semResponsavel([tarefa({ na_agenda: true })])).toHaveLength(0);
  });

  it('a descartada não cobra responsável', () => {
    expect(semResponsavel([tarefa({ descartada: true })])).toHaveLength(0);
  });
});

describe('se dá para criar as tarefas', () => {
  it('não, enquanto faltar apontar alguém', () => {
    expect(podeCriarTarefas(ata({ tarefas: [tarefa()] }))).toBe(false);
  });

  it('sim, quando todas têm dono', () => {
    expect(podeCriarTarefas(ata({ tarefas: [tarefa({ responsavel_email: 'ana@x.dev' })] }))).toBe(true);
  });

  it('não, se já foram criadas', () => {
    expect(podeCriarTarefas(ata({
      tarefas: [tarefa({ responsavel_email: 'ana@x.dev', na_agenda: true })],
      tarefas_criadas_em: '2026-09-21T10:00:00Z',
    }))).toBe(false);
  });

  it('não, numa ata sem tarefa nenhuma', () => {
    expect(podeCriarTarefas(ata({ tarefas: [] }))).toBe(false);
  });
});

describe('por que o botão está desligado', () => {
  // Botão cinza sem explicação é a forma mais comum de alguém concluir que o
  // sistema quebrou.
  it('diz QUEM falta apontar, usando o que a transcrição chamou', () => {
    const t = porQueNaoPodeCriar(ata({ tarefas: [tarefa({ responsavel_texto: 'a Ana' })] }));
    expect(t).toBe('Falta apontar quem é: a Ana.');
  });

  it('cai na descrição quando a transcrição não disse responsável', () => {
    expect(porQueNaoPodeCriar(ata({ tarefas: [tarefa({ responsavel_texto: '' })] })))
      .toBe('Falta apontar quem é: Mandar a proposta.');
  });

  it('resume quando são muitas, em vez de despejar a lista inteira', () => {
    const muitas = Array.from({ length: 5 }, (_, i) =>
      tarefa({ id: `t${i}`, responsavel_texto: `Pessoa ${i}` }));
    expect(porQueNaoPodeCriar(ata({ tarefas: muitas })))
      .toBe('Falta apontar quem é: Pessoa 0; Pessoa 1; Pessoa 2 e mais 2.');
  });

  it('cala quando dá para criar', () => {
    expect(porQueNaoPodeCriar(ata({ tarefas: [tarefa({ responsavel_email: 'a@x.dev' })] }))).toBeNull();
  });

  it('explica a ata já criada e a ata sem tarefa', () => {
    expect(porQueNaoPodeCriar(ata({ tarefas_criadas_em: 'x' })))
      .toBe('As tarefas desta ata já foram criadas.');
    expect(porQueNaoPodeCriar(ata({ tarefas: [] })))
      .toBe('Esta ata não tem nenhuma tarefa para criar.');
  });
});

describe('o resumo na lista', () => {
  const linha = (o: Partial<AtaNaLista> = {}): AtaNaLista => ({
    id: 'a1', titulo: 'R', data_reuniao: null, status: 'lida', equipe: '',
    criado_em: '', tarefas: 3, sem_responsavel: 0, tarefas_criadas: false, ...o,
  });

  it('conta quantas faltam apontar', () => {
    expect(resumoDaAta(linha({ sem_responsavel: 2 })))
      .toBe('3 tarefa(s), 2 sem responsável apontado.');
  });

  it('diz que está pronta para criar quando ninguém falta', () => {
    expect(resumoDaAta(linha())).toBe('3 tarefa(s) prontas para criar.');
  });

  it('separa "não foi lida" de "sem tarefas"', () => {
    expect(resumoDaAta(linha({ status: 'enviada' }))).toBe('Ainda não foi lida.');
    expect(resumoDaAta(linha({ tarefas: 0 }))).toBe('Sem tarefas combinadas.');
  });

  it('depois de criadas, diz que estão na agenda', () => {
    expect(resumoDaAta(linha({ tarefas_criadas: true }))).toBe('3 tarefa(s) na agenda.');
  });
});

describe('o mapa mental', () => {
  it('nível inventado vira 1, em vez de empurrar a linha para fora da tela', () => {
    expect(nivelSeguro(99)).toBe(1);
    expect(nivelSeguro('dois')).toBe(1);
    expect(nivelSeguro(0)).toBe(1);
    expect(nivelSeguro(3)).toBe(3);
  });

  it('descarta linha sem texto e apara os espaços', () => {
    expect(mapaEmLista([
      { nivel: 1, texto: ' Funil ' }, { nivel: 2, texto: '   ' }, { nivel: 9, texto: 'Bolsão' },
    ])).toEqual([{ nivel: 1, texto: 'Funil' }, { nivel: 1, texto: 'Bolsão' }]);
  });

  it('aguenta nulo', () => {
    expect(mapaEmLista(null)).toEqual([]);
  });
});

describe('a frase que diz de onde veio o conteúdo', () => {
  it('avisa que foi a LIA e que falta apontar gente', () => {
    expect(comoFoiLida(ata())).toMatch(/LIA leu.*Falta uma pessoa apontar/);
  });

  it('diz que ninguém leu, e que dá para escrever à mão', () => {
    expect(comoFoiLida(ata({ status: 'enviada', lido_por: null })))
      .toMatch(/Ainda não foi lida.*à mão/);
  });

  // A falha da LIA não pode virar uma ata parada em silêncio.
  it('mostra o motivo quando a LIA não conseguiu', () => {
    expect(comoFoiLida(ata({ erro_leitura: 'sem falas identificadas' })))
      .toMatch(/não conseguiu estruturar.*sem falas identificadas.*à mão/);
  });

  it('cala depois que as tarefas foram criadas', () => {
    expect(comoFoiLida(ata({ tarefas_criadas_em: 'x' }))).toBeNull();
  });
});
