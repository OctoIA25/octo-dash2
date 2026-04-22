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
    <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700/20 bg-black/10 relative z-0">
      <div className="flex items-center space-x-3">
        {Icon && (
          <Icon className="h-5 w-5 text-[#a78bfa]" strokeWidth={2} />
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-normal bg-gradient-to-r from-[#a78bfa] via-[#8b9bfa] to-[#7dd3fc] bg-clip-text text-transparent title-section">
            {title}
          </h1>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        {showRefresh && onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-gray-400 hover:text-white hover:bg-white/5 h-9 w-9 p-0"
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
};
