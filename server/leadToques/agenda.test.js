/**
 * Cadência que vira atividade na agenda. O que importa aqui: a hora marcada
 * chega na agenda como o corretor escolheu (fuso de São Paulo), o vínculo
 * aponta para a coluna certa de cada tipo de lead, e o toque novo fecha o
 * compromisso do anterior — sem isso a atividade velha venceria e bloquearia
 * um corretor que está em dia.
 */
import { describe, it, expect, vi } from 'vitest';
import { dataHoraEmSaoPaulo, eventoDoToque, sincronizarAgendaDoToque, TIPO_CADENCIA } from './agenda.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const TOQUE = '33333333-3333-3333-3333-333333333333';
const LEAD_CRM = { id: 'bf3bfb20-d643-4147-a2ba-aa170d21a5b7', tabela: 'leads', nome: 'Ana', phone: '11999998888' };
const LEAD_KENLO = { id: 'cf3bfb20-d643-4147-a2ba-aa170d21a5b8', tabela: 'kenlo_leads', nome: 'Bia', phone: null };

const toque = (over = {}) => ({ id: TOQUE, proximo_toque_em: '2026-09-21T17:00:00.000Z', ...over });

/** Supabase falsificado: guarda update/insert com seus filtros. */
function supabaseFalso() {
  const chamadas = [];
  return {
    chamadas,
    from(tabela) {
      const registro = { tabela, filtros: {}, outros: [] };
      chamadas.push(registro);
      const chain = {
        update: (row) => { registro.update = row; return chain; },
        insert: (row) => { registro.insert = row; return chain; },
        select: () => chain,
        eq: (col, val) => { registro.filtros[col] = val; return chain; },
        neq: (col, val) => { registro.outros.push(['neq', col, val]); return chain; },
        not: (col, op, val) => { registro.outros.push(['not', col, op, val]); return chain; },
        in: (col, vals) => { registro.outros.push(['in', col, vals]); return chain; },
        single: () => Promise.resolve({ data: { id: 'evento-1' }, error: null }),
        then: (r) => Promise.resolve({ data: null, error: null }).then(r),
      };
      return chain;
    },
  };
}

describe('dataHoraEmSaoPaulo', () => {
  it('converte o instante gravado para a data e a hora que o corretor marcou', () => {
    expect(dataHoraEmSaoPaulo('2026-09-21T17:00:00.000Z')).toEqual({ data: '2026-09-21', horario: '14:00' });
  });

  it('vira o dia quando o horário em UTC já passou da meia-noite', () => {
    expect(dataHoraEmSaoPaulo('2026-09-22T02:30:00.000Z')).toEqual({ data: '2026-09-21', horario: '23:30' });
  });

  it('data inválida não vira atividade', () => {
    expect(dataHoraEmSaoPaulo('não é data')).toBeNull();
    expect(dataHoraEmSaoPaulo(null)).toBeNull();
  });
});

describe('eventoDoToque', () => {
  it('monta a atividade bloqueante do próximo toque, ligada ao lead do CRM', () => {
    const evento = eventoDoToque({ toque: toque(), tenantId: TENANT, corretorEmail: 'ana@imob.com', lead: LEAD_CRM });

    expect(evento).toMatchObject({
      tenant_id: TENANT,
      corretor_email: 'ana@imob.com',
      tipo: TIPO_CADENCIA,
      status: 'pendente',
      data: '2026-09-21',
      horario: '14:00',
      lead_uuid: LEAD_CRM.id,
      lead_nome: 'Ana',
      lead_telefone: '11999998888',
      toque_id: TOQUE,
    });
    expect(evento.lead_id).toBeUndefined();
  });

  it('lead que não é do CRM entra pela outra coluna, sem esbarrar na chave estrangeira', () => {
    const evento = eventoDoToque({ toque: toque(), tenantId: TENANT, corretorEmail: 'ana@imob.com', lead: LEAD_KENLO });

    expect(evento.lead_id).toBe(LEAD_KENLO.id);
    expect(evento.lead_uuid).toBeUndefined();
  });

  it('toque sem próximo marcado não vira atividade', () => {
    expect(eventoDoToque({ toque: toque({ proximo_toque_em: null }), tenantId: TENANT, corretorEmail: 'a@b.c', lead: LEAD_CRM })).toBeNull();
  });
});

describe('sincronizarAgendaDoToque', () => {
  const chamar = (supabase, over = {}) =>
    sincronizarAgendaDoToque({ supabase, toque: toque(over), tenantId: TENANT, corretorEmail: 'ana@imob.com', lead: LEAD_CRM });

  it('fecha o compromisso do toque anterior e abre o do novo', async () => {
    const sb = supabaseFalso();
    await chamar(sb);

    const fechamento = sb.chamadas.find((c) => c.update);
    expect(fechamento.tabela).toBe('agenda_eventos');
    expect(fechamento.update.status).toBe('concluido');
    expect(fechamento.filtros).toEqual({ tenant_id: TENANT, lead_uuid: LEAD_CRM.id });
    // Só as atividades que vieram da cadência, e nunca a que acabou de nascer.
    expect(fechamento.outros).toEqual(
      expect.arrayContaining([
        ['not', 'toque_id', 'is', null],
        ['neq', 'toque_id', TOQUE],
        ['in', 'status', ['pendente', 'confirmado']],
      ]),
    );

    const criacao = sb.chamadas.find((c) => c.insert);
    expect(criacao.insert).toMatchObject({ toque_id: TOQUE, tipo: TIPO_CADENCIA });
  });

  it('sem próximo toque, fecha o anterior e não abre nada', async () => {
    const sb = supabaseFalso();
    await chamar(sb, { proximo_toque_em: null });

    expect(sb.chamadas.some((c) => c.update)).toBe(true);
    expect(sb.chamadas.some((c) => c.insert)).toBe(false);
  });

  it('erro da agenda não derruba o toque já registrado', async () => {
    const sb = supabaseFalso();
    sb.from = () => { throw new Error('agenda fora do ar'); };
    const aviso = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(chamar(sb)).resolves.toBeNull();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});
