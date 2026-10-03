import { describe, expect, it } from 'vitest';
import {
  avisoDaComissaoDaProposta, divergencia, entradaDoMotor, repassesDaVenda,
  conferirParcelas, resumoDaReleitura, rotuloDaSituacao, rotuloDoNivel, totaisConferem,
  type PessoaDoRepasse, type TotaisDaConferencia, type VendaNaLista,
} from './vendas';

const venda = (over: Partial<VendaNaLista> = {}): VendaNaLista => ({
  id: 'v1', data_venda: '2026-09-15', empreendimento: 'Reserva Castanheira',
  construtora: 'Santa Ângela', tipo: 'lancamento', corretor: 'Ana',
  corretor_id: 'u-ana', nivel_corretor: 'junior', lead_id: 'l1', origem: null, codigo: null,
  vgv: 600000, comissao_pct: 5, comissao_bruta: 30000,
  imposto_pct: 6, imposto_valor: 1800, comissao_liquida: 28200,
  comissao_da_proposta: null, nf_numero: null, nf_data: null,
  recebimento_previsto_em: null, recebido_em: null, valor_recebido: null,
  diferenca: 0, status: 'a_faturar', repasses: 0, repasses_pagos: 0,
  cliente: '', parcelas: 1, parcelas_pagas: 0, situacao: 'pendente',
  ...over,
});

const equipe: PessoaDoRepasse[] = [
  { user_id: 'u-ana', nome: 'Ana', nivel: 'junior', leader_user_id: 'u-carla' },
  { user_id: 'u-carla', nome: 'Carla', nivel: 'coordenador', leader_user_id: null },
];

describe('divergência entre o previsto e o recebido', () => {
  it('não existe antes de receber — esperar não é divergir', () => {
    expect(divergencia(venda({ valor_recebido: null }))).toBeNull();
  });

  // A construtora deposita a BRUTA. O imposto é pago depois, pela casa.
  it('recebimento igual à comissão bruta NÃO é divergência', () => {
    expect(divergencia(venda({ valor_recebido: 30000 }))).toBeNull();
  });

  it('e receber a líquida É divergência — faltou o imposto no depósito', () => {
    const d = divergencia(venda({ valor_recebido: 28200 }));
    expect(d?.sentido).toBe('a_menos');
    expect(d?.texto).toContain('1.800,00');
  });

  it('não acusa diferença de centavo', () => {
    expect(divergencia(venda({ valor_recebido: 30000.004 }))).toBeNull();
  });

  it('acusa o que entrou a menos, com o valor', () => {
    const d = divergencia(venda({ valor_recebido: 25000 }));
    expect(d?.sentido).toBe('a_menos');
    expect(d?.texto).toContain('5.000,00');
  });

  it('acusa também o que entrou A MAIS — dinheiro sobrando é erro igual', () => {
    expect(divergencia(venda({ valor_recebido: 31000 }))?.sentido).toBe('a_mais');
  });
});

describe('a comissão da proposta contra a calculada', () => {
  it('cala quando a proposta não trazia total', () => {
    expect(avisoDaComissaoDaProposta(venda())).toBeNull();
  });

  it('cala quando as duas batem', () => {
    expect(avisoDaComissaoDaProposta(venda({ comissao_da_proposta: 30000 }))).toBeNull();
  });

  it('mostra os DOIS números quando discordam, e diz qual vale', () => {
    const aviso = avisoDaComissaoDaProposta(venda({ comissao_da_proposta: 24000 }));
    expect(aviso).toContain('24.000,00');
    expect(aviso).toContain('30.000,00');
    expect(aviso).toContain('Vale o cálculo');
  });
});

describe('o rodapé bate com as linhas', () => {
  const totais = (over: Partial<TotaisDaConferencia> = {}): TotaisDaConferencia => ({
    vendas: 2, vgv: 900000, comissao_bruta: 45000, imposto: 2700,
    comissao_liquida: 42300, recebido: 0, a_receber: 42300,
    divergentes: 0, sem_percentual: 0, sem_repasse: 2, ...over,
  });

  const duas = [venda(), venda({ id: 'v2', vgv: 300000, comissao_bruta: 15000, imposto_valor: 900, comissao_liquida: 14100 })];

  it('confere quando fecha', () => {
    expect(totaisConferem(duas, totais()).confere).toBe(true);
  });

  it('acusa o campo que não fechou, com os dois valores', () => {
    const r = totaisConferem(duas, totais({ comissao_liquida: 40000 }));
    expect(r.confere).toBe(false);
    expect(r.campo).toBe('comissao_liquida');
    expect(r.soma).toBeCloseTo(42300, 2);
    expect(r.rodape).toBe(40000);
  });
});

describe('a entrada do motor de comissão', () => {
  it('usa o nível CONGELADO na venda, não o do cadastro de hoje', () => {
    // A Ana foi promovida a sênior depois. A venda continua de júnior.
    const promovida: PessoaDoRepasse[] = [
      { ...equipe[0], nivel: 'senior' }, equipe[1],
    ];
    const r = entradaDoMotor(venda({ nivel_corretor: 'junior' }), promovida);
    expect('entrada' in r && r.entrada.tipo !== 'permuta' && r.entrada.intermediacao?.nivel).toBe('junior');
  });

  it('impede o cálculo quando a venda está sem nível, e diz como destravar', () => {
    const r = entradaDoMotor(venda({ nivel_corretor: null }), equipe);
    expect('impedimento' in r && r.impedimento).toContain('sem nível de comissão no cadastro');
    expect('impedimento' in r && r.impedimento).toContain('a venda pega esse nível na hora');
  });

  it('impede quando a comissão está zerada — nada para repassar', () => {
    const r = entradaDoMotor(venda({ comissao_bruta: 0 }), equipe);
    expect('impedimento' in r && r.impedimento).toContain('zerada');
  });

  // Medido na planilha da Lotus: em 26 das 31 vendas, corretor + líder dão
  // exatamente 60% do BRUTO. Dividir a líquida pagaria 6% a menos a cada um.
  it('divide a BRUTA, não a líquida — o imposto sai dos 40% da casa', () => {
    const r = entradaDoMotor(venda(), equipe);
    expect('entrada' in r && r.entrada.tipo !== 'permuta' && r.entrada.comissaoTotal).toBe(30000);
  });

  it('lançamento não tem ponta de captação; venda de terceiros tem', () => {
    const l = entradaDoMotor(venda({ tipo: 'lancamento' }), equipe);
    expect('entrada' in l && l.entrada.tipo !== 'permuta' && l.entrada.captacao).toBeNull();
    const t = entradaDoMotor(venda({ tipo: 'terceiros' }), equipe);
    expect('entrada' in t && t.entrada.tipo !== 'permuta' && t.entrada.captacao?.nome).toBe('Ana');
  });
});

describe('os repasses da venda', () => {
  it('fecham a comissão bruta inteira', () => {
    const r = repassesDaVenda(venda(), equipe);
    expect('linhas' in r).toBe(true);
    if (!('linhas' in r)) return;
    const soma = r.linhas.reduce((s, l) => s + l.valor, 0);
    expect(soma).toBeCloseTo(30000, 2);
  });

  // O caso real da planilha: júnior com líder coordenador. 40% + 20% + 40%.
  it('reproduzem a planilha da Lotus: corretor 40%, líder 20%, casa 40%', () => {
    const r = repassesDaVenda(venda(), equipe);
    if (!('linhas' in r)) throw new Error('deveria ter calculado');
    const por = (papel: string) =>
      r.linhas.filter((l) => l.papel === papel).reduce((s, l) => s + l.valor, 0);
    expect(por('corretor')).toBeCloseTo(12000, 2);
    expect(por('lider')).toBeCloseTo(6000, 2);
    expect(por('lotus')).toBeCloseTo(12000, 2);
  });

  it('gravam o nível de cada pessoa, para a promoção de amanhã não mexer', () => {
    const r = repassesDaVenda(venda(), equipe);
    if (!('linhas' in r)) throw new Error('deveria ter calculado');
    const ana = r.linhas.find((l) => l.parte === 'Ana' && l.papel === 'corretor');
    expect(ana?.nivel).toBe('junior');
  });

  it('não devolve lista parcial: sem Líder Direto, devolve o impedimento do motor', () => {
    // Júnior sem líder é anomalia pela D062 — o motor bloqueia e a tela diz.
    const sozinha: PessoaDoRepasse[] = [{ ...equipe[0], leader_user_id: null }];
    const r = repassesDaVenda(venda(), sozinha);
    expect('impedimento' in r).toBe(true);
    expect('impedimento' in r && r.impedimento).toMatch(/L00\d/);
  });
});

describe('rótulo do nível', () => {
  it('traduz o congelado', () => {
    expect(rotuloDoNivel('coordenador')).toBe('Coordenador');
  });

  it('diz "sem nível" em vez de mostrar vazio', () => {
    expect(rotuloDoNivel(null)).toBe('sem nível');
    expect(rotuloDoNivel('inventado')).toBe('sem nível');
  });
});

describe('resumoDaReleitura', () => {
  it('trata ok:false como falha, mesmo vindo num HTTP 200', () => {
    const r = resumoDaReleitura({ ok: false, error: 'planilha sem cabeçalho' });
    expect(r.falhou).toBe(true);
    expect(r.descricao).toContain('planilha sem cabeçalho');
  });

  it('não promete mudança quando nada mudou', () => {
    const r = resumoDaReleitura({ ok: true, inserted: 0, updated: 0, deactivated: 0, unchanged: 66 });
    expect(r.falhou).toBe(false);
    expect(r.titulo).toContain('nada mudou');
    expect(r.descricao).toContain('66');
  });

  it('conta a linha que sumiu da planilha, e não só as que chegaram', () => {
    const r = resumoDaReleitura({ ok: true, inserted: 0, updated: 0, deactivated: 1, unchanged: 65 });
    expect(r.titulo).toBe('Planilha relida');
    expect(r.descricao).toContain('1 sumiram');
  });
});

describe('nível que a planilha escreve', () => {
  it('nível do cadastro sai com o %; código antigo passa como veio', async () => {
    const { rotuloDoNivelDaPlanilha } = await import('./vendas');
    expect(rotuloDoNivelDaPlanilha('senior')).toBe('Sênior (50%)');
    expect(rotuloDoNivelDaPlanilha('PL')).toBe('PL');
    expect(rotuloDoNivelDaPlanilha(null)).toBe('—');
  });
});

describe('situação da venda', () => {
  it('parcelado diz quantas entraram; o resto, só o nome', () => {
    expect(rotuloDaSituacao({ situacao: 'parcelado', parcelas: 5, parcelas_pagas: 2 })).toBe('Parcelado (2 de 5)');
    expect(rotuloDaSituacao({ situacao: 'pago', parcelas: 1, parcelas_pagas: 1 })).toBe('Pago');
    expect(rotuloDaSituacao({ situacao: 'pendente', parcelas: 3, parcelas_pagas: 0 })).toBe('Pendente');
  });
});

describe('conferirParcelas — fecha com a comissão antes de mandar ao banco', () => {
  it('novas + já recebidas = comissão fecha', () => {
    expect(conferirParcelas([{ valor: 3000 }, { valor: 3000 }], 4000, 10000)).toEqual({ soma: 10000, falta: 0, fecha: true });
  });
  it('diz quanto falta, e quanto passou', () => {
    expect(conferirParcelas([{ valor: 3000 }], 4000, 10000).falta).toBe(3000);
    expect(conferirParcelas([{ valor: 7000 }], 4000, 10000).falta).toBe(-1000);
  });
  it('parcela vazia ou zero não fecha, mesmo com a soma certa', () => {
    expect(conferirParcelas([{ valor: 6000 }, { valor: null }], 4000, 10000).fecha).toBe(false);
    expect(conferirParcelas([{ valor: 6000 }, { valor: 0 }], 4000, 10000).fecha).toBe(false);
  });
});
