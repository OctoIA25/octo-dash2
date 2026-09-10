/**
 * 🏠 TIPO `Imovel` — formato do imóvel no catálogo
 *
 * Este módulo já foi o leitor do XML Kenlo. A leitura saiu daqui porque o
 * serviço não conhecia tenant: baixava o arquivo estático `public/temp_kenlo.xml`
 * (snapshot congelado de outra base) e ignorava `imoveis_locais`, então um
 * imóvel existente na aba Imóveis aparecia como "não encontrado" na tela do
 * lead. Quem precisa do catálogo usa `catalogoImoveisService`; quem precisa
 * fazer o parse do XML de um tenant usa `imoveisXmlService.parseImoveisFromXml`.
 *
 * Sobrou o tipo, importado por ~30 telas — daí ele continuar neste caminho.
 */

export interface Imovel {
  referencia: string;
  titulo: string;
  tipo: string; // "Casa / Sobrado", "Apartamento", "Terreno", etc.
  tipoSimplificado: 'casa' | 'apartamento' | 'terreno' | 'comercial' | 'rural' | 'outro';
  bairro: string;
  cidade: string;
  estado: string;
  corretor_nome?: string;
  corretor_numero?: string;
  corretor_email?: string;
  corretor_foto?: string;
  /** Captador atribuído manualmente (imoveis_locais / condominios). */
  captador_id?: string | null;
  /**
   * Último ajuste no cadastro local (`imoveis_locais.updated_at`). Ausente em
   * imóvel que só existe no XML do Kenlo — daí a regra de desatualizado não se
   * aplicar a ele (ver utils/desatualizado.ts).
   */
  updated_at?: string | null;
  /**
   * true quando corretor_nome exibido é o mesmo corretor de
   * corretor_email/corretor_foto/corretor_numero (todos vindos do XML).
   * false quando corretor_nome veio de captador_id ou imoveis_corretores —
   * nesse caso os campos de contato abaixo ainda são de OUTRA pessoa (o
   * corretor do XML) e não devem ser exibidos junto do nome.
   */
  corretorContatoDaXml?: boolean;
  valor_venda: number;
  valor_locacao: number;
  finalidade: 'venda' | 'locacao' | 'venda_locacao';
  valor_iptu: number;
  valor_condominio: number;
  area_total: number;
  area_util: number;
  quartos: number;
  suites: number;
  garagem: number;
  banheiro: number;
  salas: number;
  descricao: string;
  fotos: string[];
  videos: string[];
  area_comum: string[];
  area_privativa: string[];
  // Geolocalização e endereço (para o Mapa de Imóveis)
  latitude?: number;
  longitude?: number;
  cep?: string;
  endereco?: string;
  numero?: string;
  nome_condominio?: string;
}
