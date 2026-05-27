import { useParams } from 'react-router-dom';
import { PropostaPage } from '@/features/leads/pages/PropostaPage';
import { VisaoGeralPage } from './VisaoGeralPage';

export function JuridicoPage() {
  const { section } = useParams<{ section?: string }>();

  if (section === 'proposta') {
    return <PropostaPage />;
  }

  return <VisaoGeralPage />;
}
