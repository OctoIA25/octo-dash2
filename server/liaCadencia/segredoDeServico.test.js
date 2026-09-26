/**
 * Um token só para /lia/* e /agent-telemetry/* — 26/09.
 *
 * A equipe da LIA mandou o MESMO header para as duas rotas e levou 200 numa e
 * 401 na outra. Eu tinha afirmado a eles, por escrito, que era "o mesmo header
 * e o MESMO TOKEN" — sem conferir.
 *
 * Eram duas cópias da regra de auth. Uma lia `LIA_SERVICE_TOKEN` primeiro e
 * fazia `trim()`; a outra lia `AGENT_TELEMETRY_SERVICE_TOKEN` primeiro e
 * comparava cru. Bastava uma quebra de linha no valor — que colar no painel do
 * EasyPanel deixa — para a mesma credencial passar numa e ser recusada na
 * outra.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { segredoDeServico, nomeDoSegredo, tokenConfere } from './index.js';

const AS_TRES = ['LIA_SERVICE_TOKEN', 'AGENT_TELEMETRY_SERVICE_TOKEN', 'DISPARADOR_SERVICE_TOKEN'];
let guardadas;

beforeEach(() => {
  guardadas = Object.fromEntries(AS_TRES.map((k) => [k, process.env[k]]));
  for (const k of AS_TRES) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(guardadas)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('o segredo de serviço é um só', () => {
  /*
   * O CASO QUE SUSTENTA O ARQUIVO. É a forma exata do 401 que eles relataram:
   * o valor certo, com o \n que o painel deixa ao colar.
   */
  it('quebra de linha no fim do valor não recusa a credencial certa', () => {
    process.env.DISPARADOR_SERVICE_TOKEN = 'segredo-abc\n';

    expect(tokenConfere('segredo-abc')).toBe(true);
    expect(tokenConfere('segredo-abc\n')).toBe(true);
    expect(tokenConfere('  segredo-abc  ')).toBe(true);
  });

  it('a ordem das envs é a mesma para quem chama /lia/* e /agent-telemetry/*', () => {
    process.env.DISPARADOR_SERVICE_TOKEN = 'do-disparador';
    expect(segredoDeServico()).toBe('do-disparador');
    expect(nomeDoSegredo()).toBe('DISPARADOR_SERVICE_TOKEN (fallback)');

    process.env.AGENT_TELEMETRY_SERVICE_TOKEN = 'da-telemetria';
    expect(segredoDeServico()).toBe('da-telemetria');

    // A da LIA vence as duas: é a credencial de quem integra.
    process.env.LIA_SERVICE_TOKEN = 'da-lia';
    expect(segredoDeServico()).toBe('da-lia');
    expect(nomeDoSegredo()).toBe('LIA_SERVICE_TOKEN');
  });

  /*
   * Fail-closed. Sem env nenhuma o caminho de serviço não existe — e token
   * vazio não pode virar "bateu com o esperado vazio".
   */
  it('sem env configurada, nada passa — nem o vazio', () => {
    expect(segredoDeServico()).toBeNull();
    expect(tokenConfere('qualquer')).toBe(false);
    expect(tokenConfere('')).toBe(false);
    expect(nomeDoSegredo()).toBe('NENHUMA CONFIGURADA');
  });

  it('token errado continua sendo recusado', () => {
    process.env.LIA_SERVICE_TOKEN = 'certo';
    expect(tokenConfere('errado')).toBe(false);
    expect(tokenConfere('cert')).toBe(false);
    expect(tokenConfere('certoo')).toBe(false);
  });
});
