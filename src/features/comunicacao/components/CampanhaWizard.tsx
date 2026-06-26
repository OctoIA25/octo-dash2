/**
 * CampanhaWizard — wizard de 5 etapas para criar (ou editar) uma campanha e
 * dispará-la imediatamente ou agendá-la (Comunicação › Campanhas › C1).
 *
 * Etapas: 1) Campanha (nome + template aprovado) · 2) Público · 3) Regras ·
 * 4) Configurações (variáveis + nota) · 5) Revisar e enviar (preview WhatsApp
 * + resumo + "Agora ou Agendar para data futura": disparo imediato via
 * dispatchCampaign, ou agendamento via createCampaign/updateCampaign com scheduledAt).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { listTemplates, type Template } from '../services/templatesService';
import { listAudiences, getAudienceCount, type Audience } from '../services/audiencesService';
import {
  createCampaign, updateCampaign, dispatchCampaign, type Campaign, type CampaignInput,
} from '../services/campaignsService';

import { isMappingComplete, renderWithExample, type VarMapping } from '../variableMapping';
import { localTimeToUtc, utcTimeToLocal, localDayTimeToUtc, utcDayTimeToLocal } from '../recurrence';
import { VariableMapper } from './VariableMapper';
import { WhatsAppPreview } from './WhatsAppPreview';

interface CampanhaWizardProps {
  tenantId: string;
  editing?: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}

const HOURS = Array.from({ length: 25 }, (_, h) => h); // 0..24 (24 = fim do dia)
const DEFAULT_CAP = 500;
// Dias da semana para a recorrência semanal (value = getUTCDay/getDay: 0=domingo..6=sábado).
const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Mapeia erros do backend para mensagens em pt-BR. */
function errorMessage(error: string | undefined): string {
  switch (error) {
    case 'template_not_approved': return 'O template não está mais aprovado';
    case 'whatsapp_not_configured': return 'WhatsApp não configurado para este tenant';
    case 'campaign_name_taken': return 'Já existe campanha com esse nome';
    default: return 'Não foi possível salvar a campanha';
  }
}

const inputCls = 'mt-1 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600';
const labelCls = 'block text-[12px] font-medium text-slate-600 dark:text-slate-300';
const hintCls = 'text-[11px] text-slate-400';

/** Rótulos curtos dos 5 passos, exibidos na trilha do stepper. */
const STEP_LABELS = ['Campanha', 'Público', 'Regras', 'Configurações', 'Revisar'];

/** Linha de ajuda contextual por etapa (apenas apresentação). */
const STEP_HELP: Record<number, string> = {
  1: 'Dê um nome e escolha um template aprovado da Meta.',
  2: 'Quem vai receber esta campanha.',
  3: 'Limites de envio.',
  4: 'Preencha as variáveis do template.',
  5: 'Confira tudo antes de enviar.',
};

/** Converte um ISO UTC para o valor de um <input type="datetime-local">
 * (YYYY-MM-DDTHH:mm) no fuso LOCAL — para pré-preencher o agendamento ao editar. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampanhaWizard({ tenantId, editing, onClose, onSaved }: CampanhaWizardProps) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);

  const [name, setName] = useState(editing?.name ?? '');
  const [templateId, setTemplateId] = useState(editing?.template_id ?? '');
  const [audienceId, setAudienceId] = useState(editing?.audience_id ?? '');
  const [maxRecipients, setMaxRecipients] = useState(editing?.max_recipients != null ? String(editing.max_recipients) : '');
  const [windowStart, setWindowStart] = useState(editing?.send_window?.start != null ? String(editing.send_window.start) : '');
  const [windowEnd, setWindowEnd] = useState(editing?.send_window?.end != null ? String(editing.send_window.end) : '');
  const [avoidResend, setAvoidResend] = useState(editing?.avoid_resend ?? false);
  const [throttle, setThrottle] = useState(editing?.throttle_per_min != null ? String(editing.throttle_per_min) : '');
  const [variableMapping, setVariableMapping] = useState<VarMapping>(editing?.variable_mapping ?? {});
  const [internalNote, setInternalNote] = useState(editing?.internal_note ?? '');
  const [notifyOnComplete, setNotifyOnComplete] = useState(editing?.notify_on_complete ?? false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Fix 2: guarda o id da campanha já criada para evitar recriação no retry
  const [savedId, setSavedId] = useState<string | null>(editing?.id ?? null);
  // Etapa 5: enviar agora (atual), agendar pontual, ou repetir (recorrência).
  // editing.recurrence tem precedência sobre schedule_status para o pré-preenchimento do modo.
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled' | 'recurring'>(
    editing?.recurrence ? 'recurring' : editing?.schedule_status === 'scheduled' ? 'scheduled' : 'now',
  );
  const [scheduledAtLocal, setScheduledAtLocal] = useState<string>(editing?.scheduled_at ? toLocalInput(editing.scheduled_at) : '');
  // Recorrência: frequência, dia (semanal) e horário em LOCAL (BR) — convertido p/ UTC ao salvar.
  // Pré-população (editando): a recorrência persiste em UTC. Para weekly, dia+hora
  // são convertidos juntos (utcDayTimeToLocal), pois o dia pode mudar ao cruzar a
  // meia-noite. Para daily, só o horário é convertido (não há dia).
  const editingRec = editing?.recurrence ?? null;
  const editingRecLocal = editingRec
    ? editingRec.frequency === 'weekly'
      ? utcDayTimeToLocal(editingRec.day_of_week ?? 0, editingRec.time)
      : { day_of_week: 1, time: utcTimeToLocal(editingRec.time) }
    : null;
  const [recFrequency, setRecFrequency] = useState<'daily' | 'weekly'>(editingRec?.frequency ?? 'daily');
  const [recDayOfWeek, setRecDayOfWeek] = useState<number>(editingRecLocal?.day_of_week ?? 1);
  const [recTimeLocal, setRecTimeLocal] = useState<string>(editingRecLocal?.time ?? '09:00');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [tplRes, audRes] = await Promise.all([listTemplates(tenantId), listAudiences(tenantId)]);
      if (!alive) return;
      if (tplRes.ok) setTemplates(tplRes.templates.filter((t) => t.approval_status === 'approved'));
      if (audRes.ok) setAudiences(audRes.audiences);
    })();
    return () => { alive = false; };
  }, [tenantId]);

  // Fix 1: busca contagem sempre que audienceId mudar — cobre mount em modo editing
  // e qualquer troca de público. A flag `alive` também resolve o race (Fix 3).
  useEffect(() => {
    if (!audienceId) { setAudienceCount(null); return; }
    let alive = true;
    setAudienceCount(null);
    getAudienceCount(tenantId, audienceId)
      .then((res) => { if (alive && res.ok) setAudienceCount(res.count); })
      .catch(() => {});
    return () => { alive = false; };
  }, [audienceId, tenantId]);

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);
  const selectedAudience = useMemo(() => audiences.find((a) => a.id === audienceId) ?? null, [audiences, audienceId]);
  const variables = useMemo(() => selectedTemplate?.variables || [], [selectedTemplate]);

  // Fix 1: onPickAudience agora só atualiza o estado — o effect acima cuida da contagem
  function onPickAudience(id: string) {
    setAudienceId(id);
  }

  function next() {
    if (step === 1) {
      if (!name.trim() || !templateId) { toast.error('Informe o nome e selecione um template aprovado.'); return; }
    }
    if (step === 2) {
      if (!audienceId) { toast.error('Selecione um público.'); return; }
    }
    if (step === 3) {
      if (maxRecipients && Number(maxRecipients) < 1) { toast.error('O limite deve ser de pelo menos 1.'); return; }
    }
    if (step === 4) {
      if (!isMappingComplete(variables, variableMapping)) { toast.error('Mapeie todas as variáveis do template.'); return; }
    }
    setStep((s) => Math.min(5, s + 1));
  }
  function back() { setStep((s) => Math.max(1, s - 1)); }

  /** Monta o payload a partir do state.
   * Fix 5: sendWindow, throttlePerMin e avoidResend NÃO são enviados —
   * são campos "em breve" desabilitados; o backend usa seus defaults. */
  function buildInput(): CampaignInput {
    return {
      name: name.trim(),
      templateId,
      audienceId,
      maxRecipients: maxRecipients ? Number(maxRecipients) : null,
      variableMapping,
      internalNote: internalNote.trim() ? internalNote.trim() : null,
      notifyOnComplete,
    };
  }

  async function saveDraft() {
    if (saving) return;
    setSaving(true);
    try {
      const input = buildInput();
      const res = editing
        ? await updateCampaign(tenantId, editing.id, input)
        : await createCampaign(tenantId, input);
      if (!res.ok || !res.campaign) { toast.error(errorMessage(res.error)); return; }
      toast.success('Rascunho salvo.');
      onSaved();
    } finally { setSaving(false); }
  }

  // Fix 2: reutiliza savedId no retry — nunca recria campanha já existente
  async function dispatch() {
    if (saving) return;
    if (!isMappingComplete(variables, variableMapping)) { toast.error('Mapeie todas as variáveis do template.'); return; }
    setSaving(true);
    try {
      let campaignId = savedId;
      if (!campaignId) {
        const res = editing
          ? await updateCampaign(tenantId, editing.id, buildInput())
          : await createCampaign(tenantId, buildInput());
        if (!res.ok || !res.campaign) { toast.error(errorMessage(res.error)); return; }
        campaignId = res.campaign.id;
        setSavedId(campaignId);
      } else if (editing) {
        // já existe (editing) — garante que as edições estão salvas antes de disparar
        const upd = await updateCampaign(tenantId, campaignId, buildInput());
        if (!upd.ok) { toast.error(errorMessage(upd.error)); return; }
      }
      const disp = await dispatchCampaign(tenantId, campaignId);
      if (!disp.ok) { toast.error(errorMessage(disp.error)); return; }
      toast.success('Campanha disparada.');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Agenda a campanha para uma data/hora futura — persiste scheduledAt e NÃO dispara.
   * Reutiliza savedId no retry para evitar criação duplicada (mesmo padrão do dispatch()). */
  async function schedule() {
    if (saving) return;
    if (!scheduledAtLocal || new Date(scheduledAtLocal).getTime() <= Date.now()) {
      toast.error('Escolha uma data futura.');
      return;
    }
    if (!isMappingComplete(variables, variableMapping)) { toast.error('Mapeie todas as variáveis do template.'); return; }
    setSaving(true);
    try {
      const scheduledAt = new Date(scheduledAtLocal).toISOString();
      const input = { ...buildInput(), scheduledAt };
      let campaignId = savedId;
      if (!campaignId && !editing) {
        const res = await createCampaign(tenantId, input);
        if (!res.ok || !res.campaign) { toast.error(errorMessage(res.error)); return; }
        campaignId = res.campaign.id;
        setSavedId(campaignId);
      } else {
        const id = campaignId ?? editing!.id;
        const res = await updateCampaign(tenantId, id, input);
        if (!res.ok || !res.campaign) { toast.error(errorMessage(res.error)); return; }
      }
      toast.success('Campanha agendada.');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Ativa a recorrência — persiste recurrence (em UTC) e NÃO dispara.
   * Mesmo padrão de retry/savedId do schedule(); o worker reagenda após cada disparo. */
  async function activateRecurrence() {
    if (saving) return;
    if (!recTimeLocal) { toast.error('Informe o horário.'); return; }
    if (recFrequency === 'weekly' && !Number.isInteger(recDayOfWeek)) { toast.error('Escolha o dia da semana.'); return; }
    if (!isMappingComplete(variables, variableMapping)) { toast.error('Mapeie todas as variáveis do template.'); return; }
    setSaving(true);
    try {
      // weekly: dia+hora são convertidos JUNTOS p/ UTC — se o horário cruzar a
      // meia-noite (ex.: dom 23:00 local → seg 02:00 UTC), o day_of_week também
      // avança, para o worker (que opera em UTC) disparar no dia certo.
      const recurrence = recFrequency === 'weekly'
        ? { frequency: recFrequency, ...localDayTimeToUtc(recDayOfWeek, recTimeLocal) }
        : { frequency: recFrequency, time: localTimeToUtc(recTimeLocal) };
      const input = { ...buildInput(), recurrence };
      let campaignId = savedId;
      if (!campaignId && !editing) {
        const res = await createCampaign(tenantId, input);
        if (!res.ok || !res.campaign) { toast.error(errorMessage(res.error)); return; }
        campaignId = res.campaign.id;
        setSavedId(campaignId);
      } else {
        const id = campaignId ?? editing!.id;
        const res = await updateCampaign(tenantId, id, input);
        if (!res.ok || !res.campaign) { toast.error(errorMessage(res.error)); return; }
      }
      toast.success('Campanha recorrente ativada.');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Confirma a etapa 5: dispara, agenda ou ativa recorrência conforme o modo escolhido. */
  function confirmStep5() {
    if (scheduleMode === 'recurring') { activateRecurrence(); return; }
    if (scheduleMode === 'scheduled') { schedule(); return; }
    dispatch();
  }

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-[760px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="text-[18px] font-bold tracking-tight text-slate-900 dark:text-slate-100">{editing ? 'Editar campanha' : 'Nova campanha'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancelar
          </button>
        </div>

        {/* Stepper — trilha dos 5 passos. Voltar clicando só em passos concluídos. */}
        <Stepper step={step} onGoBack={(n) => setStep(n)} />

        {/* Etapa 1 — Campanha */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Campanha</h3>
              <p className="mt-0.5 text-[12px] text-slate-400">{STEP_HELP[1]}</p>
            </div>
            <label className={labelCls}>Nome da campanha
              <input aria-label="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>Template
              <select aria-label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
                <option value="">{templates.length ? 'Selecione um template' : 'Nenhum template aprovado'}</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* Etapa 2 — Público */}
        {step === 2 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Público</h3>
              <p className="mt-0.5 text-[12px] text-slate-400">{STEP_HELP[2]}</p>
            </div>
            <label className={labelCls}>Público
              <select aria-label="Público" value={audienceId} onChange={(e) => onPickAudience(e.target.value)} className={inputCls}>
                <option value="">{audiences.length ? 'Selecione um público' : 'Nenhum público disponível'}</option>
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            {audienceId && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[18px] font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">{audienceCount != null ? audienceCount.toLocaleString('pt-BR') : '…'}</span>
                <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">leads</span>
              </div>
            )}
          </div>
        )}

        {/* Etapa 3 — Regras */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Regras</h3>
              <p className="mt-0.5 text-[12px] text-slate-400">{STEP_HELP[3]}</p>
            </div>
            <label className={labelCls}>Limite de destinatários
              <input aria-label="Limite de destinatários" type="number" min={1} value={maxRecipients} onChange={(e) => setMaxRecipients(e.target.value)} className={inputCls} placeholder={`Opcional (padrão até ${DEFAULT_CAP})`} />
            </label>

            {/* Campos "em breve" — agrupados e atenuados para não confundir com o ativo */}
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-3.5 opacity-70 space-y-3">
              <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Em breve</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Fix 5: janela de horário desabilitada (em breve) */}
                <label className={labelCls}>Hora de início
                  <select aria-label="Hora de início" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={inputCls} disabled>
                    <option value="">—</option>
                    {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>)}
                  </select>
                </label>
                <label className={labelCls}>Hora de fim
                  <select aria-label="Hora de fim" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={inputCls} disabled>
                    <option value="">—</option>
                    {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>)}
                  </select>
                </label>
              </div>
              <p className={hintCls}>Janela de envio: aplicado em breve.</p>
              {/* Fix 5: checkbox anti-reenvio desabilitado (em breve) */}
              <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={avoidResend} onChange={(e) => setAvoidResend(e.target.checked)} disabled />
                Evitar reenvio a quem já recebeu
              </label>
              {/* Fix 5: throttle desabilitado (em breve) */}
              <label className={labelCls}>Envios por minuto
                <input aria-label="Envios por minuto" type="number" min={1} value={throttle} onChange={(e) => setThrottle(e.target.value)} className={inputCls} disabled />
              </label>
            </div>
          </div>
        )}

        {/* Etapa 4 — Configurações */}
        {step === 4 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Configurações</h3>
              <p className="mt-0.5 text-[12px] text-slate-400">{STEP_HELP[4]}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Variáveis do template</p>
              <VariableMapper variables={variables} mapping={variableMapping} onChange={setVariableMapping} />
            </div>
            <label className={labelCls}>Nota interna
              <textarea aria-label="Nota interna" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600" />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={notifyOnComplete} onChange={(e) => setNotifyOnComplete(e.target.checked)} />
              Notificar ao concluir
            </label>
          </div>
        )}

        {/* Etapa 5 — Revisar e enviar */}
        {step === 5 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Revisar e enviar</h3>
              <p className="mt-0.5 text-[12px] text-slate-400">{STEP_HELP[5]}</p>
            </div>
            {selectedTemplate && <WhatsAppPreview body={renderWithExample(selectedTemplate.body, variables, variableMapping)} />}

            {/* Resumo — grade de mini-linhas legível */}
            <dl className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-[12px]">
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Público</dt>
                <dd className="text-slate-700 dark:text-slate-200 text-right font-medium">{selectedAudience?.name ?? '—'}{audienceCount != null ? ` (${audienceCount} leads)` : ''}</dd>
              </div>
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Template</dt>
                <dd className="text-slate-700 dark:text-slate-200 text-right font-medium">{selectedTemplate?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Limite</dt>
                <dd className="text-slate-700 dark:text-slate-200 text-right font-medium">{maxRecipients ? `${maxRecipients} destinatários` : `todos até ${DEFAULT_CAP}`}</dd>
              </div>
              {internalNote.trim() && (
                <div className="flex justify-between gap-3 px-3.5 py-2.5">
                  <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Nota</dt>
                  <dd className="text-slate-700 dark:text-slate-200 text-right font-medium">{internalNote.trim()}</dd>
                </div>
              )}
            </dl>

            {/* Quando enviar — agora (imediato), agendar pontual ou repetir (recorrência) */}
            <fieldset>
              <legend className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-2">Quando enviar</legend>
              <div className="space-y-2">
                {/* Agora */}
                <label className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors text-[12.5px] ${scheduleMode === 'now' ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/60' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                  <input type="radio" name="when" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} className="accent-slate-900 dark:accent-slate-100" />
                  <span className="font-medium text-slate-700 dark:text-slate-200">Agora</span>
                </label>
                {/* Agendar para */}
                <label className={`flex flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors text-[12.5px] ${scheduleMode === 'scheduled' ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/60' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                  <input type="radio" name="when" checked={scheduleMode === 'scheduled'} onChange={() => setScheduleMode('scheduled')} className="accent-slate-900 dark:accent-slate-100" />
                  <span className="font-medium text-slate-700 dark:text-slate-200">Agendar para</span>
                  <input
                    aria-label="Data e hora do agendamento"
                    type="datetime-local"
                    disabled={scheduleMode !== 'scheduled'}
                    value={scheduledAtLocal}
                    onChange={(e) => setScheduledAtLocal(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 disabled:opacity-40"
                  />
                </label>
                {/* Repetir (recorrência) */}
                <label className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors text-[12.5px] ${scheduleMode === 'recurring' ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/60' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                  <input type="radio" name="when" checked={scheduleMode === 'recurring'} onChange={() => setScheduleMode('recurring')} className="accent-slate-900 dark:accent-slate-100" />
                  <span className="font-medium text-slate-700 dark:text-slate-200">Repetir</span>
                </label>
                {scheduleMode === 'recurring' && (
                  <div className="ml-1 flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Frequência"
                      value={recFrequency}
                      onChange={(e) => setRecFrequency(e.target.value as 'daily' | 'weekly')}
                      className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                    >
                      <option value="daily">Diariamente</option>
                      <option value="weekly">Semanalmente</option>
                    </select>
                    {recFrequency === 'weekly' && (
                      <select
                        aria-label="Dia da semana"
                        value={recDayOfWeek}
                        onChange={(e) => setRecDayOfWeek(Number(e.target.value))}
                        className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                      >
                        {DAYS_PT.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    )}
                    <input
                      aria-label="Horário"
                      type="time"
                      value={recTimeLocal}
                      onChange={(e) => setRecTimeLocal(e.target.value)}
                      className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                    />
                  </div>
                )}
              </div>
            </fieldset>

            {/* Fix 4: aviso de disparo imediato com contagem */}
            <p className="text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3.5 py-2.5">
              {scheduleMode === 'recurring' ? (
                <>A campanha será enviada <strong>de forma recorrente</strong>{audienceCount != null ? ` para até ${audienceCount} lead(s)` : ''} a cada ocorrência, até você cancelar.</>
              ) : scheduleMode === 'scheduled' ? (
                <>A campanha será enviada <strong>no horário agendado</strong>{audienceCount != null ? ` para até ${audienceCount} lead(s)` : ''}.</>
              ) : (
                <>Ao disparar, a campanha será enviada <strong>imediatamente</strong>{audienceCount != null ? ` para até ${audienceCount} lead(s)` : ''}. Esta ação não pode ser desfeita.</>
              )}
            </p>
            <button type="button" onClick={confirmStep5} disabled={saving} className="w-full h-10 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500">
              {scheduleMode === 'recurring'
                ? (saving ? 'Ativando…' : 'Ativar recorrência')
                : scheduleMode === 'scheduled'
                  ? (saving ? 'Agendando…' : 'Agendar')
                  : (saving ? 'Disparando…' : 'Disparar')}
            </button>
          </div>
        )}

        {/* Navegação */}
        <div className="flex items-center justify-between mt-4">
          <div>
            {step > 1 && (
              <button type="button" onClick={back} className="h-9 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600">Voltar</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Fix 6: "Salvar rascunho" oculto na etapa 5 */}
            {step < 5 && (
              <button type="button" onClick={saveDraft} disabled={saving} className="h-9 px-3.5 rounded-lg text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600">Salvar rascunho</button>
            )}
            {step < 5 && (
              <button type="button" onClick={next} className="h-9 px-4 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500">Avançar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stepper — trilha visual dos 5 passos (apenas apresentação).
 * Estados: concluído (n < step), atual (n === step), futuro (n > step).
 * Passos concluídos podem ser clicados para VOLTAR (n < step apenas); nunca
 * pulam adiante, para não furar as validações de cada etapa.
 */
function Stepper({ step, onGoBack }: { step: number; onGoBack: (n: number) => void }) {
  return (
    <nav aria-label="Progresso da campanha" className="mb-5">
      <ol className="flex items-center">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          const isLast = i === STEP_LABELS.length - 1;
          const circleCls = done
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100'
            : current
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-900 dark:border-slate-100 ring-2 ring-slate-200 dark:ring-slate-700'
              : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-300 dark:border-slate-700';
          return (
            <li key={label} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
              <div className="flex flex-col items-center gap-1.5">
                {done ? (
                  <button
                    type="button"
                    onClick={() => onGoBack(n)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11.5px] font-bold tabular-nums transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 ${circleCls}`}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : (
                  <span
                    aria-current={current ? 'step' : undefined}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11.5px] font-bold tabular-nums ${circleCls}`}
                  >
                    {n}
                  </span>
                )}
                <span
                  className={`text-[10.5px] tracking-wide ${current ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-400'} ${current ? '' : 'hidden sm:block'}`}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <span className={`mx-1.5 sm:mx-2 h-px flex-1 -mt-5 ${done ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-200 dark:bg-slate-800'}`} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default CampanhaWizard;
