/**
 * Cadastro de uma construtora (P0.3) — o "Editar" dos cards da aba.
 *
 * A COMISSÃO só aparece para quem o banco autorizou. Não há `if` de papel
 * aqui: o campo existe quando `comissao !== undefined`, e isso só acontece
 * quando a RPC `construtoras_comissao` devolveu a linha — a decisão é do
 * banco. Se o campo não aparece, ele também não é enviado, então salvar não
 * apaga o valor de quem não pode vê-lo.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  codigoDaConstrutora,
  type Construtora,
  type EntradaDeConstrutora,
} from '../services/construtorasService';

interface ConstrutoraFormDialogProps {
  aberto: boolean;
  onFechar: () => void;
  /** null = cadastrando uma nova. */
  construtora: Construtora | null;
  /** Nome sugerido ao cadastrar a partir de um texto que não estava no cadastro. */
  nomeSugerido?: string;
  /** `undefined` = este usuário não pode ver a comissão. */
  comissao?: number | null;
  salvando: boolean;
  /** Cadastrar nova — nunca sobrescreve uma existente. */
  onCriar: (entrada: EntradaDeConstrutora) => Promise<{ success: boolean; error?: string }>;
  /** Editar a existente, pelo id. */
  onAtualizar: (id: string, entrada: EntradaDeConstrutora) => Promise<{ success: boolean; error?: string }>;
}

const vazia = (nome = ''): EntradaDeConstrutora => ({
  codigo: nome ? codigoDaConstrutora(nome) : '',
  nome,
  razaoSocial: null,
  responsavelNome: null,
  responsavelTelefone: null,
  responsavelEmail: null,
  prazoPagamentoDias: null,
  dadosNota: null,
  eAvulso: false,
  ativa: true,
  observacao: null,
});

export function ConstrutoraFormDialog({
  aberto,
  onFechar,
  construtora,
  nomeSugerido,
  comissao,
  salvando,
  onCriar,
  onAtualizar,
}: ConstrutoraFormDialogProps) {
  const [form, setForm] = useState<EntradaDeConstrutora>(vazia());
  const [erro, setErro] = useState<string | null>(null);
  const podeVerComissao = comissao !== undefined;

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    if (construtora) {
      const { id: _id, ...resto } = construtora;
      setForm(podeVerComissao ? { ...resto, comissaoPadraoPct: comissao ?? null } : resto);
    } else {
      setForm(podeVerComissao ? { ...vazia(nomeSugerido), comissaoPadraoPct: null } : vazia(nomeSugerido));
    }
  }, [aberto, construtora, nomeSugerido, comissao, podeVerComissao]);

  const campo = <K extends keyof EntradaDeConstrutora>(k: K, v: EntradaDeConstrutora[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const salvar = async () => {
    setErro(null);
    // Criar e editar são operações diferentes de propósito: com upsert,
    // cadastrar "SANTA ANGELA" tendo "Santa Ângela" renomeava a existente em
    // silêncio, porque as duas geram o mesmo código.
    const r = construtora ? await onAtualizar(construtora.id, form) : await onCriar(form);
    if (r.success) onFechar();
    else setErro(r.error ?? 'não foi possível salvar');
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{construtora ? `Editar ${construtora.nome}` : 'Nova construtora'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-nome">Nome</Label>
            <Input
              id="c-nome"
              value={form.nome}
              onChange={(e) => {
                const nome = e.target.value;
                // O código acompanha o nome só enquanto é novo: depois de
                // criado ele é a identidade e renomear não pode quebrar o
                // vínculo dos lançamentos.
                campo('nome', nome);
                if (!construtora) campo('codigo', codigoDaConstrutora(nome));
              }}
            />
            {construtora && (
              <p className="text-[11px] font-mono text-muted-foreground">{construtora.codigo}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-razao">Razão social</Label>
            <Input id="c-razao" value={form.razaoSocial ?? ''} onChange={(e) => campo('razaoSocial', e.target.value || null)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-resp">Responsável</Label>
              <Input id="c-resp" value={form.responsavelNome ?? ''} onChange={(e) => campo('responsavelNome', e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tel">Telefone</Label>
              <Input id="c-tel" value={form.responsavelTelefone ?? ''} onChange={(e) => campo('responsavelTelefone', e.target.value || null)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-email">E-mail</Label>
            <Input id="c-email" type="email" value={form.responsavelEmail ?? ''} onChange={(e) => campo('responsavelEmail', e.target.value || null)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {podeVerComissao && (
              <div className="space-y-1.5">
                <Label htmlFor="c-comissao">Comissão padrão (%)</Label>
                <Input
                  id="c-comissao"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.comissaoPadraoPct ?? ''}
                  onChange={(e) => campo('comissaoPadraoPct', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="c-prazo">Prazo de pagamento (dias)</Label>
              <Input
                id="c-prazo"
                type="number"
                min="0"
                value={form.prazoPagamentoDias ?? ''}
                onChange={(e) => campo('prazoPagamentoDias', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-nota">Dados para nota fiscal</Label>
            <Textarea id="c-nota" rows={2} value={form.dadosNota ?? ''} onChange={(e) => campo('dadosNota', e.target.value || null)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-obs">Observação</Label>
            <Textarea id="c-obs" rows={2} value={form.observacao ?? ''} onChange={(e) => campo('observacao', e.target.value || null)} />
          </div>

          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={form.ativa} onCheckedChange={(v) => campo('ativa', v === true)} />
              Ativa
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={form.eAvulso} onCheckedChange={(v) => campo('eAvulso', v === true)} />
              Parceria avulsa
            </label>
          </div>

          {erro && <p className="text-[13px] text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !form.nome.trim()}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
