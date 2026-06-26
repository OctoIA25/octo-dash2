import { describe, it, expect } from 'vitest';
import { extractVariables } from '../templateVars';

describe('extractVariables', () => {
  it('sem vars', () => { expect(extractVariables('oi')).toEqual([]); });
  it('uma', () => { expect(extractVariables('Olá {{nome}}')).toEqual(['nome']); });
  it('duas na ordem', () => { expect(extractVariables('{{nome}} {{codigo}}')).toEqual(['nome', 'codigo']); });
  it('repetida dedup', () => { expect(extractVariables('{{nome}} {{nome}}')).toEqual(['nome']); });
  it('tolera espaços', () => { expect(extractVariables('{{ nome }}')).toEqual(['nome']); });
});
