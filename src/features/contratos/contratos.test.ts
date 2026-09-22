import { describe, expect, it } from 'vitest';
import {
  avisoDeQuemFalta, carimboDeAceite, contratosComFirma, contratosParaAceitar,
  deveBloquear, mensagemDeErro, preencherPrevia, variaveisDesconhecidas, variaveisUsadas,
  type ContratoPendente, type ResultadoDaAtribuicao,
} from './contratos';

const pendente = (over: Partial<ContratoPendente> = {}): ContratoPendente => ({
  id: 'a1', titulo: 'Contrato de associação', corpo: 'Texto...', versao: 1,
  hash: 'abc123', tenant_id: 't1', exige_assinatura_eletronica: false,
  criada_em: '2026-09-21T12:00:00Z', ...over,
});

// ============================================================
// O bloqueio é a primeira tela do sistema que impede o uso da Dash.
// Um defeito aqui tranca a equipe inteira para fora — por isso é o
// bloco de testes mais detalhado do módulo.
// ============================================================
describe('quando a Dash deve ser bloqueada', () => {
  it('bloqueia o corretor com contrato pendente', () => {
    expect(deveBloquear({ pendentes: [pendente()], systemRole: 'corretor' })).toBe(true);
  });

  it('não bloqueia quem não tem pendência', () => {
    expect(deveBloquear({ pendentes: [], systemRole: 'corretor' })).toBe(false);
  });

  // TRAVA 1 — a mais importante: erro não pode trancar ninguém.
  it('NÃO bloqueia quando a consulta falhou — na dúvida, a Dash abre', () => {
    expect(deveBloquear({ pendentes: undefined, systemRole: 'corretor' })).toBe(false);
    expect(deveBloquear({ pendentes: null, systemRole: 'corretor' })).toBe(false);
  });

  it('não bloqueia com um valor estranho no lugar da lista', () => {
    expect(deveBloquear({ pendentes: 'erro' as never, systemRole: 'corretor' })).toBe(false);
    expect(deveBloquear({ pendentes: {} as never, systemRole: 'corretor' })).toBe(false);
  });

  // TRAVA 2 — quem poderia desfazer o engano nunca fica preso.
  it('NUNCA bloqueia o administrador, nem com pendência', () => {
    expect(deveBloquear({ pendentes: [pendente()], systemRole: 'admin' })).toBe(false);
  });

  it('NUNCA bloqueia o dono da plataforma', () => {
    expect(deveBloquear({ pendentes: [pendente()], systemRole: 'corretor', isOwner: true })).toBe(false);
  });

  it('bloqueia o líder de equipe, que não administra o cadastro', () => {
    expect(deveBloquear({ pendentes: [pendente()], systemRole: 'team_leader' })).toBe(true);
  });

  // TRAVA 3 — não prender ninguém por algo que não tem como aceitar.
  it('NÃO bloqueia por documento que exige assinatura eletrônica', () => {
    expect(deveBloquear({
      pendentes: [pendente({ exige_assinatura_eletronica: true })],
      systemRole: 'corretor',
    })).toBe(false);
  });

  it('mas bloqueia se houver ao menos um aceitável no meio', () => {
    expect(deveBloquear({
      pendentes: [pendente({ exige_assinatura_eletronica: true }), pendente({ id: 'a2' })],
      systemRole: 'corretor',
    })).toBe(true);
  });
});

describe('a separação dos pendentes', () => {
  const lista = [pendente({ id: 'a1' }), pendente({ id: 'a2', exige_assinatura_eletronica: true })];

  it('só os aceitáveis vão para o botão', () => {
    expect(contratosParaAceitar(lista).map((c) => c.id)).toEqual(['a1']);
  });

  it('os com firma aparecem, mas em separado', () => {
    expect(contratosComFirma(lista).map((c) => c.id)).toEqual(['a2']);
  });

  it('aguenta lista vazia e ausente', () => {
    expect(contratosParaAceitar(null)).toEqual([]);
    expect(contratosComFirma(undefined)).toEqual([]);
  });
});

describe('o aviso de quem ficou de fora', () => {
  const r = (faltando: ResultadoDaAtribuicao['faltando']): ResultadoDaAtribuicao => ({
    simulacao: true, modelo: 'Contrato', versao: 1, criadas: 1, ja_tinham: 0, faltando,
  });

  it('cala quando ninguém ficou de fora', () => {
    expect(avisoDeQuemFalta(r([]))).toBeNull();
    expect(avisoDeQuemFalta(null)).toBeNull();
  });

  it('conta por campo, do mais comum para o menos', () => {
    const t = avisoDeQuemFalta(r([
      { user_id: '1', email: 'a@x', campos: ['cpf', 'creci'] },
      { user_id: '2', email: 'b@x', campos: ['cpf'] },
      { user_id: '3', email: 'c@x', campos: ['cpf'] },
    ]))!;
    expect(t).toContain('3 pessoas');
    expect(t.indexOf('3 sem CPF')).toBeLessThan(t.indexOf('1 sem CRECI'));
  });

  it('concorda em número com uma pessoa só', () => {
    const t = avisoDeQuemFalta(r([{ user_id: '1', email: 'a@x', campos: ['cpf'] }]))!;
    expect(t).toContain('1 pessoa ficou de fora');
  });

  it('diz por que isso importa, e não só que aconteceu', () => {
    expect(avisoDeQuemFalta(r([{ user_id: '1', email: 'a@x', campos: ['cpf'] }])))
      .toContain('não serve como documento');
  });
});

describe('as variáveis do modelo', () => {
  it('lista as que o texto usa', () => {
    expect(variaveisUsadas('Eu, {{nome}}, CPF {{cpf}}, em {{data}}.'))
      .toEqual(['nome', 'cpf', 'data']);
  });

  it('não repete a mesma variável usada duas vezes', () => {
    expect(variaveisUsadas('{{nome}} e {{nome}}')).toEqual(['nome']);
  });

  it('acusa a variável inventada — é assim que o erro de digitação aparece', () => {
    expect(variaveisDesconhecidas('Eu, {{nome}}, {{nomee}} e {{telefone}}.'))
      .toEqual(['nomee', 'telefone']);
  });

  it('não acusa nada num texto sem variável', () => {
    expect(variaveisDesconhecidas('Texto simples.')).toEqual([]);
  });

  it('aceita espaço dentro das chaves', () => {
    expect(variaveisUsadas('{{ nome }}')).toEqual(['nome']);
  });

  it('a prévia troca o que conhece', () => {
    expect(preencherPrevia('Eu, {{nome}}, CPF {{cpf}}.', { nome: 'Ana', cpf: '123' }))
      .toBe('Eu, Ana, CPF 123.');
  });

  it('a prévia deixa visível a variável que não soube trocar', () => {
    expect(preencherPrevia('{{nome}} e {{inventada}}', { nome: 'Ana' }))
      .toBe('Ana e {{inventada}}');
  });
});

describe('o carimbo de aceite', () => {
  const linhas = carimboDeAceite({
    aceito_em: '2026-09-21T15:30:00Z', ip: '203.0.113.7',
    hash: 'a'.repeat(64), titulo: 'Contrato de associação', versao: 2,
  });

  it('traz data, origem, versão e o hash do texto', () => {
    expect(linhas.join(' ')).toContain('203.0.113.7');
    expect(linhas.join(' ')).toContain('versão 2');
    expect(linhas.join(' ')).toContain('a'.repeat(64));
  });

  it('diz "não registrada" em vez de deixar a origem vazia', () => {
    const sem = carimboDeAceite({
      aceito_em: '2026-09-21T15:30:00Z', ip: null,
      hash: 'x', titulo: 'C', versao: 1,
    });
    expect(sem.join(' ')).toContain('não registrada');
  });
});

describe('a mensagem de erro do aceite', () => {
  // Quem vê este texto está BLOQUEADO fora da Dash. Visto no navegador em
  // 21/09: a pessoa recebia "[object Object]".
  it('nunca devolve "[object Object]"', () => {
    expect(mensagemDeErro({ error: { code: 404, path: '/x' } })).not.toContain('object Object');
  });

  it('usa o texto do servidor quando ele é texto', () => {
    expect(mensagemDeErro({ error: 'Este contrato é de outra pessoa.' }))
      .toBe('Este contrato é de outra pessoa.');
  });

  it('acha a mensagem aninhada', () => {
    expect(mensagemDeErro({ error: { message: 'rota não encontrada' } })).toBe('rota não encontrada');
  });

  it('prefere `message` quando há os dois', () => {
    expect(mensagemDeErro({ message: 'de fora', error: 'de dentro' })).toBe('de fora');
  });

  it('cai no padrão quando não há nada legível', () => {
    expect(mensagemDeErro({})).toBe('Não deu para registrar o aceite.');
    expect(mensagemDeErro(null)).toBe('Não deu para registrar o aceite.');
    expect(mensagemDeErro({ error: {} })).toBe('Não deu para registrar o aceite.');
    expect(mensagemDeErro({ error: '   ' })).toBe('Não deu para registrar o aceite.');
  });

  it('aceita o corpo em texto puro', () => {
    expect(mensagemDeErro('Erro do servidor')).toBe('Erro do servidor');
  });
});
