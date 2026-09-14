/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Bolsão
 * Rota: /bolsao
 */

import { useEffect } from 'react';
import { BolsaoSection } from '../components/BolsaoSection';

export const BolsaoPage = () => {
  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'bolsao');
  }, []);

  return <BolsaoSection />;
};

