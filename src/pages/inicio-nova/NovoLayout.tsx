/**
 * NovoLayout - Wrapper de layout novo usado por todas as rotas do CRM
 */

import React, { useEffect } from 'react';
import { NovaSidebar } from './NovaSidebar';
import { NovoHeader } from './NovoHeader';
import { HeaderSlotProvider } from '@/contexts/HeaderSlotContext';
import { NovoActionsProvider } from '@/contexts/NovoActionsContext';
import { ViewAsProvider } from '@/contexts/ViewAsContext';
import { SupportButton } from '@/components/support/SupportButton';
import { useAuthContext } from '@/contexts/AuthContext';
import { SupportService } from '@/components/support/SupportService';

interface NovoLayoutProps {
  children?: React.ReactNode;
}

export function NovoLayout({ children }: NovoLayoutProps) {
  const { tenantId, user } = useAuthContext();

  useEffect(() => {
    if (user && tenantId) {
      SupportService.setContext(user, tenantId);
    }
  }, [user, tenantId])

  return (
    <ViewAsProvider>
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

            <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
              {children}
            </main>
          </div>
          <SupportButton
          position='bottom-right'
          config={{
            enabled: true,
            collectSystemInfo: true,
            allowScreenshots: true,
            autoOpen: false
          }}
          />
        </div>
      </NovoActionsProvider>
    </HeaderSlotProvider>
    </ViewAsProvider>
  );
}
