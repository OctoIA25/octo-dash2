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
 * Estilo: slate neutro, alinhado com o design da área "Início" / SectionHeader
 */
export const StandardCardTitle = ({ icon: Icon, children, className = '' }: StandardCardTitleProps) => {
  return (
    <CardTitle className={`flex items-center gap-2.5 ${className}`}>
      {Icon && (
        <Icon
          className="h-[18px] w-[18px] text-slate-400 dark:text-slate-500 shrink-0"
          strokeWidth={2}
        />
      )}
      <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        {children}
      </span>
    </CardTitle>
  );
};

