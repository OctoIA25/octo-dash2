/**
 * TemplatesManager — biblioteca de templates (Comunicação › Templates).
 * Lista com badge de status (rascunho/pendente/aprovado/rejeitado), form guiado
 * com valores de exemplo por variável, e ações Enviar/Atualizar status/Excluir.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, submitTemplate, refreshStatus, importFromMeta,
  type Template, type TemplateStatus,
} from '../services/templatesService';
import { extractVariables } from '../templateVars';

const STATUS_META: Record<TemplateStatus, { label: string; cls: string }> = {
  draft: { label: 'Rascunho', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  pending: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  approved: { label: 'Aprovado', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  rejected: { label: 'Rejeitado', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' },
  error: { label: 'Erro', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300' },
};

function StatusBadge({ status }: { status: TemplateStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}

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
    if (importing) return;
    setImporting(true);
    try {
      const r = await importFromMeta(tenantId as string);
      if (r.ok) {
        toast.success(`${r.imported} importados, ${r.updated} atualizados`);
        reload();
      } else if (r.error === 'whatsapp_not_configured') {
        toast.error('WhatsApp não configurado para este tenant.');
      } else {
        toast.error('Não foi possível importar da Meta.');
      }
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

  if (!tenantReady) return <div className="px-6 py-10 text-center text-[13px] text-slate-400">Selecione uma imobiliária para gerenciar templates.</div>;

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Templates</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleImport} disabled={importing} className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[12.5px] font-semibold disabled:opacity-60">{importing ? 'Importando…' : 'Importar da Meta'}</button>
            <button type="button" onClick={openNew} className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold">Novo template</button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">Não foi possível carregar os templates.</div>}

        {loading && templates.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>
        ) : templates.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Nenhum template ainda.</div>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => {
              const editable = t.approval_status === 'draft' || t.approval_status === 'rejected' || t.approval_status === 'error';
              return (
                <li key={t.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate" title={t.name}>{t.name}</p>
                    <StatusBadge status={t.approval_status} />
                  </div>
                  <p className="text-[11.5px] text-slate-400 truncate mt-1" title={t.body}>{t.body}</p>
                  {t.approval_status === 'rejected' && t.rejected_reason && (
                    <p className="text-[11px] text-rose-500 mt-1">Motivo: {t.rejected_reason}</p>
                  )}
                  {t.approval_status === 'error' && (
                    <p className="text-[11px] text-orange-500 mt-1">Falha ao enviar à Meta{t.rejected_reason ? `: ${t.rejected_reason}` : ''}. Tente reenviar.</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[12px]">
                    {editable && <button type="button" onClick={() => openEdit(t)} className="text-slate-500 hover:text-slate-700">Editar</button>}
                    {editable && <button type="button" onClick={() => onSubmit(t)} className="text-indigo-600 hover:text-indigo-700 font-semibold">Enviar para aprovação</button>}
                    {t.approval_status === 'pending' && <button type="button" onClick={() => onRefresh(t)} className="text-amber-600 hover:text-amber-700">Verificar aprovação</button>}
                    <button type="button" onClick={() => remove(t)} aria-label={`Excluir ${t.name}`} className="text-rose-500 hover:text-rose-600 ml-auto">Excluir</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {formOpen && (
          <div className="mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{editId ? 'Editar template' : 'Novo template'}</h3>
            <label className="block text-[12px] text-slate-600 dark:text-slate-300">Nome
              <input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
            </label>
            <label className="block text-[12px] text-slate-600 dark:text-slate-300">Categoria
              <select aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value as 'MARKETING' | 'UTILITY')} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]">
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidade</option>
              </select>
            </label>
            <label className="block text-[12px] text-slate-600 dark:text-slate-300">Mensagem (use {'{{variavel}}'} para variáveis dinâmicas)
              <textarea aria-label="Mensagem" value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="mt-1 w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
            </label>
            {vars.map((v) => (
              <label key={v} className="block text-[12px] text-slate-600 dark:text-slate-300">Exemplo para {`{{${v}}}`}
                <input aria-label={`Exemplo ${v}`} value={examples[v] || ''} onChange={(e) => setExamples((p) => ({ ...p, [v]: e.target.value }))} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
              </label>
            ))}
            <div className="flex items-center gap-2">
              <button type="button" onClick={save} disabled={saving} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[12.5px] font-semibold disabled:opacity-60">{saving ? 'Salvando…' : 'Salvar'}</button>
              <button type="button" onClick={() => setFormOpen(false)} className="h-8 px-3 rounded-lg text-[12.5px] text-slate-500">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplatesManager;
