/**
 * Painel de configurações do bolsão — replica as opções de
 * `Configurações > Bolsão` + `Configurações > Equipes` (toggles roleta/fila +
 * participantes) num único lugar dentro da própria página Bolsão.
 *
 * Lê e grava nas mesmas tabelas existentes (`tenant_bolsao_config`,
 * `roleta_participantes`) — não altera schema nem quebra os outros lugares.
 */

import { useEffect, useState } from 'react';
import { Clock, Inbox, Calendar, RefreshCw, Loader2, Check, Settings, Power, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  fetchTenantBolsaoConfig,
  saveTenantBolsaoConfig,
  DEFAULT_BOLSAO_CONFIG,
  type TenantBolsaoConfig,
} from '../services/tenantBolsaoConfigService';
import {
  fetchCorretoresDisponiveis,
  atualizarParticipantesRoleta,
  type CorretorDisponivel,
} from '../services/roletaService';

interface BolsaoConfigPanelProps {
  tenantId: string | null | undefined;
  isAdmin: boolean;
}

const DIAS = [
  { key: 'segunda', label: 'Seg' },
  { key: 'terca', label: 'Ter' },
  { key: 'quarta', label: 'Qua' },
  { key: 'quinta', label: 'Qui' },
  { key: 'sexta', label: 'Sex' },
  { key: 'sabado', label: 'Sáb' },
  { key: 'domingo', label: 'Dom' },
] as const;

type DiaKey = typeof DIAS[number]['key'];

export const BolsaoConfigPanel = ({ tenantId, isAdmin }: BolsaoConfigPanelProps) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<TenantBolsaoConfig>(DEFAULT_BOLSAO_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [corretores, setCorretores] = useState<CorretorDisponivel[]>([]);
  const [savingRoleta, setSavingRoleta] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchTenantBolsaoConfig(tenantId),
      fetchCorretoresDisponiveis(tenantId),
    ])
      .then(([cfg, corrs]) => {
        if (cancelled) return;
        setConfig(cfg);
        setCorretores(corrs);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const updateConfig = (patch: Partial<TenantBolsaoConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await saveTenantBolsaoConfig(tenantId, config);
      toast({ title: '✅ Configurações salvas', description: 'As regras do bolsão foram atualizadas.' });
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Falha desconhecida',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRoletaParticipante = (corretor: CorretorDisponivel) => {
    setCorretores((prev) =>
      prev.map((c) => c.id === corretor.id ? { ...c, is_in_roleta: !c.is_in_roleta } : c)
    );
  };

  const handleSaveRoleta = async () => {
    if (!tenantId) return;
    setSavingRoleta(true);
    try {
      const selecionados = corretores.filter((c) => c.is_in_roleta);
      const result = await atualizarParticipantesRoleta(tenantId, selecionados);
      if (result.success) {
        toast({
          title: '✅ Roleta atualizada',
          description: `${selecionados.length} participante(s) ativo(s).`,
        });
      } else {
        throw new Error(result.error || 'Falha ao salvar');
      }
    } catch (err) {
      toast({
        title: 'Erro ao salvar roleta',
        description: err instanceof Error ? err.message : 'Falha',
        variant: 'destructive',
      });
    } finally {
      setSavingRoleta(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400">
        <Settings className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
        <p className="text-sm">Apenas administradores podem editar as configurações do bolsão.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center text-slate-500 dark:text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p className="text-sm">Carregando configurações…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-[900px] mx-auto space-y-5">
      {/* Master switch — ativar/desativar bolsão por completo */}
      <div
        className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-colors ${
          config.bolsaoEnabled
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              config.bolsaoEnabled
                ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
            }`}
          >
            <Power className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900 dark:text-slate-100">
              {config.bolsaoEnabled ? 'Bolsão ativado' : 'Bolsão desativado'}
            </p>
            <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">
              {config.bolsaoEnabled
                ? 'Leads expiram conforme a regra de tempo configurada e são redistribuídos via roleta.'
                : 'Nenhum lead vai pro bolsão. Cronômetros e redistribuição estão pausados.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.bolsaoEnabled}
          onClick={() => updateConfig({ bolsaoEnabled: !config.bolsaoEnabled })}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
            config.bolsaoEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              config.bolsaoEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Tempos de expiração */}
      <Section icon={Clock} title="Tempos de expiração">
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          Quanto tempo um lead fica com o corretor antes de cair no bolsão.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberInput
            label="Imóvel exclusivo (min)"
            value={config.tempoExpiracaoExclusivo}
            onChange={(v) => updateConfig({ tempoExpiracaoExclusivo: v })}
          />
          <NumberInput
            label="Imóvel não exclusivo (min)"
            value={config.tempoExpiracaoNaoExclusivo}
            onChange={(v) => updateConfig({ tempoExpiracaoNaoExclusivo: v })}
          />
        </div>
      </Section>

      {/* Verificação automática */}
      <Section icon={RefreshCw} title="Verificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberInput
            label="Intervalo de verificação (s)"
            value={config.intervaloVerificacao}
            onChange={(v) => updateConfig({ intervaloVerificacao: v })}
          />
          <NumberInput
            label="Auto-refresh da UI (s)"
            value={config.intervaloAutoRefresh}
            onChange={(v) => updateConfig({ intervaloAutoRefresh: v })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <ToggleRow
            label="Notificar quando lead expira"
            checked={config.notificarExpiracao}
            onChange={(v) => updateConfig({ notificarExpiracao: v })}
          />
          <ToggleRow
            label="Auto-refresh ativado"
            checked={config.autoRefresh}
            onChange={(v) => updateConfig({ autoRefresh: v })}
          />
        </div>
      </Section>

      {/* Horário de funcionamento */}
      <Section icon={Calendar} title="Horário de funcionamento">
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          A regra de expiração só roda dentro desse horário.
        </p>
        <div className="space-y-2">
          {DIAS.map(({ key, label }) => {
            const dia = config.horarioFuncionamento[key as DiaKey];
            return (
              <div key={key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateConfig({
                    horarioFuncionamento: {
                      ...config.horarioFuncionamento,
                      [key]: { ...dia, ativo: !dia.ativo },
                    },
                  })}
                  className={`w-12 px-2 h-8 rounded-lg text-[11.5px] font-semibold border transition-colors shrink-0 ${
                    dia.ativo
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {label}
                </button>
                <input
                  type="time"
                  value={dia.inicio}
                  disabled={!dia.ativo}
                  onChange={(e) => updateConfig({
                    horarioFuncionamento: {
                      ...config.horarioFuncionamento,
                      [key]: { ...dia, inicio: e.target.value },
                    },
                  })}
                  className="h-8 px-2 rounded-lg border text-[12px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 disabled:opacity-50"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="time"
                  value={dia.termino}
                  disabled={!dia.ativo}
                  onChange={(e) => updateConfig({
                    horarioFuncionamento: {
                      ...config.horarioFuncionamento,
                      [key]: { ...dia, termino: e.target.value },
                    },
                  })}
                  className="h-8 px-2 rounded-lg border text-[12px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 disabled:opacity-50"
                />
              </div>
            );
          })}
        </div>
      </Section>

      {/* Botão salvar config */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-2 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>

      {/* Modo de redistribuição (roleta vs equipe) */}
      <Section icon={Zap} title="Modo de redistribuição">
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          Quando um lead expira, escolha pra quem ele vai.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => updateConfig({ roletaEnabled: true, teamQueueEnabled: false })}
            className={`text-left p-3 rounded-lg border transition-all ${
              config.roletaEnabled && !config.teamQueueEnabled
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-900'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">🎰 Roleta</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Sorteia aleatório entre os participantes da lista abaixo
            </p>
          </button>
          <button
            type="button"
            onClick={() => updateConfig({ teamQueueEnabled: true, roletaEnabled: false })}
            className={`text-left p-3 rounded-lg border transition-all ${
              config.teamQueueEnabled && !config.roletaEnabled
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-900'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">🔄 Bolsão por equipe</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Sorteia aleatório dentro da equipe do corretor original
            </p>
          </button>
        </div>
      </Section>

      {/* Participantes da roleta — só aparece se modo roleta */}
      {config.roletaEnabled && !config.teamQueueEnabled && (
      <Section icon={Inbox} title="Participantes da roleta">
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
            {corretores.length === 0
              ? 'Nenhum corretor cadastrado neste tenant.'
              : 'Marque quem participa do round-robin.'}
          </p>
          <div className="space-y-1.5">
            {corretores.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  c.is_in_roleta
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={c.is_in_roleta ?? false}
                  onChange={() => handleToggleRoletaParticipante(c)}
                  className="w-4 h-4 accent-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                  {c.email && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.email}</p>
                  )}
                </div>
                {c.role && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                    {c.role}
                  </span>
                )}
              </label>
            ))}
          </div>
          {corretores.length > 0 && (
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={handleSaveRoleta}
                disabled={savingRoleta}
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold flex items-center gap-2 disabled:opacity-60 transition-colors"
              >
                {savingRoleta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {savingRoleta ? 'Salvando…' : 'Salvar participantes'}
              </button>
            </div>
          )}
      </Section>
      )}
    </div>
  );
};

// =================== sub-componentes ===================

interface SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}
const Section = ({ icon: Icon, title, children }: SectionProps) => (
  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
    </div>
    {children}
  </div>
);

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}
const NumberInput = ({ label, value, onChange }: NumberInputProps) => (
  <label className="block">
    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">{label}</span>
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="w-full h-10 px-3 rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-[13px] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
    />
  </label>
);

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}
const ToggleRow = ({ label, checked, onChange }: ToggleRowProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`flex items-center justify-between gap-3 px-3 h-10 rounded-lg border transition-colors ${
      checked
        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`}
  >
    <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{label}</span>
    <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </span>
  </button>
);

export default BolsaoConfigPanel;
