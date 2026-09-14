import { describe, it, expect } from 'vitest';
import type { Foto } from '@/components/imoveis/fotos-helpers';
import { formularioAlterado } from './formularioAlterado';

const fotos: Foto[] = [{ url: 'data:image/jpeg;base64,AAA', legenda: '', isCapa: true }];
const base = { titulo: 'Casa', quartos: '3', caracteristicas: ['Piscina'], fotos };

describe('formularioAlterado', () => {
  it('mesmo objeto ou cópia com o mesmo conteúdo não é alteração', () => {
    expect(formularioAlterado(base, base)).toBe(false);
    expect(formularioAlterado(structuredClone(base), base)).toBe(false);
  });

  it('qualquer campo diferente é alteração', () => {
    expect(formularioAlterado({ ...base, titulo: 'Casa nova' }, base)).toBe(true);
    expect(formularioAlterado({ ...base, quartos: '' }, base)).toBe(true);
  });

  it('listas comparam conteúdo e ordem', () => {
    expect(formularioAlterado({ ...base, caracteristicas: ['Piscina', 'Sauna'] }, base)).toBe(true);
    expect(formularioAlterado({ ...base, caracteristicas: [] }, base)).toBe(true);
    const duas = { ...base, caracteristicas: ['A', 'B'] };
    expect(formularioAlterado({ ...base, caracteristicas: ['B', 'A'] }, duas)).toBe(true);
  });

  it('foto trocada, com legenda nova ou já enviada (URL nova) é alteração', () => {
    const [foto] = base.fotos;
    expect(formularioAlterado({ ...base, fotos: [{ ...foto, legenda: 'Sala' }] }, base)).toBe(true);
    expect(formularioAlterado({ ...base, fotos: [{ ...foto, url: 'https://cdn/x.jpg' }] }, base)).toBe(true);
  });

  it('chave ausente e chave undefined são o mesmo valor', () => {
    const [foto] = base.fotos;
    expect(formularioAlterado({ ...base, fotos: [{ ...foto, id: undefined }] }, base)).toBe(false);
  });
});
