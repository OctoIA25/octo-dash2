/**
 * useTheme - Hook de tema usando next-themes
 *
 * API compatível com versão antiga (currentTheme, changeTheme, themes, themeConfig)
 * para não quebrar componentes existentes.
 *
 * Estrutura nova:
 * - 'branco' → class="light" (tema claro padrão)
 * - 'cinza' → class="gray"  (variação cinza)
 * - 'escuro' → class="dark" (escuro padrão shadcn)
 */

import { useTheme as useNextTheme } from 'next-themes';
import { useEffect, useState } from 'react';

// Tipos mantidos compatíveis com a versão antiga
export type ThemeType = 'cinza' | 'branco' | 'escuro';

interface ThemeConfig {
  name: string;
  displayName: string;
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgHover: string;
  bgChat: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
}

// Mapeamento ThemeType <-> classe CSS next-themes
const THEME_TO_CLASS: Record<ThemeType, string> = {
  branco: 'light',
  cinza: 'gray',
  escuro: 'dark',
};

const CLASS_TO_THEME: Record<string, ThemeType> = {
  light: 'branco',
  gray: 'cinza',
  dark: 'escuro',
};

// Config visual dos temas (para componentes que consultam diretamente)
const THEMES: Record<ThemeType, ThemeConfig> = {
  branco: {
    name: 'branco',
    displayName: 'Branco',
    bgPrimary: '#ffffff',
    bgSecondary: '#fafafa',
    bgCard: '#fafafa',
    bgHover: '#f5f5f5',
    bgChat: '#f3f4f6',
    textPrimary: '#525252',
    textSecondary: '#737373',
    border: '#e4e4e4',
    accent: '#3b82f6',
  },
  cinza: {
    name: 'cinza',
    displayName: 'Cinza',
    bgPrimary: '#2b2d30',
    bgSecondary: '#313337',
    bgCard: '#313337',
    bgHover: '#3a3c40',
    bgChat: '#313337',
    textPrimary: '#eaeaea',
    textSecondary: '#aeaeae',
    border: '#474a4f',
    accent: '#3B82F6',
  },
  escuro: {
    name: 'escuro',
    displayName: 'Escuro',
    bgPrimary: '#191919',
    bgSecondary: '#1c1c1c',
    bgCard: '#1c1c1c',
    bgHover: '#212121',
    bgChat: '#1c1c1c',
    textPrimary: '#f1f1f0',
    textSecondary: '#b3b3b3',
    border: '#292929',
    accent: '#3B82F6',
  },
};

export const useTheme = () => {
  const { theme: nextTheme, setTheme: setNextTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  // Evita hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Converter class para ThemeType
  const currentTheme: ThemeType = (() => {
    const active = resolvedTheme || nextTheme || 'light';
    return CLASS_TO_THEME[active] || 'branco';
  })();

  const changeTheme = (theme: ThemeType) => {
    const nextClass = THEME_TO_CLASS[theme] || 'light';
    setNextTheme(nextClass);

    // Manter classe no body para compatibilidade com CSS legacy (se ainda usado em algum lugar)
    try {
      document.body.className = `theme-${theme}`;
    } catch {
      // ignore
    }
  };

  // Sincronizar body.className sempre que o tema mudar (compat legada)
  useEffect(() => {
    if (!mounted) return;
    try {
      document.body.className = `theme-${currentTheme}`;
    } catch {
      // ignore
    }
  }, [currentTheme, mounted]);

  return {
    currentTheme,
    changeTheme,
    themes: THEMES,
    themeConfig: THEMES[currentTheme],
  };
};
