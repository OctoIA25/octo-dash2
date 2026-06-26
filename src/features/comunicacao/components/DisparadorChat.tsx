/**
 * Agente Disparador — UI conversacional.
 *
 * Fluxo (espelha o backend, com confirmação obrigatória):
 *   1. Usuário descreve o disparo em linguagem natural.
 *   2. preview() → card com contagens (encontrados / elegíveis / sem WhatsApp /
 *      excluídos) + resumo da mensagem. NADA é enviado ainda.
 *   3. Se faltar a mensagem, pede a mensagem.
 *   4. Usuário confirma explicitamente → confirm() dispara.
 *   5. Relatório final (enviados / falhas).
 *
 * Toda a lógica vive no servidor; aqui só orquestramos a conversa e exibimos a
 * prévia. A separação prévia/confirmação é a proteção contra disparo acidental.
 */

import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { listAudiences, type Audience } from '../services/audiencesService';
import {
  previewDisparo,
  confirmDisparo,
  getRunReport,
  type DisparoPreview,
  type RunReport,
} from '../services/disparadorService';

type Phase = 'idle' | 'previewing' | 'awaiting_confirm' | 'sending' | 'done';

const ERROR_LABELS: Record<string, string> = {
  unsupported_intent: 'Não entendi o pedido. Tente descrever para quem e o que enviar.',
  forbidden_no_broker_identity: 'Seu usuário de corretor não está vinculado a um nome — fale com o administrador.',
  not_a_member: 'Você não tem acesso a esta imobiliária.',
  n8n_error: 'O serviço de interpretação (n8n) está indisponível. Tente novamente em instantes.',
  invalid_plan: 'Não consegui entender o comando. Reformule de forma mais direta.',
  message_required: 'Informe a mensagem antes de confirmar.',
  already_confirmed: 'Este disparo já foi confirmado.',
};

const labelForError = (error?: string) =>
  (error && ERROR_LABELS[error]) || `Não foi possível concluir (${error || 'erro desconhecido'}).`;

export const DisparadorChat = () => {
  const { currentTheme } = useTheme();
  const isDark = currentTheme === 'preto' || currentTheme === 'cinza';
  const { tenantId } = useAuthContext();

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audienceId, setAudienceId] = useState<string>('');
  const [command, setCommand] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<DisparoPreview | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [needsMessage, setNeedsMessage] = useState(false);
  const [report, setReport] = useState<RunReport['run'] | null>(null);

  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

  useEffect(() => {
    if (!tenantReady) return;
    listAudiences(tenantId as string).then((r) => { if (r.ok) setAudiences(r.audiences); }).catch(() => {});
  }, [tenantId, tenantReady]);

  const reset = () => {
    setPreview(null);
    setPreviewToken(null);
    setMessage('');
    setNeedsMessage(false);
    setReport(null);
    setPhase('idle');
  };

  const handlePreview = async () => {
    if (!tenantReady) return toast.error('Selecione uma imobiliária primeiro.');
    if (!audienceId && !command.trim()) return;
    setPhase('previewing');
    try {
      const res = audienceId
        ? await previewDisparo(tenantId as string, undefined, audienceId)
        : await previewDisparo(tenantId as string, command.trim());
      if (!res.ok || !res.preview || !res.previewToken) {
        toast.error(res.clarification || labelForError(res.error));
        setPhase('idle');
        return;
      }
      setPreview(res.preview);
      setPreviewToken(res.previewToken);
      setNeedsMessage(Boolean(res.needsMessage));
      setMessage(res.preview.message || '');
      setPhase('awaiting_confirm');
    } catch {
      toast.error('Falha ao interpretar o comando.');
      setPhase('idle');
    }
  };

  const handleConfirm = async () => {
    if (!previewToken || !tenantReady) return;
    if (!message.trim()) {
      setNeedsMessage(true);
      return toast.error('Informe a mensagem antes de confirmar.');
    }
    setPhase('sending');
    try {
      const res = await confirmDisparo(tenantId as string, previewToken, message.trim());
      if (!res.ok || !res.runId) {
        toast.error(labelForError(res.error));
        setPhase('awaiting_confirm');
        return;
      }
      // Busca o relatório (o backend drena a fila logo após confirmar).
      const rep = await getRunReport(tenantId as string, res.runId);
      setReport(rep.run || null);
      setPhase('done');
      toast.success(`Disparo iniciado para ${res.enqueued} cliente(s).`);
    } catch {
      toast.error('Falha ao confirmar o disparo.');
      setPhase('awaiting_confirm');
    }
  };

  const card = `rounded-xl border p-4 ${isDark ? 'bg-neutral-800/50 border-neutral-700/50' : 'bg-white border-gray-200'}`;
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMain = isDark ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className={`border-b px-6 py-4 ${isDark ? 'border-neutral-800' : 'border-gray-200'}`}>
        <h1 className={`text-lg font-bold ${textMain}`}>📣 Agente Disparador</h1>
        <p className={`text-xs ${textMuted}`}>
          Descreva em linguagem natural para quem enviar — ex.: "envie uma mensagem para todos os clientes arquivados há
          mais de 30 dias".
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl w-full mx-auto">
        {/* Seletor de público salvo */}
        {audiences.length > 0 && (
          <div className={card}>
            <label className={`block text-xs font-semibold mb-2 ${textMuted}`}>Disparar para um público salvo</label>
            <select
              aria-label="Público salvo"
              value={audienceId}
              onChange={(e) => setAudienceId(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-neutral-900 border-neutral-700 text-gray-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
            >
              <option value="">— escolher (ou digite o comando abaixo) —</option>
              {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {/* Entrada do comando */}
        <div className={card}>
          <label className={`block text-xs font-semibold mb-2 ${textMuted}`}>Comando</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={phase === 'previewing' || phase === 'sending'}
            rows={2}
            placeholder='Ex.: "Mande uma mensagem para os clientes da corretora Maria"'
            className={`w-full rounded-lg border px-3 py-2 text-sm resize-none ${
              isDark ? 'bg-neutral-900 border-neutral-700 text-gray-100' : 'bg-gray-50 border-gray-300 text-gray-900'
            }`}
          />
          <button
            onClick={handlePreview}
            disabled={(!audienceId && !command.trim()) || phase === 'previewing' || phase === 'sending'}
            className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {phase === 'previewing' ? 'Interpretando…' : 'Gerar prévia'}
          </button>
        </div>

        {/* Prévia + confirmação */}
        {preview && (phase === 'awaiting_confirm' || phase === 'sending') && (
          <div className={card}>
            <h2 className={`text-sm font-bold mb-3 ${textMain}`}>Prévia da operação</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm mb-3">
              <Stat label="Clientes encontrados" value={preview.foundCount} muted={textMuted} main={textMain} />
              <Stat label="Elegíveis (com WhatsApp)" value={preview.eligibleCount} muted={textMuted} main={textMain} />
              <Stat label="Sem WhatsApp válido" value={preview.noWhatsappCount} muted={textMuted} main={textMain} />
              <Stat label="Excluídos (limite)" value={preview.excludedCount} muted={textMuted} main={textMain} />
            </dl>
            {preview.sampleNames.length > 0 && (
              <p className={`text-xs mb-3 ${textMuted}`}>
                Ex.: {preview.sampleNames.join(', ')}
                {preview.eligibleCount > preview.sampleNames.length ? '…' : ''}
              </p>
            )}

            <label className={`block text-xs font-semibold mb-1 ${needsMessage ? 'text-amber-500' : textMuted}`}>
              Mensagem {needsMessage && '(obrigatória)'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Texto que será enviado (vira o parâmetro do template aprovado)."
              className={`w-full rounded-lg border px-3 py-2 text-sm resize-none mb-1 ${
                isDark ? 'bg-neutral-900 border-neutral-700 text-gray-100' : 'bg-gray-50 border-gray-300 text-gray-900'
              }`}
            />
            <p className={`text-[11px] mb-3 ${textMuted}`}>
              ⚠️ Disparos para clientes fora da janela de 24h usam um template aprovado pela Meta; a mensagem preenche o
              corpo do template.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={phase === 'sending' || preview.eligibleCount === 0}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {phase === 'sending' ? 'Enviando…' : `Confirmar e enviar (${preview.eligibleCount})`}
              </button>
              <button
                onClick={reset}
                disabled={phase === 'sending'}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                  isDark ? 'border-neutral-700 text-gray-300' : 'border-gray-300 text-gray-700'
                }`}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Relatório final */}
        {phase === 'done' && report && (
          <div className={card}>
            <h2 className={`text-sm font-bold mb-3 ${textMain}`}>Relatório do disparo</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Enviados" value={report.sent_count} muted={textMuted} main={textMain} />
              <Stat label="Falhas" value={report.failed_count} muted={textMuted} main={textMain} />
            </dl>
            <p className={`text-xs mt-2 ${textMuted}`}>Status: {report.status}</p>
            <button
              onClick={reset}
              className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              Novo disparo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value, muted, main }: { label: string; value: number; muted: string; main: string }) => (
  <div>
    <dt className={`text-xs ${muted}`}>{label}</dt>
    <dd className={`text-lg font-bold ${main}`}>{value}</dd>
  </div>
);

export default DisparadorChat;
