import { describe, expect, it } from 'vitest';
import { montarCurso, vazio } from '../cursoForm';

const aula = (o = {}) => ({ titulo: 'Boas-vindas', descricao: '', link: 'https://youtu.be/dQw4w9WgXcQ', duracao: '4:05', ...o });
const base = { ...vazio(), titulo: 'Onboarding' };

describe('A.7 · montar o curso para o banco', () => {
  it('link do YouTube vira id e a duração vira segundos', () => {
    const c = montarCurso(base, [aula(), aula({ titulo: 'Cadastro', link: 'aBcDeFgHiJk', duracao: '90' })], []);
    expect(typeof c).toBe('object');
    expect((c as { aulas: unknown[] }).aulas).toEqual([
      { id: undefined, titulo: 'Boas-vindas', descricao: '', youtube_id: 'dQw4w9WgXcQ', duracao_seg: 245 },
      { id: undefined, titulo: 'Cadastro', descricao: '', youtube_id: 'aBcDeFgHiJk', duracao_seg: 90 },
    ]);
  });
  it('diz a primeira coisa que falta', () => {
    expect(montarCurso({ ...base, titulo: ' ' }, [], [])).toBe('Dê um título ao curso.');
    expect(montarCurso(base, [aula({ link: 'https://vimeo.com/123' })], [])).toBe('O link da aula 1 não é de um vídeo do YouTube.');
    expect(montarCurso(base, [aula({ duracao: '' })], [])).toBe('Informe a duração da aula 1 (ex.: 12:30).');
    expect(montarCurso({ ...base, publicado: true }, [], [])).toBe('Um curso publicado precisa de pelo menos uma aula.');
    expect(montarCurso(base, [], [{ enunciado: 'P?', alternativas: ['só uma', ''], correta: 0 }])).toBe('A pergunta 1 precisa de pelo menos 2 alternativas.');
    expect(montarCurso(base, [], [{ enunciado: 'P?', alternativas: ['a', 'b', ''], correta: 2 }])).toBe('Marque a alternativa certa da pergunta 1.');
  });
  it('alternativa em branco sai, e a certa continua apontando para a mesma', () => {
    const c = montarCurso(base, [], [{ enunciado: 'P?', alternativas: ['', 'errada', 'certa'], correta: 2 }]);
    expect((c as { questoes: unknown[] }).questoes).toEqual([{ id: undefined, enunciado: 'P?', alternativas: ['errada', 'certa'], correta: 1 }]);
  });
});
