/**
 * Define QUEM entra no relatório comportamental da equipe.
 *
 * O problema que isto resolve: a tabela `Corretores` não é a equipe. Ela guarda
 * ex-corretores e cadastros sem login (num tenant real: 69 linhas para 17
 * membros), então usar `Corretores.length` como denominador fazia o card dizer
 * "5 de 69 · Adesão baixa" quando a leitura correta era "5 de 20".
 *
 * O universo é a UNIÃO de três grupos, porque nenhuma tabela sozinha os cobre:
 *   1. membro do tenant que tem linha em `Corretores` — o caso normal;
 *   2. quem tem resultado de teste mas não é membro — ex-corretor; continua
 *      aparecendo para não sumir com dado que existe, marcado como fora da equipe;
 *   3. membro do tenant SEM linha em `Corretores` — não consegue nem fazer o
 *      teste (o fluxo indexa por `Corretores.id`), então precisa aparecer como
 *      pendente em vez de sumir silenciosamente do denominador.
 *
 * A junção é por email, o único campo comum às duas tabelas. Linha de
 * `Corretores` sem email não casa com ninguém: se tiver resultado ela entra por
 * si (grupo 2) e o membro correspondente, se existir, entra à parte pelo grupo 3.
 * São a mesma pessoa contada duas vezes, e não há como saber disso sem email —
 * preferimos isso a descartar um resultado real.
 *
 * Linha de `Corretores` que não é membro e não tem resultado fica de fora: é o
 * cadastro morto que inflava a adesão.
 */

import type { CorretorRoster } from '@/services/testesEstatisticasService';

export interface PessoaDoRelatorio {
  /** id em `Corretores`; null quando o membro não tem linha lá (grupo 3) */
  id: number | null;
  nome: string;
  email: string;
  /** tem resultado mas não é membro do tenant (grupo 2) */
  foraDaEquipe: boolean;
  /** é membro mas não tem cadastro em `Corretores`, então não consegue testar (grupo 3) */
  semCadastro: boolean;
}

/**
 * Normaliza um email para chave de junção. Devolve '' para o que não for email:
 * `mapTenantMemberRow` cai para `name`/`user_id` quando o email falta, então um
 * membro pode chegar aqui com um UUID no campo — e um UUID nunca casa com uma
 * linha de `Corretores`, virando pessoa fantasma no denominador.
 */
const norm = (email: string | null | undefined): string => {
  const e = (email ?? '').trim().toLowerCase();
  return e.includes('@') ? e : '';
};

/**
 * Papéis de quem se espera ter os testes comportamentais.
 *
 * `admin` fica de fora de propósito: o gate dos testes só vale para corretor
 * (FixedSidebar checa `user.role !== 'corretor'`) e o trigger 20260522 só cria
 * linha em `Corretores` para corretor — contar admin no denominador deixaria a
 * adesão travada abaixo de 100% para sempre. `owner` é da plataforma, não da
 * imobiliária.
 */
const PAPEIS_COM_TESTE = ['corretor', 'team_leader'];

export interface MembroTenant {
  email: string;
  role: string;
}

/**
 * @param linhas todas as linhas de `Corretores` do tenant
 * @param idsComTeste ids que aparecem em algum `corretoresPorTipo` (têm resultado)
 * @param membros membros do tenant vindos de tenant_memberships (RPC)
 *
 * Fail-open: com `membros` vazio ou null — RPC fora do ar, tenant sem corretor —
 * devolve as linhas de `Corretores` como antes. Um denominador inflado é ruim,
 * mas uma tela vazia é pior.
 */
export function montarUniverso(
  linhas: CorretorRoster[],
  idsComTeste: Set<number>,
  membros: MembroTenant[] | null,
): PessoaDoRelatorio[] {
  const base = linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    email: l.email,
    foraDaEquipe: false,
    semCadastro: false,
  }));

  if (!membros || membros.length === 0) return base;

  const emailsMembros = new Set(
    membros.filter((m) => PAPEIS_COM_TESTE.includes(m.role)).map((m) => norm(m.email)).filter(Boolean),
  );
  if (emailsMembros.size === 0) return base; // tenant sem corretor: nada a cruzar

  // Vínculo de QUALQUER papel — inclusive admin. Serve só para o rótulo: um admin
  // com resultado antigo continua aparecendo (o dado existe), mas chamá-lo de
  // "fora da equipe" seria falso; ele só não entra por vínculo no denominador.
  const emailsQualquerPapel = new Set(
    membros.map((m) => norm(m.email)).filter(Boolean),
  );

  const universo: PessoaDoRelatorio[] = [];
  const emailsCobertos = new Set<string>();

  // Entre linhas duplicadas do mesmo email, a que tem resultado vem primeiro:
  // a dedupe mantém a primeira, e manter a linha vazia esconderia o resultado
  // (a pessoa apareceria como pendente e o perfil dela não abriria).
  const ordenadas = [...base].sort(
    (a, b) => Number(idsComTeste.has(b.id)) - Number(idsComTeste.has(a.id)),
  );

  for (const linha of ordenadas) {
    const email = norm(linha.email);
    const ehMembro = email !== '' && emailsMembros.has(email);
    if (!ehMembro && !idsComTeste.has(linha.id)) continue; // cadastro morto
    // Duas linhas de `Corretores` com o mesmo email são a mesma pessoa: contar
    // as duas reintroduziria, menor, o denominador inflado que isto corrige.
    if (email && emailsCobertos.has(email)) continue;
    universo.push({ ...linha, foraDaEquipe: email !== '' && !emailsQualquerPapel.has(email) });
    if (email) emailsCobertos.add(email);
  }

  for (const email of emailsMembros) {
    if (emailsCobertos.has(email)) continue;
    universo.push({ id: null, nome: email, email, foraDaEquipe: false, semCadastro: true });
  }

  return universo;
}
