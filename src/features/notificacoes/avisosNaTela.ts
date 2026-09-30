/**
 * O interruptor "Avisos na tela": por NAVEGADOR, de propósito.
 *
 * Não há tabela de preferências do usuário, e gravar isto em
 * tenant_memberships.permissions misturaria permissão com gosto (e o membro
 * não pode editar a própria linha). Janela anônima e "bloquear dados de
 * sites" fazem localStorage lançar: nesse caso fica ligado.
 */
export const CHAVE_AVISOS_NA_TELA = 'octo:avisos-na-tela';

export function avisosNaTelaLigados(): boolean {
  try {
    return localStorage.getItem(CHAVE_AVISOS_NA_TELA) !== '0';
  } catch {
    return true;
  }
}

export function definirAvisosNaTela(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE_AVISOS_NA_TELA, ligado ? '1' : '0');
  } catch {
    // O navegador recusou: segue ligado, e a tela continua funcionando.
  }
}
