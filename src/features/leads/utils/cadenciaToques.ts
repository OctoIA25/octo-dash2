/**
 * Os quadrados de cadência do lead — regra pura e vocabulário visual.
 *
 * Um quadrado é um toque com o cliente, venha da LIA ou do corretor. O NÚMERO
 * do toque é a posição na ordem cronológica, calculada aqui e nunca gravada:
 * um contador gravado erraria no primeiro envio da LIA reportado fora de ordem.
 *
 * A LIA só ocupa quadrado quando a mensagem SAIU. Agendada, cancelada (o lead
 * voltou antes) ou expirada não é toque — é intenção.
 *
 * COR = CANAL, ÍCONE = RESULTADO. Duas dimensões, dois canais visuais; a cor
 * nunca é a única pista (legenda fixa + title + aria-label em cada quadrado).
 */
import type { CanalToque, ResultadoToque, ToqueCorretor } from '../services/toquesService';
import type { CadenciaEvento } from '../services/cadenciaService';

export const TOTAL_QUADRADOS = 10;

export interface Quadrado {
  chave: string;
  numero: number;
  origem: 'corretor' | 'lia';
  canal: string;
  resultado: ResultadoToque;
  em: string;
  quem: string;
  observacao: string | null;
  proximo_toque_em: string | null;
  /** Só em toque do corretor: é o que permite desfazer. */
  toque?: ToqueCorretor;
}

export const CANAIS: { value: CanalToque; label: string; fundo: string }[] = [
  { value: 'ligacao', label: 'Ligação', fundo: 'bg-violet-600' },
  { value: 'whatsapp', label: 'WhatsApp', fundo: 'bg-emerald-600' },
  { value: 'email', label: 'E-mail', fundo: 'bg-blue-600' },
  { value: 'presencial', label: 'Presencial', fundo: 'bg-orange-600' },
];

/** Canal que a LIA venha a mandar fora da paleta (ex.: sms) aparece neutro, não some. */
const CANAL_DESCONHECIDO = { label: 'Outro canal', fundo: 'bg-slate-500' };

export const estiloDoCanal = (canal: string) =>
  CANAIS.find((c) => c.value === canal) ?? { ...CANAL_DESCONHECIDO, value: canal };

export const RESULTADOS: { value: ResultadoToque; label: string }[] = [
  { value: 'respondeu', label: 'Respondeu' },
  { value: 'nao_respondeu', label: 'Não respondeu' },
  { value: 'numero_errado', label: 'Número errado' },
  { value: 'nao_contatar', label: 'Pediu para não contatar' },
];

export const rotuloDoResultado = (r: ResultadoToque) =>
  RESULTADOS.find((x) => x.value === r)?.label ?? r;

function resultadoDaLia(ev: CadenciaEvento): ResultadoToque {
  if (ev.resultado === 'opt_out') return 'nao_contatar';
  return ev.respondeu ? 'respondeu' : 'nao_respondeu';
}

/**
 * Junta os toques do corretor com os envios da LIA, em ordem cronológica.
 * Devolve TODOS — quem desenha decide mostrar 10 e o "+N".
 */
export function montarQuadrados(
  toques: ToqueCorretor[],
  timelineLia: CadenciaEvento[] | undefined,
): Quadrado[] {
  const daLia = (timelineLia ?? [])
    .filter((ev) => ev.sent_at != null || ev.status === 'sent')
    .map((ev) => ({ ev, em: ev.sent_at ?? ev.scheduled_at }))
    // Envio sem nenhuma data não tem lugar na ordem; é raro e não vale chutar.
    .filter((x): x is { ev: CadenciaEvento; em: string } => x.em != null)
    .map(({ ev, em }) => ({
      chave: `lia:${ev.id}`,
      origem: 'lia' as const,
      canal: ev.channel ?? 'whatsapp',
      resultado: resultadoDaLia(ev),
      em,
      quem: 'LIA',
      observacao: null,
      proximo_toque_em: null,
    }));

  const doCorretor = toques.map((t) => ({
    chave: `corretor:${t.id}`,
    origem: 'corretor' as const,
    canal: t.canal,
    resultado: t.resultado,
    em: t.executado_em,
    quem: t.executado_por_nome ?? '—',
    observacao: t.observacao,
    proximo_toque_em: t.proximo_toque_em,
    toque: t,
  }));

  return [...daLia, ...doCorretor]
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em))
    .map((q, i) => ({ ...q, numero: i + 1 }));
}

/** O próximo toque é o que o ÚLTIMO toque do corretor marcou; "sem próximo" vale. */
export function proximoToque(quadrados: Quadrado[]): string | null {
  for (let i = quadrados.length - 1; i >= 0; i -= 1) {
    if (quadrados[i].origem === 'corretor') return quadrados[i].proximo_toque_em;
  }
  return null;
}

/** Cabe embaixo de um quadrado de ~50px: primeiro nome, ou o e-mail antes do @. */
export function nomeCurto(nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim();
  if (!limpo) return '—';
  return limpo.includes('@') ? limpo.split('@')[0] : limpo.split(/\s+/)[0];
}
