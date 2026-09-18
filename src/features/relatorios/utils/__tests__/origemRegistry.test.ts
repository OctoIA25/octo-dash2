/**
 * Os casos são as 17 origens cruas que existem de verdade em produção,
 * medidas em 18/09/2026. Uma regra de agrupamento testada com exemplos
 * inventados agruparia bonito e continuaria errada na base real.
 */
import { describe, it, expect } from 'vitest';
import {
  aparenciaDaOrigem,
  chaveOrigem,
    resolverOrigem,
  sugerirOrigem,
  type OrigemCadastrada,
} from '../origemRegistry';

const origem = (over: Partial<OrigemCadastrada> = {}): OrigemCadastrada => ({
  id: 'x', codigo: 'meta_leadads', nome: 'Meta Lead Ads', cor: '#1877F2',
  ordem: 1, midiaPaga: true, organica: false, ativo: true, ...over,
});

describe('chaveOrigem', () => {
  it('ignora acento, caixa e espaco duplo', () => {
    expect(chaveOrigem('ZAP  Imóveis')).toBe('zap imoveis');
    expect(chaveOrigem('zap imoveis')).toBe('zap imoveis');
  });

  it('vazio e nulo nao quebram', () => {
    expect(chaveOrigem(null)).toBe('');
    expect(chaveOrigem('   ')).toBe('');
  });
});

describe('sugerirOrigem — só o que é mecânico', () => {
  /**
   * O caso que mais dói: a LIA carimba o nome do tenant na origem, e a mesma
   * origem vira cinco linhas em todo relatório. Juntas são 2.657 leads.
   */
  it('junta as CINCO variantes da LIA que existem na base', () => {
    for (const bruto of [
      'Lia (Japi Terceiros)', 'Lia (Lotus Brokers)', 'Lia (Japi Lançamentos)',
      'Lia · teste', 'Lia · cadastro de Octo (teste estudo)',
    ]) {
      expect(sugerirOrigem(bruto), bruto).toBe('LIA');
    }
  });

  it('nao confunde outra origem que comeca parecido', () => {
    expect(sugerirOrigem('Liame Imóveis')).toBeNull();
  });

  // "Excel" sozinho são 938 leads. É método de entrada, não canal de captação.
  it('agrupa metodo de entrada, que nao e origem', () => {
    expect(sugerirOrigem('Excel')).toBe('Importação');
    expect(sugerirOrigem('Manual')).toBe('Cadastro manual');
    // "API" não é agrupada: quem entra por API pode ou não ser uma origem de
    // verdade, e só a imobiliária sabe. Sem cadastro, o texto fica como está.
    expect(sugerirOrigem('API')).toBeNull();
  });

  /**
   * "Santa Angela" é CONSTRUTORA e aparece como origem em 1.399 leads — é o
   * exemplo que o plano cita. A sugestão automática NÃO decide isso: quem
   * decide é a imobiliária, no cadastro. Inventar essa regra aqui seria o
   * mesmo defeito de sempre, com outra roupa.
   */
  it('NAO inventa regra de negocio', () => {
    expect(sugerirOrigem('Santa Angela')).toBeNull();
    expect(sugerirOrigem('ZAP Imóveis')).toBeNull();
    expect(sugerirOrigem('Instagram')).toBeNull();
  });
});

describe('resolverOrigem — a escolha salva vence', () => {
  const cadastro = [origem({ codigo: 'parceria', nome: 'Parceria com construtora', ordem: 2 })];

  it('a conversao salva ganha da sugestao e do texto cru', () => {
    expect(resolverOrigem('Santa Angela', { 'santa angela': 'parceria' }, cadastro))
      .toBe('Parceria com construtora');
  });

  it('a conversao casa sem depender de acento nem de caixa', () => {
    expect(resolverOrigem('SANTA ÂNGELA', { 'santa angela': 'parceria' }, cadastro))
      .toBe('Parceria com construtora');
  });

  it('sem conversao, vale a sugestao mecanica', () => {
    expect(resolverOrigem('Lia (Lotus Brokers)', {}, cadastro)).toBe('LIA');
  });

  it('sem conversao nem sugestao, vale o proprio texto', () => {
    expect(resolverOrigem('ZAP Imóveis', {}, cadastro)).toBe('ZAP Imóveis');
  });

  // Conversão apontando para código que não existe mais no cadastro: cai para
  // o caminho normal em vez de sumir com o lead do relatório.
  it('conversao orfa nao faz o lead desaparecer', () => {
    expect(resolverOrigem('Excel', { excel: 'codigo_apagado' }, cadastro)).toBe('Importação');
  });

  it('lead sem origem vira "Não informado", nao string vazia', () => {
    expect(resolverOrigem('', {}, cadastro)).toBe('Não informado');
    expect(resolverOrigem(null, {}, cadastro)).toBe('Não informado');
  });
});

describe('aparência e ordem', () => {
  const cadastro = [
    origem({ codigo: 'site', nome: 'Site', cor: '#0F6B54', ordem: 1 }),
    origem({ codigo: 'meta', nome: 'Meta Lead Ads', cor: '#1877F2', ordem: 2 }),
  ];

  it('acha a cor pelo nome ou pelo codigo', () => {
    expect(aparenciaDaOrigem('Site', cadastro)?.cor).toBe('#0F6B54');
    expect(aparenciaDaOrigem('meta', cadastro)?.cor).toBe('#1877F2');
  });

  it('origem fora do cadastro nao tem cor — quem desenha usa a paleta', () => {
    expect(aparenciaDaOrigem('Instagram', cadastro)).toBeNull();
  });


  // Sem desempate, a lista troca de posição a cada render e o gestor acha que
  // o dado mudou.
});
