/**
 * 📅 Google Calendar OAuth Service
 * Integração multitenant com Google Calendar API
 */

import { supabase } from '@/lib/supabaseClient';

// Credenciais OAuth do Google - configurar no .env
// VITE_GOOGLE_CALENDAR_CLIENT_ID
// VITE_GOOGLE_CALENDAR_CLIENT_SECRET
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_SECRET ?? '';
const REDIRECT_URI = `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth/google/callback`;

function getGoogleOAuthConfig(): { clientId: string; clientSecret: string } {
  const id = GOOGLE_CLIENT_ID?.trim();
  const secret = GOOGLE_CLIENT_SECRET?.trim();
  if (!id) throw new Error('VITE_GOOGLE_CALENDAR_CLIENT_ID não configurado. Defina no .env');
  if (!secret) throw new Error('VITE_GOOGLE_CALENDAR_CLIENT_SECRET não configurado. Defina no .env');
  return { clientId: id, clientSecret: secret };
}

function getGoogleClientId(): string {
  const id = GOOGLE_CLIENT_ID?.trim();
  if (!id) throw new Error('VITE_GOOGLE_CALENDAR_CLIENT_ID não configurado. Defina no .env');
  return id;
}

// Escopos necessários para Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');

export interface GoogleCalendarToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
}

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: 'confirmed' | 'tentative' | 'cancelled';
  colorId?: string;
  extendedProperties?: {
    private?: {
      octo_event_id?: string;
      octo_tenant_id?: string;
    };
  };
}

/**
 * Gerar URL de autorização OAuth do Google (multitenant: state inclui userId + tenantId)
 */
export function getGoogleAuthUrl(userId: string, tenantId: string): string {
  const clientId = getGoogleClientId();
  const state = btoa(JSON.stringify({ userId, tenantId, timestamp: Date.now() }));
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Trocar código de autorização por tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleCalendarToken> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao trocar código: ${error.error_description || error.error}`);
  }

  const data = await response.json();
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    scope: data.scope
  };
}

/**
 * Renovar access token usando refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleCalendarToken> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao renovar token: ${error.error_description || error.error}`);
  }

  const data = await response.json();
  
  return {
    access_token: data.access_token,
    refresh_token: refreshToken, // Mantém o refresh token original
    expires_at: Date.now() + (data.expires_in * 1000),
    scope: data.scope
  };
}

/**
 * Salvar tokens no Supabase (por usuário/tenant)
 */
export async function saveGoogleTokens(
  userId: string,
  tenantId: string,
  tokens: GoogleCalendarToken
): Promise<void> {
  const { error } = await supabase
    .from('google_calendar_tokens')
    .upsert({
      user_id: userId,
      tenant_id: tenantId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at).toISOString(),
      scope: tokens.scope,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,tenant_id'
    });

  if (error) {
    throw new Error(`Erro ao salvar tokens: ${error.message}`);
  }
}

/**
 * Buscar tokens do Supabase
 */
export async function getGoogleTokens(
  userId: string,
  tenantId: string
): Promise<GoogleCalendarToken | null> {
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(data.expires_at).getTime(),
    scope: data.scope
  };
}

/**
 * Verificar se token está válido e renovar se necessário
 */
export async function getValidAccessToken(
  userId: string,
  tenantId: string
): Promise<string | null> {
  const tokens = await getGoogleTokens(userId, tenantId);
  
  if (!tokens) {
    return null;
  }

  // Se token ainda é válido (com margem de 5 minutos)
  if (tokens.expires_at > Date.now() + (5 * 60 * 1000)) {
    return tokens.access_token;
  }

  // Token expirado, renovar
  try {
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    await saveGoogleTokens(userId, tenantId, newTokens);
    return newTokens.access_token;
  } catch (error) {
    console.error('Erro ao renovar token:', error);
    return null;
  }
}

/**
 * Desconectar Google Calendar (remover tokens)
 */
export async function disconnectGoogleCalendar(
  userId: string,
  tenantId: string
): Promise<void> {
  const { error } = await supabase
    .from('google_calendar_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Erro ao desconectar: ${error.message}`);
  }
}

/**
 * Criar evento no Google Calendar
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: GoogleCalendarEvent
): Promise<string> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao criar evento: ${error.error?.message || 'Erro desconhecido'}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Atualizar evento no Google Calendar
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  event: GoogleCalendarEvent
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao atualizar evento: ${error.error?.message || 'Erro desconhecido'}`);
  }
}

/**
 * Deletar evento do Google Calendar
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.json();
    throw new Error(`Erro ao deletar evento: ${error.error?.message || 'Erro desconhecido'}`);
  }
}

/**
 * Converter evento da agenda para formato Google Calendar
 */
export function agendaEventoToGoogleEvent(
  evento: any,
  tenantId: string
): GoogleCalendarEvent {
  // Garantir que a data seja interpretada corretamente no fuso local
  // evento.data é uma string 'YYYY-MM-DD' ou um objeto Date
  let dateString = evento.data;
  if (evento.data instanceof Date) {
    dateString = evento.data.toISOString().split('T')[0];
  }
  
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Se tem horário, usar dateTime
  if (evento.horario) {
    const [hours, minutes] = evento.horario.split(':').map(Number);
    
    // Criar data usando construtor com componentes locais: year, monthIndex, day, hours...
    const startDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(endDateTime.getHours() + 1); // 1 hora de duração padrão

    return {
      summary: evento.titulo,
      description: evento.descricao || '',
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      status: evento.status === 'cancelado' ? 'cancelled' : 'confirmed',
      colorId: getPriorityColorId(evento.prioridade),
      extendedProperties: {
        private: {
          octo_event_id: evento.id,
          octo_tenant_id: tenantId,
        },
      },
    };
  } else {
    // Evento de dia inteiro - usar a string YYYY-MM-DD diretamente
    return {
      summary: evento.titulo,
      description: evento.descricao || '',
      start: {
        date: dateString,
      },
      end: {
        date: dateString,
      },
      status: evento.status === 'cancelado' ? 'cancelled' : 'confirmed',
      colorId: getPriorityColorId(evento.prioridade),
      extendedProperties: {
        private: {
          octo_event_id: evento.id,
          octo_tenant_id: tenantId,
        },
      },
    };
  }
}

/**
 * Mapear prioridade para cor do Google Calendar
 */
function getPriorityColorId(prioridade?: string): string {
  switch (prioridade) {
    case 'alta':
      return '11'; // Vermelho
    case 'media':
      return '5'; // Amarelo
    case 'baixa':
      return '2'; // Verde
    default:
      return '9'; // Azul (padrão)
  }
}

/**
 * Verificar se usuário está conectado ao Google Calendar
 */
export async function isGoogleCalendarConnected(
  userId: string,
  tenantId: string
): Promise<boolean> {
  const tokens = await getGoogleTokens(userId, tenantId);
  return tokens !== null;
}

/**
 * Listar eventos do Google Calendar
 */
export async function listGoogleCalendarEvents(
  accessToken: string,
  timeMin: string = new Date().toISOString()
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao listar eventos: ${error.error?.message || 'Erro desconhecido'}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Converter prioridade do Google Calendar (ColorId) para prioridade do sistema
 */
export function getPriorityFromColorId(colorId?: string): 'alta' | 'media' | 'baixa' {
  switch (colorId) {
    case '11': // Vermelho
      return 'alta';
    case '2': // Verde
      return 'baixa';
    case '5': // Amarelo
    default:
      return 'media';
  }
}
