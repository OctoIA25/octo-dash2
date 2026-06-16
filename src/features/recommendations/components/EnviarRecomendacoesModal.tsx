/**
 * 🪟 Modal de envio de recomendações de imóveis para um lead (multicanal).
 *
 * Fluxo: identifica imóveis semelhantes (motor) → seleciona/edita → escolhe os
 * CANAIS disponíveis (Email / WhatsApp) → pré-visualiza → envia. Cada canal é
 * enviado independentemente (um request por canal), com status próprio. A lógica
 * de domínio (scoring, templates) vive em módulos puros; aqui só há estado de UI.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ImoveisComboBox } from '@/components/ui/imovel-combobox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useImoveisData } from '@/features/imoveis/hooks/useImoveisData';
import {
  Loader2,
  Send,
  Mail,
  MessageCircle,
  AlertTriangle,
  Sparkles,
  TestTube2,
  CheckCircle2,
  CalendarClock,
  X,
} from 'lucide-react';
import type { RecommendationLeadInput } from '../types';
import { useRecommendations } from '../hooks/useRecommendations';
import { RecommendationItem, type Candidate } from './RecommendationItem';
import { EmailPreviewFrame } from './EmailPreviewFrame';
import { composeRecommendationEmail } from '../email/composeEmail';
import { composeRecommendationWhatsapp } from '../whatsapp/composeWhatsapp';
import {
  fetchRecommendationConfig,
  type RecommendationConfig,
  DEFAULT_RECOMMENDATION_CONFIG,
} from '../services/recommendationConfigService';
import {
  sendRecommendation,
  type RecommendationChannel,
  type SendRecommendationRequest,
} from '../services/recommendationsApi';
import {
  fetchLeadChannelPreference,
  saveLeadChannelPreference,
} from '../services/leadChannelPreferenceService';
import {
  createSchedule,
  listSchedules,
  cancelSchedule,
  type RecommendationSchedule,
} from '../services/recommendationSchedulesApi';

interface EnviarRecomendacoesModalProps {
  lead: RecommendationLeadInput | null;
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_MESSAGE =
  'Separei alguns imóveis que combinam com o que você procura. Dá uma olhada e me conta o que achou — posso agendar uma visita quando quiser.';

const formatData = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const hasDigits = (v: string) => /\d/.test(v);

export const EnviarRecomendacoesModal = ({
  lead,
  isOpen,
  onClose,
}: EnviarRecomendacoesModalProps) => {
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const { imoveis = [] } = useImoveisData();

  const { preferences, seedImoveis, candidates, hasEnoughData } = useRecommendations(
    lead,
    imoveis,
  );

  const [candidateList, setCandidateList] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [channels, setChannels] = useState<Set<RecommendationChannel>>(new Set(['email']));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [config, setConfig] = useState<RecommendationConfig>(DEFAULT_RECOMMENDATION_CONFIG);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scheduleWeekly, setScheduleWeekly] = useState(false);
  const [schedules, setSchedules] = useState<RecommendationSchedule[]>([]);

  const emailAvailable = leadEmail.trim().includes('@');
  const whatsappAvailable = hasDigits(leadPhone);

  // (Re)inicializa ao abrir / trocar de lead.
  useEffect(() => {
    if (!isOpen || !lead) return;
    setCandidateList(candidates);
    setSelected(new Set(candidates.map((c) => c.imovel.referencia)));
    setLeadEmail(lead.email ?? '');
    setLeadPhone(lead.phone ?? '');
    setSubject('');
    setMessage(DEFAULT_MESSAGE);
    setScheduleWeekly(false);
    // Canais default por disponibilidade (sobrescrito pela preferência salva, abaixo).
    const initial = new Set<RecommendationChannel>();
    if (lead.email?.includes('@')) initial.add('email');
    else if (lead.phone && hasDigits(lead.phone)) initial.add('whatsapp');
    setChannels(initial.size ? initial : new Set(['email']));
  }, [isOpen, lead, candidates]);

  // Carrega config do tenant + preferência de canal do lead.
  useEffect(() => {
    if (!isOpen || !tenantId || tenantId === 'owner') return;
    let active = true;
    fetchRecommendationConfig(tenantId)
      .then((c) => active && setConfig(c))
      .catch(() => undefined);
    if (lead?.id != null) {
      fetchLeadChannelPreference(tenantId, lead.source, String(lead.id))
        .then((pref) => {
          if (active && pref && pref.length) setChannels(new Set(pref));
        })
        .catch(() => undefined);
      listSchedules(tenantId, String(lead.id))
        .then((items) => active && setSchedules(items.filter((s) => s.active)))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [isOpen, tenantId, lead]);

  const handleCancelSchedule = async (id: string) => {
    if (!tenantId) return;
    const ok = await cancelSchedule(tenantId, id);
    if (ok) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast({ title: 'Agendamento cancelado' });
    } else {
      toast({ title: 'Falha ao cancelar', variant: 'destructive' });
    }
  };

  const selectedImoveis = useMemo(
    () => candidateList.filter((c) => selected.has(c.imovel.referencia)).map((c) => c.imovel),
    [candidateList, selected],
  );

  const empresaNome = config.companyName || user?.tenantName || 'Sua imobiliária';

  const composedEmail = useMemo(
    () =>
      composeRecommendationEmail({
        leadNome: lead?.name || '',
        mensagem: message,
        imoveis: selectedImoveis,
        finalidade: preferences.finalidade,
        branding: {
          empresaNome,
          corretorNome: user?.name || user?.email || undefined,
          corretorEmail: user?.email || undefined,
        },
        assuntoCustom: subject,
      }),
    [lead?.name, message, selectedImoveis, preferences.finalidade, empresaNome, user, subject],
  );

  const composedWhatsapp = useMemo(
    () =>
      composeRecommendationWhatsapp({
        leadNome: lead?.name || '',
        mensagem: message,
        imoveis: selectedImoveis,
        finalidade: preferences.finalidade,
        empresaNome,
      }),
    [lead?.name, message, selectedImoveis, preferences.finalidade, empresaNome],
  );

  const toggle = (referencia: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(referencia)) next.delete(referencia);
      else next.add(referencia);
      return next;
    });

  const selectAll = () => setSelected(new Set(candidateList.map((c) => c.imovel.referencia)));
  const clearAll = () => setSelected(new Set());

  const removeCandidate = (referencia: string) => {
    setCandidateList((prev) => prev.filter((c) => c.imovel.referencia !== referencia));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(referencia);
      return next;
    });
  };

  const addManual = (referencia: string) => {
    if (!referencia) return;
    if (candidateList.some((c) => c.imovel.referencia === referencia)) {
      setSelected((prev) => new Set(prev).add(referencia));
      return;
    }
    const imovel = imoveis.find((i) => i.referencia === referencia);
    if (!imovel) return;
    setCandidateList((prev) => [...prev, { imovel, origin: 'manual' }]);
    setSelected((prev) => new Set(prev).add(referencia));
  };

  const toggleChannel = (channel: RecommendationChannel) =>
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });

  /** Canais selecionados E disponíveis. */
  const activeChannels = useMemo(
    () =>
      Array.from(channels).filter(
        (c) => (c === 'email' && emailAvailable) || (c === 'whatsapp' && whatsappAvailable),
      ),
    [channels, emailAvailable, whatsappAvailable],
  );

  const buildPayload = (
    channel: RecommendationChannel,
    isTest: boolean,
  ): SendRecommendationRequest => {
    const baseLead = {
      id: lead!.id,
      source: lead!.source,
      name: lead!.name,
      email: leadEmail.trim() || null,
      phone: leadPhone.trim() || null,
    };
    if (channel === 'email') {
      return {
        tenantId: tenantId!,
        channel: 'email',
        lead: baseLead,
        subject: composedEmail.subject,
        message,
        html: composedEmail.rendered.html,
        text: composedEmail.rendered.text,
        properties: composedEmail.propertiesSnapshot,
        testEmail: config.testEmail || undefined,
        isTest,
      };
    }
    return {
      tenantId: tenantId!,
      channel: 'whatsapp',
      lead: baseLead,
      whatsappBody: composedWhatsapp.body,
      properties: composedWhatsapp.propertiesSnapshot,
      isTest,
    };
  };

  const doSend = async (isTest: boolean) => {
    if (!lead || !tenantId || tenantId === 'owner') {
      toast({ title: 'Erro', description: 'Tenant não selecionado.', variant: 'destructive' });
      return;
    }
    if (selectedImoveis.length === 0) {
      toast({ title: 'Selecione ao menos um imóvel', variant: 'destructive' });
      return;
    }
    if (activeChannels.length === 0) {
      toast({
        title: 'Nenhum canal disponível',
        description: 'Informe um e-mail ou telefone e selecione ao menos um canal.',
        variant: 'destructive',
      });
      return;
    }
    if (isTest && activeChannels.includes('email') && !config.testEmail) {
      toast({
        title: 'Configure o e-mail de teste',
        description: 'Defina um e-mail de teste em Configurações → Recomendações.',
        variant: 'destructive',
      });
      return;
    }

    const setBusy = isTest ? setTesting : setSending;
    setBusy(true);
    try {
      const results = await Promise.all(
        activeChannels.map(async (channel) => ({
          channel,
          res: await sendRecommendation(buildPayload(channel, isTest)),
        })),
      );

      results.forEach(({ channel, res }) => {
        const nome = channel === 'email' ? 'Email' : 'WhatsApp';
        if (!res.ok) {
          toast({
            title: `Falha no envio (${nome})`,
            description: res.message || res.error || 'Tente novamente.',
            variant: 'destructive',
          });
        } else if (res.deduplicated) {
          toast({ title: `${nome}: já enviado`, description: 'Envio idêntico recente — ignorado.' });
        } else {
          toast({
            title: isTest ? `Teste enviado (${nome})` : `Enviado (${nome})`,
            description:
              res.status === 'simulated'
                ? `Simulado${res.recipient ? ` → ${res.recipient}` : ''}.`
                : `Para ${res.recipient}.`,
          });
        }
      });

      const allOk = results.every((r) => r.res.ok);
      if (!isTest && allOk) {
        // Persiste a preferência de canal do lead (best-effort).
        try {
          if (lead.id != null) {
            await saveLeadChannelPreference(tenantId, lead.source, String(lead.id), activeChannels);
          }
        } catch {
          /* preferência é best-effort; não bloqueia o fluxo */
        }
        // Agendamento semanal opcional (snapshot do conteúdo atual).
        if (scheduleWeekly) {
          try {
            const created = await createSchedule({
              tenantId,
              lead: {
                id: lead.id,
                source: lead.source,
                name: lead.name,
                email: leadEmail.trim() || null,
                phone: leadPhone.trim() || null,
              },
              channels: activeChannels,
              content: {
                subject: composedEmail.subject,
                message,
                html: composedEmail.rendered.html,
                text: composedEmail.rendered.text,
                whatsappBody: composedWhatsapp.body,
              },
              properties: composedEmail.propertiesSnapshot,
            });
            if (created.ok) toast({ title: 'Reenvio semanal agendado' });
          } catch {
            /* agendamento é best-effort; o envio manual já ocorreu */
          }
        }
        onClose();
      }
    } catch (err) {
      toast({
        title: 'Erro inesperado',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || !lead) return null;

  const noChannelPossible = !emailAvailable && !whatsappAvailable;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Enviar Recomendações
          </DialogTitle>
          <DialogDescription>
            Imóveis sugeridos para {lead.name} com base no histórico de interesse.
          </DialogDescription>
        </DialogHeader>

        {/* Informações do Lead + contatos */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Nome</span>
            <p className="font-medium truncate">{lead.name}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Última interação</span>
            <p className="font-medium">{formatData(lead.lastInteraction)}</p>
          </div>
          <div>
            <Label htmlFor="lead-email" className="text-xs text-muted-foreground">
              E-mail do lead
            </Label>
            <Input
              id="lead-email"
              type="email"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="email@cliente.com"
            />
          </div>
          <div>
            <Label htmlFor="lead-phone" className="text-xs text-muted-foreground">
              Telefone (WhatsApp)
            </Label>
            <Input
              id="lead-phone"
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              placeholder="55 11 99999-9999"
            />
          </div>
          {seedImoveis.length > 0 && (
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">Imóveis visualizados</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {seedImoveis.map((s) => (
                  <Badge key={s.referencia} variant="outline" className="text-[10px]">
                    {s.referencia} · {s.bairro || s.cidade}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Seleção de canais */}
        <div className="flex items-center gap-4 px-1">
          <span className="text-xs font-semibold text-muted-foreground">Canais:</span>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={channels.has('email')}
              disabled={!emailAvailable}
              onCheckedChange={() => toggleChannel('email')}
            />
            <Mail className="h-4 w-4" /> Email
            {!emailAvailable && <span className="text-[10px] text-muted-foreground">(sem e-mail)</span>}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={channels.has('whatsapp')}
              disabled={!whatsappAvailable}
              onCheckedChange={() => toggleChannel('whatsapp')}
            />
            <MessageCircle className="h-4 w-4" /> WhatsApp
            {!whatsappAvailable && <span className="text-[10px] text-muted-foreground">(sem telefone)</span>}
          </label>
        </div>
        {noChannelPossible && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-2.5 text-sm text-red-700 dark:text-red-300 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Sem e-mail e sem telefone: informe ao menos um contato para enviar.</span>
          </div>
        )}

        <Tabs defaultValue="imoveis" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="imoveis">Imóveis ({selected.size})</TabsTrigger>
            <TabsTrigger value="mensagem">Mensagem</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          {/* Aba: seleção de imóveis */}
          <TabsContent value="imoveis" className="flex-1 overflow-hidden flex flex-col mt-3">
            {!hasEnoughData && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3 mb-3 text-sm text-orange-800 dark:text-orange-300 flex gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Dados insuficientes para recomendações automáticas confiáveis. Adicione
                  imóveis manualmente abaixo.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Selecionar todos
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Limpar
                </Button>
              </div>
              <div className="w-56">
                <ImoveisComboBox imoveis={imoveis} value="" onChange={(ref) => addManual(ref)} placeholder="Adicionar imóvel..." />
              </div>
            </div>

            <ScrollArea className="flex-1 pr-3">
              <div className="space-y-2">
                {candidateList.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-10">
                    Nenhum imóvel na lista. Use "Adicionar imóvel" acima.
                  </div>
                ) : (
                  candidateList.map((c) => (
                    <RecommendationItem
                      key={c.imovel.referencia}
                      candidate={c}
                      selected={selected.has(c.imovel.referencia)}
                      finalidade={preferences.finalidade}
                      onToggle={toggle}
                      onRemove={removeCandidate}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Aba: mensagem */}
          <TabsContent value="mensagem" className="mt-3 space-y-3">
            {channels.has('email') && (
              <div>
                <Label htmlFor="rec-subject">Assunto (Email)</Label>
                <Input
                  id="rec-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={composedEmail.subject}
                />
              </div>
            )}
            <div>
              <Label htmlFor="rec-message">Mensagem personalizada</Label>
              <Textarea
                id="rec-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Usada nos dois canais (ajustada ao formato de cada um).
              </p>
            </div>
          </TabsContent>

          {/* Aba: preview por canal */}
          <TabsContent value="preview" className="mt-3 overflow-auto space-y-4">
            {selectedImoveis.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">
                Selecione ao menos um imóvel para ver o preview.
              </div>
            ) : (
              <>
                {channels.has('email') && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </div>
                    <EmailPreviewFrame html={composedEmail.rendered.html} />
                  </div>
                )}
                {channels.has('whatsapp') && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </div>
                    <pre className="whitespace-pre-wrap text-sm bg-[#e7ffdb] dark:bg-emerald-950/40 text-foreground rounded-lg p-3 border border-emerald-200 dark:border-emerald-900 font-sans">
                      {composedWhatsapp.body}
                    </pre>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Em produção, fora da janela de 24h, o WhatsApp envia via template aprovado na Meta.
                    </p>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Agendamento semanal */}
        <div className="border-t pt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={scheduleWeekly} onCheckedChange={() => setScheduleWeekly((v) => !v)} />
            <CalendarClock className="h-4 w-4 text-primary" />
            Agendar reenvio semanal (enquanto o interesse estiver ativo)
          </label>
          {schedules.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Agendamentos ativos deste lead:</span>
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs bg-muted/40 rounded-md px-2 py-1">
                  <CalendarClock className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1">
                    {s.channels.join(' + ')} · próximo: {formatData(s.next_run_at)} · enviados: {s.run_count}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => handleCancelSchedule(s.id)}
                    aria-label="Cancelar agendamento"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="border-t pt-3 flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => doSend(true)}
            disabled={testing || sending || selectedImoveis.length === 0 || activeChannels.length === 0}
            title="Envia um teste pelos canais selecionados"
          >
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube2 className="h-4 w-4 mr-2" />}
            Enviar teste
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} disabled={sending || testing}>
            Cancelar
          </Button>
          <Button
            onClick={() => doSend(false)}
            disabled={sending || testing || selectedImoveis.length === 0 || activeChannels.length === 0}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Enviar ({activeChannels.length})
              </>
            )}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Fora de produção: e-mail vai para o e-mail de teste e WhatsApp é apenas simulado.
        </p>
      </DialogContent>
    </Dialog>
  );
};
