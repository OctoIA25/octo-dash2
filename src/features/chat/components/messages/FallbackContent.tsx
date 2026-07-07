import type { MessageContentProps } from '../../types';

export function FallbackContent({ message }: MessageContentProps) {
  return (
    <p className="italic opacity-80">
      [{message.message_type}]{message.body ? `: ${message.body}` : ''}
    </p>
  );
}
