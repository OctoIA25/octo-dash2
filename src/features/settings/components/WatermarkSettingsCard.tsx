/**
 * 🖼️ Configuração da marca d'água do tenant.
 *
 * - Upload do logo (vira a marca branca aplicada nas fotos dos imóveis).
 * - Opacidade e tamanho da marca (com PREVIEW ao vivo via CSS — funciona offline).
 * - Liga/desliga.
 *
 * Salvar o LOGO dispara no backend: máscara branca + bump de versão + re-watermark
 * de todas as fotos do tenant. Salvar OPACIDADE/TAMANHO só atualiza os parâmetros.
 */
import { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, Save, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  getWatermarkSettings,
  setTenantLogo,
  updateWatermarkSettings,
  type WatermarkSettings,
} from '@/features/imoveis/services/watermarkService';

interface Props {
  tenantId?: string;
}

/** Traduz o erro do backend ao trocar o logo em uma mensagem acionável ao usuário. */
function mapLogoError(msg: string): string {
  if (/403|admin/.test(msg)) return 'Apenas administradores da imobiliária podem trocar o logo.';
  if (/opaca|inadequado/.test(msg))
    return 'Esse arquivo parece uma foto, não um logo. Envie um PNG com fundo transparente.';
  return msg;
}

/** Pré-visualização ao vivo (CSS) da marca — aproxima o resultado gerado no servidor. */
function WatermarkPreview({
  enabled,
  pendingPreview,
  logoUrl,
  scale,
  opacity,
}: {
  enabled: boolean;
  pendingPreview: string | null;
  logoUrl: string | null;
  scale: number;
  opacity: number;
}) {
  const previewLogo = pendingPreview || logoUrl;
  return (
    <div>
      <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        Pré-visualização
      </Label>
      {/* Fundo claro = representa uma foto clara (caso mais comum/difícil) e
          permite que o mix-blend-mode 'multiply' remova o fundo branco do logo,
          mostrando as CORES reais — como o backend faz ao recortar o branco. */}
      <div className="mt-2 relative aspect-video rounded-lg overflow-hidden border border-border bg-gradient-to-br from-stone-200 via-zinc-300 to-stone-400 flex items-center justify-center">
        <span className="absolute bottom-2 right-2 text-[10px] text-black/30">exemplo</span>

        {enabled && previewLogo ? (
          <img
            src={previewLogo}
            alt="Prévia da marca d'água"
            style={{
              width: `${scale * 100}%`,
              opacity,
              // 'multiply' descarta o fundo branco do logo (branco × foto = foto),
              // preservando as cores; drop-shadow aproxima o halo de legibilidade.
              mixBlendMode: 'multiply',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
            }}
            className="object-contain pointer-events-none select-none"
          />
        ) : (
          <div className="text-black/50 text-sm flex flex-col items-center gap-1">
            <ImageIcon className="h-7 w-7" />
            {enabled ? 'Envie um logo para ver a prévia' : 'Marca d\'água desligada'}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Prévia aproximada das cores (o resultado final, com translucidez e halo, é gerado no servidor).
      </p>
    </div>
  );
}

export function WatermarkSettingsCard({ tenantId }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [opacity, setOpacity] = useState(0.35);
  const [scale, setScale] = useState(0.3);

  // Preview local do logo recém-escolhido (antes de salvar).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    (async () => {
      try {
        const s: WatermarkSettings = await getWatermarkSettings(tenantId);
        if (!alive) return;
        setLogoUrl(s.logo_url);
        setLogoVersion(s.logo_version ?? 0);
        setEnabled(s.watermark_enabled ?? true);
        setOpacity(s.watermark_opacity ?? 0.35);
        setScale(s.watermark_scale ?? 0.3);
      } catch {
        // Sem config ainda (ou backend/cota indisponível): mantém os defaults.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const onPickFile = (file: File | null) => {
    if (!file) return;
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleSaveLogo = async () => {
    if (!tenantId || !pendingFile) return;
    setSavingLogo(true);
    try {
      const res = await setTenantLogo(tenantId, pendingFile);
      setLogoUrl(res.logoUrl);
      setLogoVersion(res.logoVersion);
      setPendingFile(null);
      setPendingPreview(null);
      toast({
        title: 'Logo atualizado',
        description: `Novo logo salvo (v${res.logoVersion}). Reprocessando as fotos — acompanhe abaixo.`,
      });
      window.dispatchEvent(new CustomEvent('watermark:reprocess-started'));
    } catch (e) {
      toast({
        title: 'Falha ao salvar logo',
        description: mapLogoError(String((e as Error).message)),
        variant: 'destructive',
      });
    } finally {
      setSavingLogo(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!tenantId) return;
    setSavingCfg(true);
    try {
      await updateWatermarkSettings(tenantId, { enabled, opacity, scale });
      toast({
        title: enabled ? 'Configuração salva' : 'Marca d\'água desativada',
        description: enabled
          ? 'Reprocessando as fotos com os novos parâmetros — acompanhe abaixo.'
          : 'As fotos passam a ser servidas SEM marca (CRM e portais). Reprocessando — acompanhe abaixo.',
      });
      window.dispatchEvent(new CustomEvent('watermark:reprocess-started'));
    } catch (e) {
      const msg = String((e as Error).message);
      toast({
        title: 'Falha ao salvar',
        description: /403|admin/.test(msg) ? 'Apenas administradores da imobiliária podem alterar isso.' : msg,
        variant: 'destructive',
      });
    } finally {
      setSavingCfg(false);
    }
  };

  return (
    <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="h-6 w-6 text-blue-400" />
        <div>
          <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            Marca d'água nas fotos
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            O logo da imobiliária é aplicado centralizado e translúcido nas fotos. Você pode
            desligar a marca a qualquer momento (admin) — as fotos passam a sair limpas.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna esquerda: upload + parâmetros */}
        <div className="space-y-5">
          {/* Upload do logo */}
          <div>
            <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Logo da imobiliária {logoVersion > 0 && <span className="text-xs text-slate-400">(v{logoVersion})</span>}
            </Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                onPickFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <div
              onClick={() => fileRef.current?.click()}
              className="mt-2 border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {pendingFile ? pendingFile.name : 'Clique para enviar o logo'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                PNG com fundo transparente é o ideal • PNG/JPG/WebP/SVG
              </p>
            </div>
            {pendingFile && (
              <Button onClick={handleSaveLogo} disabled={savingLogo} className="w-full mt-2" size="sm">
                {savingLogo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {logoUrl ? 'Atualizar logo e reprocessar imóveis' : 'Adicionar logo e reprocessar imóveis'}
              </Button>
            )}
          </div>

          {/* On/off */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Aplicar marca d'água
              </Label>
              <p className="text-xs text-muted-foreground">Desligue para servir as fotos sem marca.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Opacidade */}
          <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Opacidade
              </Label>
              <span className="text-xs font-mono text-slate-400">{Math.round(opacity * 100)}%</span>
            </div>
            <Slider value={[opacity]} min={0.05} max={1} step={0.05} onValueChange={([v]) => setOpacity(v)} />
            <p className="text-xs text-muted-foreground mt-1">
              Mais baixa = a foto aparece melhor; mais alta = protege mais.
            </p>
          </div>

          {/* Tamanho */}
          <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Tamanho do logo
              </Label>
              <span className="text-xs font-mono text-slate-400">{Math.round(scale * 100)}% da largura</span>
            </div>
            <Slider value={[scale]} min={0.1} max={0.8} step={0.05} onValueChange={([v]) => setScale(v)} />
          </div>

          <Button onClick={handleSaveConfig} disabled={savingCfg || loading} variant="outline" className="w-full" size="sm">
            {savingCfg ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar configuração e reprocessar fotos
          </Button>
        </div>

        {/* Coluna direita: preview ao vivo (CSS) */}
        <WatermarkPreview
          enabled={enabled}
          pendingPreview={pendingPreview}
          logoUrl={logoUrl}
          scale={scale}
          opacity={opacity}
        />
      </div>
    </div>
  );
}
