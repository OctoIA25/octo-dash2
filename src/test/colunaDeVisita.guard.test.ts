/**
 * Portão: a coluna vazia não volta a contar visita.
 *
 * POR QUE ISTO EXISTE
 * `leads.visit_date` está NULA em 100% dos 5.210 leads da base, e nada no
 * sistema a grava: todo INSERT passa null e o único UPDATE mira uma tabela
 * legada por id numérico, incompatível com o modelo atual. No front ela aparece
 * derivada com dois nomes — `Data_visita` e `Imovel_visitado`.
 *
 * Nove telas contavam visita por esses campos e mostravam zero. A correção
 * passou todas para a etapa do lead (`isEtapaVisita*` em funnelStages.ts).
 *
 * POR QUE UM TESTE DE VARREDURA, E NÃO O COMPILADOR
 * `Data_visita` continua no tipo `ProcessedLead`, porque ela projeta uma coluna
 * que existe e é exibida em telas legítimas. Então o TypeScript não acusa quem
 * volta a CONTAR com ela. Somando: este projeto não roda checagem de tipos no
 * build (`vite build` puro, 95 erros de tipo pré-existentes). Sem esta varredura,
 * a regressão entra sem ninguém ver e o número volta a ser zero em silêncio.
 *
 * COMO MANTER
 * O teto abaixo é o estado congelado. Se você ADICIONOU um uso, não aumente o
 * número: pergunte-se se está contando por uma coluna vazia. Se está só exibindo
 * a data, ou mapeando coluna, acrescente o arquivo com o motivo — do mesmo jeito
 * que as entradas abaixo fazem. Ao terminar uma pendência, BAIXE o teto dela.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CAMPOS = /Data_visita|Imovel_visitado/;

/** Teto de ocorrências por arquivo, fora de comentário. Cada uma com seu motivo. */
const TETO: Record<string, number> = {
  // --- EXIBE a data ao usuário. Legítimo: a data aparece quando existir.
  'src/features/leads/pages/LeadViewPage.tsx': 5,
  'src/features/imoveis/pages/ImovelViewPage.tsx': 2,
  'src/pages/inicio-nova/InicioNovaPage.tsx': 1,
  'src/components/ExportSpreadsheet.tsx': 1,
  'src/features/metricas/components/MonthlyReport.tsx': 1,

  // --- MAPEIA a coluna do banco para o formato do front. Não decide nada.
  'src/services/supabaseService.ts': 6,
  'src/features/leads/services/leadsMetricsService.ts': 2,
  'src/features/leads/services/updateLeadService.ts': 3,

  // --- GERA os leads sintéticos do tenant "Área de Teste". Dado de demonstração.
  'src/features/leads/hooks/useLeadsData.ts': 4,

  // --- A ÚNICA leitura legítima que sobra: "visitas agendadas para um dia", que
  //     a etapa não sabe responder porque não carrega data.
  'src/features/leads/utils/funnelStages.ts': 3,

  // --- Testes, incluindo os que travam a regra.
  'src/features/leads/utils/__tests__/funnelStages.test.ts': 16,
  'src/features/relatorios/utils/__tests__/funilPorUnidade.test.ts': 2,
  'src/features/relatorios/utils/__tests__/unidadeClassifier.test.ts': 2,
  'src/features/relatorios/components/__tests__/FunilPorUnidadeChart.test.tsx': 2,

  // --- PENDENTES. Não são permissão: são dívida com dono e motivo.
  // Fixture morto + o campo do tipo. Sai quando o bloco de dados de 2024 for removido.
  'src/data/realLeadsProcessor.ts': 28,
  // Gráfico "Tempo de primeira interação por Usuário" calcula Data_visita menos
  // data_entrada — mede tempo até a VISITA e chama de primeira interação. Sai na
  // fatia da 1ª interação, que já tem decisão: duas métricas, LIA e corretor.
  'src/features/relatorios/pages/RelatoriosPage.tsx': 4,
  // Mortos por não serem alcançáveis. Saem na fatia que remove Index/MainLayout.
  'src/features/leads/components/LeadsMetricsChart.tsx': 1,
  'src/utils/metrics.ts': 1,
  'src/utils/monthlyMetrics.ts': 1,
};

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(caminho.split('\\').join('/'));
  }
  return acc;
}

/** Conta ocorrências fora de comentário de linha e de bloco. */
function ocorrencias(caminho: string): number {
  return readFileSync(caminho, 'utf8')
    .split('\n')
    .filter((l) => CAMPOS.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)).length;
}

describe('a coluna vazia de visita não volta a contar', () => {
  const medido = new Map<string, number>();
  for (const f of arquivosDeCodigo('src')) {
    if (f.endsWith('colunaDeVisita.guard.test.ts')) continue;
    const n = ocorrencias(f);
    if (n > 0) medido.set(f, n);
  }

  it('nenhum arquivo novo passa a usar Data_visita ou Imovel_visitado', () => {
    const novos = [...medido.keys()].filter((f) => !(f in TETO));
    expect(
      novos,
      `Arquivo novo usando a coluna de visita. Se está CONTANDO, use ` +
        `isEtapaVisita/isEtapaVisitaAgendada/isEtapaVisitaRealizada de ` +
        `funnelStages.ts — a coluna está vazia em 100% dos leads. Se está só ` +
        `exibindo a data, acrescente o arquivo ao TETO com o motivo.`,
    ).toEqual([]);
  });

  it('nenhum arquivo aumenta o número de usos', () => {
    const cresceram = [...medido.entries()]
      .filter(([f, n]) => f in TETO && n > TETO[f])
      .map(([f, n]) => `${f}: ${n} (teto ${TETO[f]})`);
    expect(cresceram, 'Uso novo da coluna de visita em arquivo já conhecido.').toEqual([]);
  });

  it('o teto acompanha a realidade: nada listado a mais', () => {
    // Pega o caso oposto — dívida paga e teto esquecido no arquivo. Não é falha
    // de código, é o teto mentindo sobre o tamanho do problema.
    const sumiram = Object.keys(TETO).filter((f) => !medido.has(f));
    expect(sumiram, 'Estes arquivos não usam mais a coluna: remova-os do TETO.').toEqual([]);
  });
});
