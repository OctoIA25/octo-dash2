/**
 * 📅 Página de callback OAuth do Google Calendar (Octo Agenda)
 * Suporta: popup (postMessage ao opener) ou redirect na mesma aba (troca código aqui e redireciona).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { exchangeCodeForTokens, saveGoogleTokens } from '../services/googleCalendarService';
import { supabase } from '@/lib/supabaseClient';

function decodeState(stateB64: string | null): { userId: string; tenantId: string } | null {
  if (!stateB64) return null;
  try {
    const json = atob(stateB64);
    const data = JSON.parse(json) as { userId?: string; tenantId?: string };
    if (data?.userId && data?.tenantId) return { userId: data.userId, tenantId: data.tenantId };
  } catch {
    // ignore
  }
  return null;
}

export const GoogleOAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (error) {
      setStatus('error');
      setMessage(searchParams.get('error_description') || error);
      if (window.opener) {
        window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error }, window.location.origin);
      }
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('Código de autorização não recebido.');
      if (window.opener) {
        window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR' }, window.location.origin);
      }
      return;
    }

    const stateData = decodeState(state);

    // Popup: enviar code para o opener
    if (window.opener) {
      setStatus('success');
      setMessage('Conectando sua agenda...');
      window.opener.postMessage(
        { type: 'GOOGLE_OAUTH_SUCCESS', code, state },
        window.location.origin
      );
      setTimeout(() => window.close(), 1500);
      return;
    }

    // Redirect na mesma aba: trocar código por tokens aqui e redirecionar
    if (!stateData) {
      setStatus('error');
      setMessage('Sessão inválida. Tente conectar novamente.');
      return;
    }

    (async () => {
      try {
        setMessage('Conectando sua agenda...');
        const tokens = await exchangeCodeForTokens(code);
        await saveGoogleTokens(stateData.userId, stateData.tenantId, tokens);
        if (stateData.tenantId !== 'owner') {
          await supabase
            .from('agenda_eventos')
            .update({ google_calendar_synced: true })
            .eq('tenant_id', stateData.tenantId);
        }
        setStatus('success');
        setMessage('Conectado! Redirecionando...');
        setTimeout(() => {
          window.location.href = '/leads';
        }, 800);
      } catch (err: unknown) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Erro ao conectar. Tente novamente.');
      }
    })();
  }, [searchParams]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-primary, #1a1a1a)' }}
    >
      <div className="max-w-sm w-full text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-white/90">Processando autorização do Google...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-white/90">{message}</p>
            <p className="text-sm text-white/60">Esta janela pode ser fechada.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-white/90">Erro na autorização</p>
            <p className="text-sm text-red-400">{message}</p>
            <p className="text-xs text-white/50">Feche esta janela e tente novamente.</p>
          </>
        )}
      </div>
    </div>
  );
};
