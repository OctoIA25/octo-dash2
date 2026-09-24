/**
 * O Pipeline da tela inicial — um lead em um balde só.
 *
 * Este arquivo nasceu de uma conferência entre telas em 24/09, que comparou a
 * Home com o Funil e achou "um a mais" em dois lugares e "dois a mais" num
 * terceiro. Eram TRÊS causas diferentes, e nenhuma era o que o relatório dizia:
 *
 *   - um lead de PROPRIETÁRIO entrava em "Novos Leads", porque
 *     `'novos proprietários'` contém `'novo'`;
 *   - as 2 assinadas eram contadas em "Proposta" E em "Fechamento";
 *   - 326 leads em "Negociação" não casavam com balde nenhum — 19% da base
 *     invisível, sem erro e sem aviso.
 *
 * O caso que sustenta o arquivo é o último: *a soma fecha com o total*. É ele
 * que impede um lead de sumir ou de ser contado duas vezes, e é a única
 * asserção que pega os três defeitos de uma vez.
 */
import { describe, it, expect } from 'vitest';
import { baldeDoPipeline, pipelineDaHome, ORDEM_DO_PIPELINE } from '../funnelStages';

const l = (etapa_atual: string) => ({ etapa_atual });

/** A distribuição real da base em 24/09, etapa por etapa. */
const BASE_REAL = [
  ...Array(370).fill(0).map(() => l('Novos Leads')),
  ...Array(332).fill(0).map(() => l('Interação')),
  ...Array(331).fill(0).map(() => l('Visita Agendada')),
  ...Array(326).fill(0).map(() => l('Negociação')),
  ...Array(326).fill(0).map(() => l('Proposta Enviada')),
  ...Array(2).fill(0).map(() => l('Proposta Assinada')),
  l('Novos Proprietários'),
];

describe('em qual balde o lead cai', () => {
  it('cada etapa vai para o seu', () => {
    expect(baldeDoPipeline('Novos Leads')).toBe('Novos Leads');
    expect(baldeDoPipeline('Interação')).toBe('Em Atendimento');
    expect(baldeDoPipeline('Visita Agendada')).toBe('Visita');
    expect(baldeDoPipeline('Visita Realizada')).toBe('Visita');
    expect(baldeDoPipeline('Negociação')).toBe('Negociação');
    expect(baldeDoPipeline('Proposta Criada')).toBe('Proposta');
    expect(baldeDoPipeline('Proposta Enviada')).toBe('Proposta');
  });

  /*
   * "Proposta Assinada" contém a palavra "proposta". Testar os baldes na ordem
   * do funil a colocaria em "Proposta" — que foi o defeito de contar duas
   * vezes. A ordem vai do fim do funil para o começo por causa disto.
   */
  it('"Proposta Assinada" é Fechamento, e não Proposta', () => {
    expect(baldeDoPipeline('Proposta Assinada')).toBe('Fechamento');
  });

  /*
   * "Novos Proprietários" contém "novo". Foi o "um a mais" da conferência: um
   * lead de proprietário contado como cliente interessado novo.
   */
  it('"Novos Proprietários" não é um lead novo do funil de interessado', () => {
    expect(baldeDoPipeline('Novos Proprietários')).toBe('Outros');
  });

  it('lead sem etapa é novo — é o estado de quem acabou de entrar', () => {
    expect(baldeDoPipeline('')).toBe('Novos Leads');
    expect(baldeDoPipeline(null)).toBe('Novos Leads');
  });

  it('etapa que ninguém previu vai para Outros, e não some', () => {
    expect(baldeDoPipeline('Etapa que alguém inventou')).toBe('Outros');
  });
});

describe('o pipeline inteiro', () => {
  /*
   * A ASSERÇÃO QUE IMPORTA. Com ela, nenhum dos três defeitos passa: um lead
   * contado duas vezes faz a soma passar do total, e um lead sem balde faz a
   * soma ficar abaixo.
   */
  it('a soma dos baldes mais os outros é exatamente o total', () => {
    const p = pipelineDaHome(BASE_REAL);
    const soma = p.baldes.reduce((s, b) => s + b.count, 0) + p.outros;
    expect(p.total).toBe(1688);
    expect(soma).toBe(1688);
  });

  it('os números da base real, balde por balde', () => {
    const p = pipelineDaHome(BASE_REAL);
    const por = Object.fromEntries(p.baldes.map((b) => [b.label, b.count]));
    expect(por['Novos Leads']).toBe(370);      // era 371: o proprietário entrava
    expect(por['Em Atendimento']).toBe(332);
    expect(por['Visita']).toBe(331);
    expect(por['Negociação']).toBe(326);       // era 0: não havia balde
    expect(por['Proposta']).toBe(326);         // era 328: as assinadas entravam
    expect(por['Fechamento']).toBe(2);
    expect(p.outros).toBe(1);                  // o proprietário, contado e visível
  });

  it('lista vazia não quebra e não inventa percentual', () => {
    const p = pipelineDaHome([]);
    expect(p.total).toBe(0);
    expect(p.baldes.every((b) => b.count === 0 && b.pct === 0)).toBe(true);
  });

  it('a ordem é a do funil, de cima para baixo', () => {
    expect(pipelineDaHome(BASE_REAL).baldes.map((b) => b.label)).toEqual(ORDEM_DO_PIPELINE);
  });
});
