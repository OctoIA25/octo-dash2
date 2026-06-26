/**
 * TemplatesManager — biblioteca de templates (Comunicação › Templates).
 * Visual premium espelha PublicosManager/CampanhasManager (cards slate, badges de
 * status, empty-state e skeleton). O card mostra o corpo da mensagem, as variáveis
 * e as ações disponíveis conforme o status de aprovação. A lógica é preservada
 * integralmente: auto-sync com a Meta, refresh dos pendentes, submit/refresh/import,
 * regra de edição (só draft/rejected/error) e validações do formulário.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Download, Pencil, Trash2, Send, RefreshCw, FileText,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, submitTemplate, refreshStatus, importFromMeta,
  type Template, type TemplateStatus,
} from '../services/templatesService';
import { extractVariables } from '../templateVars';
import { WhatsAppPreview } from './WhatsAppPreview';

const STATUS_META: Record<TemplateStatus, { label: string; cls: string }> = {
  draft: { label: 'Rascunho', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  pending: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  approved: { label: 'Aprovado', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  rejected: { label: 'Rejeitado', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' },
  error: { label: 'Erro', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300' },
};

const CATEGORY_LABEL: Record<'MARKETING' | 'UTILITY', string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
};

function StatusBadge({ status }: { status: TemplateStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return <span className={`shrink-0 inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}

const INPUT_CLASS = 'mt-1 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600';
const LABEL_CLASS = 'block text-[12px] font-medium text-slate-600 dark:text-slate-300';

export function TemplatesManager() {
  const { tenantId } = useAuthContext();
  const tenantReady = Boolean(tenantId && tenantId !== 'owner');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('MARKETING');
  const [body, setBody] = useState('');
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const vars = extractVariables(body);

  async function reload() {
    if (!tenantReady) return;
    setLoading(true); setError(false);
    try {
      const res = await listTemplates(tenantId as string);
      if (!res.ok) { setError(true); setTemplates([]); return; }
      setTemplates(res.templates);
      // refresh automático dos pendentes
      await Promise.allSettled(res.templates.filter((t) => t.approval_status === 'pending').map((t) =>
        refreshStatus(tenantId as string, t.id).then((r) => { if (r.ok && r.template) setTemplates((prev) => prev.map((x) => x.id === t.id ? r.template! : x)); })));
    } catch { setError(true); } finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, [tenantId, tenantReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tenantReady) return;
    let alive = true;
    importFromMeta(tenantId as string)
      .then((r) => { if (alive && r.ok) reload(); })
      .catch(() => {}); // auto-sync: falha silenciosa, lista local permanece
    return () => { alive = false; };
  }, [tenantId, tenantReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() { setEditId(null); setName(''); setCategory('MARKETING'); setBody(''); setExamples({}); setFormOpen(true); }
  function openEdit(t: Template) {
    setEditId(t.id); setName(t.name); setCategory(t.category); setBody(t.body);
    const ex: Record<string, string> = {};
    (t.variables || []).forEach((v, i) => { ex[v] = t.example_values[i] ?? ''; });
    setExamples(ex); setFormOpen(true);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) { toast.error('Informe um nome.'); return; }
    if (!body.trim()) { toast.error('Informe a mensagem.'); return; }
    const exampleValues = vars.map((v) => (examples[v] || '').trim());
    if (vars.length > 0 && exampleValues.some((e) => !e)) { toast.error('Preencha um exemplo para cada variável.'); return; }
    const payload = { name: name.trim(), body: body.trim(), category, exampleValues };
    setSaving(true);
    try {
      const res = editId ? await updateTemplate(tenantId as string, editId, payload) : await createTemplate(tenantId as string, payload);
      if (!res.ok) {
        toast.error(res.error === 'template_name_taken' ? 'Já existe um template com esse nome.' : res.error === 'template_locked' ? 'Template já enviado não pode ser editado.' : 'Não foi possível salvar.');
        return;
      }
      setFormOpen(false); reload();
    } finally { setSaving(false); }
  }

  async function handleImport() {
    if (importing || !tenantReady) return;
    setImporting(true);
    try {
      const r = await importFromMeta(tenantId as string);
      if (!r.ok) {
        toast.error(r.error === 'whatsapp_not_configured' ? 'WhatsApp não configurado para este tenant.' : 'Não foi possível importar da Meta.');
        return;
      }
      toast.success(`${r.imported} importados, ${r.updated} atualizados`);
      reload();
    } catch {
      toast.error('Não foi possível importar da Meta.');
    } finally {
      setImporting(false);
    }
  }

  async function onSubmit(t: Template) {
    const res = await submitTemplate(tenantId as string, t.id);
    if (!res.ok) { toast.error(res.error === 'whatsapp_not_configured' ? 'WhatsApp não configurado para este tenant.' : 'Falha ao enviar para a Meta.'); return; }
    toast.success('Enviado para aprovação da Meta.'); reload();
  }
  async function onRefresh(t: Template) {
    const res = await refreshStatus(tenantId as string, t.id);
    if (!res.ok) { toast.error('Não foi possível atualizar o status.'); return; }
    reload();
  }
  async function remove(t: Template) {
    if (!confirm(`Excluir o template "${t.name}"?`)) return;
    const res = await deleteTemplate(tenantId as string, t.id);
    if (!res.ok) { toast.error('Não foi possível excluir.'); return; }
    reload();
  }

  if (!tenantReady) {
    return (
      <div className="px-6 py-5 h-full overflow-y-auto">
        <div className="max-w-[1100px] mx-auto">
          <EmptyState
            title="Selecione uma imobiliária"
            help="Escolha uma imobiliária para gerenciar seus templates de mensagem."
          />
        </div>
      </div>
    );
  }

  // Resumo dinâmico: nº de templates e quantos estão aprovados.
  const total = templates.length;
  const approved = templates.filter((t) => t.approval_status === 'approved').length;
  const summary = total > 0
    ? `${total} template${total === 1 ? '' : 's'} · ${approved} aprovado${approved === 1 ? '' : 's'}`
    : 'Nenhum template cadastrado';

  const showSkeleton = loading && templates.length === 0;
  const showEmpty = !loading && templates.length === 0;

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto">
        {/* Header da seção */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">Templates</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">{summary}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[12.5px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <Download className={`h-4 w-4 ${importing ? 'animate-pulse' : ''}`} aria-hidden />
              {importing ? 'Importando…' : 'Importar da Meta'}
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Novo template
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar os templates.
          </div>
        )}

        {/* Form (painel destacado no topo) */}
        {formOpen && (
          <TemplateForm
            editId={editId}
            name={name} setName={setName}
            category={category} setCategory={setCategory}
            body={body} setBody={setBody}
            vars={vars}
            examples={examples} setExamples={setExamples}
            saving={saving}
            onSave={save} onCancel={() => setFormOpen(false)}
          />
        )}

        {/* Skeleton de carregamento */}
        {showSkeleton && (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* Empty-state */}
        {showEmpty && (
          <EmptyState
            withIcon
            title="Nenhum template ainda"
            help="Crie um template ou importe os aprovados da sua conta Meta."
            action={{ label: 'Novo template', onClick: openNew }}
            secondaryAction={{ label: 'Importar da Meta', onClick: handleImport }}
          />
        )}

        {/* Grid de cards */}
        {!showSkeleton && templates.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => {
              const editable = t.approval_status === 'draft' || t.approval_status === 'rejected' || t.approval_status === 'error';
              return (
                <div
                  key={t.id}
                  className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors p-4 flex flex-col"
                >
                  {/* Topo: nome + selo de status */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 truncate" title={t.name}>{t.name}</p>
                    <StatusBadge status={t.approval_status} />
                  </div>

                  {/* Corpo da mensagem como preview */}
                  <p className="mt-2 text-[11.5px] text-slate-400 dark:text-slate-500 line-clamp-2" title={t.body}>{t.body}</p>

                  {/* Motivo de rejeição / erro */}
                  {t.approval_status === 'rejected' && t.rejected_reason && (
                    <p className="mt-2 text-[11px] text-rose-500 dark:text-rose-400">Motivo: {t.rejected_reason}</p>
                  )}
                  {t.approval_status === 'error' && (
                    <p className="mt-2 text-[11px] text-orange-500 dark:text-orange-400">Falha ao enviar à Meta{t.rejected_reason ? `: ${t.rejected_reason}` : ''}. Tente reenviar.</p>
                  )}

                  {/* Chips: categoria + variáveis */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center h-5 px-2 rounded-md text-[10.5px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {CATEGORY_LABEL[t.category]}
                    </span>
                    {(t.variables || []).map((v) => (
                      <span key={v} className="inline-flex items-center h-5 px-2 rounded-md text-[10.5px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 tabular-nums">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>

                  {/* Ações (conforme status) */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1">
                    {editable && (
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Editar
                      </button>
                    )}
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onSubmit(t)}
                        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700"
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden />
                        Enviar para aprovação
                      </button>
                    )}
                    {t.approval_status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => onRefresh(t)}
                        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        Verificar aprovação
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(t)}
                      aria-label={`Excluir ${t.name}`}
                      className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-700 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Card-fantasma exibido enquanto a lista de templates carrega. */
function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="h-3.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <span className="h-6 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-3 space-y-1.5">
        <span className="block h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <span className="block h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <span className="h-5 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
        <span className="h-5 w-14 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

/** Empty-state premium reutilizável (sem-template e sem-tenant). */
function EmptyState({ title, help, withIcon, action, secondaryAction }: {
  title: string;
  help: string;
  withIcon?: boolean;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      {withIcon && (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <FileText className="h-6 w-6" aria-hidden />
        </span>
      )}
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-slate-400 dark:text-slate-500">{help}</p>
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[12.5px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <Download className="h-4 w-4" aria-hidden />
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Formulário guiado de template (criar/editar). Apenas apresentação — lógica fica no pai. */
function TemplateForm({
  editId, name, setName, category, setCategory, body, setBody, vars, examples, setExamples, saving, onSave, onCancel,
}: {
  editId: string | null;
  name: string;
  setName: (v: string) => void;
  category: 'MARKETING' | 'UTILITY';
  setCategory: (v: 'MARKETING' | 'UTILITY') => void;
  body: string;
  setBody: (v: string) => void;
  vars: string[];
  examples: Record<string, string>;
  setExamples: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <h3 className="text-[14px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">{editId ? 'Editar template' : 'Novo template'}</h3>
      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">Defina o conteúdo da mensagem e os valores de exemplo de cada variável.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <label className={LABEL_CLASS}>
            Nome
            <input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className={LABEL_CLASS}>
            Categoria
            <select aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value as 'MARKETING' | 'UTILITY')} className={INPUT_CLASS}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utilidade</option>
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Mensagem <span className="font-normal text-slate-400 dark:text-slate-500">(use {'{{variavel}}'} para campos dinâmicos)</span>
            <textarea aria-label="Mensagem" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600" />
          </label>
          {vars.length > 0 && (
            <div className="space-y-3">
              {vars.map((v) => (
                <label key={v} className={LABEL_CLASS}>
                  Exemplo para {`{{${v}}}`}
                  <input aria-label={`Exemplo ${v}`} value={examples[v] || ''} onChange={(e) => setExamples((p) => ({ ...p, [v]: e.target.value }))} className={INPUT_CLASS} />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Preview do WhatsApp (variáveis literais) */}
        <div className="hidden sm:block">
          <p className="mb-2 text-[11.5px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pré-visualização</p>
          <WhatsAppPreview body={body} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:hover:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[12.5px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default TemplatesManager;
