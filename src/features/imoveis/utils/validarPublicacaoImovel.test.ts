import { describe, it, expect } from 'vitest';
import { validarPublicacaoImovel, type DadosPublicacao } from './validarPublicacaoImovel';

const valido: DadosPublicacao = {
  proprietario_nome: 'Maria Souza',
  tipo: 'Apartamento',
  cep: '01310-100',
  captador_id: 'u1',
  link_video: '',
  tour_virtual: '',
};
const ctx = { codigoGerado: 'AP0001', podeEditarCaptador: true };

const campos = (dados: Partial<DadosPublicacao>, c: Partial<typeof ctx> = {}) =>
  validarPublicacaoImovel({ ...valido, ...dados }, { ...ctx, ...c }).map((p) => p.campo);

describe('validarPublicacaoImovel', () => {
  it('imóvel completo não tem problema', () => {
    expect(validarPublicacaoImovel(valido, ctx)).toEqual([]);
  });

  it('cobra cada regra existente, com a seção para abrir', () => {
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

  it('devolve todos os problemas juntos, na ordem das seções', () => {
    const problemas = validarPublicacaoImovel(
      { proprietario_nome: '', tipo: '', cep: '', captador_id: '', link_video: 'x', tour_virtual: 'y' },
      { codigoGerado: '', podeEditarCaptador: true },
    );
    // Sem tipo não existe código: não lista "código" como problema separado.
    expect(problemas.map((p) => p.campo)).toEqual(['proprietario_nome', 'tipo', 'cep', 'captador_id', 'link_video', 'tour_virtual']);
    expect(problemas[0].secao).toBe('proprietario');
  });

  it('captador só é exigido de quem pode defini-lo', () => {
    expect(campos({ captador_id: '' }, { podeEditarCaptador: false })).toEqual([]);
  });

  it('vídeo e tour só são validados quando preenchidos', () => {
    expect(campos({ link_video: '   ', tour_virtual: '' })).toEqual([]);
    expect(campos({ link_video: 'https://youtu.be/dQw4w9WgXcQ', tour_virtual: 'https://tour.com/360' })).toEqual([]);
  });
});
