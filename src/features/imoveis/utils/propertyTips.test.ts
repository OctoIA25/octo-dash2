import { describe, it, expect } from 'vitest';
import {
  calculatePropertyCompleteness,
  FOTOS_RECOMENDADO,
  type PropertyCompletenessInput,
} from './propertyCompleteness';
import { buildPropertyTips, TIPS_VISIVEIS } from './propertyTips';

const fotos = (quantidade: number) =>
  Array.from({ length: quantidade }, (_, i) => ({ url: `https://cdn.exemplo.com/foto-${i}.webp` }));

/** Imóvel com todas as categorias em 100% — mesma base do completômetro. */
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
  valor_venda: '1.200.000,00',
  valor_iptu: '320,00',
  descricao: 'a'.repeat(300),
  fotos: fotos(FOTOS_RECOMENDADO),
  area_util: '92',
  quartos: '3',
  banheiros: '2',
  vagas: '2',
  caracteristicas: ['Piscina', 'Academia', 'Salão de festas'],
  link_video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  tour_virtual: 'https://tour.exemplo.com/imovel/1',
};

const tips = (property: PropertyCompletenessInput) =>
  buildPropertyTips(calculatePropertyCompleteness(property));

const ids = (property: PropertyCompletenessInput) => tips(property).map((t) => t.id);

describe('imóvel sem dados', () => {
  const vazio = tips({});

  it('gera uma dica por categoria — não uma por critério', () => {
    expect(vazio).toHaveLength(calculatePropertyCompleteness({}).categories.length);
    expect(new Set(vazio.map((t) => t.categoryKey)).size).toBe(vazio.length);
  });

  it('começa pelas informações fundamentais', () => {
    const top = vazio.slice(0, TIPS_VISIVEIS);
    expect(top.every((t) => t.priority === 'alta')).toBe(true);
    expect(top.map((t) => t.categoryKey)).toEqual(['basicas', 'preco', 'endereco']);
  });

  it('responde o que fazer, por que importa e para onde ir', () => {
    for (const tip of vazio) {
      expect(tip.title).toBeTruthy();
      expect(tip.description).toBeTruthy();
      expect(tip.section).toBeTruthy();
      expect(tip.points).toBeGreaterThan(0);
    }
  });

  it('deixa vídeo e tour virtual por último, como melhoria', () => {
    const finais = vazio.slice(-2).map((t) => t.categoryKey);
    expect(finais.sort()).toEqual(['tour', 'video']);
    expect(vazio.filter((t) => ['video', 'tour'].includes(t.categoryKey)).every((t) => t.priority === 'baixa')).toBe(true);
  });
});

describe('a dica some quando o problema é resolvido', () => {
  it('descrição: sai da lista ao atingir o tamanho recomendado', () => {
    expect(ids({})).toContain('descricao-minima');
    expect(ids({ descricao: 'a'.repeat(40) })).toContain('descricao-boa');
    expect(ids({ descricao: 'a'.repeat(300) }).some((id) => id.startsWith('descricao'))).toBe(false);
  });

  it('contato do proprietário: some com e-mail, telefone ou celular', () => {
    const semContato = tips({ proprietario_nome: 'Maria', finalidade: 'residencial', tipo: 'Casa', titulo: 'Casa' });
    expect(semContato.find((t) => t.categoryKey === 'basicas')?.id).toBe('proprietario-contato');

    const comEmail = tips({
      proprietario_nome: 'Maria',
      proprietario_email: 'maria@exemplo.com',
      finalidade: 'residencial',
      tipo: 'Casa',
      titulo: 'Casa',
    });
    expect(comEmail.some((t) => t.categoryKey === 'basicas')).toBe(false);
  });

  it('preço: some ao informar o valor de venda ou locação', () => {
    expect(ids({})).toContain('valor-principal');
    expect(ids({ valor_locacao: '2.500,00' })).not.toContain('valor-principal');
  });

  it('vídeo: some ao adicionar o link', () => {
    expect(ids({})).toContain('video');
    expect(ids({ link_video: 'https://youtu.be/dQw4w9WgXcQ' })).not.toContain('video');
  });
});

describe('imagens', () => {
  it.each([
    [0, 'Adicione mais 1 foto'],
    [1, 'Adicione mais 2 fotos (recomendamos 8)'],
    [3, 'Adicione mais 2 fotos (recomendamos 8)'],
    [5, 'Adicione mais 3 fotos (recomendamos 8)'],
  ])('com %i fotos pede: %s', (quantidade, titulo) => {
    const imagens = tips({ fotos: fotos(quantidade) }).find((t) => t.categoryKey === 'imagens');
    expect(imagens?.title).toBe(titulo);
  });

  it('com o recomendado, a dica desaparece', () => {
    expect(ids({ fotos: fotos(FOTOS_RECOMENDADO) })).not.toContain('fotos-8');
    expect(tips({ fotos: fotos(FOTOS_RECOMENDADO) }).some((t) => t.categoryKey === 'imagens')).toBe(false);
  });

  it('as 4 faixas de foto viram UMA dica com os pontos que ainda faltam', () => {
    const semFotos = tips({}).find((t) => t.categoryKey === 'imagens');
    expect(semFotos?.points).toBeCloseTo(15);

    const comMetade = tips({ fotos: fotos(3) }).find((t) => t.categoryKey === 'imagens');
    expect(comMetade?.points).toBeCloseTo(7.5);
  });

  it('nenhuma foto é falha alta; a partir daí é melhoria', () => {
    expect(tips({}).find((t) => t.categoryKey === 'imagens')?.priority).toBe('alta');
    expect(tips({ fotos: fotos(1) }).find((t) => t.categoryKey === 'imagens')?.priority).toBe('media');
  });
});

describe('ordenação e limite', () => {
  it('prioridade alta vem antes de média, e média antes de baixa', () => {
    const ordem = { alta: 0, media: 1, baixa: 2 };
    const sequencia = tips({}).map((t) => ordem[t.priority]);
    expect([...sequencia].sort((a, b) => a - b)).toEqual(sequencia);
  });

  it('dentro da mesma prioridade, o que soma mais pontos vem primeiro', () => {
    // Arredondado: frações de peso deixam resíduo de ponto flutuante e empates
    // exatos (15 vs 14,999…) não devem contar como desordem.
    const altas = tips({})
      .filter((t) => t.priority === 'alta')
      .map((t) => Math.round(t.points));
    expect([...altas].sort((a, b) => b - a)).toEqual(altas);
  });

  it('a apresentação corta em poucas dicas, não em dezenas', () => {
    expect(TIPS_VISIVEIS).toBe(3);
    expect(tips({}).slice(0, TIPS_VISIVEIS)).toHaveLength(3);
  });
});

describe('campos que não se aplicam não viram dica', () => {
  it('terreno não recebe dica de dormitórios/vagas', () => {
    const terreno = tips({ tipo: 'Terreno', area_total: '400' });
    const caracteristicas = terreno.find((t) => t.categoryKey === 'caracteristicas');
    expect(caracteristicas?.id).toBe('amenidades');
  });

  it('imóvel sem condomínio vinculado não recebe dica de condomínio', () => {
    expect(ids({ valor_venda: '500.000,00', valor_iptu: '300' })).not.toContain('condominio');
    expect(ids({ valor_venda: '500.000,00', valor_iptu: '300', condominio: 'Ed. Paulista' })).toContain('condominio');
  });
});

describe('imóvel completo', () => {
  it('não gera nenhuma dica', () => {
    const resultado = calculatePropertyCompleteness(IMOVEL_COMPLETO);
    expect(resultado.isComplete).toBe(true);
    expect(buildPropertyTips(resultado)).toEqual([]);
  });

  it('a 95% sobra apenas a melhoria opcional', () => {
    const quaseCompleto = buildPropertyTips(
      calculatePropertyCompleteness({ ...IMOVEL_COMPLETO, tour_virtual: '' }),
    );
    expect(quaseCompleto).toHaveLength(1);
    expect(quaseCompleto[0]).toMatchObject({ id: 'tour', priority: 'baixa', section: 'midia' });
  });
});
