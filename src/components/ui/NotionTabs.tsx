import React from 'react';
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';

interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface NotionTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal' | 'pills';
}

export const NotionTabs = ({ 
  tabs, 
  activeTab, 
  onTabChange, 
  size = 'md',
  variant = 'default' 
}: NotionTabsProps) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return {
          container: 'gap-2',
          button: 'h-10 px-4 text-sm',
          icon: 'h-4 w-4',
          spacing: 'space-x-2'
        };
      case 'lg':
        return {
          container: 'gap-4',
          button: 'h-16 px-8 text-lg',
          icon: 'h-6 w-6',
          spacing: 'space-x-3'
        };
      default:
        return {
          container: 'gap-3',
          button: 'h-12 px-6 text-base',
          icon: 'h-5 w-5',
          spacing: 'space-x-2.5'
        };
    }
  };

  const getVariantClasses = (isActive: boolean) => {
    const base = 'transition-all duration-300 font-bold';
    
    // Aba ATIVA - Destaque máximo com gradiente AZUL vibrante, escala maior, sombra forte e borda branca
    const activeStyle = 'bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-600 text-white shadow-[0_0_25px_rgba(59,130,246,0.6)] scale-110 hover:scale-[1.12] hover:shadow-[0_0_35px_rgba(59,130,246,0.8)] ring-2 ring-white/50 border-2 border-white/30';
    
    // Abas INATIVAS - Light: cinza claro sobre fundo claro / Dark: apagadas escuras
    const inactiveStyle = 'bg-bg-secondary/70 text-text-secondary shadow-sm hover:bg-bg-hover hover:text-text-primary hover:shadow-md hover:scale-[1.03] border border-border opacity-80 hover:opacity-100 dark:bg-gray-700/30 dark:text-gray-400/80 dark:hover:bg-gray-600/40 dark:hover:text-gray-300 dark:border-gray-600/30 dark:opacity-60 dark:hover:opacity-80';
    
    switch (variant) {
      case 'minimal':
        return `${base} rounded-lg ${isActive ? activeStyle : inactiveStyle}`;
      
      case 'pills':
        return `${base} rounded-full ${isActive ? activeStyle : inactiveStyle}`;
      
      default:
        return `${base} rounded-lg ${isActive ? activeStyle : inactiveStyle}`;
    }
  };

  const classes = getSizeClasses();

  return (
    <div className={`flex ${classes.container} gap-2`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <Button
            key={tab.id}
            variant="ghost"
            onClick={() => onTabChange(tab.id)}
            className={`${classes.button} ${getVariantClasses(isActive)}`}
          >
            <div className={`flex items-center ${classes.spacing}`}>
              {Icon && <Icon className={classes.icon} />}
              <span className="font-medium">{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`
                  px-2.5 py-1 text-xs rounded-full font-extrabold transition-all duration-300
                  ${isActive
                    ? 'bg-white text-blue-600 shadow-lg ring-2 ring-blue-200'
                    : 'bg-bg-hover text-text-secondary border border-border dark:bg-gray-800/50 dark:text-gray-500 dark:border-gray-600/30'
                  }
                `}>
                  {tab.count}
                </span>
              )}
            </div>
          </Button>
        );
      })}
    </div>
  );
};
