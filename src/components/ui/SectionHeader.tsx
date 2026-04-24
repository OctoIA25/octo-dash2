import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showRefresh?: boolean;
}

export const SectionHeader = ({
  title,
  subtitle,
  icon: Icon,
  actions,
  onRefresh,
  isRefreshing = false,
  showRefresh = false
}: SectionHeaderProps) => {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5 relative z-0">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <Icon
            className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0 mt-1"
            strokeWidth={2}
          />
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showRefresh && onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 w-9 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
};
