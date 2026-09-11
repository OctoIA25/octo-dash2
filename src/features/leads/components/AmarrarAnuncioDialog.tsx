/**
 * "Que imóvel é este anúncio?" — a pendência que fecha o buraco dos leads de
 * portal sem imóvel identificado.
 *
 * NÃO SUGERE NADA SOZINHO. Mostra o que o portal mandou (id do anúncio, quantos
 * leads, e o endereço quando a mensagem trouxe) e deixa a pessoa escolher. A
 * versão anterior deste problema tentava adivinhar pelo bairro e escrevia código
 * errado — pior que código nenhum.
 *
 * `Input` + `<datalist>` em vez de um Select: a lista é escolha OU digitação,
 * porque lançamento recém-numerado ainda não existe em lugar nenhum para ser
 * listado. O datalist é nativo do navegador e já faz a busca por digitação.
 */
import { useState, useEffect, useId } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Link2 } from 'lucide-react';
import type { AnuncioPendente, OpcaoDeCodigo } from '../services/anunciosPendentesService';

interface Props {
  anuncio: AnuncioPendente | null;
  opcoes: OpcaoDeCodigo[];
  salvando: boolean;
  onFechar: () => void;
  onConfirmar: (codigo: string) => void;
}

export function AmarrarAnuncioDialog({ anuncio, opcoes, salvando, onFechar, onConfirmar }: Props) {
  const [codigo, setCodigo] = useState('');
  const listaId = useId();

  // Trocar de anúncio sem limpar o campo gravaria o código do anterior.
  useEffect(() => { setCodigo(''); }, [anuncio?.originListingId]);

  if (!anuncio) return null;

  const codigoLimpo = codigo.trim().toUpperCase();

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Que imóvel é este anúncio?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Anúncio no portal: </span>
              <span className="font-mono font-semibold">{anuncio.originListingId}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Chegou como: </span>
              <span className="font-mono">{anuncio.codigoNoPortal || 'sem código'}</span>
              <span className="text-muted-foreground"> · {anuncio.totalLeads} lead(s)</span>
            </p>
            {anuncio.dica ? (
              <p className="text-muted-foreground">O lead dizia: “{anuncio.dica}”</p>
            ) : (
              <p className="text-muted-foreground">
                Os leads deste anúncio são cliques no WhatsApp — o portal não mandou endereço.
                O id acima aparece no link do anúncio no painel do ZAP.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${listaId}-input`}>Imóvel ou lançamento</Label>
            <Input
              id={`${listaId}-input`}
              list={listaId}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Escolha na lista ou digite o código"
              autoComplete="off"
              disabled={salvando}
            />
            <datalist id={listaId}>
              {opcoes.map((o) => (
                <option key={`${o.grupo}-${o.codigo}`} value={o.codigo} label={`${o.rotulo} · ${o.grupo}`} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Vale para todos os leads deste anúncio, inclusive os que já chegaram.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => onConfirmar(codigoLimpo)} disabled={!codigoLimpo || salvando}>
            {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gravando…</> : 'Amarrar anúncio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
