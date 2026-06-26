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
 *
 * Apresentação premium (coerente com Públicos/Campanhas): a área é um chat —
 * mensagens roláveis do assistente em bolhas slate e um compositor fixo no
 * rodapé. A prévia e o relatório são "cards de ação" dentro da bolha do
 * assistente. Apenas o visual mudou; estados, handlers e serviços são os mesmos.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Rocket, Send, Sparkles } from 'lucide-react';
import { listAudiences, type Audience } from '../services/audiencesService';
import { listTemplates, type Template } from '../services/templatesService';
import {
  previewDisparo,
  confirmDisparo,
  getRunReport,
  type DisparoPreview,
  type RunReport,
} from '../services/disparadorService';
import { isMappingComplete, type VarMapping } from '../variableMapping';
import { VariableMapper } from './VariableMapper';

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

/** Sugestões de prompt que preenchem o compositor ao clicar (empty-state). */
const PROMPT_SUGGESTIONS = [
  'Reativar clientes arquivados há mais de 30 dias',
  'Avisar os clientes sem contato há 15 dias',
  'Mande uma mensagem para os clientes da corretora Maria',
];

export const DisparadorChat = () => {
  const { tenantId } = useAuthContext();

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audienceId, setAudienceId] = useState<string>('');
  const [command, setCommand] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [selectedTemplateVars, setSelectedTemplateVars] = useState<string[]>([]);
  const [variableMapping, setVariableMapping] = useState<VarMapping>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<DisparoPreview | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [needsMessage, setNeedsMessage] = useState(false);
  const [report, setReport] = useState<RunReport['run'] | null>(null);

  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

  // Rola para a última mensagem quando a conversa avança (prévia / relatório).
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // `scrollIntoView` não existe em alguns ambientes (jsdom); guarda defensiva.
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [phase, preview, report]);

  useEffect(() => {
    if (!tenantReady) return;
    listAudiences(tenantId as string).then((r) => { if (r.ok) setAudiences(r.audiences); }).catch(() => {});
  }, [tenantId, tenantReady]);

  useEffect(() => {
    if (!tenantReady) return;
    listTemplates(tenantId as string).then((r) => { if (r.ok) setTemplates(r.templates.filter((t) => t.approval_status === 'approved')); }).catch(() => {});
  }, [tenantId, tenantReady]);

  const handleTemplateSelect = (id: string) => {
    const t = templates.find((x) => x.id === id);
    // Troca de template invalida o mapa anterior — sempre reseta.
    setVariableMapping({});
    if (t) { setMessage(t.body); setSelectedTemplateName(t.name); setSelectedTemplateVars(t.variables || []); }
    else { setSelectedTemplateName(''); setSelectedTemplateVars([]); }
  };

  const reset = () => {
    setPreview(null);
    setPreviewToken(null);
    setMessage('');
    setNeedsMessage(false);
    setReport(null);
    setSelectedTemplateName('');
    setSelectedTemplateVars([]);
    setVariableMapping({});
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
    if (selectedTemplateVars.length > 0 && !isMappingComplete(selectedTemplateVars, variableMapping)) {
      return toast.error('Mapeie todas as variáveis do template.');
    }
    setPhase('sending');
    try {
      const res = await confirmDisparo(
        tenantId as string,
        previewToken,
        message.trim(),
        selectedTemplateName || undefined,
        selectedTemplateVars.length > 0 ? variableMapping : undefined,
      );
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

  const composerDisabled = phase === 'previewing' || phase === 'sending';
  const canPreview = (Boolean(audienceId) || Boolean(command.trim())) && !composerDisabled;

  // Enviar no Enter (Shift+Enter quebra linha), como num chat.
  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canPreview) handlePreview();
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950/40">
      {/* Cabeçalho discreto da conversa */}
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="max-w-2xl w-full mx-auto">
          <h2 className="text-[18px] font-bold tracking-tight text-slate-900 dark:text-slate-100">Disparador</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
            Descreva em linguagem natural quem você quer atingir e o que enviar.
          </p>
        </div>
      </header>

      {/* Trilha de mensagens (rolável) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl w-full mx-auto space-y-4">
          {/* Bolha de boas-vindas / empty-state premium */}
          {phase === 'idle' && !report && (
            <EmptyState onPick={(s) => setCommand(s)} />
          )}

          {/* Eco do comando do usuário, como bolha de usuário */}
          {phase !== 'idle' && command.trim() && !audienceId && (
            <UserBubble text={command.trim()} />
          )}

          {/* Assistente "interpretando" */}
          {phase === 'previewing' && (
            <AssistantBubble>
              <TypingIndicator label="Interpretando o pedido" />
            </AssistantBubble>
          )}

          {/* Prévia + confirmação (card de ação dentro da bolha do assistente) */}
          {preview && (phase === 'awaiting_confirm' || phase === 'sending') && (
            <AssistantBubble>
              <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100">Prévia da operação</h3>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                Revise os números e a mensagem antes de confirmar. Nada foi enviado ainda.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Encontrados" value={preview.foundCount} tone="slate" />
                <Stat label="Elegíveis" value={preview.eligibleCount} tone="emerald" />
                <Stat label="Sem WhatsApp" value={preview.noWhatsappCount} tone="slate" />
                <Stat label="Excluídos" value={preview.excludedCount} tone={preview.excludedCount > 0 ? 'amber' : 'slate'} />
              </div>

              {preview.sampleNames.length > 0 && (
                <p className="mt-3 text-[11.5px] text-slate-400 dark:text-slate-500">
                  Ex.: {preview.sampleNames.join(', ')}
                  {preview.eligibleCount > preview.sampleNames.length ? '…' : ''}
                </p>
              )}

              {templates.length > 0 && (
                <div className="mt-4">
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300" htmlFor="tpl-select">
                    Usar um template aprovado
                  </label>
                  <select
                    id="tpl-select"
                    aria-label="Template aprovado"
                    defaultValue=""
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="mt-1 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                  >
                    <option value="">— escolher um template —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {selectedTemplateVars.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Variáveis do template</p>
                      <div className="mt-1.5">
                        <VariableMapper variables={selectedTemplateVars} mapping={variableMapping} onChange={setVariableMapping} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4">
                <label
                  className={`block text-[12px] font-medium ${needsMessage ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}
                  htmlFor="msg-textarea"
                >
                  Mensagem {needsMessage && '(obrigatória)'}
                </label>
                <textarea
                  id="msg-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Texto que será enviado (vira o parâmetro do template aprovado)."
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                />
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  Disparos para clientes fora da janela de 24h usam um template aprovado pela Meta; a mensagem preenche o
                  corpo do template.
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={phase === 'sending' || preview.eligibleCount === 0}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:hover:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                >
                  {phase === 'sending' ? 'Enviando…' : `Confirmar e enviar (${preview.eligibleCount})`}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={phase === 'sending'}
                  className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[12.5px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </AssistantBubble>
          )}

          {/* Relatório final (card de ação dentro da bolha do assistente) */}
          {phase === 'done' && report && (
            <AssistantBubble>
              <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100">Relatório do disparo</h3>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                Status: <span className="font-medium text-slate-700 dark:text-slate-200">{report.status}</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Enviados" value={report.sent_count} tone="emerald" />
                <Stat label="Falhas" value={report.failed_count} tone={report.failed_count > 0 ? 'rose' : 'slate'} />
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
              >
                <Rocket className="h-4 w-4" aria-hidden />
                Novo disparo
              </button>
            </AssistantBubble>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Compositor fixo no rodapé */}
      <footer className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="max-w-2xl w-full mx-auto">
          {/* Seletor de público salvo (atalho opcional ao comando livre) */}
          {audiences.length > 0 && (
            <div className="mb-2.5">
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300" htmlFor="audience-select">
                Disparar para um público salvo
              </label>
              <select
                id="audience-select"
                aria-label="Público salvo"
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
                className="mt-1 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
              >
                <option value="">— escolher (ou digite o comando abaixo) —</option>
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 focus-within:ring-2 focus-within:ring-slate-300 dark:focus-within:ring-slate-600 transition-shadow">
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={composerDisabled}
              rows={1}
              placeholder='Ex.: "Mande uma mensagem para os clientes da corretora Maria"'
              className="flex-1 max-h-32 resize-none bg-transparent px-1.5 py-1.5 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handlePreview}
              disabled={!canPreview}
              aria-label="Gerar prévia"
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:hover:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            >
              <Send className="h-4 w-4" aria-hidden />
              {phase === 'previewing' ? 'Interpretando…' : 'Gerar prévia'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

/** Bolha do assistente — superfície clara à esquerda, com ícone discreto. */
function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 max-w-[80%] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-[13px] text-slate-700 dark:text-slate-200">
        {children}
      </div>
    </div>
  );
}

/** Bolha do usuário — superfície slate escura à direita. */
function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] text-white dark:bg-slate-100 dark:text-slate-900 whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}

/** Indicador de "digitando" — três pontos com pulso suave. */
function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
      </span>
      <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{label}…</span>
    </div>
  );
}

/** Mini-stat: número grande tabular + label uppercase. Tons sutis por natureza do dado. */
function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const valueCls = {
    slate: 'text-slate-900 dark:text-slate-100',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
  }[tone];
  return (
    <div className="min-w-0">
      <p className={`text-[20px] font-bold tabular-nums leading-none ${valueCls}`}>{value.toLocaleString('pt-BR')}</p>
      <p className="mt-1 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

/** Empty-state premium do chat: chip de ícone + ajuda + chips de sugestões clicáveis. */
function EmptyState({ onPick }: { onPick: (suggestion: string) => void }) {
  return (
    <AssistantBubble>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Rocket className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Comece um disparo</p>
      </div>
      <p className="mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
        Descreva quem você quer atingir e o que enviar. Eu monto uma prévia com as contagens antes de qualquer envio —
        nada é disparado sem a sua confirmação.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROMPT_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="inline-flex items-center h-7 px-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
          >
            {s}
          </button>
        ))}
      </div>
    </AssistantBubble>
  );
}

export default DisparadorChat;
