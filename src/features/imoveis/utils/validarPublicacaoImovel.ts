/**
 * Regras para PUBLICAR um imóvel (ou salvar um já publicado) — as mesmas que o
 * CriarImovelForm sempre aplicou, só que devolvendo TODOS os problemas de uma
 * vez, para a tela listar tudo que falta em vez de um erro por clique.
 *
 * Rascunho não passa por aqui: para salvar rascunho basta tipo + código.
 *
 * Proprietário e endereço têm a mesma regra no banco (tg_valida_publicacao_imovel,
 * migration 20260915): aqui é para listar tudo antes de enviar; lá é a garantia.
 * Ao mudar um lado, mude o outro.
 */
import { validarCep } from '@/services/viaCepService';
import { isHttpUrl, normalizeYouTubeUrl } from './mediaUrls';

/** Seções colapsáveis do formulário (ids `secao-*`), para abrir a primeira com problema. */
export type SecaoPublicacao = 'proprietario' | 'estrutura' | 'localizacao' | 'comissoes' | 'midia';

export interface ProblemaPublicacao {
  campo:
    | 'proprietario_nome' | 'proprietario_contato' | 'tipo' | 'codigo' | 'cep' | 'logradouro' | 'numero'
    | 'bairro' | 'cidade' | 'estado' | 'captador_id' | 'link_video' | 'tour_virtual';
  mensagem: string;
  secao: SecaoPublicacao;
}

export interface DadosPublicacao {
  proprietario_nome: string;
  proprietario_celular: string;
  proprietario_tel_residencial: string;
  proprietario_tel_comercial: string;
  proprietario_email: string;
  tipo: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  captador_id: string;
  link_video: string;
  tour_virtual: string;
}

export const validarPublicacaoImovel = (
  dados: DadosPublicacao,
  {
    codigoGerado,
    podeEditarCaptador,
    validarProprietario = true,
  }: {
    codigoGerado: string;
    podeEditarCaptador: boolean;
    /**
     * false para quem edita sem poder ver o proprietário: o formulário não tem os
     * dados para conferir, e o banco valida o que está gravado.
     */
    validarProprietario?: boolean;
  },
): ProblemaPublicacao[] => {
  const problemas: ProblemaPublicacao[] = [];
  const vazio = (valor: string) => !valor.trim();

  // Todo imóvel publicado precisa de proprietário identificado e contatável.
  if (validarProprietario) {
    if (vazio(dados.proprietario_nome)) {
      problemas.push({ campo: 'proprietario_nome', mensagem: 'Nome do proprietário', secao: 'proprietario' });
    }
    const contatos = [
      dados.proprietario_celular, dados.proprietario_tel_residencial,
      dados.proprietario_tel_comercial, dados.proprietario_email,
    ];
    if (contatos.every(vazio)) {
      problemas.push({ campo: 'proprietario_contato', mensagem: 'Telefone ou e-mail do proprietário', secao: 'proprietario' });
    }
  }

  if (!dados.tipo) {
    problemas.push({ campo: 'tipo', mensagem: 'Tipo do imóvel', secao: 'estrutura' });
  } else if (!codigoGerado) {
    // Sem tipo não há código; listar os dois seria o mesmo problema duas vezes.
    problemas.push({ campo: 'codigo', mensagem: 'Código do imóvel (aguarde a geração)', secao: 'estrutura' });
  }

  // Os feeds de portais (ZAP/OLX) rejeitam imóvel sem CEP.
  if (!validarCep(dados.cep)) {
    problemas.push({ campo: 'cep', mensagem: 'CEP (8 dígitos)', secao: 'localizacao' });
  }
  const endereco = [
    ['logradouro', 'Logradouro'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['estado', 'Estado'],
  ] as const;
  for (const [campo, mensagem] of endereco) {
    if (vazio(dados[campo])) problemas.push({ campo, mensagem, secao: 'localizacao' });
  }

  // Só cobra de quem pode definir o captador; os demais salvam sem tocar no campo.
  if (podeEditarCaptador && !dados.captador_id) {
    problemas.push({ campo: 'captador_id', mensagem: 'Corretor captador', secao: 'comissoes' });
  }

  if (dados.link_video.trim() && !normalizeYouTubeUrl(dados.link_video)) {
    problemas.push({
      campo: 'link_video',
      mensagem: 'Link do vídeo (use um link do YouTube ou deixe em branco)',
      secao: 'midia',
    });
  }

  if (dados.tour_virtual.trim() && !isHttpUrl(dados.tour_virtual)) {
    problemas.push({
      campo: 'tour_virtual',
      mensagem: 'Tour virtual (use uma URL http(s) ou deixe em branco)',
      secao: 'midia',
    });
  }

  return problemas;
};
