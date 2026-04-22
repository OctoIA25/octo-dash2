import { useEffect } from 'react';

/**
 * Enquanto `open` é true, define `--drawer-width` no <body> para que o layout
 * principal possa aplicar `margin-right: var(--drawer-width, 0px)` e compactar
 * o conteúdo. Só empurra o conteúdo quando a tela tem espaço sobrando
 * (viewport >= width + MIN_CONTENT_WIDTH); caso contrário o drawer apenas
 * sobrepõe (variável fica em 0).
 */
const MIN_CONTENT_WIDTH = 1024; // largura mínima que o conteúdo precisa pra não parecer esmagado

export function useLateralDrawer(open: boolean, width = 560) {
  useEffect(() => {
    if (!open) return;

    const apply = () => {
      const available = window.innerWidth - width;
      const effective = available >= MIN_CONTENT_WIDTH ? `${width}px` : '0px';
      document.body.style.setProperty('--drawer-width', effective);
    };

    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      document.body.style.removeProperty('--drawer-width');
    };
  }, [open, width]);
}
