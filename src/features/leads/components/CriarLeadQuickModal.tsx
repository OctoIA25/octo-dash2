/**
 * Modal de criar/editar lead — usado pelo botão "+ Adicionar" de cada coluna
 * (cria) e pelo clique em um card do Kanban (edita). Mantém o usuário no
 * Kanban, emite `leadsEventEmitter` para sincronizar Funil/Pipeline.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save, User as UserIcon, Phone, Mail, Home, Loader2, Thermometer } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';
import { useToast } from '@/hooks/use-toast';
import {
  LEAD_TYPE_INTERESSADO,
  LEAD_TYPE_PROPRIETARIO,
  type KanbanLead,
  type LeadType,
} from '../services/leadsService';

interface CriarLeadQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | undefined | null;
  /** Se preenchido, o modal entra em modo edição. */
  editingLead?: KanbanLead | null;
  /** Rótulo da etapa sugerida (só no criar). */
  stageHint?: string;
  /** 1 = Interessado (default), 2 = Proprietário. Controla qual lead_type gravar. */
  leadType?: LeadType;
}

interface LeadForm {
  name: string;
  phone: string;
  email: string;
  interest_reference: string;
  message: string;
  temperature: string;
}

const EMPTY_FORM: LeadForm = {
  name: '',
  phone: '',
  email: '',
  interest_reference: '',
  message: '',
  temperature: 'Frio',
};

const TEMPERATURES = ['Quente', 'Morno', 'Frio'];

const leadToForm = (lead: KanbanLead): LeadForm => ({
  name: lead.nomedolead ?? '',
  phone: lead.lead ?? lead.numerocorretor ?? '',
  email: lead.email ?? '',
  interest_reference: lead.codigo ?? '',
  message: lead.comments ?? '',
  temperature: lead.temperature ?? 'Frio',
});

export const CriarLeadQuickModal = ({
  isOpen,
  onClose,
  tenantId,
  editingLead,
  stageHint,
  leadType = LEAD_TYPE_INTERESSADO,
}: CriarLeadQuickModalProps) => {
  const isEditMode = Boolean(editingLead);
  const isProprietario = leadType === LEAD_TYPE_PROPRIETARIO;
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Hidrata o form sempre que o lead muda ou o modal abre.
  useEffect(() => {
    if (!isOpen) return;
    if (editingLead) {
      setForm(leadToForm(editingLead));
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
  }, [isOpen, editingLead]);

  if (!isOpen) return null;

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    if (!isEditMode && !form.phone.trim()) {
      setError('Telefone é obrigatório');
      return;
    }
    if (!tenantId) {
      setError('Tenant não identificado. Faça login novamente.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditMode && editingLead) {
        // UPDATE — respeita RLS via tenant_memberships / assigned_agent_id
        const updatePayload = {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          property_code: form.interest_reference.trim() || null,
          comments: form.message.trim() || null,
          temperature: form.temperature,
          updated_at: new Date().toISOString(),
        };

        const { error: updateError, data: updated } = await supabase
          .from('leads')
          .update(updatePayload)
          .eq('id', editingLead.id)
          .eq('tenant_id', tenantId)
          .select('id');

        // Se o lead está em kenlo_leads (não existe em public.leads), atualizar lá.
        if (!updateError && (!updated || updated.length === 0)) {
          const kenloPayload: Record<string, unknown> = {
            client_name: form.name.trim(),
            client_phone: form.phone.trim() || null,
            client_email: form.email.trim() || null,
            interest_reference: form.interest_reference.trim() || null,
            message: form.message.trim() || null,
            temperature:
              form.temperature === 'Quente' ? 'hot' : form.temperature === 'Morno' ? 'warm' : 'cold',
            updated_at: new Date().toISOString(),
          };
          const { error: kenloError } = await supabase
            .from('kenlo_leads')
            .update(kenloPayload)
            .eq('id', editingLead.id)
            .eq('tenant_id', tenantId);
          if (kenloError) throw new Error(kenloError.message);
        } else if (updateError) {
          throw new Error(updateError.message);
        }

        toast({ title: `✅ ${typeLabel} atualizado`, description: `${form.name.trim()} foi salvo.` });
      } else {
        // INSERT
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData?.user?.id ?? null;
        const authUserName =
          (authData?.user?.user_metadata?.name as string | undefined) ??
          authData?.user?.email?.split('@')[0] ??
          null;

        const payload: Record<string, unknown> = {
          tenant_id: tenantId,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          property_code: form.interest_reference.trim() || null,
          comments: form.message.trim() || null,
          temperature: form.temperature,
          source: 'Manual',
          status: isProprietario ? 'Novos Proprietários' : 'Novos Leads',
          lead_type: leadType,
        };
        if (authUserId) payload.assigned_agent_id = authUserId;
        if (authUserName) payload.assigned_agent_name = authUserName;

        const { error: insertError } = await supabase.from('leads').insert(payload);
        if (insertError) throw new Error(insertError.message || 'Erro ao criar lead');

        toast({ title: `✅ ${typeLabel} criado`, description: `${form.name.trim()} foi adicionado.` });
      }

      leadsEventEmitter.emit();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeLabel = isProprietario ? 'Proprietário' : 'Lead';
  const title = isEditMode ? `Editar ${typeLabel}` : `Criar ${typeLabel}`;
  const subtitle = isEditMode
    ? `Atualize as informações do ${typeLabel.toLowerCase()}`
    : stageHint
      ? `Entrará em ${stageHint}`
      : isProprietario
        ? 'Cadastre um novo proprietário manualmente'
        : 'Cadastre um novo lead manualmente';

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[460px] max-w-[92vw] border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header com banner colorido — estilo dashboard */}
          <div className="relative px-5 py-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                {isEditMode
                  ? <Save className="w-5 h-5 text-white" strokeWidth={2.2} />
                  : <Plus className="w-5 h-5 text-white" strokeWidth={2.2} />}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white leading-tight">{title}</h2>
                <p className="text-xs text-blue-100/90 mt-0.5">{subtitle}</p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 px-5 py-4 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40">
            {/* Seção: Informações do cliente */}
            <SectionTitle>Informações do cliente</SectionTitle>
            <div className="space-y-3 mb-5">
              <Field
                icon={<UserIcon className="w-4 h-4 text-slate-400" />}
                label="Nome *"
                type="text"
                placeholder="Nome do cliente"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  icon={<Phone className="w-4 h-4 text-slate-400" />}
                  label={isEditMode ? 'Telefone' : 'Telefone *'}
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                />
                <Field
                  icon={<Mail className="w-4 h-4 text-slate-400" />}
                  label="Email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                />
              </div>
            </div>

            {/* Seção: Interesse */}
            <SectionTitle>Interesse</SectionTitle>
            <div className="space-y-3 mb-5">
              <Field
                icon={<Home className="w-4 h-4 text-slate-400" />}
                label="Código do Imóvel"
                type="text"
                placeholder="Ex: AP0929"
                value={form.interest_reference}
                onChange={(v) => setForm((f) => ({ ...f, interest_reference: v.toUpperCase() }))}
                mono
              />

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Thermometer className="w-4 h-4 text-slate-400" />
                  Temperatura
                </label>
                <div className="flex gap-2">
                  {TEMPERATURES.map((t) => {
                    const active = form.temperature === t;
                    const color =
                      t === 'Quente' ? '#ef4444' : t === 'Morno' ? '#f59e0b' : '#3b82f6';
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, temperature: t }))}
                        className="flex-1 py-2 text-xs font-semibold rounded-lg border transition-all bg-white dark:bg-slate-900"
                        style={{
                          borderColor: active ? color : '#e2e8f0',
                          backgroundColor: active ? color + '15' : undefined,
                          color: active ? color : '#64748b',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Seção: Observação */}
            <SectionTitle>Observação</SectionTitle>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={3}
              placeholder="Informações adicionais sobre o lead"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
            />

            {error && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60 shadow-sm"
            >
              {isSubmitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isEditMode
                  ? <Save className="w-4 h-4" />
                  : <Plus className="w-4 h-4" />}
              {isSubmitting
                ? (isEditMode ? 'Salvando...' : 'Criando...')
                : (isEditMode ? 'Salvar' : `Criar ${typeLabel}`)}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
    {children}
  </p>
);

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}

const Field = ({ icon, label, type, placeholder, value, onChange, mono }: FieldProps) => (
  <div>
    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
      {icon}
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${mono ? 'font-mono' : ''}`}
    />
  </div>
);
