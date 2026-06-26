import { describe, it, expect } from 'vitest';
import { toMetaBody, submitTemplate, fetchTemplateStatus, extractBodyFromComponents, mapMetaTemplateToRow, listApprovedTemplates } from './metaTemplates.js';

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
  it('status bloqueante da Meta (PAUSED) vira rejected com o motivo preservado', async () => {
    const fetchImpl = async () => okJson({ data: [{ name: 'p', status: 'PAUSED' }] });
    const r = await fetchTemplateStatus({ wabaId: 'W', accessToken: 'T', name: 'p', fetchImpl });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('PAUSED');
  });
  it('DISABLED também vira rejected com motivo', async () => {
    const fetchImpl = async () => okJson({ data: [{ name: 'p', status: 'DISABLED' }] });
    const r = await fetchTemplateStatus({ wabaId: 'W', accessToken: 'T', name: 'p', fetchImpl });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('DISABLED');
  });
});

describe('extractBodyFromComponents', () => {
  it('extrai o body e as variáveis numeradas', () => {
    const r = extractBodyFromComponents([{ type: 'HEADER', text: 'Oi' }, { type: 'BODY', text: 'Olá {{1}}, vaga em {{2}}' }]);
    expect(r).toEqual({ body: 'Olá {{1}}, vaga em {{2}}', variables: ['1', '2'] });
  });
  it('tolera type minúsculo e sem variáveis', () => {
    expect(extractBodyFromComponents([{ type: 'body', text: 'Oi tudo bem' }])).toEqual({ body: 'Oi tudo bem', variables: [] });
  });
  it('sem BODY → vazio', () => {
    expect(extractBodyFromComponents([{ type: 'FOOTER', text: 'x' }])).toEqual({ body: '', variables: [] });
  });
  it('variável repetida aparece 1x', () => {
    expect(extractBodyFromComponents([{ type: 'BODY', text: '{{1}} e {{1}}' }])).toEqual({ body: '{{1}} e {{1}}', variables: ['1'] });
  });
});

describe('mapMetaTemplateToRow', () => {
  it('normaliza um template da Meta', () => {
    const row = mapMetaTemplateToRow({ id: 'tpl_9', name: 'promo', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Olá {{1}}' }] });
    expect(row).toEqual({ name: 'promo', language: 'pt_BR', category: 'MARKETING', body: 'Olá {{1}}', variables: ['1'], provider_template_id: 'tpl_9' });
  });
  it('categoria desconhecida vira MARKETING; id ausente → null', () => {
    const row = mapMetaTemplateToRow({ name: 'x', language: 'en', category: 'AUTH', components: [{ type: 'BODY', text: 'hi' }] });
    expect(row.category).toBe('MARKETING');
    expect(row.provider_template_id).toBe(null);
  });
});

describe('listApprovedTemplates', () => {
  it('GET por waba e filtra só APPROVED', async () => {
    let url; let init;
    const fetchImpl = async (u, i) => { url = u; init = i; return okJson({ data: [
      { name: 'a', status: 'APPROVED' }, { name: 'b', status: 'PENDING' }, { name: 'c', status: 'APPROVED' },
    ] }); };
    const r = await listApprovedTemplates({ wabaId: 'WABA1', accessToken: 'TOK', fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.templates.map((t) => t.name)).toEqual(['a', 'c']);
    expect(url).toContain('/WABA1/message_templates');
    expect(url).toContain('limit=200');
    expect(init.headers.Authorization).toBe('Bearer TOK');
  });
  it('erro da Meta → { ok:false }', async () => {
    const fetchImpl = async () => errJson({ error: { message: 'bad token' } });
    const r = await listApprovedTemplates({ wabaId: 'W', accessToken: 'T', fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('meta_list_failed');
    expect(r.detail).toContain('bad token');
  });
  it('exceção de rede → { ok:false } (não lança)', async () => {
    const fetchImpl = async () => { throw new Error('net'); };
    const r = await listApprovedTemplates({ wabaId: 'W', accessToken: 'T', fetchImpl });
    expect(r.ok).toBe(false);
  });
});
