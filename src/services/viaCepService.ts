/**
 * 📮 Serviço de integração com ViaCEP
 * Busca endereço automaticamente a partir do CEP
 */

export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string; // cidade
  uf: string; // estado
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

export interface EnderecoViaCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  complemento?: string;
}

/**
 * Remove caracteres não numéricos do CEP
 */
export function formatarCep(cep: string): string {
  return cep.replace(/\D/g, '');
}

/**
 * Formata o CEP para exibição (00000-000)
 */
export function formatarCepExibicao(cep: string): string {
  const cepLimpo = formatarCep(cep);
  if (cepLimpo.length <= 5) return cepLimpo;
  return `${cepLimpo.slice(0, 5)}-${cepLimpo.slice(5, 8)}`;
}

/**
 * Valida se o CEP tem 8 dígitos
 */
export function validarCep(cep: string): boolean {
  const cepLimpo = formatarCep(cep);
  return cepLimpo.length === 8;
}

/**
 * Busca endereço na API ViaCEP
 * @param cep CEP a ser consultado (pode conter máscara)
 * @returns Dados do endereço ou null se não encontrado
 */
export async function buscarCep(cep: string): Promise<EnderecoViaCep | null> {
  const cepLimpo = formatarCep(cep);
  
  if (!validarCep(cepLimpo)) {
    console.warn('⚠️ CEP inválido:', cep);
    return null;
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    
    if (!response.ok) {
      console.error('❌ Erro ao buscar CEP:', response.status);
      return null;
    }

    const data: ViaCepResponse = await response.json();

    if (data.erro) {
      console.warn('⚠️ CEP não encontrado:', cep);
      return null;
    }

    return {
      cep: formatarCepExibicao(data.cep),
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade || '',
      estado: data.uf || '',
      complemento: data.complemento || '',
    };
  } catch (error) {
    console.error('❌ Erro na requisição ViaCEP:', error);
    return null;
  }
}
