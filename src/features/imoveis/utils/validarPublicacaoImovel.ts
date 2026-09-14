/**
 * Regras para PUBLICAR um imóvel (ou salvar um já publicado) — as mesmas que o
 * CriarImovelForm sempre aplicou, só que devolvendo TODOS os problemas de uma
 * vez, para a tela listar tudo que falta em vez de um erro por clique.
 *
 * Rascunho não passa por aqui: para salvar rascunho basta tipo + código.
 */
import { validarCep } from '@/services/viaCepService';
import { isHttpUrl, normalizeYouTubeUrl } from './mediaUrls';

/** Seções colapsáveis do formulário (ids `secao-*`), para abrir a primeira com problema. */
export type SecaoPublicacao = 'proprietario' | 'estrutura' | 'localizacao' | 'comissoes' | 'midia';

export interface ProblemaPublicacao {
  campo: 'proprietario_nome' | 'tipo' | 'codigo' | 'cep' | 'captador_id' | 'link_video' | 'tour_virtual';
  mensagem: string;
  secao: SecaoPublicacao;
}

export interface DadosPublicacao {
  proprietario_nome: string;
  tipo: string;
  cep: string;
  captador_id: string;
  link_video: string;
  tour_virtual: string;
}

export const validarPublicacaoImovel = (
  dados: DadosPublicacao,
  { codigoGerado, podeEditarCaptador }: { codigoGerado: string; podeEditarCaptador: boolean },
): ProblemaPublicacao[] => {
  const problemas: ProblemaPublicacao[] = [];

  // Todo imóvel publicado precisa de proprietário identificado.
  if (!dados.proprietario_nome.trim()) {
    problemas.push({ campo: 'proprietario_nome', mensagem: 'Nome do proprietário', secao: 'proprietario' });
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
