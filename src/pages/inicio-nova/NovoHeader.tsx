/**
 * NovoHeader - Header compartilhado do design novo do CRM
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bell, Sun, Moon, ChevronDown, LogOut, User as UserIcon, Settings } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { PageTabs } from './PageTabs';
import { LogoutConfirmModal } from '@/components/LogoutConfirmModal';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';
import { useNovoActions } from '@/contexts/NovoActionsContext';

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

export function NovoHeader() {
  const { user } = useAuthContext();
  const { currentTheme, changeTheme } = useTheme();
  const isDark = currentTheme === 'escuro';
  const { slot } = useHeaderSlot();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const novoRef = useRef<HTMLDivElement>(null);

  const { actions: novoActions } = useNovoActions();
  const hasSingleAction = novoActions.length === 1;
  const hasMultipleActions = novoActions.length > 1;

  useEffect(() => {
    if (!novoOpen) return;
    const onClick = (event: MouseEvent) => {
      if (novoRef.current && !novoRef.current.contains(event.target as Node)) {
        setNovoOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [novoOpen]);

  const handleNovoClick = () => {
    if (hasSingleAction) {
      novoActions[0].onClick();
      return;
    }
    if (hasMultipleActions) {
      setNovoOpen((prev) => !prev);
    }
  };

  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [profileOpen]);

  const userName = (() => {
    if (!user?.email) return 'Usuário';
    const prefix = user.email.split('@')[0].replace(/[._-]/g, ' ');
    return prefix
      .split(' ')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
      .slice(0, 30);
  })();

  const userRole =
    user?.systemRole === 'owner'
      ? 'Owner'
      : user?.systemRole === 'admin'
      ? 'Gestor'
      : user?.systemRole === 'team_leader'
      ? 'Líder'
      : 'Corretor';

  const initials = getInitials(userName);

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-6 gap-4 shrink-0">
      {slot ?? <PageTabs />}

      <div className="flex items-center gap-3 ml-auto">
        {novoActions.length > 0 && (
          <div ref={novoRef} className="relative">
            <button
              type="button"
              onClick={handleNovoClick}
              aria-haspopup={hasMultipleActions ? 'menu' : undefined}
              aria-expanded={hasMultipleActions ? novoOpen : undefined}
              title={hasSingleAction ? novoActions[0].label : 'Criar novo'}
              className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} />
              Novo
              {hasMultipleActions && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${novoOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2.2}
                />
              )}
            </button>

            {hasMultipleActions && novoOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+6px)] min-w-[220px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50"
              >
                {novoActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setNovoOpen(false);
                        action.onClick();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      {Icon ? (
                        <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" strokeWidth={2} />
                      ) : (
                        <Plus className="w-4 h-4 text-slate-500 dark:text-slate-400" strokeWidth={2} />
                      )}
                      <span className="font-medium">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => changeTheme(isDark ? 'branco' : 'escuro')}
          className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors focus:outline-none"
          aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          title={isDark ? 'Tema claro' : 'Tema escuro'}
        >
          {isDark ? (
            <Sun className="w-[18px] h-[18px] text-amber-400" strokeWidth={2} />
          ) : (
            <Moon className="w-[18px] h-[18px] text-slate-600" strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          className="relative w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
        >
          <Bell className="w-[18px] h-[18px] text-slate-600 dark:text-slate-300" strokeWidth={2} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
        </button>

        <div ref={profileRef} className="relative pl-3 border-l border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[12px] font-semibold">
              {initials}
            </div>
            <div className="text-right">
              <p className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">{userName}</p>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-tight">{userRole}</p>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+6px)] w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{userName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email ?? ''}</p>
                <p className="mt-1 text-[10.5px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-semibold">
                  {userRole}
                </p>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/configuracoes');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <UserIcon className="w-4 h-4" strokeWidth={2} />
                Meu perfil
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/configuracoes');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Settings className="w-4 h-4" strokeWidth={2} />
                Configurações
              </button>

              <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  setLogoutOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={2} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      <LogoutConfirmModal isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </header>
  );
}
