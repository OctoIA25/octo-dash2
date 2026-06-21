/**
 * ⚙️ Card de Configurações → Recomendações.
 *
 * Configura, POR IMOBILIÁRIA: e-mail de teste, nome da empresa e o SMTP próprio
 * (host, porta, usuário, remetente e senha). A senha trafega só ao salvar, é
 * cifrada no servidor (AES-256-GCM) e nunca volta ao browser — o formulário
 * apenas indica se já existe uma senha salva. Inclui "Enviar e-mail de teste".
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ImoveisComboBox } from '@/components/ui/imovel-combobox';
import { useToast } from '@/hooks/use-toast';
import { useImoveisData } from '@/features/imoveis/hooks/useImoveisData';
import { Loader2, Save, TestTube2, Mail, Eye, EyeOff, AlertTriangle, Archive, X } from 'lucide-react';
import {
  fetchRecommendationConfig,
  saveRecommendationConfig,
  type RecommendationConfig,
  DEFAULT_RECOMMENDATION_CONFIG,
} from '../services/recommendationConfigService';
import { buildPropertiesSnapshot } from '../propertiesSnapshot';
import { composeRecommendationEmail } from '../email/composeEmail';
import { getSampleImoveis } from '../email/sampleImoveis';
import { sendRecommendation } from '../services/recommendationsApi';
import { EmailPreviewFrame } from './EmailPreviewFrame';

interface RecommendationEmailSettingsCardProps {
  tenantId?: string;
}

const SAMPLE_MESSAGE =
  'Este é um e-mail de teste. É exatamente assim que sua recomendação chega para o cliente.';

export const RecommendationEmailSettingsCard = ({
  tenantId,
}: RecommendationEmailSettingsCardProps) => {
  const { toast } = useToast();
  const { imoveis = [] } = useImoveisData();

  const [config, setConfig] = useState<RecommendationConfig>(DEFAULT_RECOMMENDATION_CONFIG);
  const [password, setPassword] = useState(''); // só preenchido ao trocar a senha
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const reload = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    const c = await fetchRecommendationConfig(tenantId);
    setConfig(c);
    setPassword('');
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRecommendationConfig(tenantId || '')
      .then((c) => active && setConfig(c))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tenantId]);

  const sample = useMemo(() => {
    const demoImoveis = imoveis.length > 0 ? imoveis.slice(0, 3) : getSampleImoveis();
    return composeRecommendationEmail({
      leadNome: 'Cliente Exemplo',
      mensagem: SAMPLE_MESSAGE,
      imoveis: demoImoveis,
      branding: { empresaNome: config.companyName || 'Sua imobiliária' },
    });
  }, [imoveis, config.companyName]);

  const setSmtp = (patch: Partial<RecommendationConfig['smtp']>) =>
    setConfig((c) => ({ ...c, smtp: { ...c.smtp, ...patch } }));

  const setRecovery = (patch: Partial<RecommendationConfig['recovery']>) =>
    setConfig((c) => ({ ...c, recovery: { ...c.recovery, ...patch } }));

  // Adiciona um imóvel à lista fixa do agente (sem duplicar pela referência).
  // Reutiliza buildPropertiesSnapshot para gravar no MESMO shape do engine.
  const addRecoveryImovel = (referencia: string, imovel?: typeof imoveis[number]) => {
    if (!imovel) return;
    setConfig((c) => {
      if (c.recovery.properties.some((p) => p.referencia === referencia)) return c;
      const [snapshot] = buildPropertiesSnapshot([imovel]);
      return { ...c, recovery: { ...c.recovery, properties: [...c.recovery.properties, snapshot] } };
    });
  };

  const removeRecoveryImovel = (referencia: string) =>
    setConfig((c) => ({
      ...c,
      recovery: {
        ...c.recovery,
        properties: c.recovery.properties.filter((p) => p.referencia !== referencia),
      },
    }));

  const handleSave = async () => {
    if (!tenantId || tenantId === 'owner') {
      toast({ title: 'Selecione uma imobiliária', variant: 'destructive' });
      return;
    }
    if (password && !config.encryptionAvailable) {
      toast({
        title: 'Criptografia indisponível',
        description: 'Configure EMAIL_ENCRYPTION_KEY no servidor para salvar a senha.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await saveRecommendationConfig(tenantId, {
        testEmail: config.testEmail,
        companyName: config.companyName,
        smtp: {
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          user: config.smtp.user,
          from: config.smtp.from,
          password: password || undefined,
        },
        whatsapp: {
          templateName: config.whatsapp.templateName,
          templateLanguage: config.whatsapp.templateLanguage,
        },
        intervalDays: config.intervalDays,
        interestWindowDays: config.interestWindowDays,
        recovery: {
          enabled: config.recovery.enabled,
          message: config.recovery.message,
          properties: config.recovery.properties,
        },
      });
      if (!result.ok) {
        toast({
          title: 'Erro ao salvar',
          description: result.message || result.error,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Configurações salvas' });
      await reload();
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!tenantId || tenantId === 'owner') {
      toast({
        title: 'Selecione uma imobiliária',
        description: 'O envio de teste exige um tenant ativo (não disponível no modo owner).',
        variant: 'destructive',
      });
      return;
    }
    if (!config.testEmail.trim()) {
      toast({
        title: 'Informe um e-mail de teste',
        description: 'Preencha e salve o e-mail de teste antes de enviar.',
        variant: 'destructive',
      });
      return;
    }
    setTesting(true);
    try {
      const result = await sendRecommendation({
        tenantId,
        lead: { id: null, source: 'manual', name: 'Cliente Exemplo', email: null },
        subject: sample.subject,
        message: SAMPLE_MESSAGE,
        html: sample.rendered.html,
        text: sample.rendered.text,
        properties: sample.propertiesSnapshot,
        testEmail: config.testEmail,
        isTest: true,
      });
      if (!result.ok) {
        toast({
          title: 'Falha no envio do teste',
          description: result.message || result.error,
          variant: 'destructive',
        });
        return;
      }
      // Sem SMTP do tenant, o servidor usa o transporte SIMULADO: NADA é enviado
      // de verdade. Avisar de forma destacada em vez de uma falsa confirmação.
      if (result.transport === 'simulated') {
        toast({
          title: 'Nada foi enviado (modo simulado)',
          description: `Sem SMTP configurado, o e-mail não saiu de verdade. Preencha o servidor de envio (SMTP) acima e salve para enviar para ${result.recipient}.`,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'E-mail de teste enviado',
        description: `Enviado para ${result.recipient}.`,
      });
    } catch (err) {
      toast({
        title: 'Erro inesperado',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Recomendações por e-mail</h3>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 text-sm text-blue-800 dark:text-blue-300">
          Fora de produção, <strong>todos</strong> os envios são redirecionados para o e-mail
          de teste abaixo — o cliente real nunca recebe durante os testes.
        </div>

        {/* Geral */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cfg-test-email">E-mail de teste</Label>
            <Input
              id="cfg-test-email"
              type="email"
              value={config.testEmail}
              onChange={(e) => setConfig((c) => ({ ...c, testEmail: e.target.value }))}
              placeholder="seu-email@exemplo.com"
            />
          </div>
          <div>
            <Label htmlFor="cfg-company">Nome da empresa (no e-mail)</Label>
            <Input
              id="cfg-company"
              value={config.companyName}
              onChange={(e) => setConfig((c) => ({ ...c, companyName: e.target.value }))}
              placeholder="Sua Imobiliária"
            />
          </div>
        </div>

        {/* SMTP próprio da imobiliária */}
        <div className="border-t pt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold">Servidor de envio (SMTP)</h4>
            <p className="text-[12px] text-muted-foreground">
              Cada imobiliária envia pelo seu próprio e-mail. A senha é cifrada no servidor e
              nunca exibida aqui. Em branco = usa o envio padrão do sistema.
            </p>
          </div>

          {!config.encryptionAvailable && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-2.5 text-[12px] text-orange-800 dark:text-orange-300 flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Criptografia indisponível no servidor (EMAIL_ENCRYPTION_KEY ausente). Não é
                possível salvar a senha até configurá-la.
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="smtp-host">Host SMTP</Label>
              <Input
                id="smtp-host"
                value={config.smtp.host}
                onChange={(e) => setSmtp({ host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="smtp-port">Porta</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={config.smtp.port}
                  onChange={(e) => setSmtp({ port: Number(e.target.value) || 0 })}
                  placeholder="587"
                />
              </div>
              <div className="flex flex-col justify-end pb-2">
                <Label htmlFor="smtp-secure" className="mb-1">SSL/TLS</Label>
                <Switch
                  id="smtp-secure"
                  checked={config.smtp.secure}
                  onCheckedChange={(v) => setSmtp({ secure: v })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="smtp-user">Usuário (e-mail)</Label>
              <Input
                id="smtp-user"
                type="email"
                value={config.smtp.user}
                onChange={(e) => setSmtp({ user: e.target.value })}
                placeholder="conta@gmail.com"
              />
            </div>
            <div>
              <Label htmlFor="smtp-from">Remetente (From)</Label>
              <Input
                id="smtp-from"
                value={config.smtp.from}
                onChange={(e) => setSmtp({ from: e.target.value })}
                placeholder="Imobiliária <conta@gmail.com>"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="smtp-pass">
                Senha {config.smtp.hasPassword && '(já configurada — preencha só para trocar)'}
              </Label>
              <Input
                id="smtp-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config.smtp.hasPassword ? '•••••••• (mantida)' : 'senha de app'}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        {/* WhatsApp (template aprovado na Meta) */}
        <div className="border-t pt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold">WhatsApp (template)</h4>
            <p className="text-[12px] text-muted-foreground">
              Mensagens iniciadas pela empresa exigem um template aprovado na Meta. As credenciais
              do WhatsApp vêm da integração existente; aqui você define qual template usar.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="wa-template">Nome do template</Label>
              <Input
                id="wa-template"
                value={config.whatsapp.templateName}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, whatsapp: { ...c.whatsapp, templateName: e.target.value } }))
                }
                placeholder="recomendacao_imoveis"
              />
            </div>
            <div>
              <Label htmlFor="wa-lang">Idioma do template</Label>
              <Input
                id="wa-lang"
                value={config.whatsapp.templateLanguage}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, whatsapp: { ...c.whatsapp, templateLanguage: e.target.value } }))
                }
                placeholder="pt_BR"
              />
            </div>
          </div>
        </div>

        {/* Agente de Recuperação (disparado ao arquivar um lead do CRM) */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <Archive className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold">Agente de Recuperação</h4>
                <p className="text-[12px] text-muted-foreground">
                  Quando um corretor arquiva um cliente, o agente envia automaticamente, por
                  WhatsApp, a mensagem e a lista de imóveis abaixo — uma tentativa de recuperar
                  o lead.
                </p>
              </div>
            </div>
            <Switch
              checked={config.recovery.enabled}
              onCheckedChange={(v) => setRecovery({ enabled: v })}
              aria-label="Ativar Agente de Recuperação"
            />
          </div>

          {config.recovery.enabled && (
            <>
              {!config.whatsapp.templateName && (
                <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-2.5 text-[12px] text-orange-800 dark:text-orange-300 flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Configure o <strong>template de WhatsApp</strong> acima: o agente envia por
                    WhatsApp e, sem template aprovado na Meta, nada será enviado.
                  </span>
                </div>
              )}

              <div>
                <Label htmlFor="recovery-message">Mensagem ao cliente</Label>
                <Textarea
                  id="recovery-message"
                  value={config.recovery.message}
                  onChange={(e) => setRecovery({ message: e.target.value })}
                  placeholder="Olá! Sentimos sua falta. Separamos algumas oportunidades que podem te interessar."
                  rows={3}
                />
                <p className="text-[12px] text-muted-foreground mt-1">
                  Este texto é enviado como parâmetro do template de WhatsApp aprovado na Meta.
                </p>
              </div>

              <div>
                <Label>Imóveis (oportunidades)</Label>
                <p className="text-[12px] text-muted-foreground mb-2">
                  Selecione os imóveis que o agente apresentará ao cliente arquivado.
                </p>
                <ImoveisComboBox
                  imoveis={imoveis}
                  value=""
                  onChange={addRecoveryImovel}
                  placeholder="Buscar imóvel por referência, título ou bairro…"
                />

                {config.recovery.properties.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {config.recovery.properties.map((p) => (
                      <li
                        key={p.referencia}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{p.referencia}</span>
                          <span className="text-muted-foreground"> — {p.titulo}</span>
                          {p.localizacao && (
                            <span className="text-[12px] text-muted-foreground block truncate">
                              {p.localizacao}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecoveryImovel(p.referencia)}
                          className="text-muted-foreground hover:text-destructive flex-shrink-0"
                          aria-label={`Remover ${p.referencia}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Nenhum imóvel selecionado — o agente não envia sem ao menos um imóvel.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Cadência ("prazo") dos reenvios agendados */}
        <div className="border-t pt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold">Cadência das recomendações</h4>
            <p className="text-[12px] text-muted-foreground">
              Define o "prazo" dos reenvios automáticos: de quantos em quantos dias
              reenviar e por quanto tempo, após o interesse do lead, continuar enviando.
              Aplica-se aos novos agendamentos.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cfg-interval-days">Intervalo de reenvio (dias)</Label>
              <Input
                id="cfg-interval-days"
                type="number"
                min={1}
                value={config.intervalDays}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, intervalDays: Number(e.target.value) || 0 }))
                }
                placeholder="7"
              />
            </div>
            <div>
              <Label htmlFor="cfg-window-days">Janela de interesse (dias)</Label>
              <Input
                id="cfg-window-days"
                type="number"
                min={1}
                value={config.interestWindowDays}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, interestWindowDays: Number(e.target.value) || 0 }))
                }
                placeholder="7"
              />
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={handleSendTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube2 className="h-4 w-4 mr-2" />}
            Enviar e-mail de teste
          </Button>
          <Button variant="ghost" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showPreview ? 'Ocultar preview' : 'Ver preview'}
          </Button>
        </div>

        {showPreview && <EmailPreviewFrame html={sample.rendered.html} />}
      </CardContent>
    </Card>
  );
};
