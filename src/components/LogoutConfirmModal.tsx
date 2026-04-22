/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Modal de confirmação de logout com animações fluidas
 */

import { useState, useEffect } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { Button } from '@/components/ui/button';
import { LogOut, X, AlertCircle, Loader2 } from 'lucide-react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogoutConfirmModal = ({ isOpen, onClose }: LogoutConfirmModalProps) => {
  const { logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isHoveringLogout, setIsHoveringLogout] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Pequeno delay para animação de entrada
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    // Animação de saída antes do logout
    await new Promise(resolve => setTimeout(resolve, 300));
    setIsVisible(false);
    
    // Aguardar animação completar
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Executar logout e AGUARDAR completar
    await logout();
    
    // Redirecionar para a raiz (que mostrará a tela de login)
    window.location.href = '/';
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
      setIsLoggingOut(false);
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop com animação de fade */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className={`
            bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl w-[340px] max-w-[92vw]
            pointer-events-auto
            transform transition-all duration-300 ease-out
            ${isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Confirmar Saída</h2>
                <p className="text-sm text-gray-400 mt-0.5">Você tem certeza?</p>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              disabled={isLoggingOut}
              className="h-8 w-8 rounded-lg hover:bg-neutral-800 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4">
              <p className="text-gray-300 text-sm leading-relaxed">
                Você está prestes a sair da sua conta{' '}
                <span className="font-semibold text-white">{user?.name}</span>.
              </p>
              <p className="text-gray-400 text-xs mt-2">
                Todas as configurações não salvas serão perdidas.
              </p>
            </div>

            {/* Sessão atual */}
            {user && (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Tipo de conta:</span>
                  <span className="text-gray-300 font-medium">
                    {user.role === 'gestao' ? 'Administrador' : 'Corretor'}
                  </span>
                </div>
                {user.corretor && (
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Corretor:</span>
                    <span className="text-gray-300 font-medium">{user.corretor}</span>
                  </div>
                )}
                {user.equipe && user.equipe !== 'admin' && (
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Equipe:</span>
                    <span className={`font-medium capitalize ${
                      user.equipe === 'verde' ? 'text-green-400' :
                      user.equipe === 'vermelha' ? 'text-red-400' :
                      user.equipe === 'amarela' ? 'text-yellow-400' :
                      user.equipe === 'azul' ? 'text-blue-400' : 'text-gray-300'
                    }`}>
                      {user.equipe}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row gap-3 p-6 border-t border-neutral-800 bg-neutral-900/50">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoggingOut}
              className="w-full sm:flex-1 h-11 border-neutral-700 hover:bg-neutral-800 text-gray-300 hover:text-white transition-all duration-200"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              onMouseEnter={() => setIsHoveringLogout(true)}
              onMouseLeave={() => setIsHoveringLogout(false)}
              className="w-full sm:flex-1 h-11 bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 border-0"
            >
              {isLoggingOut ? (
                <div className="flex items-center gap-2" style={{ color: '#ffffff' }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ffffff' }} />
                  <span style={{ color: '#ffffff' }}>Saindo...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogOut 
                    className={`w-4 h-4 transition-colors duration-200 ${isHoveringLogout ? 'logout-icon-red' : ''}`}
                    style={{ color: isHoveringLogout ? undefined : '#ffffff' }}
                  />
                  <span style={{ color: '#ffffff' }}>Sair Agora</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

