/**
 * O dicionário é o texto do (i) de cada contador. Estes testes existem para
 * duas coisas: que nenhuma métrica nativa fique sem explicação, e que o
 * dicionário não descreva uma conta que o código não faz mais.
 */
import { describe, it, expect } from 'vitest';
import { KPI_DICIONARIO, DICIONARIO_DASH, descricaoDaMetrica } from '../kpiDictionary';
import { NATIVE_METRIC_KEYS } from '../kpiTypes';

describe('KPI_DICIONARIO', () => {
  // O `Record<NativeMetricKey, string>` já obriga isso em tempo de compilação,
  // mas o projeto não roda typecheck no build — então vale também em teste.
  it('tem entrada para TODA métrica nativa', () => {
    const semTexto = NATIVE_METRIC_KEYS.filter((k) => !(KPI_DICIONARIO[k] || '').trim());
    expect(semTexto, 'métrica nativa sem texto no (i)').toEqual([]);
  });

  it('nao tem entrada sobrando (metrica que deixou de existir)', () => {
    const sobrando = Object.keys(KPI_DICIONARIO).filter(
      (k) => !NATIVE_METRIC_KEYS.includes(k as (typeof NATIVE_METRIC_KEYS)[number]),
    );
    expect(sobrando, 'entrada no dicionário sem métrica correspondente').toEqual([]);
  });

  // Um (i) que só repete o nome do card não serve para nada. O valor está em
  // dizer de qual evento até qual evento, e sobre quais registros.
  it('cada texto e uma frase de verdade, nao o rotulo repetido', () => {
    for (const chave of NATIVE_METRIC_KEYS) {
      expect(KPI_DICIONARIO[chave].length, `texto curto demais em ${chave}`).toBeGreaterThan(60);
    }
  });

  // As três pegadinhas que um gestor descobriria sozinho, do jeito ruim.
  it('avisa quais contadores ignoram o filtro de periodo', () => {
    expect(KPI_DICIONARIO.imoveisAtivos).toContain('ignora o filtro de período');
    expect(KPI_DICIONARIO.tamanhoEquipe).toContain('ignora o filtro de período');
  });

  it('avisa que "Indiferente" cai na captacao SEM exclusividade', () => {
    expect(KPI_DICIONARIO.captacaoSemExclusividade).toContain('Indiferente');
  });

  it('avisa que conversao de visita conta quem PASSOU da visita', () => {
    expect(KPI_DICIONARIO.conversaoVisita).toMatch(/OU passaram|passou pela visita/);
  });
});

describe('DICIONARIO_DASH — contadores fora do catálogo de KPIs', () => {
  it('cada texto e uma frase de verdade, nao o rotulo repetido', () => {
    for (const [chave, texto] of Object.entries(DICIONARIO_DASH)) {
      expect(texto.length, `texto curto demais em ${chave}`).toBeGreaterThan(60);
    }
  });

  // Chave prefixada pela tela para não colidir com o catálogo nativo — e o
  // catálogo tem precedência, então uma colisão silenciaria a entrada daqui.
  it('nenhuma chave colide com o catalogo nativo', () => {
    const colisoes = Object.keys(DICIONARIO_DASH).filter((k) => k in KPI_DICIONARIO);
    expect(colisoes).toEqual([]);
  });

  // As pegadinhas destas telas, que um gestor descobriria do jeito ruim.
  it('avisa que os numeros da home nao sao do mes', () => {
    expect(DICIONARIO_DASH['inicio.leadsNoFunil']).toContain('não é do mês');
    expect(DICIONARIO_DASH['inicio.conversaoBase']).toContain('não sobre o mês');
  });

  it('avisa que lead convertido e DISTINTO, nao proposta', () => {
    expect(DICIONARIO_DASH['relatorios.leadsConvertidos']).toContain('DISTINTOS');
  });
});

describe('descricaoDaMetrica', () => {
  it('o texto do gestor ganha do dicionario — a tela e dele', () => {
    expect(descricaoDaMetrica('totalLeads', 'Do meu jeito')).toBe('Do meu jeito');
  });

  it('gestor sem texto cai no dicionario', () => {
    expect(descricaoDaMetrica('totalLeads', '   ')).toBe(KPI_DICIONARIO.totalLeads);
    expect(descricaoDaMetrica('totalLeads', null)).toBe(KPI_DICIONARIO.totalLeads);
  });

  // KPI que o gestor criou (manual/planilha) não tem conta nativa para
  // descrever: sem texto dele, o (i) não aparece — melhor nada que vazio.
  it('KPI manual sem texto devolve null, e o (i) some', () => {
    expect(descricaoDaMetrica(null, '')).toBeNull();
    expect(descricaoDaMetrica('metricaQueNaoExiste', '')).toBeNull();
  });

  it('acha tambem os contadores das outras telas', () => {
    expect(descricaoDaMetrica('inicio.conversaoBase', '')).toBe(DICIONARIO_DASH['inicio.conversaoBase']);
    expect(descricaoDaMetrica('relatorios.leadsRecebidos', '')).toBe(DICIONARIO_DASH['relatorios.leadsRecebidos']);
  });
});
