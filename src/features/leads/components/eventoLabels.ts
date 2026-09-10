/**
 * Vocabulário do histórico do lead — rótulos e cores em um lugar só, no molde
 * de cadenciaLabels.ts.
 *
 * O tipo do evento é um enum ABERTO: o app da LIA cria tipo novo sem avisar e
 * o banco não tem CHECK justamente para que isso não vire erro de escrita. Por
 * isso `descreverEvento` NUNCA esconde o que não conhece — humaniza o próprio
 * tipo. Sumir com a linha seria pior do que mostrar um nome feio.
 */
import type { EventoLead } from '../services/historicoLeadService';

export interface EstiloEvento {
  /** Cor do ponto na linha do tempo. */
  dot: string;
}

/** Um evento já traduzido para o que a tela mostra. */
export interface EventoDescrito extends EstiloEvento {
  titulo: string;
  /** Segunda linha; null quando não há nada a acrescentar. */
  detalhe: string | null;
}

const CINZA = 'bg-slate-300 dark:bg-slate-600';

const ESTILO_POR_TIPO: Record<string, string> = {
  'lead.created': 'bg-blue-500',
  'lead.assigned': 'bg-violet-500',
  'lead.attended': 'bg-emerald-500',
  'lead.stage_changed': 'bg-blue-500',
  'lead.classified': CINZA,
  'lead.archived': 'bg-amber-500',
  'lead.unarchived': 'bg-emerald-500',
};

/** Quem provocou o evento, para a segunda linha. */
export function rotuloDoAtor(ator: EventoLead['ator']): string {
  if (ator?.nome) return ator.nome;
  if (ator?.tipo === 'lia') return 'LIA';
  if (ator?.tipo === 'usuario') return 'Usuário da dash';
  return 'Sistema';
}

/** Tipo desconhecido vira "Contato realizado" em vez de sumir da tela. */
function humanizar(tipo: string): string {
  const semPrefixo = tipo.includes('.') ? tipo.slice(tipo.indexOf('.') + 1) : tipo;
  return semPrefixo.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const juntar = (...partes: (string | null | undefined)[]) =>
  partes.filter(Boolean).join(' · ') || null;

/**
 * Traduz um evento para título + detalhe + cor. Pura, para a tela não precisar
 * saber de nenhuma regra.
 */
export function descreverEvento(ev: EventoLead): EventoDescrito {
  const dot = ESTILO_POR_TIPO[ev.tipo] ?? 'bg-slate-400 dark:bg-slate-500';
  const ator = rotuloDoAtor(ev.ator);
  const etapaDaLia = typeof ev.metadata?.etapa === 'string' ? `etapa ${ev.metadata.etapa}` : null;

  switch (ev.tipo) {
    case 'lead.created':
      return { dot, titulo: 'Lead criado', detalhe: ev.para ? `via ${ev.para}` : null };

    case 'lead.assigned':
      return {
        dot,
        titulo: ev.para ? `Entregue para ${ev.para}` : 'Corretor removido',
        // O derivado não sabe de quem saiu — só o evento real guarda o "de".
        detalhe: ev.de ? `antes com ${ev.de}` : null,
      };

    case 'lead.attended':
      return {
        dot,
        titulo: 'Atendimento confirmado',
        detalhe: ev.para ? `por ${ev.para}` : null,
      };

    case 'lead.stage_changed':
      return {
        dot,
        titulo: ev.para ? `Etapa: ${ev.para}` : 'Etapa alterada',
        detalhe: juntar(ev.de ? `de ${ev.de}` : null, ator),
      };

    case 'lead.classified':
      return {
        dot,
        titulo: ev.para ? `Classificado como ${ev.para}` : 'Classificação removida',
        // 'lia' | 'dashboard' | 'automatic': é o que distingue quem classificou
        // quando a escrita veio do servidor e não há usuário.
        detalhe: typeof ev.metadata?.origem === 'string' ? `por ${ev.metadata.origem}` : ator,
      };

    case 'lead.archived':
      return { dot, titulo: 'Arquivado', detalhe: juntar(ev.para, ator) };

    case 'lead.unarchived':
      return { dot, titulo: 'Reaberto', detalhe: ator };

    default:
      // Evento da LIA (ou tipo que ainda não existe quando isto foi escrito).
      return {
        dot,
        titulo: ev.descricao || humanizar(ev.tipo),
        detalhe: juntar(etapaDaLia, ev.descricao ? null : ator),
      };
  }
}
