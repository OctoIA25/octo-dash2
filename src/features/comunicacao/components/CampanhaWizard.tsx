/**
 * CampanhaWizard — wizard de 5 etapas para criar (ou editar) uma campanha e
 * dispará-la imediatamente (Comunicação › Campanhas › C1).
 *
 * Etapas: 1) Campanha (nome + template aprovado) · 2) Público · 3) Regras ·
 * 4) Configurações (variáveis read-only + nota) · 5) Revisar e enviar (preview
 * WhatsApp + resumo + Disparar). Não há agendamento neste escopo: o disparo é
 * sempre imediato (createCampaign → dispatchCampaign).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { listTemplates, type Template } from '../services/templatesService';
import { listAudiences, getAudienceCount, type Audience } from '../services/audiencesService';
import {
  createCampaign, updateCampaign, dispatchCampaign, type Campaign, type CampaignInput,
} from '../services/campaignsService';
import { extractVariables } from '../templateVars';
import { WhatsAppPreview } from './WhatsAppPreview';

interface CampanhaWizardProps {
  tenantId: string;
  editing?: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}

const HOURS = Array.from({ length: 25 }, (_, h) => h); // 0..24 (24 = fim do dia)
const DEFAULT_CAP = 500;

/** Mapeia erros do backend para mensagens em pt-BR. */
function errorMessage(error: string | undefined): string {
  switch (error) {
    case 'template_not_approved': return 'O template não está mais aprovado';
    case 'whatsapp_not_configured': return 'WhatsApp não configurado para este tenant';
    case 'campaign_name_taken': return 'Já existe campanha com esse nome';
    default: return 'Não foi possível salvar a campanha';
  }
}

const inputCls = 'mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]';
const labelCls = 'block text-[12px] text-slate-600 dark:text-slate-300';
const hintCls = 'text-[11px] text-slate-400';

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
  const [internalNote, setInternalNote] = useState(editing?.internal_note ?? '');
  const [notifyOnComplete, setNotifyOnComplete] = useState(editing?.notify_on_complete ?? false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Fix 2: guarda o id da campanha já criada para evitar recriação no retry
  const [savedId, setSavedId] = useState<string | null>(editing?.id ?? null);

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
  const variables = useMemo(() => (selectedTemplate ? extractVariables(selectedTemplate.body) : []), [selectedTemplate]);

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

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{editing ? 'Editar campanha' : 'Nova campanha'}</h2>
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-[12.5px] text-slate-500">Cancelar</button>
        </div>
        <p className="text-[11.5px] text-slate-400 mb-4">Etapa {step} de 5</p>

        {/* Etapa 1 — Campanha */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Campanha</h3>
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Público</h3>
            <label className={labelCls}>Público
              <select aria-label="Público" value={audienceId} onChange={(e) => onPickAudience(e.target.value)} className={inputCls}>
                <option value="">{audiences.length ? 'Selecione um público' : 'Nenhum público disponível'}</option>
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            {audienceId && (
              <p className="text-[12px] text-slate-500 tabular-nums">{audienceCount != null ? `${audienceCount} leads` : '…'}</p>
            )}
          </div>
        )}

        {/* Etapa 3 — Regras */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Regras</h3>
            <label className={labelCls}>Limite de destinatários
              <input aria-label="Limite de destinatários" type="number" min={1} value={maxRecipients} onChange={(e) => setMaxRecipients(e.target.value)} className={inputCls} placeholder={`Opcional (padrão até ${DEFAULT_CAP})`} />
            </label>
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
              Evitar reenvio a quem já recebeu <span className={hintCls}>(em breve)</span>
            </label>
            {/* Fix 5: throttle desabilitado (em breve) */}
            <label className={labelCls}>Envios por minuto
              <input aria-label="Envios por minuto" type="number" min={1} value={throttle} onChange={(e) => setThrottle(e.target.value)} className={inputCls} disabled />
              <span className={hintCls}>Em breve.</span>
            </label>
          </div>
        )}

        {/* Etapa 4 — Configurações */}
        {step === 4 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Configurações</h3>
            <div>
              <p className="text-[12px] text-slate-600 dark:text-slate-300 mb-1">Variáveis do template</p>
              {variables.length === 0 ? (
                <p className={hintCls}>Este template não usa variáveis.</p>
              ) : (
                <ul className="space-y-1">
                  {variables.map((v) => (
                    <li key={v} className="text-[12px] text-slate-500">{`{{${v}}} → mapeada do cadastro do lead (em breve)`}</li>
                  ))}
                </ul>
              )}
            </div>
            <label className={labelCls}>Nota interna
              <textarea aria-label="Nota interna" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} className="mt-1 w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={notifyOnComplete} onChange={(e) => setNotifyOnComplete(e.target.checked)} />
              Notificar ao concluir
            </label>
          </div>
        )}

        {/* Etapa 5 — Revisar e enviar */}
        {step === 5 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Revisar e enviar</h3>
            {selectedTemplate && <WhatsAppPreview body={selectedTemplate.body} />}
            <dl className="space-y-1 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Público</dt>
                <dd className="text-slate-700 dark:text-slate-200 text-right">{selectedAudience?.name ?? '—'}{audienceCount != null ? ` (${audienceCount} leads)` : ''}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Template</dt>
                <dd className="text-slate-700 dark:text-slate-200 text-right">{selectedTemplate?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Limite</dt>
                <dd className="text-slate-700 dark:text-slate-200 text-right">{maxRecipients ? `${maxRecipients} destinatários` : `todos até ${DEFAULT_CAP}`}</dd>
              </div>
              {internalNote.trim() && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Nota</dt>
                  <dd className="text-slate-700 dark:text-slate-200 text-right">{internalNote.trim()}</dd>
                </div>
              )}
            </dl>
            {/* Fix 4: aviso de disparo imediato com contagem */}
            <p className="text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3">
              Ao disparar, a campanha será enviada <strong>imediatamente</strong>
              {audienceCount != null ? ` para até ${audienceCount} lead(s)` : ''}. Esta ação não pode ser desfeita.
            </p>
            <button type="button" onClick={dispatch} disabled={saving} className="w-full h-9 rounded-lg bg-emerald-600 text-white text-[12.5px] font-semibold disabled:opacity-40">
              {saving ? 'Disparando…' : 'Disparar'}
            </button>
          </div>
        )}

        {/* Navegação */}
        <div className="flex items-center justify-between mt-4">
          <div>
            {step > 1 && (
              <button type="button" onClick={back} className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-[12.5px] text-slate-600 dark:text-slate-300">Voltar</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Fix 6: "Salvar rascunho" oculto na etapa 5 */}
            {step < 5 && (
              <button type="button" onClick={saveDraft} disabled={saving} className="h-8 px-3 rounded-lg text-[12.5px] text-slate-500 disabled:opacity-40">Salvar rascunho</button>
            )}
            {step < 5 && (
              <button type="button" onClick={next} className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold">Avançar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CampanhaWizard;
