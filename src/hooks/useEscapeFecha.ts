import { useEffect } from 'react';

/**
 * Escape fecha o diálogo.
 *
 * Visto no navegador em 21/09, no quadro de demandas: sem isto, quem abre um
 * card fica preso — o único jeito de sair é acertar o X ou o fundo. É o básico
 * que todo diálogo precisa ter, e some justamente para quem usa teclado.
 *
 * Mora aqui, e não dentro de uma tela, porque a segunda tela a precisar dele
 * foi a conferência de vendas: copiar as oito linhas seria começar duas
 * versões do mesmo comportamento.
 */
export function useEscapeFecha(aoFechar: () => void) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);
}
