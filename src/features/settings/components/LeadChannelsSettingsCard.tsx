/**
 * Configuração de Canais de Lead (Configurações > Canais de Lead).
 *
 * Lista as origens que realmente aparecem nos leads do tenant e permite
 * ao admin/owner escolher a qual CANAL cada origem pertence (ex: origem
 * "ZAP Imóveis" -> canal "Portais Imobiliários"). Origens sem escolha
 * manual usam a sugestão automática do classificador — o badge indica
 * se o canal atual é "Automático" ou "Personalizado".
 *
 * Os gráficos "por Canal" dos Relatórios agrupam as origens por esse canal.
 */

import { useMemo, useState } from 'react';
import { ProcessedLead, canonicalizeOrigemLeads } from '@/data/realLeadsProcessor';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeadSourceChannels } from '@/features/relatorios/hooks/useLeadSourceChannels';
import {
  DEFAULT_CANAIS,
  origemChannelKey,
  suggestCanal,
} from '@/features/relatorios/utils/canalClassifier';
import { Megaphone, RotateCcw, Sparkles, UserCheck, Loader2, Plus, Check } from 'lucide-react';

const CUSTOM_OPTION = '__custom__';

interface LeadChannelsSettingsCardProps {
  leads?: ProcessedLead[];
}

interface OrigemRow {
  key: string; // chave normalizada (trim + lowercase)
  origem: string; // rótulo canônico para exibição
  total: number; // quantidade de leads dessa origem
}

export const LeadChannelsSettingsCard = ({ leads }: LeadChannelsSettingsCardProps) => {
  const { toast } = useToast();
  const { channels, loading, saveChannel, resetChannel } = useLeadSourceChannels();

  // Rascunho do input de canal personalizado, por chave de origem
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});

  // Origens reais dos leads do tenant, com rótulo canônico e contagem
  const rows: OrigemRow[] = useMemo(() => {
    const canonical = canonicalizeOrigemLeads(leads ?? []);
    const counts: Record<string, { origem: string; total: number }> = {};
    canonical.forEach((l) => {
      const label = (l.origem_lead || '').trim();
      if (!label) return; // origem vazia não tem como ser mapeada
      const key = origemChannelKey(label);
      if (!counts[key]) counts[key] = { origem: label, total: 0 };
      counts[key].total += 1;
    });
    return Object.entries(counts)
      .map(([key, { origem, total }]) => ({ key, origem, total }))
      .sort((a, b) => b.total - a.total);
  }, [leads]);

  // Canais disponíveis no select: padrão + personalizados já salvos pelo tenant
  const canaisDisponiveis = useMemo(() => {
    const set = new Set<string>(DEFAULT_CANAIS);
    Object.values(channels).forEach((c) => set.add(c));
    return Array.from(set);
  }, [channels]);

  const handleSelectCanal = async (row: OrigemRow, value: string) => {
    if (value === CUSTOM_OPTION) {
      setCustomDrafts((prev) => ({ ...prev, [row.key]: prev[row.key] ?? '' }));
      return;
    }
    const ok = await saveChannel(row.origem, value);
    if (ok) {
      toast({
        title: 'Canal atualizado!',
        description: `"${row.origem}" agora conta como "${value}" nos gráficos por canal.`,
        duration: 3000,
      });
    } else {
      toast({
        title: 'Erro ao salvar canal',
        description: 'Não foi possível salvar. Tente novamente.',
        variant: 'destructive',
        duration: 4000,
      });
    }
  };

  const handleSaveCustom = async (row: OrigemRow) => {
    const canal = (customDrafts[row.key] || '').trim();
    if (!canal) return;
    const ok = await saveChannel(row.origem, canal);
    if (ok) {
      setCustomDrafts((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      toast({
        title: 'Canal personalizado criado!',
        description: `"${row.origem}" agora conta como "${canal}".`,
        duration: 3000,
      });
    } else {
      toast({
        title: 'Erro ao salvar canal',
        description: 'Não foi possível salvar. Tente novamente.',
        variant: 'destructive',
        duration: 4000,
      });
    }
  };

  const handleReset = async (row: OrigemRow) => {
    const ok = await resetChannel(row.origem);
    if (ok) {
      toast({
        title: 'Canal automático restaurado',
        description: `"${row.origem}" voltou para a sugestão automática ("${suggestCanal(row.origem)}").`,
        duration: 3000,
      });
    } else {
      toast({
        title: 'Erro ao restaurar',
        description: 'Não foi possível restaurar. Tente novamente.',
        variant: 'destructive',
        duration: 4000,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Info header */}
      <div className="bg-gradient-to-br from-orange-600/10 via-amber-600/10 to-orange-600/10 border border-orange-500/20 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Megaphone className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Canais de Lead
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Cada origem de lead recebe automaticamente um canal sugerido (ex: <strong>ZAP Imóveis</strong> →{' '}
              <strong>Portais Imobiliários</strong>, <strong>Meta</strong> → <strong>Redes Sociais</strong>).
              Ajuste aqui o canal de qualquer origem — os gráficos <strong>"por Canal"</strong> dos Relatórios
              agrupam os leads por essa classificação.
            </p>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-orange-400" />}
        </div>
      </div>

      {/* Lista de origens */}
      {rows.length === 0 ? (
        <div
          className="border rounded-xl p-8 text-center"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'hsl(var(--border))' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma origem de lead encontrada ainda. Assim que os leads chegarem, as origens aparecem aqui
            para você classificar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const manual = channels[row.key];
            const sugestao = suggestCanal(row.origem);
            const canalAtual = manual || sugestao;
            const isCustomEditing = customDrafts[row.key] !== undefined;

            return (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-3 p-4 rounded-xl border transition-colors"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-[14px]" style={{ color: 'var(--text-primary)' }}>
                    {row.origem}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {row.total} {row.total === 1 ? 'lead' : 'leads'}
                  </p>
                </div>

                {manual ? (
                  <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1">
                    <UserCheck className="h-3 w-3" /> Personalizado
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1">
                    <Sparkles className="h-3 w-3" /> Automático
                  </Badge>
                )}

                {isCustomEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={customDrafts[row.key]}
                      onChange={(e) =>
                        setCustomDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCustom(row);
                      }}
                      placeholder="Nome do novo canal"
                      autoFocus
                      className="h-10 w-52"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'hsl(var(--border))',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveCustom(row)}
                      disabled={!(customDrafts[row.key] || '').trim()}
                      className="h-10 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      style={{ color: 'var(--text-secondary)', borderColor: 'hsl(var(--border))' }}
                      onClick={() =>
                        setCustomDrafts((prev) => {
                          const next = { ...prev };
                          delete next[row.key];
                          return next;
                        })
                      }
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Select value={canalAtual} onValueChange={(v) => handleSelectCanal(row, v)}>
                    <SelectTrigger
                      className="h-10 w-56"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'hsl(var(--border))',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canaisDisponiveis.map((canal) => (
                        <SelectItem key={canal} value={canal}>
                          {canal}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_OPTION}>
                        <span className="flex items-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Criar canal personalizado…
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {manual && !isCustomEditing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={`Voltar para o canal automático ("${sugestao}")`}
                    onClick={() => handleReset(row)}
                    className="h-10 px-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
