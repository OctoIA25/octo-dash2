/**
 * Materiais de estudo (P4.2) — as contas, fora do componente.
 *
 * A decisão que organiza o arquivo: O PLANO DE CARREIRA NÃO TEM CÓPIA. Os
 * níveis e os percentuais já vivem no motor de comissão, usado em cinco telas.
 * Guardá-los também aqui criaria a segunda fonte que o chefe proíbe — e no dia
 * em que as duas discordassem, o corretor estaria lendo a errada, justamente
 * sobre quanto ele ganha.
 *
 * Por isso o material do tipo `niveis_de_comissao` nasce sem corpo no banco: o
 * corpo é montado aqui, na leitura, a partir de `NIVEIS`.
 */

import { NIVEIS, type Nivel } from '@/features/comissionamento/commissionRules';

export type CategoriaDeMaterial =
  | 'plano_de_carreira' | 'comissao' | 'regimento' | 'scripts' | 'treinamentos' | 'outros';

export type TipoDeMaterial = 'texto' | 'arquivo' | 'link' | 'niveis_de_comissao';

export interface Material {
  id: string;
  titulo: string;
  resumo: string;
  categoria: CategoriaDeMaterial;
  tipo: TipoDeMaterial;
  conteudo: string;
  arquivo: string | null;
  link_url: string | null;
  versao: number;
  publicado_em: string | null;
  obrigatorio: boolean;
  publico: 'todos' | 'cargo' | 'equipe';
  cargo_id: string | null;
  team_id: string | null;
  ativo: boolean;
  rascunho: boolean;
  novo: boolean;
  lido_em: string | null;
  aceito_em: string | null;
  /** Só chega para quem gere. */
  leram: number | null;
  aceitaram: number | null;
}

export interface QuadroDeMateriais {
  pode_gerir: boolean;
  materiais: Material[];
}

export const ROTULO_DA_CATEGORIA: Record<CategoriaDeMaterial, string> = {
  plano_de_carreira: 'Plano de carreira',
  comissao: 'Regras de comissão',
  regimento: 'Regimento',
  scripts: 'Scripts',
  treinamentos: 'Treinamentos',
  outros: 'Outros',
};

/** A ordem em que as categorias aparecem — da carreira para o resto. */
export const ORDEM_DAS_CATEGORIAS: CategoriaDeMaterial[] = [
  'plano_de_carreira', 'comissao', 'regimento', 'scripts', 'treinamentos', 'outros',
];

export interface DegrauDaCarreira {
  nivel: Nivel;
  label: string;
  percentual: number;
  /** Quanto este nível leva numa comissão de exemplo. */
  exemplo: number;
}

/**
 * O plano de carreira, montado a partir do motor de comissão.
 *
 * O exemplo em reais existe porque "45%" não diz nada a quem está decidindo se
 * vale a pena buscar o próximo nível; "numa venda com R$ 20.000 de comissão,
 * você leva R$ 9.000" diz.
 */
export function planoDeCarreira(comissaoDeExemplo = 20000): DegrauDaCarreira[] {
  return (Object.keys(NIVEIS) as Nivel[])
    .map((nivel) => ({
      nivel,
      label: NIVEIS[nivel].label,
      percentual: NIVEIS[nivel].percentual,
      exemplo: Math.round(comissaoDeExemplo * NIVEIS[nivel].percentual) / 100,
    }))
    .sort((a, b) => a.percentual - b.percentual);
}

/** O que separa um nível do seguinte, em pontos percentuais. */
export function saltoEntreNiveis(degraus: DegrauDaCarreira[]): Array<{ de: string; para: string; pontos: number }> {
  const saida: Array<{ de: string; para: string; pontos: number }> = [];
  for (let i = 0; i < (degraus?.length ?? 0) - 1; i++) {
    saida.push({
      de: degraus[i].label,
      para: degraus[i + 1].label,
      pontos: degraus[i + 1].percentual - degraus[i].percentual,
    });
  }
  return saida;
}

/** Agrupa a lista por categoria, na ordem da tela, sem categoria vazia. */
export function porCategoria(
  materiais: Material[]
): Array<{ categoria: CategoriaDeMaterial; rotulo: string; materiais: Material[] }> {
  return ORDEM_DAS_CATEGORIAS
    .map((categoria) => ({
      categoria,
      rotulo: ROTULO_DA_CATEGORIA[categoria],
      materiais: (materiais ?? []).filter((m) => m.categoria === categoria),
    }))
    .filter((g) => g.materiais.length > 0);
}

/** A busca: título, resumo e o corpo do texto. */
export function filtrar(materiais: Material[], termo: string): Material[] {
  const t = (termo ?? '').trim().toLowerCase();
  if (!t) return materiais ?? [];
  return (materiais ?? []).filter((m) =>
    `${m.titulo} ${m.resumo} ${m.tipo === 'texto' ? m.conteudo : ''}`.toLowerCase().includes(t)
  );
}

/**
 * O que ainda falta esta pessoa aceitar.
 *
 * Devolve `null` quando não falta nada: um aviso de "0 pendentes" treina a
 * pessoa a ignorar o aviso.
 */
export function avisoDePendentes(pendentes: Array<{ titulo: string }> | null | undefined): string | null {
  const n = pendentes?.length ?? 0;
  if (n <= 0) return null;
  if (n === 1) return `Você tem 1 material obrigatório para ler e aceitar: ${pendentes![0].titulo}.`;
  return `Você tem ${n} materiais obrigatórios para ler e aceitar.`;
}

/**
 * Quantos ainda não aceitaram — a leitura que o gestor precisa.
 *
 * Devolve o que FALTA, e não o que foi feito: a lista de quem leu não move
 * ninguém a cobrar nada.
 */
export function quantosFaltam(
  m: Pick<Material, 'obrigatorio' | 'aceitaram' | 'leram'>,
  alcanca: number
): string | null {
  if (!m?.obrigatorio || alcanca <= 0) return null;
  const feitos = m.aceitaram ?? 0;
  const faltam = Math.max(alcanca - feitos, 0);
  if (faltam === 0) return `Todas as ${alcanca} pessoas já aceitaram.`;
  return `${faltam} de ${alcanca} ainda não aceitaram.`;
}

/**
 * O selo "novo" some sozinho depois de 7 dias.
 *
 * Calculado no banco, e não aqui, porque o relógio do navegador é do usuário —
 * e um selo que depende dele apareceria e sumiria conforme o fuso da máquina.
 * Esta função só traduz a decisão para a tela.
 */
export const eNovo = (m: Pick<Material, 'novo'>) => !!m?.novo;

/** O rótulo de quem alcança o material. */
export function paraQuem(
  m: Pick<Material, 'publico'>,
  nomeDoCargo?: string | null,
  nomeDaEquipe?: string | null
): string {
  if (m?.publico === 'cargo') return nomeDoCargo ? `Cargo: ${nomeDoCargo}` : 'Um cargo específico';
  if (m?.publico === 'equipe') return nomeDaEquipe ? `Equipe: ${nomeDaEquipe}` : 'Uma equipe específica';
  return 'Toda a equipe';
}
