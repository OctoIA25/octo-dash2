/**
 * Seção de Leads Arquivados
 * - Corretor: vê apenas seus próprios leads arquivados
 * - Admin/Gestão: vê todos os leads arquivados do tenant
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Search,
  RefreshCw,
  User,
  Phone,
  Mail,
  Clock,
  Tag,
  Users,
  CalendarX,
  X,
} from 'lucide-react';
import {
  fetchLeadsArquivadosDoCorretor,
  fetchTodosLeadsArquivadosCRM,
  desarquivarLeadCRM,
  type KanbanLead,
} from '../services/leadsService';
import {
  fetchKenloLeadsArquivados,
  desarquivarKenloLead,
} from '@/features/imoveis/services/kenloLeadsService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ──────────────────────────────────────────────
// Card individual de lead arquivado
// ──────────────────────────────────────────────

interface LeadArquivadoCardProps {
  lead: KanbanLead;
  mostrarCorretor: boolean;
  onDesarquivar: (lead: KanbanLead) => void;
}

const LeadArquivadoCard = ({ lead, mostrarCorretor, onDesarquivar }: LeadArquivadoCardProps) => {
  const nome = lead.nomedolead || 'Lead sem nome';
  const inicial = nome.charAt(0).toUpperCase();

  return (
    <Card className="border border-gray-200 bg-white/80 dark:bg-slate-900/60 hover:shadow-md transition-shadow dark:border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Avatar + info principal */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {inicial}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-gray-900 truncate dark:text-slate-100">{nome}</h3>

              {mostrarCorretor && lead.corretor_responsavel && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 mt-0.5 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                  <User className="h-2.5 w-2.5 mr-0.5" />
                  {lead.corretor_responsavel}
                </Badge>
              )}

              <div className="mt-1.5 space-y-1">
                {lead.lead && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{lead.lead}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.portal && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                    <Tag className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{lead.portal}</span>
                  </div>
                )}
              </div>

              {/* Motivo e data de arquivamento */}
              <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 dark:border-slate-800">
                {lead.archive_reason && (
                  <div className="flex items-start gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                    <Archive className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{lead.archive_reason}</span>
                  </div>
                )}
                {lead.archived_at && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                    <CalendarX className="h-3 w-3 flex-shrink-0" />
                    <span>Arquivado em {formatDate(lead.archived_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ação de desarquivar */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDesarquivar(lead)}
            className="h-8 px-3 text-xs flex-shrink-0 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
            title="Restaurar lead"
          >
            <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
            Restaurar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────

export const LeadsArquivadosSection = () => {
  const { user, isAdmin, isCorretor, tenantId } = useAuth();
  const { toast } = useToast();

  const [leads, setLeads] = useState<KanbanLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [leadParaDesarquivar, setLeadParaDesarquivar] = useState<KanbanLead | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  const mostrarCorretor = isAdmin;

  // ── Buscar dados ─────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      let userId = user?.id;
      if (!userId) {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id;
      }

      let crmData: KanbanLead[] = [];
      let kenloData: KanbanLead[] = [];

      if (isAdmin) {
        crmData = await fetchTodosLeadsArquivadosCRM();
        if (tenantId) {
          kenloData = await fetchKenloLeadsArquivados(tenantId);
        }
      } else if (userId) {
        crmData = await fetchLeadsArquivadosDoCorretor(userId);
        if (tenantId) {
          kenloData = await fetchKenloLeadsArquivados(tenantId);
        }
      }

      setLeads([...crmData, ...kenloData]);
    } catch {
      toast({
        title: 'Erro ao carregar arquivados',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, tenantId, toast]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Filtro de busca ──────────────────────────
  const leadsFiltrados = leads.filter((l) => {
    if (!busca.trim()) return true;
    const termo = busca.toLowerCase();
    return (
      (l.nomedolead || '').toLowerCase().includes(termo) ||
      (l.lead || '').includes(termo) ||
      (l.email || '').toLowerCase().includes(termo) ||
      (l.corretor_responsavel || '').toLowerCase().includes(termo) ||
      (l.archive_reason || '').toLowerCase().includes(termo)
    );
  });

  // ── Desarquivar ──────────────────────────────
  const handleDesarquivar = async (lead: KanbanLead) => {
    setLeadParaDesarquivar(null);
    setProcessando(lead.id);
    try {
      const isKenlo = (lead as any)._sourceTable === 'kenlo_leads';
      const result = isKenlo
        ? await desarquivarKenloLead(lead.id)
        : await desarquivarLeadCRM(lead.id);
      if (result.success) {
        setLeads((prev) => prev.filter((l) => l.id !== lead.id));
        toast({
          title: '✅ Lead restaurado',
          description: `${lead.nomedolead} foi devolvido para o funil.`,
          className: 'bg-green-500/10 border-green-500/50',
        });
      } else {
        const msg = (result as any).message || (result as any).error || 'Erro desconhecido';
        toast({ title: 'Erro ao restaurar lead', description: msg, variant: 'destructive' });
      }
    } finally {
      setProcessando(null);
    }
  };

  // ── Render ───────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0 dark:bg-slate-900 dark:border-slate-800">
        <div className="w-full px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-orange-500" />
            <h1 className="text-xl font-bold text-foreground">Leads Arquivados</h1>
            {isAdmin && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900">
                <Users className="h-3 w-3 mr-1" />
                Visão do tenant
              </Badge>
            )}
          </div>

          <div className="flex-1" />

          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{leads.length}</strong> arquivados
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={carregar}
            disabled={loading}
            className="h-9 px-4"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Barra de busca */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 dark:bg-slate-900 dark:border-slate-800">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
          <Input
            placeholder="Buscar por nome, telefone, e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-9"
          />
          {busca && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-500"
              onClick={() => setBusca('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {busca && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {leadsFiltrados.length} de {leads.length} resultado(s)
          </p>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="h-12 w-12 text-orange-400 animate-spin" />
            <p className="text-muted-foreground">Carregando leads arquivados...</p>
          </div>
        ) : leadsFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <Archive className="h-16 w-16 text-gray-300" />
            <h3 className="text-lg font-semibold text-foreground">
              {leads.length === 0 ? 'Nenhum lead arquivado' : 'Nenhum resultado encontrado'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {leads.length === 0
                ? isAdmin
                  ? 'Nenhum lead foi arquivado neste tenant ainda.'
                  : 'Você não tem leads arquivados ainda.'
                : 'Tente buscar por outro termo.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {leadsFiltrados.map((lead) => (
              <div key={lead.id} className="relative">
                {processando === lead.id && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 rounded-lg flex items-center justify-center z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-green-500" />
                  </div>
                )}
                <LeadArquivadoCard
                  lead={lead}
                  mostrarCorretor={mostrarCorretor}
                  onDesarquivar={(l) => setLeadParaDesarquivar(l)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmar restauração */}
      {leadParaDesarquivar && (
        <Dialog open onOpenChange={() => setLeadParaDesarquivar(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArchiveRestore className="h-5 w-5 text-green-500" />
                Restaurar lead?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              O lead <strong className="text-foreground">{leadParaDesarquivar.nomedolead}</strong> será
              removido dos arquivados e devolvido para o funil ativo.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLeadParaDesarquivar(null)}>Cancelar</Button>
              <Button
                onClick={() => handleDesarquivar(leadParaDesarquivar)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <ArchiveRestore className="h-4 w-4 mr-2" />
                Restaurar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default LeadsArquivadosSection;
