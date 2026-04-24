/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página independente de Meus Leads Atribuídos
 */

import { MeusLeadsAtribuidosSection } from '../components/MeusLeadsAtribuidosSection';
import { LeadsArquivadosSection } from '../components/LeadsArquivadosSection';
import { CentralLeadsPage } from './CentralLeadsPage';
import { useSearchParams } from 'react-router-dom';
import { LEAD_TYPE_INTERESSADO, LEAD_TYPE_PROPRIETARIO } from '../services/leadsService';

interface MeusLeadsPageProps {
  leads?: unknown[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

type SubArea = 'kanban' | 'kanban-proprietario' | 'central-leads' | 'arquivados';

export const MeusLeadsPage = (_props: MeusLeadsPageProps) => {
  const [searchParams] = useSearchParams();
  const sub = searchParams.get('sub');
  const activeSubArea: SubArea =
    sub === 'kanban-proprietario' || sub === 'central-leads' || sub === 'arquivados'
      ? sub
      : 'kanban';

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {activeSubArea === 'kanban' ? (
        <MeusLeadsAtribuidosSection leadType={LEAD_TYPE_INTERESSADO} />
      ) : activeSubArea === 'kanban-proprietario' ? (
        <MeusLeadsAtribuidosSection leadType={LEAD_TYPE_PROPRIETARIO} />
      ) : activeSubArea === 'arquivados' ? (
        <div className="w-full"><LeadsArquivadosSection /></div>
      ) : (
        <div className="px-6 pb-6">
          <CentralLeadsPage embedded />
        </div>
      )}
    </div>
  );
};
