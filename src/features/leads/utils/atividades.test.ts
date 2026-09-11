import { describe, it, expect } from 'vitest';
import {
  prazoAtividade,
  faixaDaAtividade,
  agruparAtividades,
  atividadeNaAba,
  contarAbas,
  filtrarPorAba,
  separarAFazer,
  etapaAposAtividade,
  type Atividade,
} from './atividades';

const AGORA = new Date(2026, 8, 11, 14, 0, 0); // 11/set/2026, 14h

const atv = (over: Partial<Atividade> = {}): Atividade => ({
  id: over.id ?? 'a1',
  titulo: 'Ligar pro João',
  data: '2026-09-11',
  horario: '10:00',
  tipo: 'retornar_cliente',
  status: 'pendente',
  corretor_email: 'ana@imob.com',
  ...over,
});

describe('prazoAtividade', () => {
  it('usa o horário quando existe', () => {
    expect(prazoAtividade({ data: '2026-09-11', horario: '10:30' })).toEqual(
      new Date(2026, 8, 11, 10, 30, 0, 0)
    );
  });

  it('sem horário, vence no fim do dia — senão toda tarefa nasceria atrasada', () => {
    const prazo = prazoAtividade({ data: '2026-09-11', horario: null });
    expect(prazo.getHours()).toBe(23);
    expect(prazo.getMinutes()).toBe(59);
  });

  it('não escorrega de dia por fuso (data crua, não ISO UTC)', () => {
    expect(prazoAtividade({ data: '2026-09-11', horario: '00:30' }).getDate()).toBe(11);
  });
});

describe('faixaDaAtividade', () => {
  it('passou do horário e segue pendente → atrasada', () => {
    expect(faixaDaAtividade(atv({ horario: '10:00' }), AGORA)).toBe('atrasada');
  });

  it('ainda hoje, mais tarde → hoje', () => {
    expect(faixaDaAtividade(atv({ horario: '18:00' }), AGORA)).toBe('hoje');
  });

  it('sem horário, hoje → hoje (não atrasada)', () => {
    expect(faixaDaAtividade(atv({ horario: null }), AGORA)).toBe('hoje');
  });

  it('dentro de 7 dias → proximas; além disso → futura', () => {
    expect(faixaDaAtividade(atv({ data: '2026-09-15' }), AGORA)).toBe('proximas');
    expect(faixaDaAtividade(atv({ data: '2026-09-30' }), AGORA)).toBe('futura');
  });

  it('concluída ou cancelada sai das faixas de cobrança, mesmo vencida', () => {
    expect(faixaDaAtividade(atv({ data: '2026-09-01', status: 'concluido' }), AGORA)).toBe('concluida');
    expect(faixaDaAtividade(atv({ data: '2026-09-01', status: 'cancelado' }), AGORA)).toBe('cancelada');
  });
});

describe('agruparAtividades', () => {
  it('separa nas três faixas e ordena pelo prazo', () => {
    const grupos = agruparAtividades(
      [
        atv({ id: 'tarde', horario: '18:00' }),
        atv({ id: 'velha', data: '2026-09-05' }),
        atv({ id: 'manha', horario: '09:00' }),
        atv({ id: 'semana', data: '2026-09-14' }),
        atv({ id: 'longe', data: '2026-10-20' }),
      ],
      AGORA
    );
    expect(grupos.atrasadas.map((a) => a.id)).toEqual(['velha', 'manha']);
    expect(grupos.hoje.map((a) => a.id)).toEqual(['tarde']);
    expect(grupos.proximas.map((a) => a.id)).toEqual(['semana']);
  });
});

describe('abas do painel', () => {
  const atrasada = atv({ id: 'atrasada', data: '2026-09-05' });
  const deHoje = atv({ id: 'hoje', horario: '18:00' });
  const futura = atv({ id: 'futura', data: '2026-09-20' });
  const visitaFutura = atv({ id: 'visitaF', data: '2026-09-18', tipo: 'visita_agendada' });
  const visitaAtrasada = atv({ id: 'visitaA', data: '2026-09-02', tipo: 'visita_agendada' });
  const concluida = atv({ id: 'feita', data: '2026-09-05', status: 'concluido' });
  const todas = [atrasada, deHoje, futura, visitaFutura, visitaAtrasada, concluida];

  it('"A fazer" é o que já chegou: atrasada ou de hoje', () => {
    expect(filtrarPorAba(todas, 'afazer', AGORA).map((a) => a.id).sort()).toEqual(
      ['atrasada', 'hoje', 'visitaA']
    );
  });

  it('"Futuras" é o que ainda não chegou a data', () => {
    expect(filtrarPorAba(todas, 'futuras', AGORA).map((a) => a.id).sort()).toEqual(
      ['futura', 'visitaF']
    );
  });

  it('"Visitas" é transversal — pega visita atrasada e futura, nunca outro tipo', () => {
    expect(filtrarPorAba(todas, 'visitas', AGORA).map((a) => a.id).sort()).toEqual(
      ['visitaA', 'visitaF']
    );
  });

  it('concluída sai de todas as abas de trabalho, mas fica em "Todos"', () => {
    for (const aba of ['afazer', 'visitas', 'futuras'] as const) {
      expect(filtrarPorAba([concluida], aba, AGORA)).toEqual([]);
    }
    expect(filtrarPorAba([concluida], 'todos', AGORA)).toHaveLength(1);
  });

  it('a atividade anda sozinha de aba conforme o relógio', () => {
    const marcada = atv({ id: 'x', data: '2026-09-15', horario: '10:00' });
    const antes = new Date(2026, 8, 14, 12, 0);
    const noDia = new Date(2026, 8, 15, 8, 0);
    const depois = new Date(2026, 8, 16, 8, 0);

    expect(atividadeNaAba(marcada, 'futuras', antes)).toBe(true);
    expect(atividadeNaAba(marcada, 'afazer', noDia)).toBe(true);
    expect(separarAFazer([marcada], noDia).hoje).toHaveLength(1);
    expect(separarAFazer([marcada], depois).pendentes).toHaveLength(1);
  });

  it('contarAbas conta a mesma atividade nas abas que se sobrepõem', () => {
    const contagem = contarAbas(todas, AGORA);
    expect(contagem).toEqual({ afazer: 3, visitas: 2, futuras: 2, todos: 6 });
  });
});

describe('etapaAposAtividade', () => {
  it('marcar visita move o lead, venha ele de onde vier', () => {
    expect(etapaAposAtividade('visita_agendada', 'Novos Leads')).toBe('visita-agendada');
    expect(etapaAposAtividade('visita_realizada', 'Proposta Enviada')).toBe('visita-agendada');
  });

  it('retorno e reunião só empurram lead que ainda está no começo', () => {
    expect(etapaAposAtividade('retornar_cliente', 'Novos Leads')).toBe('visita-agendada');
    expect(etapaAposAtividade('reuniao', 'Interacao')).toBe('visita-agendada');
    expect(etapaAposAtividade('retornar_cliente', 'Proposta Assinada')).toBeNull();
    expect(etapaAposAtividade('reuniao', 'Negociação')).toBeNull();
  });

  it('normaliza o status antes de comparar (espaço vira hífen, caixa some)', () => {
    expect(etapaAposAtividade('retornar_cliente', 'NOVOS LEADS')).toBe('visita-agendada');
  });

  it('tipo sem regra não move nada', () => {
    expect(etapaAposAtividade('tarefa', 'Novos Leads')).toBeNull();
    expect(etapaAposAtividade('outro', null)).toBeNull();
  });
});
