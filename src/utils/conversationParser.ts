import { ProcessedLead } from '@/data/realLeadsProcessor';

export interface ChatMessage {
  id: number;
  sender: 'LIA' | 'Lead';
  message: string;
  timestamp?: Date;
}

export const parseConversation = (lead: ProcessedLead): ChatMessage[] => {
  const chatMessages: ChatMessage[] = [];
  
  if (!lead.Conversa || !lead.Conversa.trim()) {
    return chatMessages;
  }

  const conversationText = lead.Conversa;
  const lines = conversationText.split('\n').filter(line => line.trim());
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      let sender: 'LIA' | 'Lead' = 'Lead';
      let message = trimmedLine;
      let timestamp: Date | undefined;

      // Regex para capturar diferentes formatos de prefixos
      // Formato: LIA [12/01 14:30]: mensagem ou Lead [12/01 14:30]: mensagem
      const prefixRegex = /(Lead|LIA)\s*\[(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})\]:\s*/gi;
      // Formato simples: LIA: mensagem ou Lead: mensagem
      const simpleRegex = /(Lead|LIA):\s*/gi;
      
      // Verificar se tem prefixo completo com timestamp
      const prefixMatch = trimmedLine.match(prefixRegex);
      if (prefixMatch) {
        // Detectar sender
        if (trimmedLine.toLowerCase().includes('lia')) {
          sender = 'LIA';
        } else {
          sender = 'Lead';
        }
        
        // Extrair timestamp
        const timestampMatch = trimmedLine.match(/\[(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})\]/);
        if (timestampMatch) {
          try {
            const [, date, time] = timestampMatch;
            const [day, month] = date.split('/');
            const [hour, minute] = time.split(':');
            const currentYear = new Date().getFullYear();
            timestamp = new Date(currentYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
          } catch (e) {
            // Se falhar o parsing da data, usar data atual
            timestamp = new Date();
          }
        }
        
        // Remover prefixo da mensagem
        message = trimmedLine.replace(prefixRegex, '').trim();
      } 
      // Verificar prefixo simples (LIA: ou Lead:)
      else if (trimmedLine.match(simpleRegex)) {
        if (trimmedLine.toLowerCase().includes('lia:')) {
          sender = 'LIA';
        } else {
          sender = 'Lead';
        }
        
        // Remover prefixo simples
        message = trimmedLine.replace(simpleRegex, '').trim();
        
        // Gerar timestamp baseado na data de entrada do lead
        const baseDate = new Date(lead.data_entrada);
        timestamp = new Date(baseDate.getTime() + (index * 60000)); // +1 minuto por mensagem
      }
      // Se não tem prefixo, alternar automaticamente (Lead primeiro)
      else {
        sender = index % 2 === 0 ? 'Lead' : 'LIA';
        const baseDate = new Date(lead.data_entrada);
        timestamp = new Date(baseDate.getTime() + (index * 60000));
      }

      // Só adicionar se a mensagem não estiver vazia e não for separador
      if (message.trim() && 
          message.trim() !== '---' && 
          message.trim() !== '--' && 
          message.trim() !== '___' &&
          message.length > 1) {
        chatMessages.push({
          id: index,
          sender,
          message: message.trim(),
          timestamp
        });
      }
    }
  });

  return chatMessages;
};
