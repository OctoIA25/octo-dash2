/**
 * Nova venda à mão — pedido de 03/10: Diretoria, admin e Gerente lançam na
 * Conferência a venda que não passou por proposta no CRM.
 *
 * A comissão é a NEGOCIADA, digitada em reais; o % sai dela (comissão ÷ VGV),
 * a mesma regra da venda que nasce da proposta (20261014). Sem previsão de
 * recebimento a venda entra mesmo assim — e a projeção a mostra em
 * "Atrasado / sem data" até alguém pôr a data.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import { hojeSP } from '@/lib/dataSP';
import { parseNumeric } from '@/features/relatorios/import/generic/metadataDiscovery';
import { criarVenda } from './vendasService';
import type { PessoaDoRepasse } from './vendas';

const inputCls = 'h-8 w-full rounded-md border bg-background px-2 text-xs';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

export function NovaVendaModal({ tenantId, equipe, empreendimentos, onFechar, onCriou }: {
  tenantId: string;
  equipe: PessoaDoRepasse[];
  empreendimentos: Array<{ id: string; nome: string }>;
  onFechar: () => void;
  onCriou: () => void;
}) {
  const { toast } = useToast();
  useEscapeFecha(onFechar);

  const [dataVenda, setDataVenda] = useState(hojeSP);
  const [lancamentoId, setLancamentoId] = useState('');
  const [empreendimento, setEmpreendimento] = useState('');
  const [corretorId, setCorretorId] = useState('');
  const [cliente, setCliente] = useState('');
  const [vgv, setVgv] = useState('');
  const [comissao, setComissao] = useState('');
  const [previstoEm, setPrevistoEm] = useState('');

  const criar = useMutation({
    mutationFn: () => {
      const valorComissao = parseNumeric(comissao);
      if (!valorComissao || valorComissao <= 0) throw new Error('Informe a comissão negociada.');
      if (!lancamentoId && !empreendimento.trim()) throw new Error('Escolha o empreendimento ou escreva o imóvel.');
      const corretor = equipe.find((p) => p.user_id === corretorId);
      return criarVenda(tenantId, {
        dataVenda,
        lancamentoId: lancamentoId || null,
        empreendimento: lancamentoId ? '' : empreendimento.trim(),
        corretorId: corretorId || null,
        corretorNome: corretor?.nome ?? '',
        cliente: cliente.trim(),
        vgv: parseNumeric(vgv) ?? 0,
        comissao: valorComissao,
        previstoEm: previstoEm || null,
      });
    },
    onSuccess: () => { toast({ title: 'Venda criada' }); onCriou(); },
    onError: (e: Error) => toast({ title: 'Não deu para criar a venda', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar} role="presentation">
      <form
        className="w-full max-w-md space-y-3 rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); criar.mutate(); }}
        role="dialog"
        aria-label="Nova venda"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nova venda</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Data da venda">
            <input type="date" required max={hojeSP()} value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Empreendimento">
            <select value={lancamentoId} onChange={(e) => setLancamentoId(e.target.value)} className={inputCls}>
              <option value="">Terceiros / pronto</option>
              {empreendimentos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
          {!lancamentoId && (
            <div className="col-span-2">
              <Campo rotulo="Imóvel">
                <input value={empreendimento} onChange={(e) => setEmpreendimento(e.target.value)}
                  placeholder="ex.: Apto Centro, cód. L045" className={inputCls} />
              </Campo>
            </div>
          )}
          <Campo rotulo="Corretor">
            <select value={corretorId} onChange={(e) => setCorretorId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {equipe.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Cliente">
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="VGV">
            <input inputMode="decimal" value={vgv} placeholder="500.000,00" onChange={(e) => setVgv(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Comissão negociada">
            <input inputMode="decimal" required value={comissao} placeholder="25.000,00"
              onChange={(e) => setComissao(e.target.value)} className={inputCls} />
          </Campo>
          <div className="col-span-2">
            <Campo rotulo="Previsão de recebimento (à vista — para parcelar, abra a venda depois)">
              <input type="date" value={previstoEm} onChange={(e) => setPrevistoEm(e.target.value)} className={inputCls} />
            </Campo>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} className="px-3 text-xs text-muted-foreground">Cancelar</button>
          <button type="submit" disabled={criar.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {criar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Criar venda
          </button>
        </div>
      </form>
    </div>
  );
}
