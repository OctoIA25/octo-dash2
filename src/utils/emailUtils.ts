/**
 * Utilitários para geração de emails de corretores
 * Garante consistência entre AdminTaskManager e useAuth
 */

/**
 * Gera o email do corretor baseado no nome
 * Formato: nome.toLowerCase().replace(/\s+/g, '.')@imobiliaria.com
 * 
 * Exemplo: "Alexandra Niero" -> "alexandra.niero@imobiliaria.com"
 */
export const gerarEmailCorretor = (nome: string): string => {
  return `${nome.toLowerCase().replace(/\s+/g, '.')}@imobiliaria.com`;
};

