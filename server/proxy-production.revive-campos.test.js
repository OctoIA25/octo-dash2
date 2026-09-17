/**
 * Regressão: o revive apagava o que o lead já tinha.
 *
 * Quando a entrada nova cai num lead que já existe, o UPDATE é montado com o
 * payload do lead novo. Como o payload traz SEMPRE a chave `property_code`
 * (null quando o anúncio não está no de-para), quem já era lead com código —
 * 'RESERVA CASTANHEIRA' vindo da Santa Ângela, 'L014' vindo do ZAP — e voltasse
 * por um formulário da Meta fora do de-para perdia o código. Pior: o UPDATE
 * também reescreve `created_at`, o que dispara o trigger de reclassificação
 * (20260903) e rebaixa o lead para 'indefinido'. O processor recebe 201, marca
 * o evento `done`, e nada registra a substituição.
 *
 * O helper saiu de proxy-production.js (não importável: chama app.listen no
 * import) para server/leadDedup.js, então aqui o teste roda a função de
 * verdade e o arquivo de produção é checado só no ponto de uso.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { patchDeReentrada } from './leadDedup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'proxy-production.js'), 'utf8');

describe('patchDeReentrada — o patch do revive', () => {
  it('não leva property_code null (o bug)', () => {
    expect(patchDeReentrada({ name: 'Maria' }, { name: 'Maria', property_code: null }))
      .toEqual({});
  });

  it('leva o código quando o lead novo tem um', () => {
    expect(patchDeReentrada({ name: 'Maria' }, { property_code: 'ALLEGRATO' }).property_code)
      .toBe('ALLEGRATO');
  });

  it('não desatribui o corretor por ausência', () => {
    expect(patchDeReentrada({}, { assigned_agent_id: null, assigned_agent_name: null }))
      .toEqual({});
  });

  it('false, 0 e string vazia passam — são valor, não ausência', () => {
    // is_exclusive ficou fora: ele descreve o imóvel do interesse novo e só
    // entra junto com property_code (caso próprio abaixo).
    expect(patchDeReentrada({}, { property_code: 'L014', is_exclusive: false, n: 0, comments: '' }))
      .toEqual({ property_code: 'L014', is_exclusive: false, n: 0, comments: '' });
  });

  it('undefined também não passa', () => {
    expect(patchDeReentrada({ name: 'X' }, { email: undefined, status: 'Novos Leads' }))
      .toEqual({ status: 'Novos Leads' });
  });

  it('nunca mexe no telefone: é a identidade do lead', () => {
    expect(patchDeReentrada({ phone: '+5519999999999' }, { phone: '19999999999' }).phone)
      .toBeUndefined();
  });

  it('volta o lead para o começo do funil — oportunidade nova (decisão de 17/09)', () => {
    // Formulário repetido de quem já está em Negociação: o payload do webhook
    // traz sempre status/temperature com os defaults ('Novos Leads'/'Frio').
    const patch = patchDeReentrada(
      { status: 'Negociação', temperature: 'Quente', assigned_agent_id: 'corretor-1', assigned_agent_name: 'Ana' },
      { status: 'Novos Leads', temperature: 'Frio', property_code: 'L014' },
    );
    expect(patch.status).toBe('Novos Leads');
    // Temperatura não: 'Frio' é o default do portal, quem marcou 'Quente' foi
    // o corretor.
    expect(patch.temperature).toBeUndefined();
    expect(patch.property_code).toBe('L014');
  });

  it('NÃO tira o lead do corretor que já atende', () => {
    const patch = patchDeReentrada(
      { assigned_agent_id: 'corretor-1', assigned_agent_name: 'Ana' },
      { assigned_agent_id: 'corretor-2', assigned_agent_name: 'Bruno' },
    );
    expect(patch.assigned_agent_id).toBeUndefined();
    expect(patch.assigned_agent_name).toBeUndefined();
  });

  it('dá corretor ao lead que estava sem dono', () => {
    const patch = patchDeReentrada(
      { assigned_agent_id: null, assigned_agent_name: null },
      { assigned_agent_id: 'corretor-2', assigned_agent_name: 'Bruno' },
    );
    expect(patch).toMatchObject({ assigned_agent_id: 'corretor-2', assigned_agent_name: 'Bruno' });
  });

  it('na roleta forçada o corretor sorteado vale — é o pedido da rota', () => {
    const patch = patchDeReentrada(
      { assigned_agent_id: 'corretor-1', assigned_agent_name: 'Ana' },
      { assigned_agent_id: 'corretor-2', assigned_agent_name: 'Bruno' },
      { forcarAtribuicao: true },
    );
    expect(patch).toMatchObject({ assigned_agent_id: 'corretor-2', assigned_agent_name: 'Bruno' });
  });

  it('não sobrescreve a observação do corretor com a mensagem do portal', () => {
    const patch = patchDeReentrada(
      { comments: 'Cliente pediu para ligar só à noite' },
      { comments: 'Tenho interesse neste imóvel' },
    );
    expect(patch.comments).toBeUndefined();
  });

  it('exclusividade só entra junto com o imóvel novo', () => {
    expect(patchDeReentrada({}, { is_exclusive: true }).is_exclusive).toBeUndefined();
    expect(patchDeReentrada({}, { is_exclusive: true, property_code: 'L014' }).is_exclusive).toBe(true);
  });

  it('completa nome e e-mail que faltavam no lead', () => {
    expect(patchDeReentrada({ name: null, email: null }, { name: 'Maria', email: 'maria@x.com' }))
      .toMatchObject({ name: 'Maria', email: 'maria@x.com' });
  });

  it('NÃO troca o e-mail de quem já tinha um (o portal novo pode trazer outro)', () => {
    const patch = patchDeReentrada(
      { name: 'Maria Aparecida', email: 'pessoal@gmail.com' },
      { name: 'Maria', email: 'corporativo@empresa.com.br' },
    );
    expect(patch.email).toBeUndefined();
    expect(patch.name).toBeUndefined();
  });
});

describe('proxy-production.js — uso do helper', () => {
  it('o UPDATE do revive filtra os nulos', () => {
    expect(source).toContain('.update({ ...patchDeReentrada(existente, crmLeadData, opts), created_at: now, updated_at: now })');
  });

  it('só a roleta forçada reatribui lead existente', () => {
    expect(source.match(/insertOrReviveLead\(crmLeadData, \{ forcarAtribuicao: true \}\)/g)).toHaveLength(1);
  });

  it('não sobrou nenhum revive espalhando o payload cru', () => {
    expect(source).not.toContain('.update({ ...rest,');
  });

  it('procura o lead existente ANTES de inserir', () => {
    const insert = source.indexOf('const insertOrReviveLead');
    const busca = source.indexOf('buscarLeadPeloTelefone(supabase, crmLeadData.tenant_id', insert);
    const inserindo = source.indexOf(".from('leads')\n    .insert(crmLeadData)", insert);
    expect(busca).toBeGreaterThan(insert);
    expect(busca).toBeLessThan(inserindo);
  });
});
