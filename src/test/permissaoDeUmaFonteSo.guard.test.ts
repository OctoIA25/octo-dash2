/**
 * Portão: permissão se decide num lugar só.
 *
 * POR QUE ISTO EXISTE
 * Em 28/09 a tela de Configurações escondia onze blocos dos cinco líderes de
 * equipe da base. A causa não era regra errada: eram DUAS regras.
 *
 *   AuthContext.tsx   role === 'corretor' ? 'corretor' : 'gestao'
 *   useAuth.ts        role === 'admin'    ? 'gestao'   : 'corretor'
 *
 * O contexto trata líder como gestão; o hook, como corretor. Cada um está
 * certo sozinho, então nenhum teste de unidade acusava — só aparecia na tela
 * de quem é líder. É o mesmo defeito de "o mesmo número em duas telas" que
 * esta base vem corrigindo, aplicado a permissão.
 *
 * A REGRA
 * Comparar `role === 'gestao'` é decidir permissão. Só os dois donos da
 * autenticação podem fazer isso; todo o resto lê `isGestao` do
 * `useAuthContext()`, que é a fonte única.
 *
 * COMO MANTER
 * A lista abaixo é o estado congelado, com o motivo de cada um. Se você
 * ADICIONOU um arquivo aqui, pare: use `useAuthContext().isGestao`. Ao
 * corrigir um dos pendentes, REMOVA a linha dele.
 *
 * Já saiu daqui: `ElaineChat.tsx`, corrigido em 28/09 — era o único pendente
 * que mudava COMPORTAMENTO (os cinco líderes não viam o resultado anexado
 * nem o seletor de liderados). Os dois que restam são cosméticos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const COMPARACAO = /role\s*===\s*['"]gestao['"]/;

/**
 * Comentário não é código. Sem tirar os comentários, o portão acusa quem
 * apenas EXPLICA a regra — foi o que aconteceu na primeira execução, com um
 * arquivo que cita `role==='gestao'` para justificar usar `systemRole`. É o
 * mesmo tropeço do Tailwind lendo um comentário como CSS.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Quem pode decidir, e quem ainda decide sem dever. */
const CONHECIDOS: Record<string, string> = {
  'src/contexts/AuthContext.tsx': 'DONO: é ele quem define isGestao.',
  'src/hooks/useAuth.ts': 'DONO (legado): segunda implementação, a ser aposentada.',
  'src/components/AppSidebar.tsx': 'PENDENTE — cosmético: só escolhe o rótulo Admin/Líder/Corretor.',
  'src/components/LogoutConfirmModal.tsx': 'PENDENTE — cosmético: líder aparece escrito "Corretor".',
  'src/components/LoginScreen.tsx': 'Não é permissão: dica de senha da tela de demonstração.',
};

function varre(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'node_modules' || nome === '__tests__') continue;
      varre(caminho, achados);
      continue;
    }
    if (!/\.tsx?$/.test(nome) || /\.test\.tsx?$/.test(nome)) continue;
    if (COMPARACAO.test(semComentarios(readFileSync(caminho, 'utf8')))) achados.push(caminho);
  }
  return achados;
}

describe('permissão se decide num lugar só', () => {
  it('ninguém novo compara role === "gestao"', () => {
    const achados = varre('src').sort();
    const novos = achados.filter((a) => !(a in CONHECIDOS));
    expect(
      novos,
      `Decida permissão com useAuthContext().isGestao, não comparando o role.\n` +
        `Arquivo(s) novo(s): ${novos.join(', ')}`,
    ).toEqual([]);
  });

  it('a tela de Configurações lê a fonte única', () => {
    const tela = readFileSync('src/features/settings/components/ConfiguracoesSection.tsx', 'utf8');
    expect(tela).toContain('useAuthContext');
    // O ponto exato da regressão de 28/09: ela lia a segunda implementação.
    expect(tela).not.toMatch(/from\s+['"]@\/hooks\/useAuth['"]/);
  });

  it('a dívida conhecida não cresce', () => {
    const achados = varre('src').sort();
    expect(achados.length).toBe(Object.keys(CONHECIDOS).length);
  });
});
