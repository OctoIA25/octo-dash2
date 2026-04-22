import React from 'react';
import { LucideIcon } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';

interface GradientCardTitleProps {
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

/**
 * Título com gradiente roxo → azul para cards
 * Compatível com todos os temas
 */
export const GradientCardTitle = ({ icon: Icon, children, className = '' }: GradientCardTitleProps) => {
  return (
    <CardTitle className={`flex items-center gap-2.5 ${className}`}>
      {Icon && (
        <Icon className="h-5 w-5 text-[#a78bfa]" strokeWidth={2} />
      )}
      <span className="bg-gradient-to-r from-[#a78bfa] via-[#8b9bfa] to-[#7dd3fc] bg-clip-text text-transparent font-bold text-lg tracking-wide">
        {children}
      </span>
    </CardTitle>
  );
};

