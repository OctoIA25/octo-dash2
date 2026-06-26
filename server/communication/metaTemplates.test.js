import { describe, it, expect } from 'vitest';
import { toMetaBody, submitTemplate, fetchTemplateStatus } from './metaTemplates.js';

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

const okJson = (body) => ({ ok: true, json: async () => body });
const errJson = (body) => ({ ok: false, json: async () => body });

describe('submitTemplate', () => {
  it('POSTa para /{waba}/message_templates com BODY convertido + example e devolve id/status', async () => {
    let calledUrl; let calledInit;
    const fetchImpl = async (url, init) => { calledUrl = url; calledInit = init; return okJson({ id: 'tpl_123', status: 'PENDING', category: 'MARKETING' }); };
    const r = await submitTemplate({ wabaId: 'WABA1', accessToken: 'TOK', name: 'promo', language: 'pt_BR', category: 'MARKETING', body: 'Olá {{nome}}', exampleValues: ['João'], fetchImpl });
    expect(r).toEqual({ ok: true, providerTemplateId: 'tpl_123', status: 'pending' });
    expect(calledUrl).toContain('/WABA1/message_templates');
    expect(calledInit.headers.Authorization).toBe('Bearer TOK');
    const sent = JSON.parse(calledInit.body);
    expect(sent.name).toBe('promo');
    expect(sent.category).toBe('MARKETING');
    expect(sent.components[0]).toEqual({ type: 'BODY', text: 'Olá {{1}}', example: { body_text: [['João']] } });
  });
  it('erro da Meta → { ok:false, error:meta_submit_failed, detail }', async () => {
    const fetchImpl = async () => errJson({ error: { message: 'name exists' } });
    const r = await submitTemplate({ wabaId: 'W', accessToken: 'T', name: 'x', language: 'pt_BR', category: 'MARKETING', body: 'oi', exampleValues: [], fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('meta_submit_failed');
    expect(r.detail).toContain('name exists');
  });
  it('exceção de rede → { ok:false } (não lança)', async () => {
    const fetchImpl = async () => { throw new Error('network'); };
    const r = await submitTemplate({ wabaId: 'W', accessToken: 'T', name: 'x', language: 'pt_BR', category: 'MARKETING', body: 'oi', exampleValues: [], fetchImpl });
    expect(r.ok).toBe(false);
  });
});

describe('fetchTemplateStatus', () => {
  it('GET por name → status normalizado (approved)', async () => {
    let url;
    const fetchImpl = async (u) => { url = u; return okJson({ data: [{ name: 'promo', status: 'APPROVED' }] }); };
    const r = await fetchTemplateStatus({ wabaId: 'WABA1', accessToken: 'TOK', name: 'promo', fetchImpl });
    expect(r).toEqual({ ok: true, status: 'approved', reason: null });
    expect(url).toContain('/WABA1/message_templates');
    expect(url).toContain('name=promo');
  });
  it('rejected traz o motivo quando presente', async () => {
    const fetchImpl = async () => okJson({ data: [{ name: 'p', status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' }] });
    const r = await fetchTemplateStatus({ wabaId: 'W', accessToken: 'T', name: 'p', fetchImpl });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('INVALID_FORMAT');
  });
  it('template ainda não conhecido pela Meta (data vazio) → pending', async () => {
    const fetchImpl = async () => okJson({ data: [] });
    const r = await fetchTemplateStatus({ wabaId: 'W', accessToken: 'T', name: 'p', fetchImpl });
    expect(r.status).toBe('pending');
  });
  it('data só com template de outro name → pending (não pega o errado)', async () => {
    const fetchImpl = async () => okJson({ data: [{ name: 'outro', status: 'APPROVED' }] });
    const r = await fetchTemplateStatus({ wabaId: 'W', accessToken: 'T', name: 'meu', fetchImpl });
    expect(r.status).toBe('pending');
  });
});
