import { describe, it, expect } from 'vitest';
import { resolveContent } from '../components/messages/registry';
import { TextContent } from '../components/messages/TextContent';
import { DocumentContent } from '../components/messages/DocumentContent';
import { FallbackContent } from '../components/messages/FallbackContent';

describe('resolveContent', () => {
  it('texto e template usam TextContent', () => {
    expect(resolveContent('text')).toBe(TextContent);
    expect(resolveContent('template')).toBe(TextContent);
  });
  it('document usa DocumentContent', () => {
    expect(resolveContent('document')).toBe(DocumentContent);
  });
  it('tipo desconhecido/nao-mapeado cai no FallbackContent', () => {
    expect(resolveContent('location')).toBe(FallbackContent);
    expect(resolveContent('sticker')).toBe(FallbackContent);
    expect(resolveContent('system')).toBe(FallbackContent);
  });
});
