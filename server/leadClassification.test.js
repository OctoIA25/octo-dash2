import { describe, it, expect, vi } from 'vitest';
import { resolveClassification, applyClassification, handleClassificationPatch, CLASSIFICACOES } from './leadClassification.js';

describe('resolveClassification', () => {
  it('aceita os quatro valores canônicos', () => {
    for (const v of CLASSIFICACOES) {
      expect(resolveClassification(v)).toEqual({ ok: true, value: [v] });
    }
  });

  it('aceita sinônimos de negócio, com acento e caixa livres', () => {
    expect(resolveClassification('Lançamento').value).toEqual(['lancamento']);
    expect(resolveClassification('LANCAMENTOS').value).toEqual(['lancamento']);
    expect(resolveClassification('Locação').value).toEqual(['locacao']);
    expect(resolveClassification('aluguel').value).toEqual(['locacao']);
    expect(resolveClassification('  Alugados ').value).toEqual(['locacao']);
    expect(resolveClassification('rent').value).toEqual(['locacao']);
    expect(resolveClassification('prontos').value).toEqual(['pronto']);
  });

  // A coluna virou text[] (20260818): o lead pode ser Lançamento E Locação.
  it('aceita lista e normaliza — ordem canônica, sem duplicata', () => {
    expect(resolveClassification(['locacao', 'lancamento']).value)
      .toEqual(['lancamento', 'locacao']);
    expect(resolveClassification(['aluguel', 'Locação', 'rent']).value).toEqual(['locacao']);
    expect(resolveClassification(['lancamentos', 'prontos', 'aluguel']).value)
      .toEqual(['lancamento', 'pronto', 'locacao']);
  });

  it("'indefinido' é exclusiva — é ausência de classificação, não uma a mais", () => {
    expect(resolveClassification(['pronto', 'indefinido']).value).toEqual(['pronto']);
    expect(resolveClassification(['indefinido']).value).toEqual(['indefinido']);
  });

  it('um valor inválido reprova a lista inteira — nada é gravado pela metade', () => {
    const r = resolveClassification(['pronto', 'venda']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('venda');
  });

  it('lista vazia é o mesmo que não mandar nada', () => {
    expect(resolveClassification([]).ok).toBe(false);
  });

  it('recusa valor inventado e diz quais valem', () => {
    for (const lixo of ['lancamentoo', 'imovel_novo', 'qualquer_coisa', 'venda']) {
      const r = resolveClassification(lixo);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('lancamento');
    }
  });

  it('recusa vazio, null e undefined', () => {
    for (const v of ['', null, undefined]) {
      expect(resolveClassification(v).ok).toBe(false);
    }
  });
});

/**
 * Supabase falso: devolve `linhas[tabela]` no select e registra os updates.
 * `erro` (opcional) simula falha de infraestrutura numa etapa específica:
 * { tabela, etapa: 'select' | 'update', message }.
 */
function fakeSupabase(linhas, erro) {
  const updates = [];
  return {
    updates,
    from(tabela) {
      const falhaAqui = (etapa) => erro?.tabela === tabela && erro.etapa === etapa;
      const chain = {
        _update: null,
        select: () => chain,
        update(patch) { chain._update = patch; return chain; },
        eq: () => chain,
        maybeSingle: async () => (
          falhaAqui('select')
            ? { data: null, error: { message: erro.message } }
            : { data: linhas[tabela] ?? null, error: null }
        ),
        then(resolve) { // await do update
          updates.push({ tabela, patch: chain._update });
          return Promise.resolve({ error: falhaAqui('update') ? { message: erro.message } : null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

describe('applyClassification', () => {
  const base = { tenantId: 'T1', leadId: 'L1', classification: ['locacao'], source: 'lia' };

  it('grava em leads quando o lead mora lá, e reporta a transição', async () => {
    const sb = fakeSupabase({ leads: { id: 'L1', classification: 'pronto' } });
    const r = await applyClassification(sb, base);
    expect(r).toMatchObject({ ok: true, tabela: 'leads', from: ['pronto'], to: ['locacao'] });
    expect(sb.updates[0].patch).toMatchObject({ classification: ['locacao'], classification_source: 'lia' });
  });

  it('cai para kenlo_leads quando não está em leads', async () => {
    const sb = fakeSupabase({ kenlo_leads: { id: 'L1', classification: null } });
    const r = await applyClassification(sb, base);
    expect(r).toMatchObject({ ok: true, tabela: 'kenlo_leads' });
    expect(r.from).toEqual(['indefinido']); // NULL lê-se como indefinido
  });

  it('lead inexistente (ou de outro tenant) devolve 404, não 403', async () => {
    const r = await applyClassification(fakeSupabase({}), base);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('grava o source recebido, sem inventar', async () => {
    const sb = fakeSupabase({ leads: { id: 'L1', classification: 'pronto' } });
    await applyClassification(sb, { ...base, source: 'dashboard' });
    expect(sb.updates[0].patch.classification_source).toBe('dashboard');
  });

  it('SELECT falha na primeira tabela: devolve 500, não 404 (falha de infra ≠ lead ausente)', async () => {
    const sb = fakeSupabase({}, { tabela: 'leads', etapa: 'select', message: 'timeout' });
    const r = await applyClassification(sb, base);
    expect(r).toMatchObject({ ok: false, status: 500 });
  });

  it('UPDATE falha: devolve 500 e não cai para a segunda tabela', async () => {
    const sb = fakeSupabase(
      { leads: { id: 'L1', classification: 'pronto' }, kenlo_leads: { id: 'L1', classification: 'pronto' } },
      { tabela: 'leads', etapa: 'update', message: 'boom' },
    );
    const r = await applyClassification(sb, base);
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(sb.updates).toHaveLength(1); // não tentou kenlo_leads depois da falha
  });
});

/** Fake `res` do Express: só o que o handler usa, `status()` encadeia como o real. */
function fakeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('handleClassificationPatch', () => {
  // Extraído dos dois entrypoints (Task 5, fix round 1): antes esta lógica
  // vivia colada em app.patch(), duplicada byte a byte, e só era provada por
  // regex sobre o texto-fonte — o que não pega o body `source` vazando para
  // a escrita se alguém trocar `resolved.value` por `req.body?.classification`
  // por engano. Testado aqui, uma vez, contra o handler de verdade.

  it("ignora 'source' do body mesmo quando presente — a origem é 'lia', sempre", async () => {
    const sb = fakeSupabase({ leads: { id: 'L1', classification: 'pronto' } });
    const req = { body: { classification: 'locacao', source: 'dashboard' }, params: { id: 'L1' }, tenantId: 'T1' };
    const res = fakeRes();

    await handleClassificationPatch(req, res, sb);

    expect(sb.updates[0].patch.classification_source).toBe('lia');
    expect(res.status).not.toHaveBeenCalled(); // 200 implícito
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ source: 'lia' }),
    }));
  });

  it('classification inválida → 400 e nenhuma escrita é tentada', async () => {
    const sb = fakeSupabase({ leads: { id: 'L1', classification: 'pronto' } });
    const req = { body: { classification: 'lancamentoo' }, params: { id: 'L1' }, tenantId: 'T1' };
    const res = fakeRes();

    await handleClassificationPatch(req, res, sb);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(sb.updates).toHaveLength(0); // applyClassification nunca rodou
  });

  it('sinônimo é resolvido antes de gravar — o valor cru do body não chega ao banco', async () => {
    const sb = fakeSupabase({ leads: { id: 'L1', classification: 'pronto' } });
    const req = { body: { classification: 'aluguel' }, params: { id: 'L1' }, tenantId: 'T1' };
    const res = fakeRes();

    await handleClassificationPatch(req, res, sb);

    expect(sb.updates[0].patch.classification).toEqual(['locacao']);
  });
});
