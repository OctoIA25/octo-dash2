import { describe, it, expect } from 'vitest';
import {
  calculatePropertyCompleteness,
  contarFotosValidas,
  COMPLETENESS_CATEGORIES,
  FOTOS_RECOMENDADO,
  type PropertyCompletenessInput,
} from './propertyCompleteness';

const fotos = (quantidade: number) =>
  Array.from({ length: quantidade }, (_, i) => ({ url: `https://cdn.exemplo.com/foto-${i}.webp` }));

const DESCRICAO_DETALHADA = 'a'.repeat(300);

/** Imóvel com todas as categorias em 100%. */
const IMOVEL_COMPLETO: PropertyCompletenessInput = {
  finalidade: 'residencial',
  tipo: 'Apartamento',
  titulo: 'Apartamento no Centro',
  proprietario_nome: 'Maria Souza',
  proprietario_celular: '11988887777',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
  condominio: 'Edifício Paulista',
  valor_venda: '1.200.000,00',
  valor_condominio: '850,00',
  valor_iptu: '320,00',
  descricao: DESCRICAO_DETALHADA,
  fotos: fotos(FOTOS_RECOMENDADO),
  area_util: '92',
  quartos: '3',
  banheiros: '2',
  vagas: '2',
  caracteristicas: ['Piscina', 'Academia', 'Salão de festas'],
  link_video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  tour_virtual: 'https://tour.exemplo.com/imovel/1',
};

const categoria = (property: PropertyCompletenessInput, key: string) => {
  const result = calculatePropertyCompleteness(property).categories.find((c) => c.key === key);
  if (!result) throw new Error(`categoria ${key} não encontrada`);
  return result;
};

describe('pesos das categorias', () => {
  it('somam exatamente 100 pontos', () => {
    const total = COMPLETENESS_CATEGORIES.reduce((sum, c) => sum + c.points, 0);
    expect(total).toBe(100);
  });

  it('aponta para seções que existem no formulário', () => {
    // Ids reais dos <Collapsible id="secao-*"> do CriarImovelForm.
    const secoesDoForm = [
      'proprietario',
      'estrutura',
      'localizacao',
      'valores',
      'publicacao',
      'midia',
      'caracteristicas',
    ];
    for (const c of COMPLETENESS_CATEGORIES) {
      expect(secoesDoForm).toContain(c.section);
    }
    // Inclui os checks que sobrescrevem a seção da categoria (proprietário).
    for (const c of calculatePropertyCompleteness({}).categories) {
      for (const item of c.missing) {
        expect(secoesDoForm).toContain(item.section);
      }
    }
  });

  it('dá id, motivo e prioridade a todo item faltante', () => {
    const ids = new Set<string>();
    for (const c of calculatePropertyCompleteness({}).categories) {
      for (const item of c.missing) {
        expect(item.id).toBeTruthy();
        expect(item.why.length).toBeGreaterThan(10);
        expect(['alta', 'media', 'baixa']).toContain(item.priority);
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
      }
    }
  });

  it('distribui os pontos da categoria entre os itens faltantes', () => {
    for (const c of calculatePropertyCompleteness({}).categories) {
      const soma = c.missing.reduce((s, item) => s + item.points, 0);
      expect(soma).toBeCloseTo(c.maxPoints);
    }
  });
});

describe('imóvel vazio', () => {
  const vazio = calculatePropertyCompleteness({});

  it('resulta em 0%', () => {
    expect(vazio.percentage).toBe(0);
    expect(vazio.earnedPoints).toBe(0);
    expect(vazio.isComplete).toBe(false);
  });

  it('marca todas as categorias como incompletas com o que falta', () => {
    for (const c of vazio.categories) {
      expect(c.isComplete).toBe(false);
      expect(c.missing.length).toBeGreaterThan(0);
      expect(c.message).toBe(c.missing[0].label);
    }
  });

  it('não quebra com fotos/características nulas', () => {
    expect(calculatePropertyCompleteness({ fotos: null, caracteristicas: null }).percentage).toBe(0);
  });
});

describe('imóvel completamente preenchido', () => {
  const completo = calculatePropertyCompleteness(IMOVEL_COMPLETO);

  it('resulta em 100%', () => {
    expect(completo.percentage).toBe(100);
    expect(completo.earnedPoints).toBe(100);
    expect(completo.maxPoints).toBe(100);
    expect(completo.isComplete).toBe(true);
  });

  it('não deixa item faltante em nenhuma categoria', () => {
    for (const c of completo.categories) {
      expect(c.isComplete).toBe(true);
      expect(c.missing).toEqual([]);
      expect(c.percentage).toBe(100);
    }
  });

  it('aceita valores numéricos vindos do banco (edição), não só strings', () => {
    const doBanco = { ...IMOVEL_COMPLETO, valor_venda: 1200000, valor_iptu: 320, valor_condominio: 850, area_util: 92 };
    expect(calculatePropertyCompleteness(doBanco).percentage).toBe(100);
  });
});

describe('categoria parcialmente preenchida', () => {
  it('calcula proporcional ao peso (endereço só com CEP = 2/7)', () => {
    const endereco = categoria({ cep: '01310100' }, 'endereco');
    expect(endereco.percentage).toBeCloseTo((2 / 7) * 100);
    expect(endereco.earnedPoints).toBeCloseTo((2 / 7) * 15);
    expect(endereco.isComplete).toBe(false);
  });

  it('descrição cresce por faixa de tamanho', () => {
    expect(categoria({ descricao: 'curta' }, 'descricao').percentage).toBe(0);
    expect(categoria({ descricao: 'a'.repeat(40) }, 'descricao').percentage).toBe(50);
    expect(categoria({ descricao: 'a'.repeat(120) }, 'descricao').percentage).toBe(75);
    expect(categoria({ descricao: 'a'.repeat(300) }, 'descricao').percentage).toBe(100);
  });

  it('descrição só com espaços não conta', () => {
    expect(categoria({ descricao: '   '.repeat(200) }, 'descricao').percentage).toBe(0);
  });

  it('preço com valor principal mas sem IPTU fica em 3/4', () => {
    const preco = categoria({ valor_venda: '500.000,00' }, 'preco');
    expect(preco.percentage).toBe(75);
    expect(preco.missing.map((item) => item.label)).toEqual(['Informe o valor do IPTU']);
  });
});

describe('campos opcionais não impedem 100%', () => {
  it('condomínio não é cobrado de imóvel sem condomínio vinculado', () => {
    const semCondominio = { ...IMOVEL_COMPLETO, condominio: '', valor_condominio: '' };
    expect(categoria(semCondominio, 'preco').percentage).toBe(100);
  });

  it('cobra condomínio quando o imóvel está vinculado a um', () => {
    const comCondominio = { ...IMOVEL_COMPLETO, valor_condominio: '' };
    expect(categoria(comCondominio, 'preco').isComplete).toBe(false);
  });

  it('terreno chega a 100% em características sem quartos/banheiros/vagas', () => {
    const terreno: PropertyCompletenessInput = {
      tipo: 'Terreno',
      area_total: '400',
      caracteristicas: ['Portão eletrônico', 'Portaria 24h', 'Vigia'],
    };
    expect(categoria(terreno, 'caracteristicas').percentage).toBe(100);
  });

  it('apartamento sem suíte ainda chega a 100% (suíte não pontua)', () => {
    const semSuite = { ...IMOVEL_COMPLETO, suites: '' } as PropertyCompletenessInput;
    expect(calculatePropertyCompleteness(semSuite).percentage).toBe(100);
  });
});

describe('imagens', () => {
  it.each([
    [0, 0],
    [1, 25],
    [3, 50],
    [5, 75],
    [8, 100],
    [12, 100],
  ])('%i fotos → %i%%', (quantidade, esperado) => {
    expect(categoria({ fotos: fotos(quantidade) }, 'imagens').percentage).toBe(esperado);
  });

  it('diz quantas fotos faltam para o próximo passo', () => {
    expect(categoria({ fotos: fotos(1) }, 'imagens').message).toBe(
      'Adicione mais 2 fotos (recomendamos 8)',
    );
    expect(categoria({ fotos: [] }, 'imagens').message).toBe('Adicione mais 1 foto');
  });

  it('ignora fotos sem URL utilizável', () => {
    const quebradas = [{ url: '' }, { legenda: 'sem url' }, 'https://cdn.exemplo.com/ok.webp'];
    expect(contarFotosValidas(quebradas as never)).toBe(1);
    expect(categoria({ fotos: quebradas as never }, 'imagens').percentage).toBe(25);
  });

  it('aceita o formato legado (string[]) e o novo ({url})', () => {
    expect(contarFotosValidas(['https://a.webp', { url: 'https://b.webp' }])).toBe(2);
  });
});

describe('dados inválidos não contam como completos', () => {
  it('vídeo fora do YouTube não pontua', () => {
    expect(categoria({ link_video: 'https://vimeo.com/12345' }, 'video').percentage).toBe(0);
    expect(categoria({ link_video: 'https://youtu.be/dQw4w9WgXcQ' }, 'video').percentage).toBe(100);
  });

  it('tour virtual sem http(s) não pontua', () => {
    expect(categoria({ tour_virtual: 'tour.exemplo.com' }, 'tour').percentage).toBe(0);
    expect(categoria({ tour_virtual: 'ftp://tour.exemplo.com' }, 'tour').percentage).toBe(0);
    expect(categoria({ tour_virtual: 'https://tour.exemplo.com' }, 'tour').percentage).toBe(100);
  });

  it('CEP com menos de 8 dígitos não pontua', () => {
    expect(categoria({ cep: '013101' }, 'endereco').percentage).toBe(0);
  });

  it('valores zerados ou negativos não pontuam', () => {
    expect(categoria({ valor_venda: '0,00', valor_locacao: '0' }, 'preco').percentage).toBe(0);
    expect(categoria({ area_total: '-10' }, 'caracteristicas').percentage).toBe(0);
    expect(categoria({ area_total: 'abc' }, 'caracteristicas').percentage).toBe(0);
  });
});

describe('recálculo ao alterar o formulário', () => {
  it('sobe conforme os campos são preenchidos e chega a 100%', () => {
    let form: PropertyCompletenessInput = {};
    const inicial = calculatePropertyCompleteness(form).percentage;

    form = { ...form, finalidade: 'residencial', tipo: 'Apartamento' };
    const comTipo = calculatePropertyCompleteness(form).percentage;

    form = { ...form, cep: '01310-100', logradouro: 'Av. Paulista', numero: '1000' };
    const comEndereco = calculatePropertyCompleteness(form).percentage;

    expect(inicial).toBe(0);
    expect(comTipo).toBeGreaterThan(inicial);
    expect(comEndereco).toBeGreaterThan(comTipo);
    expect(calculatePropertyCompleteness(IMOVEL_COMPLETO).percentage).toBe(100);
  });

  it('cai quando um campo é apagado', () => {
    const semFotos = calculatePropertyCompleteness({ ...IMOVEL_COMPLETO, fotos: [] });
    expect(semFotos.percentage).toBe(85);
    expect(semFotos.isComplete).toBe(false);
  });

  it('o total é a soma dos pontos das categorias', () => {
    const parcial = calculatePropertyCompleteness({ ...IMOVEL_COMPLETO, descricao: 'a'.repeat(120) });
    const somaCategorias = parcial.categories.reduce((s, c) => s + c.earnedPoints, 0);
    expect(parcial.earnedPoints).toBeCloseTo(somaCategorias);
    expect(parcial.percentage).toBeCloseTo(somaCategorias);
  });
});
