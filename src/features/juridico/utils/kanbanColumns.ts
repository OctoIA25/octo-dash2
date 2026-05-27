import type { SavedProposal } from '@/features/leads/services/proposalsService';

export interface JuridicoKanbanColumn {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
}

export const JURIDICO_KANBAN_COLUMNS: JuridicoKanbanColumn[] = [
  { id: 'proposta-criada', title: 'PROPOSTA CRIADA', color: '#8b5cf6' },
  { id: 'feitura-contrato', title: 'FEITURA DE CONTRATO', color: '#f59e0b' },
  { id: 'em-analise-leitura', title: 'EM ANÁLISE', subtitle: 'Leitura', color: '#3b82f6' },
  { id: 'andamento', title: 'ANDAMENTO', color: '#6366f1' },
  { id: 'recebido-andamento', title: 'RECEBIDO', subtitle: 'Em andamento', color: '#10b981' },
  { id: 'recebido-experiencia', title: 'RECEBIDO', subtitle: 'Experiência', color: '#14b8a6' },
];

const normalize = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function getProposalColumn(proposal: SavedProposal): string {
  if (proposal.stage_id === 'feitura-contrato') return 'feitura-contrato';

  if (proposal.stage_id === 'proposta-assinada') {
    const group = normalize(proposal.transaction_form?.activeDealSubstageGroup);
    if (!group) return 'em-analise-leitura';
    if (group.includes('experien')) return 'recebido-experiencia';
    if (group.includes('recebid')) return 'recebido-andamento';
    if (group.includes('andamento')) return 'andamento';
    if (group.includes('analise') || group.includes('leitura')) return 'em-analise-leitura';
    return 'andamento';
  }

  return 'proposta-criada';
}
