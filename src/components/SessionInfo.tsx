import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Shield } from 'lucide-react';

interface SessionData {
  user: any;
  ip: string;
  loginTime: number;
  lastActivity: number;
  expiresAt: number;
}

export const SessionInfo = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const updateSessionInfo = () => {
      try {
        const storedSession = localStorage.getItem('octo-dash-session');
        if (storedSession) {
          const session: SessionData = JSON.parse(storedSession);
          setSessionData(session);
          
          // Calcular tempo restante
          const now = Date.now();
          const remaining = session.expiresAt - now;
          
          if (remaining > 0) {
            const minutes = Math.floor(remaining / (1000 * 60));
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            
            if (hours > 0) {
              setTimeRemaining(`${hours}h ${mins}m`);
            } else {
              setTimeRemaining(`${mins}m`);
            }
          } else {
            setTimeRemaining('Expirada');
          }
        }
      } catch (error) {
        console.error('Erro ao ler informações da sessão:', error);
      }
    };

    // Atualizar imediatamente
    updateSessionInfo();
    
    // Atualizar a cada minuto
    const interval = setInterval(updateSessionInfo, 60000);
    
    return () => clearInterval(interval);
  }, []);

  if (!sessionData) return null;

  return (
    <div className="flex items-center space-x-2 text-xs text-text-secondary">
      <div className="flex items-center space-x-1">
        <Shield className="h-3 w-3" />
        <span>IP: {sessionData.ip}</span>
      </div>
      <div className="flex items-center space-x-1">
        <Clock className="h-3 w-3" />
        <Badge variant="outline" className="text-xs">
          {timeRemaining}
        </Badge>
      </div>
    </div>
  );
};