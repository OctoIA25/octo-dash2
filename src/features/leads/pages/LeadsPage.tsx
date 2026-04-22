/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * LeadsPage - Página da área de Leads
 */

import { ProcessedLead } from '@/data/realLeadsProcessor';
import { LeadSection } from '../components/LeadSection';

interface LeadsPageProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const LeadsPage = ({ leads, onRefresh, isRefreshing }: LeadsPageProps) => {
  
  try {
    return <LeadSection />;
  } catch (error) {
    console.error('❌ Erro ao renderizar LeadsPage:', error);
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-4">Erro ao carregar página de Leads</h2>
        <p className="text-red-400">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
      </div>
    );
  }
};

