import type { ComponentType } from 'react';
import type { MessageContentProps, WhatsappMessageType } from '../../types';
import { TextContent } from './TextContent';
import { DocumentContent } from './DocumentContent';
import { FallbackContent } from './FallbackContent';

// Adicionar image/video/audio nas Tasks 4 e 5.
const registry: Partial<Record<WhatsappMessageType, ComponentType<MessageContentProps>>> = {
  text: TextContent,
  template: TextContent,
  document: DocumentContent,
};

export function resolveContent(type: WhatsappMessageType): ComponentType<MessageContentProps> {
  return registry[type] ?? FallbackContent;
}

export { registry };
