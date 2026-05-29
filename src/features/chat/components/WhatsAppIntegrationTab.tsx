import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  deleteWhatsappConfig,
  loadWhatsappConfig,
  saveWhatsappConfig,
  setWhatsappConfigActive,
  type WhatsappConfigRecord,
} from '../services/whatsappConfigService';

type FormState = {
  phone_number_id: string;
  business_account_id: string;
  display_phone_number: string;
  access_token: string;
  webhook_verify_token: string;
  app_secret: string;
};

const EMPTY_FORM: FormState = {
  phone_number_id: '',
  business_account_id: '',
  display_phone_number: '',
  access_token: '',
  webhook_verify_token: '',
  app_secret: '',
};

function generateVerifyToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function WhatsAppIntegrationTab() {
  const { tenantId, isAdmin, isOwner } = useAuthContext();
  const canEdit = isAdmin || isOwner;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [config, setConfig] = useState<WhatsappConfigRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/v1/whatsapp/webhook` : '';

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadWhatsappConfig(tenantId)
      .then((cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        if (cfg) {
          setForm({
            phone_number_id: cfg.phone_number_id ?? '',
            business_account_id: cfg.business_account_id ?? '',
            display_phone_number: cfg.display_phone_number ?? '',
            access_token: '',
            webhook_verify_token: cfg.webhook_verify_token ?? '',
            app_secret: cfg.app_secret ?? '',
          });
        }
      })
      .catch((err) =>
        !cancelled &&
        setFeedback({ kind: 'error', text: err?.message ?? 'Erro ao carregar configuração.' }),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !canEdit) return;
    setFeedback(null);

    if (!form.phone_number_id.trim()) {
      setFeedback({ kind: 'error', text: 'Phone Number ID é obrigatório.' });
      return;
    }
    if (!config && !form.access_token.trim()) {
      setFeedback({ kind: 'error', text: 'Access Token é obrigatório na primeira configuração.' });
      return;
    }
    if (!form.webhook_verify_token.trim()) {
      setFeedback({ kind: 'error', text: 'Webhook Verify Token é obrigatório.' });
      return;
    }

    setSaving(true);
    try {
      await saveWhatsappConfig(tenantId, {
        phone_number_id: form.phone_number_id.trim(),
        business_account_id: form.business_account_id.trim() || undefined,
        display_phone_number: form.display_phone_number.trim() || undefined,
        access_token: form.access_token.trim(),
        webhook_verify_token: form.webhook_verify_token.trim(),
        app_secret: form.app_secret.trim() || undefined,
      });
      const fresh = await loadWhatsappConfig(tenantId);
      setConfig(fresh);
      setForm((prev) => ({ ...prev, access_token: '' }));
      setFeedback({ kind: 'success', text: 'Configuração salva com sucesso.' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Erro ao salvar configuração.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!tenantId || !config || !canEdit) return;
    setToggling(true);
    try {
      await setWhatsappConfigActive(tenantId, !config.is_active);
      const fresh = await loadWhatsappConfig(tenantId);
      setConfig(fresh);
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Erro ao alterar status.',
      });
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!tenantId || !config || !canEdit) return;
    if (!window.confirm('Remover a configuração WhatsApp deste tenant? Mensagens existentes não serão apagadas.')) return;
    setRemoving(true);
    try {
      await deleteWhatsappConfig(tenantId);
      setConfig(null);
      setForm(EMPTY_FORM);
      setFeedback({ kind: 'success', text: 'Configuração removida.' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Erro ao remover.',
      });
    } finally {
      setRemoving(false);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      /* noop */
    }
  };

  if (!tenantId || tenantId === 'owner') {
    return (
      <div className="p-6">
        <div className="max-w-2xl rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Selecione um tenant para configurar a integração WhatsApp.
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="p-6">
        <div className="max-w-2xl rounded-xl border border-gray-200 bg-white dark:bg-slate-900 p-4 text-sm text-gray-600 dark:text-slate-300">
          Apenas administradores podem configurar a integração WhatsApp.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <MessageCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                WhatsApp Cloud API (Meta)
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Credenciais do número WhatsApp Business deste tenant.
              </p>
            </div>
            {config && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                  config.is_active
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                {config.is_active ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Conectado
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" />
                    Inativo
                  </>
                )}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando configuração...
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field
                label="Phone Number ID"
                hint="ID do número WhatsApp no Meta Business (ex.: 1234567890123456)."
                value={form.phone_number_id}
                onChange={(v) => setForm({ ...form, phone_number_id: v })}
              />

              <Field
                label="Número exibido (display)"
                hint="Opcional, somente para exibição no header do chat. Ex.: +55 11 98888-0000."
                value={form.display_phone_number}
                onChange={(v) => setForm({ ...form, display_phone_number: v })}
              />

              <Field
                label="WhatsApp Business Account ID"
                hint="Opcional, ID da WABA no Business Manager."
                value={form.business_account_id}
                onChange={(v) => setForm({ ...form, business_account_id: v })}
              />

              <SecretField
                label="Access Token (permanente)"
                hint={
                  config
                    ? 'Deixe em branco para manter o token atual. Preencha apenas se for trocar.'
                    : 'Token permanente de System User do Meta Business com permissões whatsapp_business_messaging.'
                }
                placeholder={config ? '••••••••••••••••••••••••' : 'EAAG...'}
                value={form.access_token}
                show={showToken}
                onToggle={() => setShowToken((s) => !s)}
                onChange={(v) => setForm({ ...form, access_token: v })}
              />

              <SecretField
                label="Webhook Verify Token"
                hint="String gerada por você que a Meta usa na verificação do webhook. Cole o mesmo valor lá no Business Manager."
                value={form.webhook_verify_token}
                show={showVerify}
                onToggle={() => setShowVerify((s) => !s)}
                onChange={(v) => setForm({ ...form, webhook_verify_token: v })}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, webhook_verify_token: generateVerifyToken() })}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Gerar
                  </button>
                }
              />

              <SecretField
                label="App Secret"
                hint="Opcional. Usado para verificar a assinatura X-Hub-Signature-256 dos webhooks (recomendado)."
                value={form.app_secret}
                show={showSecret}
                onToggle={() => setShowSecret((s) => !s)}
                onChange={(v) => setForm({ ...form, app_secret: v })}
              />

              <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 p-3">
                <div className="text-xs font-medium text-gray-600 dark:text-slate-300">URL do Webhook (configure no Meta Business)</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 px-2 py-1 text-xs">
                    {webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy('webhook', webhookUrl)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    {copied === 'webhook' ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copiar
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                  Recebimento de mensagens pelo n8n: deixe esta URL desabilitada no Business Manager
                  e aponte o webhook diretamente para o n8n.
                </p>
              </div>

              {feedback && (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    feedback.kind === 'success'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {config ? 'Salvar alterações' : 'Conectar'}
                </button>

                {config && (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleActive}
                      disabled={toggling}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {config.is_active ? 'Desativar' : 'Ativar'}
                    </button>

                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={removing}
                      className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Remover
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}

function Field({ label, hint, value, onChange }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {hint && <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

interface SecretFieldProps extends FieldProps {
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  rightSlot?: React.ReactNode;
}

function SecretField({ label, hint, value, onChange, show, onToggle, placeholder, rightSlot }: SecretFieldProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-700 dark:text-slate-300">{label}</label>
        {rightSlot}
      </div>
      <div className="relative flex items-center">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2.5 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
