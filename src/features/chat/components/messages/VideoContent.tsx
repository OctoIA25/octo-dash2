import type { MessageContentProps } from '../../types';

export function VideoContent({ message }: MessageContentProps) {
  if (!message.media_url) {
    return <p className="italic opacity-80">[video] indisponível</p>;
  }
  return (
    <div className="space-y-1">
      <video
        src={message.media_url}
        controls
        preload="none"
        className="max-h-[280px] max-w-full rounded"
      />
      {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
    </div>
  );
}
