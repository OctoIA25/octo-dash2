import { describe, it, expect } from 'vitest';
import {
  makeGetConfigHandler,
  makeSaveConfigHandler,
  makeResolveTenantTransport,
} from './index.js';
import { encryptSecret } from './crypto.js';

const KEY = Buffer.alloc(32, 9).toString('base64');
const envWithKey = { EMAIL_ENCRYPTION_KEY: KEY };

/**
 * Fake Supabase com chains tolerantes a 1 ou 2 `.eq()`. Captura `upsert`.
 * `tables` mapeia nome → linha retornada por maybeSingle().
 */
function makeFake({ tables = {}, membership = { user_id: 'u1' } } = {}) {
  const captures = {};
  const makeChain = (table) => {
    const result = table === 'tenant_memberships' ? membership : tables[table] ?? null;
    const node = {
      eq: () => node,
      maybeSingle: async () => ({ data: result, error: null }),
    };
    return node;
  };
  const supabase = {
    from(table) {
      return {
        select: () => makeChain(table),
        upsert: async (row) => {
          (captures[table] ||= []).push(row);
          return { error: null };
        },
      };
    },
  };
  return { supabase, captures };
}

const makeRes = () => ({
  statusCode: 0,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
});

const req = (over = {}) => ({ userId: 'u1', userEmail: 'corretor@imob.com', query: {}, body: {}, ...over });

describe('makeSaveConfigHandler', () => {
  it('salva config e cifra a senha em tenant_email_secrets', async () => {
    const { supabase, captures } = makeFake();
    const res = makeRes();
    await makeSaveConfigHandler(supabase, { processEnv: envWithKey })(
      req({
        body: {
          tenantId: 't1',
          testEmail: 'teste@imob.com',
          companyName: 'Imob',
          smtp: { host: 'smtp.gmail.com', port: 587, secure: false, user: 'c@gmail.com', from: 'Imob <c@gmail.com>', password: 'app-pass' },
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    // config não-secreta gravada
    expect(captures.tenant_recommendation_config[0]).toMatchObject({
      tenant_id: 't1',
      smtp_host: 'smtp.gmail.com',
      smtp_user: 'c@gmail.com',
    });
    // senha gravada CIFRADA (não em claro)
    const secretRow = captures.tenant_email_secrets[0];
    expect(secretRow.smtp_pass_encrypted).toBeTruthy();
    expect(secretRow.smtp_pass_encrypted).not.toContain('app-pass');
  });

  it('não grava segredo quando a senha vem vazia (mantém a atual)', async () => {
    const { supabase, captures } = makeFake();
    const res = makeRes();
    await makeSaveConfigHandler(supabase, { processEnv: envWithKey })(
      req({ body: { tenantId: 't1', smtp: { host: 'smtp.x.com', password: '' } } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(captures.tenant_email_secrets).toBeUndefined();
  });

  it('recusa salvar senha sem EMAIL_ENCRYPTION_KEY', async () => {
    const { supabase } = makeFake();
    const res = makeRes();
    await makeSaveConfigHandler(supabase, { processEnv: {} })(
      req({ body: { tenantId: 't1', smtp: { host: 'x', password: 'segredo' } } }),
      res,
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('encryption_unavailable');
  });

  it('403 sem acesso ao tenant', async () => {
    const { supabase } = makeFake({ membership: null });
    const res = makeRes();
    await makeSaveConfigHandler(supabase, { processEnv: envWithKey })(
      req({ body: { tenantId: 't1' } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('makeGetConfigHandler', () => {
  it('retorna hasPassword=true e NUNCA a senha', async () => {
    const { supabase } = makeFake({
      tables: {
        tenant_recommendation_config: { test_email: 'a@b.com', company_name: 'Imob', smtp_host: 'smtp.x', smtp_port: 587, smtp_secure: false, smtp_user: 'u@x.com', smtp_from: 'F' },
        tenant_email_secrets: { smtp_pass_encrypted: 'iv:tag:cipher' },
      },
    });
    const res = makeRes();
    await makeGetConfigHandler(supabase, { processEnv: envWithKey })(
      req({ query: { tenantId: 't1' } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.config.smtp.hasPassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('iv:tag:cipher');
    expect(res.body.config.encryptionAvailable).toBe(true);
  });

  it('400 sem tenantId', async () => {
    const { supabase } = makeFake();
    const res = makeRes();
    await makeGetConfigHandler(supabase)(req({ query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('makeResolveTenantTransport', () => {
  it('usa o SMTP do tenant (kind smtp + from próprio)', async () => {
    const { supabase } = makeFake({
      tables: {
        tenant_recommendation_config: { smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_secure: false, smtp_user: 'c@gmail.com', smtp_from: 'Imob <c@gmail.com>' },
        tenant_email_secrets: { smtp_pass_encrypted: encryptSecret('app-pass', envWithKey) },
      },
    });
    const resolve = makeResolveTenantTransport(supabase, { processEnv: envWithKey });
    const { transport, from } = await resolve('t1');
    expect(transport.kind).toBe('smtp');
    expect(from).toBe('Imob <c@gmail.com>');
  });

  it('sem SMTP do tenant nem do env → transporte simulado', async () => {
    const { supabase } = makeFake({ tables: { tenant_recommendation_config: null } });
    const resolve = makeResolveTenantTransport(supabase, { processEnv: {} });
    const { transport } = await resolve('t1');
    expect(transport.kind).toBe('simulated');
  });
});
