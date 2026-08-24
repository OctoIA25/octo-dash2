/**
 * Regras de Comissão Lotus v1.4 — motor de cálculo.
 *
 * A comissão total é dividida em "pontas" (captação e intermediação). Cada
 * ponta é um bolso independente: o corretor leva o % do seu nível, o Líder
 * Direto leva o complemento até o % do nível dele (teto), e o que sobra fica
 * com a Lotus. A soma de tudo fecha 100% da comissão total — se não fechar,
 * o cálculo é bloqueado e escalado (L007).
 *
 * Casos atípicos não são decididos aqui: o motor devolve `bloqueio` com o
 * código de escalação (L003 atípico / L007 anomalia) e nenhuma linha de
 * pagamento. Quem chama mostra o motivo e manda para decisão humana.
 *
 * ponytail: o nível do corretor é entrada, não busca em banco. §3.7 manda usar
 * o nível vigente na DATA DO FECHAMENTO — enquanto não houver histórico de
 * promoções persistido, quem chama informa o nível correto daquela data.
 */

export type Nivel = 'estagiario' | 'junior' | 'pleno' | 'senior' | 'coordenador';

/** Tabela §2 (v1.4): % que o corretor leva sobre a própria ponta. */
export const NIVEIS: Record<Nivel, { label: string; percentual: number }> = {
  estagiario: { label: 'Estagiário', percentual: 40 },
  junior: { label: 'Junior', percentual: 40 },
  pleno: { label: 'Pleno', percentual: 45 },
  senior: { label: 'Sênior', percentual: 50 },
  coordenador: { label: 'Coordenador', percentual: 60 },
};

/** D062: só Sênior e Coordenador podem ficar sem Líder Direto — são líderes de si mesmos. */
const NIVEIS_PROPRIO_LIDER: Nivel[] = ['senior', 'coordenador'];

export interface Pessoa {
  nome: string;
  nivel: Nivel;
}

export interface Corretor extends Pessoa {
  /** Líder Direto. Ausente é anomalia, exceto para Sênior/Coordenador (D062). */
  liderDireto?: Pessoa | null;
}

export interface Parceiro {
  tipo: 'imobiliaria' | 'corretor_autonomo';
  nome?: string;
  /** Parceria sem contrato formal sempre bloqueia (§6). */
  contratoFormal: boolean;
}

export interface Operacao {
  tipo: 'revenda' | 'lancamento';
  comissaoTotal: number;
  /** Lançamento não tem ponta de captação — a captação é direta com a construtora. */
  captacao?: Corretor | null;
  intermediacao?: Corretor | null;
  parceiro?: Parceiro | null;
  /** Revenda + parceria (3.5.a): qual das duas pontas ficou com a Lotus. */
  pontaDaLotus?: 'captacao' | 'intermediacao';
}

export interface Permuta {
  tipo: 'permuta';
  /** Permuta com torna sempre escala broker (§3.6). */
  temDiferencaMonetaria: boolean;
  imovelA: Operacao;
  imovelB: Operacao;
}

export type Entrada = Operacao | Permuta;

export type Papel = 'corretor' | 'lider' | 'lotus' | 'parceiro';

export interface LinhaComissao {
  parte: string;
  papel: Papel;
  /** Nível da pessoa — é dele que sai o %. Lotus e parceiro não têm. */
  nivel?: Nivel;
  ponta: string;
  /** % aplicado sobre o valor da ponta. */
  percentual: number;
  valor: number;
}

export interface Bloqueio {
  codigo: 'L003' | 'L007';
  motivo: string;
}

export interface ResultadoComissao {
  total: number;
  /** Cenário aplicado (A–G), para o audit log §7. */
  cenario: string;
  linhas: LinhaComissao[];
  bloqueio: Bloqueio | null;
}

/** Tolerância do fechamento em 100%: um centavo. */
const EPSILON = 0.01;

const bloqueio = (codigo: Bloqueio['codigo'], motivo: string): Bloqueio => ({ codigo, motivo });

/**
 * Distribui uma ponta entre corretor, Líder Direto e Lotus.
 * Sem corretor, a ponta inteira fica com a Lotus.
 */
function distribuirPonta(
  ponta: string,
  valor: number,
  corretor: Corretor | null | undefined,
): { linhas: LinhaComissao[]; bloqueio?: undefined } | { bloqueio: Bloqueio; linhas?: undefined } {
  if (!corretor) {
    return { linhas: [{ parte: 'Lotus', papel: 'lotus', ponta, percentual: 100, valor }] };
  }

  const pctCorretor = NIVEIS[corretor.nivel].percentual;
  const lider = corretor.liderDireto ?? null;
  const proprioLider = !lider || lider.nome === corretor.nome;

  if (!lider && !NIVEIS_PROPRIO_LIDER.includes(corretor.nivel)) {
    return {
      bloqueio: bloqueio(
        'L003',
        `${corretor.nome} (${NIVEIS[corretor.nivel].label}) está sem Coordenador cadastrado. ` +
          'Todo corretor abaixo de Sênior precisa de Líder Direto antes do cálculo (D062).',
      ),
    };
  }

  // O teto da ponta é o % do Líder Direto: o corretor leva o dele, o líder leva
  // a diferença, e a Lotus fica com o que sobra acima do teto.
  const teto = proprioLider ? pctCorretor : NIVEIS[lider!.nivel].percentual;
  if (teto < pctCorretor) {
    return {
      bloqueio: bloqueio(
        'L007',
        `${lider!.nome} (${NIVEIS[lider!.nivel].label}) tem % menor que o liderado ` +
          `${corretor.nome} (${NIVEIS[corretor.nivel].label}) — anomalia hierárquica.`,
      ),
    };
  }

  const linhas: LinhaComissao[] = [
    {
      parte: corretor.nome,
      papel: 'corretor',
      nivel: corretor.nivel,
      ponta,
      percentual: pctCorretor,
      valor: (valor * pctCorretor) / 100,
    },
  ];
  if (!proprioLider) {
    linhas.push({
      parte: lider!.nome,
      papel: 'lider',
      nivel: lider!.nivel,
      ponta,
      percentual: teto - pctCorretor,
      valor: (valor * (teto - pctCorretor)) / 100,
    });
  }
  linhas.push({ parte: 'Lotus', papel: 'lotus', ponta, percentual: 100 - teto, valor: (valor * (100 - teto)) / 100 });
  return { linhas };
}

/** Divisão da comissão total entre as pontas, conforme tipo de operação e parceria. */
function definirPontas(
  op: Operacao,
): { pontas: { nome: string; percentual: number; corretor?: Corretor | null; parceiro?: string }[]; bloqueio?: undefined }
  | { bloqueio: Bloqueio; pontas?: undefined } {
  const parceiro = op.parceiro ?? null;

  if (parceiro && !parceiro.contratoFormal) {
    return { bloqueio: bloqueio('L003', 'Parceria sem contrato formal assinado antes da operação.') };
  }

  const nomeParceiro = parceiro?.nome?.trim() || 'Parceiro Externo';

  if (op.tipo === 'lancamento') {
    // Lançamento só tem ponta de intermediação; com parceria, o split depende
    // do tipo do parceiro (D061): imobiliária divide meio a meio, corretor
    // autônomo leva menos porque a Lotus assume o custo operacional dele.
    if (!parceiro) {
      return { pontas: [{ nome: 'Intermediação', percentual: 100, corretor: op.intermediacao }] };
    }
    const pctParceiro = parceiro.tipo === 'imobiliaria' ? 50 : 40;
    return {
      pontas: [
        { nome: `Intermediação — ${nomeParceiro}`, percentual: pctParceiro, parceiro: nomeParceiro },
        { nome: 'Intermediação — Lotus', percentual: 100 - pctParceiro, corretor: op.intermediacao },
      ],
    };
  }

  // Revenda: captação e intermediação valem 50% cada.
  if (!parceiro) {
    return {
      pontas: [
        { nome: 'Captação', percentual: 50, corretor: op.captacao },
        { nome: 'Intermediação', percentual: 50, corretor: op.intermediacao },
      ],
    };
  }

  // Revenda + parceria (3.5.a): cada lado fica com uma ponta inteira.
  const lotusNaCaptacao = (op.pontaDaLotus ?? 'captacao') === 'captacao';
  return {
    pontas: lotusNaCaptacao
      ? [
          { nome: 'Captação — Lotus', percentual: 50, corretor: op.captacao },
          { nome: `Intermediação — ${nomeParceiro}`, percentual: 50, parceiro: nomeParceiro },
        ]
      : [
          { nome: `Captação — ${nomeParceiro}`, percentual: 50, parceiro: nomeParceiro },
          { nome: 'Intermediação — Lotus', percentual: 50, corretor: op.intermediacao },
        ],
  };
}

/** Cenário aplicado, para registro no audit log (§7). */
function identificarCenario(op: Operacao): string {
  if (op.parceiro) return 'E — parceria externa';
  const cap = op.captacao;
  const int = op.intermediacao;
  if (cap && int && cap.nome === int.nome) return 'D — mesmo corretor nas duas pontas';
  const comLider = [cap, int].some((c) => c?.liderDireto && c.liderDireto.nome !== c.nome);
  return comLider ? 'B — corretor com Líder Direto' : 'A — corretor é o próprio líder';
}

function calcularOperacao(op: Operacao, prefixo = ''): ResultadoComissao {
  const total = Number.isFinite(op.comissaoTotal) ? op.comissaoTotal : 0;
  const cenario = identificarCenario(op);
  const nomear = (ponta: string) => (prefixo ? `${prefixo} · ${ponta}` : ponta);

  const divisao = definirPontas(op);
  if (divisao.bloqueio) return { total, cenario, linhas: [], bloqueio: divisao.bloqueio };

  const linhas: LinhaComissao[] = [];
  for (const ponta of divisao.pontas) {
    const valorPonta = (total * ponta.percentual) / 100;
    const nome = nomear(ponta.nome);

    if (ponta.parceiro) {
      linhas.push({ parte: ponta.parceiro, papel: 'parceiro', ponta: nome, percentual: 100, valor: valorPonta });
      continue;
    }

    const distribuida = distribuirPonta(nome, valorPonta, ponta.corretor);
    if (distribuida.bloqueio) {
      return { total, cenario: op.parceiro ? cenario : 'C — corretor sem Líder Direto', linhas: [], bloqueio: distribuida.bloqueio };
    }
    linhas.push(...distribuida.linhas);
  }

  return { total, cenario, linhas, bloqueio: null };
}

/**
 * Calcula a divisão da comissão de uma operação (ou de uma permuta, que são
 * duas operações independentes). Sempre confere se a soma fecha 100%.
 */
export function calcularComissao(entrada: Entrada): ResultadoComissao {
  if (entrada.tipo === 'permuta') {
    if (entrada.temDiferencaMonetaria) {
      return {
        total: entrada.imovelA.comissaoTotal + entrada.imovelB.comissaoTotal,
        cenario: 'F — permuta',
        linhas: [],
        bloqueio: bloqueio('L003', 'Permuta com diferença monetária (torna) exige validação do broker.'),
      };
    }
    const a = calcularOperacao(entrada.imovelA, 'Imóvel A');
    const b = calcularOperacao(entrada.imovelB, 'Imóvel B');
    const primeiroBloqueio = a.bloqueio ?? b.bloqueio;
    const resultado: ResultadoComissao = {
      total: a.total + b.total,
      cenario: 'F — permuta',
      linhas: primeiroBloqueio ? [] : [...a.linhas, ...b.linhas],
      bloqueio: primeiroBloqueio,
    };
    return conferirFechamento(resultado);
  }

  return conferirFechamento(calcularOperacao(entrada));
}

/** Sanity check §5: a soma dos pagamentos tem que fechar a comissão total. */
function conferirFechamento(resultado: ResultadoComissao): ResultadoComissao {
  if (resultado.bloqueio) return resultado;
  const soma = resultado.linhas.reduce((acc, linha) => acc + linha.valor, 0);
  if (Math.abs(soma - resultado.total) > EPSILON) {
    return {
      ...resultado,
      linhas: [],
      bloqueio: bloqueio('L007', `A soma dos pagamentos (${soma.toFixed(2)}) não fecha a comissão total (${resultado.total.toFixed(2)}).`),
    };
  }
  return resultado;
}

/** Consolida as linhas por parte — é o que a tela mostra como "quem recebe quanto". */
export function totaisPorParte(
  resultado: ResultadoComissao,
): { parte: string; papel: Papel; nivel?: Nivel; valor: number }[] {
  const acumulado = new Map<string, { parte: string; papel: Papel; nivel?: Nivel; valor: number }>();
  for (const linha of resultado.linhas) {
    // Uma pessoa pode aparecer como corretor numa ponta e como líder na outra:
    // agrupa pelo nome e mantém o papel mais "alto" que ela exerceu.
    const atual = acumulado.get(linha.parte);
    if (atual) {
      atual.valor += linha.valor;
      if (atual.papel === 'lider' && linha.papel === 'corretor') atual.papel = 'corretor';
      atual.nivel ??= linha.nivel;
    } else {
      acumulado.set(linha.parte, { parte: linha.parte, papel: linha.papel, nivel: linha.nivel, valor: linha.valor });
    }
  }
  return [...acumulado.values()].sort((a, b) => b.valor - a.valor);
}
