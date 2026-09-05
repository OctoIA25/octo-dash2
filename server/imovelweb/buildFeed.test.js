import { describe, it, expect } from 'vitest';
import {
  buildImovelwebXml,
  buildImovelXml,
  mapImovelwebTipo,
  montarTitulo,
  montarLocalidade,
  extrairCodigoYoutube,
  imovelPublicavel,
} from './buildFeed.js';

const config = {
  codigoImobiliaria: '47898311',
  emailUsuario: 'mkt@lotusbrokers.com.br',
  publicationType: 'SIMPLE',
};

const apartamento = {
  codigo_imovel: 'AP0684',
  titulo: 'Apartamento à venda 2 quartos no condomínio Reserva do Japy',
  tipo: 'Apartamento',
  bairro: 'Recanto Quarto Centenário',
  cidade: 'Jundiaí',
  estado: 'SP',
  cep: '13215-000',
  logradouro: 'Rua das Palmeiras',
  numero: '100',
  complemento: 'Apto 52',
  quartos: 2,
  banheiros: 2,
  suites: 1,
  vagas: 1,
  area_util: 68,
  area_total: 75,
  valor_venda: 520000,
  valor_condominio: 480,
  descricao: '<p>Apartamento reformado com armários planejados.</p>',
  fotos: [{ url: 'https://cdn.exemplo.com/2.jpg' }, { url: 'https://cdn.exemplo.com/1.jpg', isCapa: true }],
};

describe('mapImovelwebTipo', () => {
  it('usa os IDs reais do Brasil', () => {
    expect(mapImovelwebTipo({ tipo: 'Casa' }).idTipo).toBe('1');
    expect(mapImovelwebTipo({ tipo: 'Apartamento' }).idTipo).toBe('2');
    expect(mapImovelwebTipo({ tipo: 'Terreno' }).idTipo).toBe('1003');
    expect(mapImovelwebTipo({ tipo: 'Chácara' }).idTipo).toBe('1004');
    expect(mapImovelwebTipo({ tipo: 'Sala comercial' }).idTipo).toBe('1005');
  });

  it('reconhece subtipo de apartamento quando dá', () => {
    expect(mapImovelwebTipo({ tipo: 'Apartamento', tipo_simplificado: 'Cobertura' }).idSubTipo).toBe('26');
    expect(mapImovelwebTipo({ tipo: 'Apartamento' }).idSubTipo).toBeNull();
  });
});

describe('montarTitulo', () => {
  it('corta em 100 caracteres (limite do schema deles)', () => {
    const titulo = montarTitulo({ ...apartamento, titulo: 'A'.repeat(140) });
    expect(titulo.length).toBeLessThanOrEqual(100);
  });

  it('não corta no meio da palavra', () => {
    const titulo = montarTitulo({
      ...apartamento,
      titulo: 'Apartamento à venda de 113 m² 3 quartos 1 suíte, condomínio Liberty Exclusive, Jardim Messina Jundiaí SP',
    });
    expect(titulo.endsWith('Messina')).toBe(true);
  });

  it('completa título curto para não ficar abaixo do mínimo de 10', () => {
    const titulo = montarTitulo({ codigo_imovel: 'AP1', titulo: 'Apto' });
    expect(titulo.length).toBeGreaterThanOrEqual(10);
  });
});

describe('buildImovelXml', () => {
  const xml = buildImovelXml(apartamento, config);

  it('manda quartos/banheiros/suítes/vagas como característica com o ID deles', () => {
    expect(xml).toContain('<id><![CDATA[CFT2]]></id>');   // quartos
    expect(xml).toContain('<id><![CDATA[CFT3]]></id>');   // banheiros
    expect(xml).toContain('<id><![CDATA[CFT4]]></id>');   // suítes
    expect(xml).toContain('<id><![CDATA[CFT7]]></id>');   // vagas
    expect(xml).toContain('<idValor><![CDATA[M2]]></idValor>');
  });

  it('não manda característica zerada (o cadastro sem vaga não vira "0 vagas")', () => {
    const semVaga = buildImovelXml({ ...apartamento, vagas: 0 }, config);
    expect(semVaga).not.toContain('CFT7');
  });

  it('preço de venda vira VENTA em BRL', () => {
    expect(xml).toContain('<operacao>VENTA</operacao>');
    expect(xml).toContain('<quantidade>520000</quantidade>');
    expect(xml).toContain('<moeda>BRL</moeda>');
  });

  it('imóvel de venda e locação sai com os dois preços', () => {
    const ambos = buildImovelXml({ ...apartamento, valor_locacao: 3200 }, config);
    expect(ambos).toContain('<operacao>VENTA</operacao>');
    expect(ambos).toContain('<operacao>ALQUILER</operacao>');
  });

  it('capa vai como primeira imagem', () => {
    const primeira = xml.indexOf('https://cdn.exemplo.com/1.jpg');
    const segunda = xml.indexOf('https://cdn.exemplo.com/2.jpg');
    expect(primeira).toBeGreaterThan(-1);
    expect(primeira).toBeLessThan(segunda);
  });

  it('respeita o hide_complement do tenant', () => {
    expect(buildImovelXml(apartamento, config)).toContain('Apto 52');
    expect(buildImovelXml(apartamento, { ...config, hideComplement: true })).not.toContain('Apto 52');
  });

  it('publica com o plano configurado', () => {
    expect(xml).toContain('<tipoPublicacao><![CDATA[SIMPLE]]></tipoPublicacao>');
  });
});

describe('montarLocalidade', () => {
  it('usa a ordem e as vírgulas que eles exigem', () => {
    expect(montarLocalidade(apartamento)).toBe('Recanto Quarto Centenário,Jundiaí,SP,Brasil');
  });
});

describe('extrairCodigoYoutube', () => {
  it('extrai o código da URL (eles não aceitam a URL inteira)', () => {
    expect(extrairCodigoYoutube('https://www.youtube.com/watch?v=cloSRP_sp9o')).toBe('cloSRP_sp9o');
    expect(extrairCodigoYoutube('https://youtu.be/cloSRP_sp9o')).toBe('cloSRP_sp9o');
    expect(extrairCodigoYoutube('')).toBeNull();
  });
});

describe('buildImovelwebXml', () => {
  it('imóvel sem preço fica de fora (o Brasil não aceita valor 0)', () => {
    expect(imovelPublicavel({ ...apartamento, valor_venda: 0 })).toBe(false);
    const xml = buildImovelwebXml({ listings: [{ ...apartamento, valor_venda: 0 }], config });
    expect(xml).not.toContain('AP0684');
  });

  it('imóvel sem código fica de fora', () => {
    expect(imovelPublicavel({ ...apartamento, codigo_imovel: null })).toBe(false);
  });

  it('monta o envelope com dataModificacao em unix ms', () => {
    const antes = Date.now();
    const xml = buildImovelwebXml({ listings: [apartamento], config });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<OpenNavent>')).toBe(true);
    const ms = Number(xml.match(/<dataModificacao><!\[CDATA\[(\d+)\]\]><\/dataModificacao>/)[1]);
    expect(ms).toBeGreaterThanOrEqual(antes);
    expect(xml).toContain('<codigoAnuncio><![CDATA[AP0684]]></codigoAnuncio>');
    expect(xml.trimEnd().endsWith('</OpenNavent>')).toBe(true);
  });
});
