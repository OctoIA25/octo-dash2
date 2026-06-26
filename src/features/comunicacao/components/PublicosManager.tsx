/**
 * PublicosManager — gestão de Públicos (Comunicação › Públicos).
 * Lista os públicos (nome + filtro legível + contagem atual) e permite
 * criar/editar/excluir via formulário guiado por tipo de filtro (sem JSON).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive, Clock, BellOff, User, Heart, ListChecks, Users, Plus, Pencil, Trash2,
} from 'lucide-react';
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

/** Ícone + cores sutis por tipo de filtro (chip do card). Paleta restrita: slate + acentos. */
const TYPE_STYLE: Record<SegType, { Icon: typeof Archive; chip: string }> = {
  archived: { Icon: Archive, chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  archived_period: { Icon: Clock, chip: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' },
  no_contact: { Icon: BellOff, chip: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' },
  by_broker: { Icon: User, chip: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' },
  interest: { Icon: Heart, chip: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' },
  explicit_list: { Icon: ListChecks, chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' },
};

/** Micro-ajuda contextual por tipo, exibida no form. */
const TYPE_HINTS: Record<SegType, string> = {
  archived: 'Todos os leads atualmente arquivados.',
  archived_period: 'Leads arquivados há pelo menos N dias.',
  no_contact: 'Leads sem nenhum contato registrado há N dias.',
  by_broker: 'Leads atribuídos a um corretor específico.',
  interest: 'Leads com um interesse declarado.',
  explicit_list: 'Lista fixa de leads pelos nomes informados.',
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

const INPUT_CLASS = 'mt-1 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600';
const LABEL_CLASS = 'block text-[12px] font-medium text-slate-600 dark:text-slate-300';

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
    if ((type === 'archived_period' || type === 'no_contact') && (!fields.days || Number(fields.days) < 1)) {
      toast.error('Informe um número de dias (mínimo 1).');
      return;
    }
    if (type === 'by_broker' && !fields.broker.trim()) { toast.error('Informe o corretor.'); return; }
    if (type === 'interest' && !fields.interest.trim()) { toast.error('Informe o interesse.'); return; }
    if (type === 'explicit_list' && !fields.names.split(',').map((s) => s.trim()).filter(Boolean).length) { toast.error('Informe ao menos um nome.'); return; }
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
    if (res.error === 'audience_in_use') { toast.error('Não é possível excluir este público, pois ele está em uso.'); return; }
    if (!res.ok) { toast.error('Não foi possível excluir o público.'); return; }
    reload();
  }

  if (!tenantReady) {
    return (
      <div className="px-6 py-5 h-full overflow-y-auto">
        <div className="max-w-[1100px] mx-auto">
          <EmptyState
            title="Selecione uma imobiliária"
            help="Escolha uma imobiliária para gerenciar os públicos de comunicação."
          />
        </div>
      </div>
    );
  }

  // Resumo dinâmico: nº de públicos e soma das contagens conhecidas.
  const total = audiences.length;
  const knownCounts = audiences.filter((a) => counts[a.id] != null);
  const sumKnown = knownCounts.reduce((acc, a) => acc + counts[a.id], 0);
  const summary = knownCounts.length > 0
    ? `${total} público${total === 1 ? '' : 's'} · ${sumKnown.toLocaleString('pt-BR')} contato${sumKnown === 1 ? '' : 's'} no total`
    : `${total} público${total === 1 ? '' : 's'}`;

  const showSkeleton = loading && audiences.length === 0;
  const showEmpty = !loading && audiences.length === 0;

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto">
        {/* Header da seção */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">Públicos</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">{summary}</p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Novo público
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar os públicos.
          </div>
        )}

        {/* Form (painel destacado no topo) */}
        {formOpen && (
          <PublicoForm
            editId={editId}
            name={name} setName={setName}
            type={type} setType={setType}
            fields={fields} setFields={setFields}
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
            title="Nenhum público ainda"
            help="Crie um público para segmentar quem recebe suas campanhas."
            action={{ label: 'Criar primeiro público', onClick: openNew }}
          />
        )}

        {/* Grid de cards */}
        {!showSkeleton && audiences.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {audiences.map((a) => {
              const { Icon, chip } = TYPE_STYLE[a.segment.type];
              const count = counts[a.id];
              const description = describeSegment(a.segment);
              return (
                <div
                  key={a.id}
                  className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg ${chip}`}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 truncate" title={a.name}>{a.name}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        aria-label={`Editar ${a.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 focus:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(a)}
                        aria-label={`Excluir ${a.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-700 focus:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {/* Contagem em destaque — dado mais importante */}
                  <div className="mt-4 flex items-baseline gap-1.5">
                    {count != null ? (
                      <span className="text-[22px] font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">{count.toLocaleString('pt-BR')}</span>
                    ) : (
                      <span className="inline-block h-[18px] w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-hidden />
                    )}
                    <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">contatos</span>
                  </div>

                  <p className="mt-2 text-[11.5px] text-slate-400 dark:text-slate-500 truncate" title={description}>{description}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Card-fantasma exibido enquanto carrega. Mesmo formato dos cards reais. */
function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <span className="h-3.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-4 h-5 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

/** Empty-state premium reutilizável (sem-público e sem-tenant). */
function EmptyState({ title, help, withIcon, action }: {
  title: string;
  help: string;
  withIcon?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      {withIcon && (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <Users className="h-6 w-6" aria-hidden />
        </span>
      )}
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-slate-400 dark:text-slate-500">{help}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Formulário guiado de público (criar/editar). Apenas apresentação — lógica fica no pai. */
function PublicoForm({
  editId, name, setName, type, setType, fields, setFields, onSave, onCancel,
}: {
  editId: string | null;
  name: string;
  setName: (v: string) => void;
  type: SegType;
  setType: (v: SegType) => void;
  fields: { days: string; broker: string; interest: string; names: string };
  setFields: React.Dispatch<React.SetStateAction<{ days: string; broker: string; interest: string; names: string }>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Preview do que será criado (best-effort).
  const preview = describeSegment(buildSegment(type, fields));

  return (
    <div className="mb-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <h3 className="text-[14px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">{editId ? 'Editar público' : 'Novo público'}</h3>
      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">Defina o nome e o filtro que seleciona os contatos.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={LABEL_CLASS}>
          Nome
          <input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          Tipo de filtro
          <select aria-label="Tipo de filtro" value={type} onChange={(e) => setType(e.target.value as SegType)} className={INPUT_CLASS}>
            {(Object.keys(TYPE_LABELS) as SegType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
      </div>

      <p className="mt-2 text-[11.5px] text-slate-400 dark:text-slate-500">{TYPE_HINTS[type]}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(type === 'archived_period' || type === 'no_contact') && (
          <label className={LABEL_CLASS}>
            Dias
            <input aria-label="Dias" type="number" min={1} value={fields.days} onChange={(e) => setFields((f) => ({ ...f, days: e.target.value }))} className={INPUT_CLASS} />
          </label>
        )}
        {type === 'by_broker' && (
          <label className={LABEL_CLASS}>
            Corretor
            <input aria-label="Corretor" value={fields.broker} onChange={(e) => setFields((f) => ({ ...f, broker: e.target.value }))} className={INPUT_CLASS} />
          </label>
        )}
        {type === 'interest' && (
          <label className={LABEL_CLASS}>
            Interesse
            <input aria-label="Interesse" value={fields.interest} onChange={(e) => setFields((f) => ({ ...f, interest: e.target.value }))} className={INPUT_CLASS} />
          </label>
        )}
        {type === 'explicit_list' && (
          <label className={`${LABEL_CLASS} sm:col-span-2`}>
            Nomes (separados por vírgula)
            <textarea aria-label="Nomes" value={fields.names} onChange={(e) => setFields((f) => ({ ...f, names: e.target.value }))} className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600" rows={2} />
          </label>
        )}
      </div>

      {preview && (
        <p className="mt-4 text-[11.5px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Resultado:</span> {preview}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!name.trim()}
          className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:hover:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          Salvar
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

export default PublicosManager;
