/**
 * Ponte entre o Realtime e o aviso na tela.
 *
 * Mora DENTRO do Router (montada no NovoLayout) porque o NotificationsProvider
 * fica fora dele (App.tsx), e o clique no aviso precisa navegar. A função de
 * navegar vai no closure do toast — o Toaster em si também está fora do Router.
 *
 * Assina o EVENTO de chegada (`aoChegar`), em vez de vigiar um estado: estado
 * seria reexibido quando o layout desmonta e monta de novo (abrir /lead/:id e
 * voltar) e engoliria rajadas (duas chegadas antes do render viram uma).
 * Trade-off: chegada enquanto o usuário está fora do NovoLayout (ex.: em
 * /lead/:id) não ganha bloop — continua no sino e na lista.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { destinoDoLink } from '../notificationKinds';
import { avisosNaTelaLigados } from '../avisosNaTela';
import { mostrarBloop } from './NotificationBloop';

export function AvisosNaTela() {
  const { aoChegar, markAsRead } = useNotifications();
  const navigate = useNavigate();
  // O ouvinte vive enquanto o layout viver; as refs evitam closure velho de navigate/markAsRead.
  const navegarRef = useRef(navigate);
  const marcarRef = useRef(markAsRead);
  useEffect(() => {
    navegarRef.current = navigate;
    marcarRef.current = markAsRead;
  }, [navigate, markAsRead]);

  useEffect(
    () =>
      aoChegar((item) => {
        if (!avisosNaTelaLigados()) return;
        mostrarBloop(item, (i) => {
          marcarRef.current(i.id);
          navegarRef.current(destinoDoLink(i.linkType, i.linkId) ?? '/notificacoes');
        });
      }),
    [aoChegar],
  );

  return null;
}
