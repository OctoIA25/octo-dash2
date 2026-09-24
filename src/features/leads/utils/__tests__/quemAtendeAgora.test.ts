/**
 * Quem atende os leads agora.
 *
 * O caso que sustenta o arquivo é o primeiro: bolsão LIGADO e distribuição
 * automática DESLIGADA. É o estado real da Lotus, medido em produção em
 * 24/09 — e era o estado que a tela contava errado, dizendo "Bolsão ativado,
 * leads expiram conforme a regra" enquanto nenhum cronômetro corria.
 */
import { describe, it, expect } from 'vitest';
import { quemAtendeAgora } from '../quemAtendeAgora';

describe('quemAtendeAgora', () => {
  it('a Lia atendendo vence o interruptor do bolsão — é o estado da Lotus', () => {
    const r = quemAtendeAgora({ autoDistributionEnabled: false, bolsaoEnabled: true });
    expect(r.quem).toBe('lia');
    expect(r.titulo).toMatch(/Lia está atendendo/i);
    // O ponto inteiro: dizer que os minutos não valem.
    expect(r.cronometrosValem).toBe(false);
    expect(r.explicacao).toMatch(/NÃO estão valendo/);
  });

  it('com a distribuição automática ligada e o bolsão desligado, ninguém é substituído', () => {
    const r = quemAtendeAgora({ autoDistributionEnabled: true, bolsaoEnabled: false });
    expect(r.quem).toBe('ninguem');
    expect(r.cronometrosValem).toBe(false);
  });

  it('com as duas ligadas, o Octo redistribui e os minutos valem', () => {
    const r = quemAtendeAgora({ autoDistributionEnabled: true, bolsaoEnabled: true });
    expect(r.quem).toBe('octo');
    expect(r.cronometrosValem).toBe(true);
    // Responde a pergunta dele: "a verificação não é em tempo real?"
    expect(r.explicacao).toMatch(/a cada minuto/);
  });

  it('config ainda não carregada não desenha "a Lia atende" por engano', () => {
    for (const vazio of [null, undefined, {}]) {
      const r = quemAtendeAgora(vazio);
      expect(r.quem).toBe('octo');
      expect(r.cronometrosValem).toBe(true);
    }
  });

  it('as duas desligadas: a Lia manda, porque é ela quem está com o lead', () => {
    const r = quemAtendeAgora({ autoDistributionEnabled: false, bolsaoEnabled: false });
    expect(r.quem).toBe('lia');
  });
});
