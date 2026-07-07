import type { MessageContentProps } from '../../types';

export function TextContent({ message }: MessageContentProps) {
  return <p className="whitespace-pre-wrap break-words">{message.body}</p>;
}
