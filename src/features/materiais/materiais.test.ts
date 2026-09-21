import { describe, expect, it } from 'vitest';
import {
  avisoDePendentes, filtrar, paraQuem, planoDeCarreira, porCategoria,
  quantosFaltam, saltoEntreNiveis, type Material,
} from './materiais';
import { NIVEIS } from '@/features/comissionamento/commissionRules';

const material = (over: Partial<Material> = {}): Material => ({
  id: 'm1', titulo: 'Regimento interno', resumo: 'As regras da casa',
  categoria: 'regimento', tipo: 'texto', conteudo: 'Capítulo I...',
  arquivo: null, link_url: null, versao: 1, publicado_em: '2026-09-20T12:00:00Z',
  obrigatorio: false, publico: 'todos', cargo_id: null, team_id: null,
  ativo: true, rascunho: false, novo: true, lido_em: null, aceito_em: null,
  leram: null, aceitaram: null, ...over,
});

describe('o plano de carreira sai do motor de comissão', () => {
  it('tem um degrau por nível do motor — sem cópia nenhuma', () => {
    const degraus = planoDeCarreira();
    expect(degraus).toHaveLength(Object.keys(NIVEIS).length);
    for (const d of degraus) {
      expect(d.percentual).toBe(NIVEIS[d.nivel].percentual);
      expect(d.label).toBe(NIVEIS[d.nivel].label);
    }
  });

  it('vem do mais baixo para o mais alto', () => {
    const pcts = planoDeCarreira().map((d) => d.percentual);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
  });

  it('traduz o percentual em dinheiro, que é o que ajuda a decidir', () => {
    const pleno = planoDeCarreira(20000).find((d) => d.nivel === 'pleno')!;
    expect(pleno.percentual).toBe(45);
    expect(pleno.exemplo).toBe(9000);
  });

  it('aceita outra comissão de exemplo', () => {
    expect(planoDeCarreira(10000).find((d) => d.nivel === 'senior')!.exemplo).toBe(5000);
  });

  it('diz quantos pontos separam um nível do seguinte', () => {
    const saltos = saltoEntreNiveis(planoDeCarreira());
    expect(saltos[0].pontos).toBeGreaterThan(0);
    expect(saltos).toHaveLength(Object.keys(NIVEIS).length - 1);
  });
});

describe('a lista por categoria', () => {
  it('não mostra categoria vazia', () => {
    const g = porCategoria([material({ categoria: 'regimento' })]);
    expect(g).toHaveLength(1);
    expect(g[0].rotulo).toBe('Regimento');
  });

  it('põe o plano de carreira primeiro', () => {
    const g = porCategoria([
      material({ id: 'a', categoria: 'outros' }),
      material({ id: 'b', categoria: 'plano_de_carreira' }),
    ]);
    expect(g[0].categoria).toBe('plano_de_carreira');
  });
});

describe('a busca', () => {
  const lista = [
    material({ id: 'a', titulo: 'Regimento interno', conteudo: 'férias e faltas' }),
    material({ id: 'b', titulo: 'Script de abordagem', resumo: 'primeiro contato', conteudo: 'Bom dia' }),
  ];

  it('devolve tudo com o termo vazio', () => {
    expect(filtrar(lista, '')).toHaveLength(2);
    expect(filtrar(lista, '   ')).toHaveLength(2);
  });

  it('acha pelo título', () => {
    expect(filtrar(lista, 'script')).toHaveLength(1);
  });

  it('acha pelo resumo', () => {
    expect(filtrar(lista, 'primeiro contato')[0].id).toBe('b');
  });

  it('acha DENTRO do texto — é o que faz a busca valer a pena', () => {
    expect(filtrar(lista, 'férias')[0].id).toBe('a');
  });

  it('não busca dentro de arquivo ou link, que não têm texto aqui', () => {
    const comArquivo = [material({ id: 'c', tipo: 'arquivo', conteudo: 'ignorado', titulo: 'Apostila' })];
    expect(filtrar(comArquivo, 'ignorado')).toHaveLength(0);
    expect(filtrar(comArquivo, 'apostila')).toHaveLength(1);
  });
});

describe('o aviso de pendentes', () => {
  it('cala quando não falta nada — "0 pendentes" treina a ignorar o aviso', () => {
    expect(avisoDePendentes([])).toBeNull();
    expect(avisoDePendentes(null)).toBeNull();
  });

  it('nomeia o material quando é um só', () => {
    expect(avisoDePendentes([{ titulo: 'Regimento' }])).toContain('Regimento');
  });

  it('conta quando são vários', () => {
    expect(avisoDePendentes([{ titulo: 'A' }, { titulo: 'B' }])).toContain('2 materiais');
  });
});

describe('quantos faltam aceitar', () => {
  it('cala em material que não é obrigatório', () => {
    expect(quantosFaltam(material({ obrigatorio: false, aceitaram: 0 }), 5)).toBeNull();
  });

  it('diz o que FALTA, não o que foi feito', () => {
    const t = quantosFaltam(material({ obrigatorio: true, aceitaram: 2 }), 5)!;
    expect(t).toBe('3 de 5 ainda não aceitaram.');
  });

  it('comemora quando todos aceitaram', () => {
    expect(quantosFaltam(material({ obrigatorio: true, aceitaram: 5 }), 5))
      .toBe('Todas as 5 pessoas já aceitaram.');
  });

  it('não devolve número negativo se o aceite passar do alcance', () => {
    expect(quantosFaltam(material({ obrigatorio: true, aceitaram: 9 }), 5))
      .toBe('Todas as 5 pessoas já aceitaram.');
  });

  it('cala quando o material não alcança ninguém', () => {
    expect(quantosFaltam(material({ obrigatorio: true, aceitaram: 0 }), 0)).toBeNull();
  });
});

describe('para quem é o material', () => {
  it('diz o nome do cargo quando há', () => {
    expect(paraQuem(material({ publico: 'cargo' }), 'Líder de equipe')).toBe('Cargo: Líder de equipe');
  });

  it('não mostra identificador quando o nome não veio', () => {
    expect(paraQuem(material({ publico: 'cargo' }))).toBe('Um cargo específico');
  });

  it('o padrão é toda a equipe', () => {
    expect(paraQuem(material())).toBe('Toda a equipe');
  });
});
