import { describe, expect, it } from 'vitest';
import {
  avisoDaPasta, camposParaConfirmar, comoFoiLido, confiancaEmTexto,
  faltaPreencher, resumoDaPasta, valorInicial,
} from './documentos';
import type { CampoDoDocumento, Pasta } from './documentosService';

const campo = (over: Partial<CampoDoDocumento> = {}): CampoDoDocumento => ({
  campo: 'cpf', rotulo: 'CPF', formato: 'cpf', obrigatorio: true,
  valor_sugerido: null, valor_final: null, confianca: null,
  validacao: 'ok', mensagem: '', ...over,
});

describe('o que a caixa mostra ao abrir', () => {
  it('mostra a sugestão da IA quando ninguém confirmou ainda', () => {
    expect(valorInicial(campo({ valor_sugerido: '529.982.247-25' }))).toBe('529.982.247-25');
  });

  // Reabrir um documento conferido não pode trocar a decisão da pessoa pelo
  // palpite da máquina — é a Regra 1 aparecendo na tela.
  it('o que a pessoa confirmou vence a sugestão', () => {
    expect(valorInicial(campo({ valor_sugerido: 'errado', valor_final: 'certo' }))).toBe('certo');
  });

  it('vazio quando não há nem um nem outro', () => {
    expect(valorInicial(campo())).toBe('');
  });
});

describe('o que vai para o banco na confirmação', () => {
  it('manda o que está na tela, e não o que a IA sugeriu', () => {
    const campos = [campo({ campo: 'cpf', valor_sugerido: '111' }),
                    campo({ campo: 'nome', rotulo: 'Nome', valor_sugerido: 'Jose' })];
    expect(camposParaConfirmar(campos, { cpf: '529.982.247-25' })).toEqual([
      { campo: 'cpf', valor: '529.982.247-25' },
      { campo: 'nome', valor: 'Jose' },
    ]);
  });

  it('tira espaço das pontas — " 123 " e "123" são o mesmo CPF', () => {
    expect(camposParaConfirmar([campo()], { cpf: '  529.982.247-25  ' })[0].valor)
      .toBe('529.982.247-25');
  });

  it('apagar o campo manda vazio, e não a sugestão de volta', () => {
    expect(camposParaConfirmar([campo({ valor_sugerido: '111' })], { cpf: '' })[0].valor).toBe('');
  });

  it('aguenta lista vazia', () => {
    expect(camposParaConfirmar([], {})).toEqual([]);
  });
});

describe('o que falta preencher', () => {
  it('lista só o obrigatório em branco', () => {
    const campos = [
      campo({ campo: 'cpf', rotulo: 'CPF', obrigatorio: true }),
      campo({ campo: 'rg', rotulo: 'RG', obrigatorio: false }),
      campo({ campo: 'nome', rotulo: 'Nome', obrigatorio: true, valor_sugerido: 'Jose' }),
    ];
    expect(faltaPreencher(campos, {})).toEqual(['CPF']);
  });

  it('o que a pessoa acabou de digitar conta como preenchido', () => {
    expect(faltaPreencher([campo()], { cpf: '529.982.247-25' })).toEqual([]);
  });

  it('só espaço não conta como preenchido', () => {
    expect(faltaPreencher([campo()], { cpf: '   ' })).toEqual(['CPF']);
  });
});

describe('a frase que diz de onde veio a leitura', () => {
  it('avisa que foi a LIA e que ainda falta gente', () => {
    expect(comoFoiLido({ status: 'lido', lido_por: 'ia' }))
      .toMatch(/LIA leu.*Falta uma pessoa conferir/);
  });

  it('distingue o padrão aprendido da leitura por IA', () => {
    expect(comoFoiLido({ status: 'lido', lido_por: 'regra' }))
      .toMatch(/padrão aprendido/);
  });

  // Depois de conferido a frase some: o dado deixou de ser palpite.
  it('cala quando uma pessoa já conferiu', () => {
    expect(comoFoiLido({ status: 'conferido', lido_por: 'ia' })).toBeNull();
  });

  it('cala quando ninguém leu', () => {
    expect(comoFoiLido({ status: 'enviado', lido_por: null })).toBeNull();
  });
});

describe('o placar da pasta', () => {
  const pasta = (over: Partial<Pasta> = {}): Pasta =>
    ({ tipos: [], faltam: 3, total_tipos: 7, ...over });

  it('conta o que falta, não o que já foi feito', () => {
    expect(resumoDaPasta(pasta())).toBe('Faltam 3 de 7 documentos.');
  });

  it('diz que fechou quando não falta nada', () => {
    expect(resumoDaPasta(pasta({ faltam: 0 })))
      .toBe('Pasta completa — os 7 documentos foram conferidos.');
  });

  it('não finge pasta completa quando não há tipo nenhum', () => {
    expect(resumoDaPasta(pasta({ total_tipos: 0, faltam: 0 })))
      .toBe('Nenhum tipo de documento cadastrado.');
    expect(resumoDaPasta(null)).toBe('Nenhum tipo de documento cadastrado.');
  });
});

describe('o aviso do que precisa de olho', () => {
  const comDocs = (docs: Array<Partial<{ status: string; alertas: number }>>): Pasta => ({
    total_tipos: 7, faltam: 1,
    tipos: [{
      tipo: 'cpf', nome: 'CPF', conferidos: 0, falta: true,
      documentos: docs.map((d, i) => ({
        id: `d${i}`, arquivo: 'x', arquivo_nome: 'x', status: 'lido',
        lido_por: 'ia', motivo_recusa: '', conferido_em: null, alertas: 0, ...d,
      })) as Pasta['tipos'][0]['documentos'],
    }],
  });

  it('separa "tem pendência" de "ninguém olhou"', () => {
    expect(avisoDaPasta(comDocs([{ status: 'lido', alertas: 2 }, { status: 'recusado' }])))
      .toBe('1 documento(s) com campo para revisar · 1 recusado(s), esperando reenvio');
  });

  it('documento lido sem alerta nenhum não vira aviso', () => {
    expect(avisoDaPasta(comDocs([{ status: 'lido', alertas: 0 }]))).toBeNull();
  });

  it('cala quando não há nada', () => {
    expect(avisoDaPasta(null)).toBeNull();
  });
});

describe('a confiança em letra', () => {
  it('arredonda para porcentagem', () => {
    expect(confiancaEmTexto(0.973)).toBe('97%');
    expect(confiancaEmTexto(0.4)).toBe('40%');
  });

  // Sem confiança é diferente de confiança zero: um campo que ninguém leu não
  // pode aparecer como "0% de certeza".
  it('cala quando não há confiança registrada', () => {
    expect(confiancaEmTexto(null)).toBeNull();
    expect(confiancaEmTexto(undefined)).toBeNull();
    expect(confiancaEmTexto(0)).toBe('0%');
  });
});
