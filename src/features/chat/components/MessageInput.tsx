import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { File as FileIcon, Image, Loader2, Music, Paperclip, Send, Video, X } from 'lucide-react';

export interface ComposeMedia {
  file: File;
  type: 'image' | 'audio' | 'video' | 'document';
}

interface Props {
  disabled?: boolean;
  onSendText: (text: string) => Promise<void> | void;
  onSendMedia: (params: { media: ComposeMedia; caption: string }) => Promise<void> | void;
}

function inferType(mime: string): ComposeMedia['type'] | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

export function MessageInput({ disabled, onSendText, onSendMedia }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<ComposeMedia | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    if (pending.type === 'image' || pending.type === 'video') {
      const url = URL.createObjectURL(pending.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [pending]);

  const pickFile = (ref: React.RefObject<HTMLInputElement>) => {
    setMenuOpen(false);
    ref.current?.click();
  };

  const handleFileChange =
    (forcedType?: ComposeMedia['type']) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const type = forcedType ?? inferType(file.type) ?? 'document';
      setPending({ file, type });
      // limpa o input pra permitir re-selecionar mesmo arquivo depois
      e.target.value = '';
    };

  const handleSend = async () => {
    if (sending || disabled) return;
    if (pending) {
      setSending(true);
      try {
        await onSendMedia({ media: pending, caption: text.trim() });
        setPending(null);
        setText('');
      } finally {
        setSending(false);
      }
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await onSendText(trimmed);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="border-t" style={{ borderColor: 'var(--border-color, #e5e7eb)' }}>
      {pending && (
        <div className="flex items-center gap-3 border-b bg-gray-50 px-3 py-2 dark:bg-slate-900/40">
          {pending.type === 'image' && previewUrl ? (
            <img src={previewUrl} alt={pending.file.name} className="h-12 w-12 rounded object-cover" />
          ) : pending.type === 'video' && previewUrl ? (
            <video src={previewUrl} className="h-12 w-12 rounded object-cover" />
          ) : pending.type === 'audio' ? (
            <Music className="h-10 w-10 text-emerald-600" />
          ) : (
            <FileIcon className="h-10 w-10 text-emerald-600" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{pending.file.name}</div>
            <div className="text-[11px] text-gray-500">
              {(pending.file.size / 1024).toFixed(1)} KB · {pending.type}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="flex-none rounded-md p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-800"
            title="Remover anexo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled || sending}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-slate-800"
            title="Anexar"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-12 left-0 z-10 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              <MenuItem icon={Image} label="Imagem" onClick={() => pickFile(imageInputRef)} />
              <MenuItem icon={Video} label="Vídeo" onClick={() => pickFile(videoInputRef)} />
              <MenuItem icon={Music} label="Áudio" onClick={() => pickFile(audioInputRef)} />
              <MenuItem icon={FileIcon} label="Documento" onClick={() => pickFile(documentInputRef)} />
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange('image')}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange('audio')}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/3gpp"
            className="hidden"
            onChange={handleFileChange('video')}
          />
          <input
            ref={documentInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            className="hidden"
            onChange={handleFileChange('document')}
          />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={pending ? 'Legenda (opcional)' : 'Mensagem'}
          disabled={disabled || sending}
          rows={1}
          className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          style={{ borderColor: 'var(--border-color, #e5e7eb)', maxHeight: 120 }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || sending || (!pending && !text.trim())}
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-500 text-white transition-opacity hover:bg-emerald-600 disabled:opacity-40"
          aria-label="Enviar"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Image;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-800"
    >
      <Icon className="h-4 w-4 text-gray-500" />
      {label}
    </button>
  );
}
