import { describe, it, expect } from 'vitest';
import { generateReport } from './generateReport';

const base = {
  amostras: [{
    link: 'https://exemplo.com/imovel/1',
    valorTotal: 500000,
    metragem: 100,
    estado: 'SP',
    cidade: 'Jundiaí',
    bairro: 'Centro',
    condominio: '',
    rua: '',
  }],
  metragemImovel: 100,
  correcaoMercado: 0,
  margemExclusividade: 5,
  nomeCliente: 'Fulano',
  enderecoImovel: 'Rua X, 1',
  observacoes: '',
  mediaPorM2: 5000,
  valorBase: 500000,
  valorMercado: 500000,
  valorExclusividade: 525000,
};

describe('generateReport — cabeçalho', () => {
  it('usa o nome do tenant, sem logo fixa de outra imobiliária', () => {
    const html = generateReport({ ...base, tenantNome: 'Imobiliária Teste' }, { skipDownload: true });
    expect(html).toContain('Imobiliária Teste');
    expect(html).not.toContain('Japi');
    expect(html).not.toContain('i.ibb.co');
  });

  it('escapa o nome do tenant', () => {
    const html = generateReport({ ...base, tenantNome: 'A & <b>B</b>' }, { skipDownload: true });
    expect(html).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;');
  });

  it('sem tenant, cai em um título genérico', () => {
    const html = generateReport(base, { skipDownload: true });
    expect(html).toContain('Avaliação Imobiliária');
  });
});
