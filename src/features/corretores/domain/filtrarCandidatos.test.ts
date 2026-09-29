import { describe, it, expect } from 'vitest';
import {
  filtrarCandidatos, recorteCanalPeriodo, temFiltroAtivo, FILTROS_VAZIOS,
  type FiltrosCandidato,
} from './filtrarCandidatos';

const base = {
  id: 'x', nome: 'Fulano', email: 'f@x.com', cargo: 'Corretor Júnior', experiencia: '0-2 anos',
  status: 'Lead', estagio: 'lead', fonte: 'Meta', data_inscricao: '2026-09-10T12:00:00Z',
  cond_regiao: 'pendente', cond_tempo: 'pendente', cond_verba: 'pendente',
};

const lista = [
  { ...base, id: '1', nome: 'Ana Silva', email: 'ana@x.com', fonte: 'Meta', data_inscricao: '2026-09-01T10:00:00Z' },
  { ...base, id: '2', nome: 'Bruno Costa', email: 'bruno@y.com', cargo: 'Corretor Pleno', fonte: 'Indicação',
    status: 'Interação', estagio: 'interacao', data_inscricao: '2026-09-15T10:00:00Z',
    cond_regiao: 'aprovado', cond_tempo: 'aprovado', cond_verba: 'aprovado' },
  { ...base, id: '3', nome: 'Carla Souza', email: 'carla@z.com', experiencia: '3-5 anos', fonte: 'LinkedIn',
    status: 'Perdido', estagio: 'perdido', data_inscricao: '2026-09-20T10:00:00Z',
    cond_regiao: 'reprovado', cond_tempo: 'aprovado', cond_verba: null },
];

const com = (parte: Partial<FiltrosCandidato>): FiltrosCandidato => ({ ...FILTROS_VAZIOS, ...parte });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('recorteCanalPeriodo — o recorte que vale para o funil', () => {
  it('sem filtro devolve todos', () => {
    expect(ids(recorteCanalPeriodo(lista, FILTROS_VAZIOS))).toEqual(['1', '2', '3']);
  });

  it('canal compara com o label da fonte', () => {
    expect(ids(recorteCanalPeriodo(lista, com({ filtroCanal: 'Indicação' })))).toEqual(['2']);
  });

  it('período compara o dia da candidatura, inclusivo dos dois lados', () => {
    expect(ids(recorteCanalPeriodo(lista, com({ periodoDe: '2026-09-15' })))).toEqual(['2', '3']);
    expect(ids(recorteCanalPeriodo(lista, com({ periodoAte: '2026-09-15' })))).toEqual(['1', '2']);
    expect(ids(recorteCanalPeriodo(lista, com({ periodoDe: '2026-09-15', periodoAte: '2026-09-15' })))).toEqual(['2']);
  });

  it('NÃO aplica status, busca, cargo nem condição — senão cada barra do funil mostraria só quem está nela', () => {
    expect(ids(recorteCanalPeriodo(lista, com({ filtroStatus: 'Perdido', searchTerm: 'zzz', filtroCondicao: 'aprovadas' })))).toEqual(['1', '2', '3']);
  });
});

describe('filtrarCandidatos — o que a lista e o quadro mostram', () => {
  it('busca em nome, e-mail e cargo, sem diferenciar caixa', () => {
    expect(ids(filtrarCandidatos(lista, com({ searchTerm: 'ANA' })))).toEqual(['1']);
    expect(ids(filtrarCandidatos(lista, com({ searchTerm: '@y.com' })))).toEqual(['2']);
    expect(ids(filtrarCandidatos(lista, com({ searchTerm: 'pleno' })))).toEqual(['2']);
  });

  it('status compara com o label', () => {
    expect(ids(filtrarCandidatos(lista, com({ filtroStatus: 'Perdido' })))).toEqual(['3']);
  });

  it('cargo e experiência são igualdade exata', () => {
    expect(ids(filtrarCandidatos(lista, com({ filtroCargo: 'Corretor Pleno' })))).toEqual(['2']);
    expect(ids(filtrarCandidatos(lista, com({ filtroExperiencia: '3-5 anos' })))).toEqual(['3']);
  });

  it('condições: as três aprovadas / alguma reprovada / alguma pendente (nulo conta como pendente)', () => {
    expect(ids(filtrarCandidatos(lista, com({ filtroCondicao: 'aprovadas' })))).toEqual(['2']);
    expect(ids(filtrarCandidatos(lista, com({ filtroCondicao: 'reprovada' })))).toEqual(['3']);
    expect(ids(filtrarCandidatos(lista, com({ filtroCondicao: 'pendentes' })))).toEqual(['1', '3']);
  });

  it('inclui o recorte de canal e período', () => {
    expect(ids(filtrarCandidatos(lista, com({ filtroCanal: 'Meta', periodoAte: '2026-09-30' })))).toEqual(['1']);
  });

  it('candidato sem e-mail ou cargo não derruba a busca', () => {
    const semCampos = [{ ...base, id: '9', nome: 'Zé', email: undefined, cargo: undefined }];
    expect(ids(filtrarCandidatos(semCampos, com({ searchTerm: 'zé' })))).toEqual(['9']);
    expect(ids(filtrarCandidatos(semCampos, com({ searchTerm: 'nada' })))).toEqual([]);
  });
});

describe('temFiltroAtivo', () => {
  it('vazio não é ativo; qualquer um dos oito é', () => {
    expect(temFiltroAtivo(FILTROS_VAZIOS)).toBe(false);
    expect(temFiltroAtivo(com({ filtroCanal: 'Meta' }))).toBe(true);
    expect(temFiltroAtivo(com({ periodoDe: '2026-01-01' }))).toBe(true);
    expect(temFiltroAtivo(com({ filtroCondicao: 'pendentes' }))).toBe(true);
    expect(temFiltroAtivo(com({ searchTerm: 'a' }))).toBe(true);
  });
});
