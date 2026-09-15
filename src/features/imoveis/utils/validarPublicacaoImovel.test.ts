import { describe, it, expect } from 'vitest';
import { validarPublicacaoImovel, type DadosPublicacao } from './validarPublicacaoImovel';

const valido: DadosPublicacao = {
  proprietario_nome: 'Maria Souza',
  proprietario_celular: '(11) 99999-0000',
  proprietario_tel_residencial: '',
  proprietario_tel_comercial: '',
  proprietario_email: '',
  tipo: 'Apartamento',
  cep: '01310-100',
  logradouro: 'Av. Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
  captador_id: 'u1',
  link_video: '',
  tour_virtual: '',
};
const ctx = { codigoGerado: 'AP0001', podeEditarCaptador: true };

const campos = (dados: Partial<DadosPublicacao>, c: Partial<typeof ctx & { validarProprietario: boolean }> = {}) =>
  validarPublicacaoImovel({ ...valido, ...dados }, { ...ctx, ...c }).map((p) => p.campo);

describe('validarPublicacaoImovel', () => {
  it('imóvel completo não tem problema', () => {
    expect(validarPublicacaoImovel(valido, ctx)).toEqual([]);
  });

  it('cobra cada regra, com a seção para abrir', () => {
    expect(validarPublicacaoImovel({ ...valido, tipo: '' }, ctx)).toEqual([
      { campo: 'tipo', mensagem: 'Tipo do imóvel', secao: 'estrutura' },
    ]);
    expect(campos({ proprietario_nome: '' })).toEqual(['proprietario_nome']);
    expect(campos({ proprietario_nome: '   ' })).toEqual(['proprietario_nome']);
    expect(campos({}, { codigoGerado: '' })).toEqual(['codigo']);
    expect(campos({ cep: '0131' })).toEqual(['cep']);
    expect(campos({ captador_id: '' })).toEqual(['captador_id']);
    expect(campos({ link_video: 'https://vimeo.com/123' })).toEqual(['link_video']);
    expect(campos({ tour_virtual: 'tour.com/360' })).toEqual(['tour_virtual']);
  });

  it('proprietário sem nenhum contato não publica; qualquer telefone ou o e-mail basta', () => {
    const semContato = { proprietario_celular: '', proprietario_tel_residencial: ' ', proprietario_tel_comercial: '', proprietario_email: '' };
    expect(validarPublicacaoImovel({ ...valido, ...semContato }, ctx)).toEqual([
      { campo: 'proprietario_contato', mensagem: 'Telefone ou e-mail do proprietário', secao: 'proprietario' },
    ]);
    expect(campos({ ...semContato, proprietario_tel_comercial: '(11) 3333-0000' })).toEqual([]);
    expect(campos({ ...semContato, proprietario_email: 'maria@x.com' })).toEqual([]);
  });

  it('endereço do imóvel é obrigatório campo a campo', () => {
    expect(campos({ logradouro: '', numero: ' ', bairro: '', cidade: '', estado: '' })).toEqual([
      'logradouro', 'numero', 'bairro', 'cidade', 'estado',
    ]);
    const problemas = validarPublicacaoImovel({ ...valido, numero: '' }, ctx);
    expect(problemas).toEqual([{ campo: 'numero', mensagem: 'Número', secao: 'localizacao' }]);
  });

  it('devolve todos os problemas juntos, na ordem das seções', () => {
    const problemas = validarPublicacaoImovel(
      {
        ...valido,
        proprietario_nome: '', proprietario_celular: '', tipo: '', cep: '', logradouro: '',
        captador_id: '', link_video: 'x', tour_virtual: 'y',
      },
      { codigoGerado: '', podeEditarCaptador: true },
    );
    // Sem tipo não existe código: não lista "código" como problema separado.
    expect(problemas.map((p) => p.campo)).toEqual([
      'proprietario_nome', 'proprietario_contato', 'tipo', 'cep', 'logradouro', 'captador_id', 'link_video', 'tour_virtual',
    ]);
    expect(problemas[0].secao).toBe('proprietario');
  });

  it('quem não pode ver o proprietário não é cobrado por ele (o banco valida o gravado)', () => {
    expect(campos({ proprietario_nome: '', proprietario_celular: '' }, { validarProprietario: false })).toEqual([]);
    expect(campos({ proprietario_nome: '', cep: '' }, { validarProprietario: false })).toEqual(['cep']);
  });

  it('captador só é exigido de quem pode defini-lo', () => {
    expect(campos({ captador_id: '' }, { podeEditarCaptador: false })).toEqual([]);
  });

  it('vídeo e tour só são validados quando preenchidos', () => {
    expect(campos({ link_video: '   ', tour_virtual: '' })).toEqual([]);
    expect(campos({ link_video: 'https://youtu.be/dQw4w9WgXcQ', tour_virtual: 'https://tour.com/360' })).toEqual([]);
  });
});
