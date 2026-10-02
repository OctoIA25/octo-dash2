import { describe, expect, it } from 'vitest';
import { pinoVoltaParaFila } from './pinoDoLancamento';

const salvo = { endereco_plantao: 'Av. Brasil, 1000', bairro: 'Centro', cidade: 'Jundiaí', geo_origem: 'automatica' };

describe('pinoVoltaParaFila', () => {
  it('endereço do empreendimento novo tira o pino automático', () => {
    expect(pinoVoltaParaFila(salvo, { ...salvo, endereco_empreendimento: 'Rua das Palmeiras, 250' })).toBe(true);
  });

  it('o pino posto à mão nunca sai', () => {
    expect(pinoVoltaParaFila({ ...salvo, geo_origem: 'manual' }, { ...salvo, cidade: 'Itupeva' })).toBe(false);
  });

  it('mudar o plantão não mexe no pino quando o empreendimento já tem endereço', () => {
    const comEmp = { ...salvo, endereco_empreendimento: 'Rua das Palmeiras, 250' };
    expect(pinoVoltaParaFila(comEmp, { ...comEmp, endereco_plantao: 'Outro estande' })).toBe(false);
  });

  it('espaço a mais não conta como mudança', () => {
    expect(pinoVoltaParaFila(salvo, { ...salvo, bairro: ' Centro ' })).toBe(false);
  });
});
