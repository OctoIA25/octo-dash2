/**
 * ModalOverlay - Componente reutilizavel de overlay para modais customizados
 *
 * Use este componente em QUALQUER modal customizado (fora do shadcn Dialog)
 * para garantir estilo consistente em todos os temas (escuro, branco, cinza).
 *
 * Caracteristicas:
 * - Fundo preto 60% com blur de 8px (efeito moderno)
 * - Renderiza via React Portal no document.body (fora de qualquer contexto de empilhamento)
 * - z-index alto (99998) para ficar por cima de tudo
 * - Click fora fecha o modal (opcional, via onClose)
 *
 * Uso basico:
 * ```tsx
 * {isOpen && (
 *   <ModalOverlay onClose={() => setIsOpen(false)}>
 *     <div className="bg-white dark:bg-slate-900 rounded-lg p-6">
 *       Conteudo do modal aqui
 *     </div>
 *   </ModalOverlay>
 * )}
 * ```
 */

import { ReactNode, MouseEvent } from 'react';
import { createPortal } from 'react-dom';

interface ModalOverlayProps {
  children: ReactNode;
  /** Se fornecido, clicar no overlay (fora do conteudo) chama essa funcao */
  onClose?: () => void;
  /** Classe CSS extra para o container do conteudo (centraliza por padrao) */
  contentClassName?: string;
  /** Se false, o conteudo nao e centralizado (util para sidebars) */
  centered?: boolean;
  /** z-index customizado (padrao: 99998 para overlay, 99999 para conteudo) */
  zIndex?: number;
}

export function ModalOverlay({
  children,
  onClose,
  contentClassName = '',
  centered = true,
  zIndex = 99998,
}: ModalOverlayProps) {
  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    // So fecha se clicar no proprio overlay, nao no conteudo filho
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  const overlayContent = (
    <>
      {/* Overlay escuro com blur - renderiza no body via Portal */}
      <div
        onClick={handleOverlayClick}
        className="octo-modal-overlay animate-in fade-in duration-200"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex,
          ...(centered && {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }),
        }}
      >
        {centered && (
          <div
            className={contentClassName}
            style={{ zIndex: zIndex + 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        )}
      </div>
      {/* Se nao centralizado, renderiza conteudo fora do overlay (ex: sidebar deslizante) */}
      {!centered && children}
    </>
  );

  return createPortal(overlayContent, document.body);
}
