import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listWhatsappTemplates, type WhatsappTemplate } from '../services/whatsappService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | undefined;
  onSend: (params: { name: string; language: string; bodyParameters: string[] }) => Promise<void>;
}

function extractBodyText(template: WhatsappTemplate): string {
  const body = template.components.find((c) => c.type === 'BODY');
  return body?.text ?? '';
}

function countPlaceholders(text: string): number {
  const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g);
  if (!matches) return 0;
  const indexes = matches.map((m) => parseInt(m.replace(/\D+/g, ''), 10));
  return Math.max(0, ...indexes);
}

function renderPreview(text: string, params: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, idx) => {
    const i = parseInt(idx, 10) - 1;
    return params[i] || `{{${idx}}}`;
  });
}

export function TemplatePicker({ open, onOpenChange, tenantId, onSend }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listWhatsappTemplates(tenantId)
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        if (list.length > 0) {
          const first = list[0];
          setSelectedKey(`${first.name}::${first.language}`);
        }
      })
      .catch((err) => !cancelled && setError(err?.message ?? 'Erro ao carregar templates.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, tenantId]);

  const selected = useMemo(
    () => templates.find((t) => `${t.name}::${t.language}` === selectedKey) ?? null,
    [templates, selectedKey],
  );

  const bodyText = selected ? extractBodyText(selected) : '';
  const placeholderCount = useMemo(() => countPlaceholders(bodyText), [bodyText]);

  // Resetar params ao trocar template
  useEffect(() => {
    setParams(Array.from({ length: placeholderCount }, () => ''));
    setSendError(null);
  }, [selectedKey, placeholderCount]);

  const handleSend = async () => {
    if (!selected) return;
    if (placeholderCount > 0 && params.some((p) => !p.trim())) {
      setSendError('Preencha todas as variáveis do template.');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await onSend({
        name: selected.name,
        language: selected.language,
        bodyParameters: params,
      });
      onOpenChange(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Erro ao enviar template.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar template (HSM)</DialogTitle>
          <DialogDescription>
            Templates pré-aprovados pela Meta. Use para iniciar conversa com contatos novos
            ou fora da janela de 24h.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando templates...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            Nenhum template aprovado encontrado. Cadastre templates em Business Manager → WhatsApp Manager → Modelos de mensagem.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                Template
              </label>
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {templates.map((t) => (
                  <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                    {t.name} ({t.language}) — {t.category}
                  </option>
                ))}
              </select>
            </div>

            {placeholderCount > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700 dark:text-slate-300">Variáveis</p>
                {params.map((value, idx) => (
                  <div key={idx}>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      {`{{${idx + 1}}}`}
                    </label>
                    <input
                      value={value}
                      onChange={(e) =>
                        setParams((prev) => {
                          const next = [...prev];
                          next[idx] = e.target.value;
                          return next;
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder={`Valor da variável ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-gray-700 dark:text-slate-300">Pré-visualização</p>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 p-3 text-sm whitespace-pre-wrap">
                {renderPreview(bodyText, params) || '—'}
              </div>
            </div>

            {sendError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {sendError}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !selected || templates.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar template
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
