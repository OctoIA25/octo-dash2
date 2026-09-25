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
export type SecaoPublicacao = 'proprietario' | 'estrutura' | 'localizacao' | 'comissoes' | 'midia' | 'publicacao';

export interface ProblemaPublicacao {
  campo:
    | 'proprietario_nome' | 'proprietario_contato' | 'tipo' | 'codigo' | 'cep' | 'logradouro' | 'numero'
    | 'bairro' | 'cidade' | 'estado' | 'captador_id' | 'link_video' | 'tour_virtual'
    | 'titulo' | 'descricao';
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
  /** Texto do anúncio: opcionais porque só entram na regra de tamanho. */
  titulo?: string;
  descricao?: string;
}

/**
 * Limite do texto que vai aos portais (decisão de 21/09/2026). Acima disso o
 * anúncio é recusado lá, e o imóvel some do portal sem ninguém entender.
 * Exportados para o formulário usar os MESMOS números no contador e no
 * maxLength — dois lugares com o número escrito à mão divergem na primeira
 * mudança.
 */
export const LIMITE_TITULO = 100;
export const LIMITE_DESCRICAO = 3000;

/**
 * Corta no limite sem partir palavra ao meio. Usado só no texto que a IA gera:
 * o que a pessoa escreveu nunca é cortado sozinho — ali o contador mostra o
 * excesso e o salvamento cobra, para ninguém perder texto sem ver.
 */
export const cortarNoLimite = (texto: string, limite: number): string => {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return (ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte).trimEnd();
};

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

  const tamanho = (valor: string | undefined) => (valor ?? '').trim().length;
  if (tamanho(dados.titulo) > LIMITE_TITULO) {
    problemas.push({
      campo: 'titulo',
      mensagem: `Título do anúncio com ${tamanho(dados.titulo)} caracteres — o limite é ${LIMITE_TITULO}`,
      secao: 'publicacao',
    });
  }
  if (tamanho(dados.descricao) > LIMITE_DESCRICAO) {
    problemas.push({
      campo: 'descricao',
      mensagem: `Descrição com ${tamanho(dados.descricao)} caracteres — o limite é ${LIMITE_DESCRICAO}`,
      secao: 'publicacao',
    });
  }

  return problemas;
};
