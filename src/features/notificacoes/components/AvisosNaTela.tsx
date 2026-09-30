/**
 * Ponte entre o Realtime e o aviso na tela.
 *
 * Mora DENTRO do Router (montada no NovoLayout) porque o NotificationsProvider
 * fica fora dele (App.tsx), e o clique no aviso precisa navegar. A função de
 * navegar vai no closure do toast — o Toaster em si também está fora do Router.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { destinoDoLink } from '../notificationKinds';
import { avisosNaTelaLigados } from '../avisosNaTela';
import { mostrarBloop } from './NotificationBloop';

export function AvisosNaTela() {
  const { novaChegada, markAsRead } = useNotifications();
  const navigate = useNavigate();
  // navigate muda a cada navegação: sem isto, o mesmo aviso reapareceria.
  const ultimoMostrado = useRef<string | null>(null);

  useEffect(() => {
    if (!novaChegada || novaChegada.id === ultimoMostrado.current) return;
    ultimoMostrado.current = novaChegada.id;
    if (!avisosNaTelaLigados()) return;
    mostrarBloop(novaChegada, (item) => {
      markAsRead(item.id);
      navigate(destinoDoLink(item.linkType, item.linkId) ?? '/notificacoes');
    });
  }, [novaChegada, markAsRead, navigate]);

  return null;
}
