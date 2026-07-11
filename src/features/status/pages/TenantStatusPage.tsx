/**
 * P2 — Página "Status do Tenant" (owner-only, diagnóstico operacional).
 *
 * Read-only. Um seletor de tenant + grid de cards. O backend monta os cards
 * (GET /api/v1/health/tenant/:id); aqui só pintamos. Sem polling agressivo:
 * React Query com refetch manual (botão) + staleTime curto.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchTenantStatus, type CardStatus, type FailureOrigin, type JobStatus } from '../services/tenantStatusService';

interface OwnerTenant { id: string; code: string; name: string }
const SELECTED_KEY = 'owner-status-selected-tenant';

// Cor do badge por status. slate como base; verde/âmbar/vermelho só como sinal.
const STATUS_STYLE: Record<CardStatus, { dot: string; label: string }> = {
  ok:       { dot: 'bg-emerald-500', label: 'OK' },
  degraded: { dot: 'bg-amber-500',   label: 'Degradado' },
  error:    { dot: 'bg-red-500',     label: 'Erro' },
  inactive: { dot: 'bg-slate-300',   label: 'Inativo' },
  unknown:  { dot: 'bg-slate-400',   label: 'Indisponível' },
};

const ORIGIN_LABEL: Record<Exclude<FailureOrigin, null>, string> = {
  internal: '🔴 Interno',
  external: '🔴 Fornecedor',
  config:   '🟡 Config do tenant',
};

function StatusBadge({ status }: { status: CardStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 text-right">{value ?? '—'}</span>
    </div>
  );
}

function StatusCard({
  title, status, origin, children,
}: {
  title: string; status: CardStatus; origin?: FailureOrigin; children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="pt-0">
        {children}
        {origin && (
          <div className="mt-2 text-xs text-slate-500">{ORIGIN_LABEL[origin]}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TenantStatusPage() {
  const [tenants, setTenants] = useState<OwnerTenant[]>([]);
  const [tenantId, setTenantId] = useState<string>(() => localStorage.getItem(SELECTED_KEY) || '');

  useEffect(() => {
    // Não listar tenants soft-deletados (mesmo filtro do OwnerDashboard). Se a
    // coluna deleted_at não existir (migration pendente), degrada sem o filtro.
    (async () => {
      const withFilter = await supabase
        .from('tenants').select('id, code, name').is('deleted_at', null).order('name');
      if (withFilter.error?.message?.includes('deleted_at does not exist')) {
        const fallback = await supabase.from('tenants').select('id, code, name').order('name');
        setTenants((fallback.data as OwnerTenant[]) || []);
        return;
      }
      setTenants((withFilter.data as OwnerTenant[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (tenantId) localStorage.setItem(SELECTED_KEY, tenantId);
  }, [tenantId]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['tenant-status', tenantId],
    queryFn: () => fetchTenantStatus(tenantId),
    enabled: !!tenantId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const jobs = useMemo<[string, JobStatus][]>(
    () => Object.entries(data?.platform.jobs || {})
      .filter(([k, v]) => k !== 'available' && typeof v === 'object') as [string, JobStatus][],
    [data],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Status do Tenant</h1>
          <p className="text-sm text-slate-500">Diagnóstico operacional — uso interno (owner).</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
          >
            <option value="">Selecione um tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            disabled={!tenantId || isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {!tenantId && <p className="text-sm text-slate-500">Escolha um tenant para ver o status.</p>}
      {error && <p className="text-sm text-red-600">Falha ao carregar: {(error as Error).message}</p>}

      {data?.exists === false && (
        <p className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Este tenant não existe (ou foi removido permanentemente).
        </p>
      )}
      {data?.deleted_at && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ⚠️ Tenant soft-deletado em {data.deleted_at.slice(0, 10)} — diagnóstico apenas.
        </p>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatusCard title="Contact2Sale" status={data.tenant.contact2sale.status} origin={data.tenant.contact2sale.failure_origin}>
            <Field label="Última sync" value={data.tenant.contact2sale.last_sync_at?.slice(0, 19).replace('T', ' ')} />
            <Field label="Último erro" value={data.tenant.contact2sale.last_error} />
          </StatusCard>

          <StatusCard title="Kenlo" status={data.tenant.kenlo.status} origin={data.tenant.kenlo.failure_origin}>
            <Field label="Última sync" value={data.tenant.kenlo.last_sync_at?.slice(0, 19).replace('T', ' ')} />
            <Field label="Último erro" value={data.tenant.kenlo.last_error} />
          </StatusCard>

          <StatusCard title="Outbox" status={data.tenant.outbox.status} origin={data.tenant.outbox.failure_origin}>
            <Field label="Fila pendente" value={data.tenant.outbox.queue_pending} />
            <Field label="Fila com falha" value={data.tenant.outbox.queue_failed} />
            <Field label="Último erro" value={data.tenant.outbox.last_error} />
          </StatusCard>

          <StatusCard title="Webhooks" status={data.tenant.webhooks.status} origin={data.tenant.webhooks.failure_origin}>
            <Field label="Falhas (24h)" value={data.tenant.webhooks.recent_failures} />
            <Field label="Último erro" value={data.tenant.webhooks.last_error} />
          </StatusCard>

          <StatusCard title="WhatsApp" status={data.tenant.whatsapp.status} origin={data.tenant.whatsapp.failure_origin}>
            <Field label="Ativo" value={data.tenant.whatsapp.active ? 'Sim' : 'Não'} />
            <Field label="Fila (queued)" value={data.tenant.whatsapp.queued} />
            <Field label="Falhas" value={data.tenant.whatsapp.failed} />
          </StatusCard>

          <StatusCard title="IA" status={data.tenant.ia.available ? 'ok' : 'unknown'}>
            <Field label="Provider" value={data.tenant.ia.provider ?? 'não configurado'} />
            <Field label="Modelo" value={data.tenant.ia.model} />
            <Field label="Telemetria" value="não instrumentada" />
          </StatusCard>

          {/* Plataforma (global — não é deste tenant) */}
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">
                Jobs da plataforma <span className="text-xs font-normal text-slate-400">(global)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 pt-0 sm:grid-cols-4">
              {jobs.map(([name, j]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${j.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-slate-700">{name}</span>
                  <span className="ml-auto text-slate-400">{j.age_s != null ? `${j.age_s}s` : '—'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
