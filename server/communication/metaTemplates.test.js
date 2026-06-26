import { describe, it, expect } from 'vitest';
import { toMetaBody } from './metaTemplates.js';

describe('toMetaBody', () => {
  it('sem variáveis: texto igual, lista vazia', () => {
    expect(toMetaBody('Olá, tudo bem?')).toEqual({ text: 'Olá, tudo bem?', variables: [] });
  });
  it('uma variável → {{1}}', () => {
    expect(toMetaBody('Olá {{nome}}!')).toEqual({ text: 'Olá {{1}}!', variables: ['nome'] });
  });
  it('duas variáveis distintas → {{1}} {{2}} na ordem', () => {
    expect(toMetaBody('{{nome}}, seu código é {{codigo}}')).toEqual({ text: '{{1}}, seu código é {{2}}', variables: ['nome', 'codigo'] });
  });
  it('variável repetida reusa o mesmo número e aparece 1x na lista', () => {
    expect(toMetaBody('Olá {{nome}}. Att, {{nome}}')).toEqual({ text: 'Olá {{1}}. Att, {{1}}', variables: ['nome'] });
  });
  it('tolera espaços dentro das chaves', () => {
    expect(toMetaBody('Oi {{ nome }}')).toEqual({ text: 'Oi {{1}}', variables: ['nome'] });
  });
});
