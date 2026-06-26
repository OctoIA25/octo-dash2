/**
 * PublicosManager — gestão de Públicos (Comunicação › Públicos).
 * Lista os públicos (nome + filtro legível + contagem atual) e permite
 * criar/editar/excluir via formulário guiado por tipo de filtro (sem JSON).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  listAudiences, createAudience, updateAudience, deleteAudience, getAudienceCount, type Audience,
} from '../services/audiencesService';
import { describeSegment, type SegmentDsl } from '../describeSegment';

type SegType = SegmentDsl['type'];
const TYPE_LABELS: Record<SegType, string> = {
  archived: 'Arquivados',
  archived_period: 'Arquivados há N dias',
  no_contact: 'Sem contato há N dias',
  by_broker: 'Por corretor',
  interest: 'Por interesse',
  explicit_list: 'Lista de nomes',
};

/** Monta o SegmentDsl a partir dos campos do form. */
function buildSegment(type: SegType, fields: { days: string; broker: string; interest: string; names: string }): SegmentDsl {
  switch (type) {
    case 'archived': return { type: 'archived' };
    case 'archived_period': return { type: 'archived_period', days: Number(fields.days) || 0 };
    case 'no_contact': return { type: 'no_contact', days: Number(fields.days) || 0 };
    case 'by_broker': return { type: 'by_broker', broker: fields.broker.trim() };
    case 'interest': return { type: 'interest', interest: fields.interest.trim() };
    case 'explicit_list': return { type: 'explicit_list', names: fields.names.split(',').map((s) => s.trim()).filter(Boolean) };
  }
}

export function PublicosManager() {
  const { tenantId } = useAuthContext();
  const tenantReady = Boolean(tenantId && tenantId !== 'owner');
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<SegType>('archived');
  const [fields, setFields] = useState({ days: '', broker: '', interest: '', names: '' });

  async function reload() {
    if (!tenantReady) return;
    setLoading(true); setError(false);
    try {
      const res = await listAudiences(tenantId as string);
      if (!res.ok) { setError(true); setAudiences([]); return; }
      setAudiences(res.audiences);
      // Contagens em paralelo (uma por público); falhas individuais são ignoradas.
      await Promise.allSettled(res.audiences.map((a) =>
        getAudienceCount(tenantId as string, a.id).then((c) => { if (c.ok) setCounts((p) => ({ ...p, [a.id]: c.count })); }),
      ));
    } catch { setError(true); } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [tenantId, tenantReady]);

  function openNew() {
    setEditId(null); setName(''); setType('archived'); setFields({ days: '', broker: '', interest: '', names: '' }); setFormOpen(true);
  }

  function openEdit(a: Audience) {
    const seg = a.segment;
    setEditId(a.id);
    setName(a.name);
    setType(seg.type);
    setFields({
      days: 'days' in seg ? String(seg.days) : '',
      broker: 'broker' in seg ? seg.broker : '',
      interest: 'interest' in seg ? seg.interest : '',
      names: 'names' in seg ? seg.names.join(', ') : '',
    });
    setFormOpen(true);
  }

  async function save() {
    const segment = buildSegment(type, fields);
    const body = { name: name.trim(), segment };
    const res = editId
      ? await updateAudience(tenantId as string, editId, body)
      : await createAudience(tenantId as string, body);
    if (!res.ok) {
      toast.error(res.error === 'audience_name_taken' ? 'Já existe um público com esse nome.' : 'Não foi possível salvar o público.');
      return;
    }
    setFormOpen(false);
    reload();
  }

  async function remove(a: Audience) {
    if (!confirm(`Excluir o público "${a.name}"?`)) return;
    const res = await deleteAudience(tenantId as string, a.id);
    if (!res.ok) { toast.error('Não foi possível excluir o público.'); return; }
    reload();
  }

  if (!tenantReady) {
    return <div className="px-6 py-10 text-center text-[13px] text-slate-400">Selecione uma imobiliária para gerenciar públicos.</div>;
  }

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Públicos</h2>
          <button type="button" onClick={openNew} className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold">Novo público</button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">Não foi possível carregar os públicos.</div>}

        {loading && audiences.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>
        ) : audiences.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Nenhum público ainda.</div>
        ) : (
          <ul className="space-y-2">
            {audiences.map((a) => (
              <li key={a.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate" title={a.name}>{a.name}</p>
                  <p className="text-[11.5px] text-slate-400 truncate" title={describeSegment(a.segment)}>{describeSegment(a.segment)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[12px] text-slate-500 tabular-nums">{counts[a.id] != null ? `${counts[a.id]} contatos` : '—'}</span>
                  <button type="button" onClick={() => openEdit(a)} aria-label={`Editar ${a.name}`} className="text-[12px] text-slate-500 hover:text-slate-700">Editar</button>
                  <button type="button" onClick={() => remove(a)} aria-label={`Excluir ${a.name}`} className="text-[12px] text-rose-500 hover:text-rose-600">Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {formOpen && (
          <div className="mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{editId ? 'Editar público' : 'Novo público'}</h3>
            <label className="block text-[12px] text-slate-600 dark:text-slate-300">Nome
              <input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
            </label>
            <label className="block text-[12px] text-slate-600 dark:text-slate-300">Tipo de filtro
              <select aria-label="Tipo de filtro" value={type} onChange={(e) => setType(e.target.value as SegType)} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]">
                {(Object.keys(TYPE_LABELS) as SegType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            {(type === 'archived_period' || type === 'no_contact') && (
              <label className="block text-[12px] text-slate-600 dark:text-slate-300">Dias
                <input aria-label="Dias" type="number" value={fields.days} onChange={(e) => setFields((f) => ({ ...f, days: e.target.value }))} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
              </label>
            )}
            {type === 'by_broker' && (
              <label className="block text-[12px] text-slate-600 dark:text-slate-300">Corretor
                <input aria-label="Corretor" value={fields.broker} onChange={(e) => setFields((f) => ({ ...f, broker: e.target.value }))} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
              </label>
            )}
            {type === 'interest' && (
              <label className="block text-[12px] text-slate-600 dark:text-slate-300">Interesse
                <input aria-label="Interesse" value={fields.interest} onChange={(e) => setFields((f) => ({ ...f, interest: e.target.value }))} className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" />
              </label>
            )}
            {type === 'explicit_list' && (
              <label className="block text-[12px] text-slate-600 dark:text-slate-300">Nomes (separados por vírgula)
                <textarea aria-label="Nomes" value={fields.names} onChange={(e) => setFields((f) => ({ ...f, names: e.target.value }))} className="mt-1 w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]" rows={2} />
              </label>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={save} disabled={!name.trim()} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[12.5px] font-semibold disabled:opacity-40">Salvar</button>
              <button type="button" onClick={() => setFormOpen(false)} className="h-8 px-3 rounded-lg text-[12.5px] text-slate-500">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PublicosManager;
