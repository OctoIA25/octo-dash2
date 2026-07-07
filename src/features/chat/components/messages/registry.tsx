import type { ComponentType } from 'react';
import type { MessageContentProps, WhatsappMessageType } from '../../types';
import { TextContent } from './TextContent';
import { DocumentContent } from './DocumentContent';
import { FallbackContent } from './FallbackContent';
import { AudioContent } from './AudioContent';

// Adicionar image/video na Task 5.
const registry: Partial<Record<WhatsappMessageType, ComponentType<MessageContentProps>>> = {
  text: TextContent,
  template: TextContent,
  document: DocumentContent,
  audio: AudioContent,
};

export function resolveContent(type: WhatsappMessageType): ComponentType<MessageContentProps> {
  return registry[type] ?? FallbackContent;
}

export { registry };
