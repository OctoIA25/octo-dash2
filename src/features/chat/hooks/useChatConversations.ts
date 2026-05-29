import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { listConversations } from '../services/chatService';
import type { WhatsappConversation } from '../types';

export function useChatConversations(tenantId: string | undefined) {
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const list = await listConversations(tenantId);
      setConversations(list);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`whatsapp_conversations_${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tenantId, refresh]);

  return { conversations, loading, refresh };
}
