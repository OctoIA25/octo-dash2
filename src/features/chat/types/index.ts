export type WhatsappDirection = 'inbound' | 'outbound';

export type WhatsappMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'template'
  | 'system';

export type WhatsappMessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'received';

export interface WhatsappConversation {
  id: string;
  tenant_id: string;
  contact_phone: string;
  contact_name: string | null;
  contact_profile_name: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  assigned_user_id: string | null;
  lead_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappMessage {
  id: string;
  conversation_id: string;
  tenant_id: string;
  wa_message_id: string | null;
  direction: WhatsappDirection;
  message_type: WhatsappMessageType;
  body: string | null;
  media_url: string | null;
  metadata: Record<string, unknown>;
  status: WhatsappMessageStatus;
  error_message: string | null;
  sent_by_user_id: string | null;
  wa_timestamp: string | null;
  created_at: string;
}

export interface WhatsappConfig {
  tenant_id: string;
  phone_number_id: string;
  business_account_id: string | null;
  display_phone_number: string | null;
  is_active: boolean;
}

export type MediaKind = 'image' | 'audio' | 'video' | 'document';

export interface MessageContentProps {
  message: WhatsappMessage;
  isOutbound: boolean;
}

export interface PendingMessage {
  tempId: string;
  conversationId: string;
  type: MediaKind;
  file: File;
  caption: string;
  objectUrl: string;
  status: 'uploading' | 'sending' | 'failed';
  progress: number; // 0-100
  error?: string;
}
