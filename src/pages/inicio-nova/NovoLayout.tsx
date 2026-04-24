/**
 * NovoLayout - Wrapper de layout novo usado por todas as rotas do CRM
 * Preserva o OutletContext (leads, onRefresh, isRefreshing) usado pelas páginas existentes.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { NovaSidebar } from './NovaSidebar';
import { NovoHeader } from './NovoHeader';
import type { ProcessedLead } from '@/data/realLeadsProcessor';
import { HeaderSlotProvider } from '@/contexts/HeaderSlotContext';
import { NovoActionsProvider } from '@/contexts/NovoActionsContext';

export interface NovoLayoutContext {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface NovoLayoutProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children?: React.ReactNode;
}

export function NovoLayout({ leads, onRefresh, isRefreshing, children }: NovoLayoutProps) {
  const context: NovoLayoutContext = { leads, onRefresh, isRefreshing };

  return (
    <HeaderSlotProvider>
      <NovoActionsProvider>
        <div
          className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          <NovaSidebar />

          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ marginRight: 'var(--drawer-width, 0px)' }}
          >
            <NovoHeader />

            <main className="flex-1 overflow-y-auto">
              {children ? children : <Outlet context={context} />}
            </main>
          </div>
        </div>
      </NovoActionsProvider>
    </HeaderSlotProvider>
  );
}
