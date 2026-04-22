/**
 * Componente de Card inspirado no Notion
 * Design minimalista e funcional
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NotionCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const NotionCard = ({ children, className, hover = false, onClick }: NotionCardProps) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white/[0.02] backdrop-blur-sm rounded-lg border border-white/[0.05]",
        "transition-all duration-200 ease-out",
        hover && "hover:bg-white/[0.04] hover:border-white/[0.08] cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
};

interface NotionCardHeaderProps {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export const NotionCardHeader = ({ children, className, icon }: NotionCardHeaderProps) => {
  return (
    <div className={cn("px-6 py-4 border-b border-white/[0.05]", className)}>
      <div className="flex items-center gap-3">
        {icon && <div className="text-white/40">{icon}</div>}
        <h3 className="text-base font-semibold text-white/90">{children}</h3>
      </div>
    </div>
  );
};

interface NotionCardContentProps {
  children: ReactNode;
  className?: string;
}

export const NotionCardContent = ({ children, className }: NotionCardContentProps) => {
  return (
    <div className={cn("p-6", className)}>
      {children}
    </div>
  );
};

interface NotionPropertyProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export const NotionProperty = ({ label, value, className }: NotionPropertyProps) => {
  return (
    <div className={cn("flex items-start gap-3 py-2", className)}>
      <span className="text-sm text-white/40 min-w-[120px]">{label}</span>
      <span className="text-sm text-white/80 flex-1">{value}</span>
    </div>
  );
};

interface NotionBadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export const NotionBadge = ({ children, variant = 'default', className }: NotionBadgeProps) => {
  const variants = {
    default: 'bg-white/[0.05] text-white/60 border-white/[0.05]',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
};

