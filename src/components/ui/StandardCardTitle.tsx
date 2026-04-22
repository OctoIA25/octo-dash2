/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { LucideIcon } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';

interface StandardCardTitleProps {
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

/**
 * Componente de título padronizado para todos os cards
 * Estilo: Ícone roxo + Texto com gradiente roxo → azul claro
 * Baseado no design "Funil de Proprietários"
 */
export const StandardCardTitle = ({ icon: Icon, children, className = '' }: StandardCardTitleProps) => {
  return (
    <CardTitle className={`flex items-center gap-2.5 ${className}`}>
      {Icon && (
        <Icon className="h-5 w-5 text-[#a78bfa]" strokeWidth={2} />
      )}
      <span className="bg-gradient-to-r from-[#a78bfa] via-[#8b9bfa] to-[#7dd3fc] bg-clip-text text-transparent font-semibold text-lg tracking-normal title-card">
        {children}
      </span>
    </CardTitle>
  );
};

