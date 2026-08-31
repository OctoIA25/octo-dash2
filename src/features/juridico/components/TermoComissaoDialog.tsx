import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import type { SavedProposal } from '@/features/leads/services/proposalsService';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';
import {
  generateTermoComissao,
  valorPorExtenso,
  numeroPorExtenso,
  formatBRL,
  mesPorExtenso,
  type TermoComissaoData,
} from '../services/termoComissaoService';

interface TermoComissaoDialogProps {
  proposal: SavedProposal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const parseAmount = (value: number | string | null | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePtNumber = (value: string) => {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Extenso de percentual aceitando decimais: "3,5" → "três vírgula cinco". */
const pctPorExtenso = (pct: string) => {
  const normalized = pct.replace(',', '.').trim();
  if (!normalized || !Number.isFinite(Number(normalized))) return '';
  const [inteiro, decimal] = normalized.split('.');
  const partes = [numeroPorExtenso(Number(inteiro))];
  if (decimal && Number(decimal) > 0) {
    partes.push('vírgula', decimal.split('').map((d) => numeroPorExtenso(Number(d))).join(' '));
  }
  return partes.join(' ');
};

const buildAddress = (proposal: SavedProposal) => {
  const street = [proposal.logradouro, proposal.numero].filter(Boolean).join(', ');
  const complement = proposal.complemento ? `, ${proposal.complemento}` : '';
  const city = [proposal.cidade, proposal.uf].filter(Boolean).join(' - ');
  const cep = proposal.cep ? `CEP ${proposal.cep}` : '';
  return [
    proposal.property_reference ? `Unidade ${proposal.property_reference}` : '',
    street ? `${street}${complement}` : '',
    proposal.bairro,
    city,
    cep,
  ]
    .filter(Boolean)
    .join(', ');
};

export function TermoComissaoDialog({ proposal, open, onOpenChange }: TermoComissaoDialogProps) {
  const { tenantId } = useAuthContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [creci1, setCreci1] = useState('');

  const buyers = useMemo(
    () => proposal.parties.filter((party) => party.party_type === 'comprador'),
    [proposal.parties],
  );

  const valorVenda = parseAmount(proposal.value);
  const hoje = useMemo(() => new Date(), []);

  const [form, setForm] = useState({
    comprador1_nome: '',
    comprador1_cpf: '',
    comprador1_email: '',
    comprador2_nome: '',
    comprador2_cpf: '',
    comprador2_email: '',
    data_dia: '',
    data_mes: '',
    data_ano: '',
    imovel_descricao: '',
    valor_venda: '',
    comissao_pct: '',
    lotus_pct: '',
    corretor1_pct: '',
    corretor1_nome: '',
    corretor1_creci: '',
    corretor2_pct: '',
    corretor2_nome: '',
    corretor2_creci: '',
    lotus_banco_agencia_conta: '',
    lotus_pagamento_data: '',
    corretor1_pgto_cpf: '',
    corretor1_pix: '',
    corretor1_pgto_data: '',
    corretor2_pgto_cpf: '',
    corretor2_pix: '',
    corretor2_pgto_data: '',
  });

  // Pré-preenche a partir da proposta sempre que o dialog abre
  useEffect(() => {
    if (!open) return;
    setForm((prev) => ({
      ...prev,
      comprador1_nome: buyers[0]?.full_name || '',
      comprador1_cpf: buyers[0]?.cpf || '',
      comprador1_email: buyers[0]?.email || '',
      comprador2_nome: buyers[1]?.full_name || '',
      comprador2_cpf: buyers[1]?.cpf || '',
      comprador2_email: buyers[1]?.email || '',
      data_dia: String(hoje.getDate()),
      data_mes: mesPorExtenso(hoje.getMonth()),
      data_ano: String(hoje.getFullYear()),
      imovel_descricao: buildAddress(proposal),
      valor_venda: valorVenda ? formatBRL(valorVenda) : '',
      corretor1_nome: proposal.agent_name || '',
    }));
  }, [open, proposal, buyers, valorVenda, hoje]);

  // CRECI do corretor da proposta (a RPC de membros não retorna colunas novas; o service já resolve via creciMap)
  useEffect(() => {
    if (!open || !tenantId || tenantId === 'owner') return;
    let cancelled = false;
    fetchTenantMembers(tenantId)
      .then((members) => {
        if (cancelled) return;
        const match = proposal.agent_user_id
          ? members.find((m) => m.user_id === proposal.agent_user_id)
          : undefined;
        if (match?.creci) setCreci1(match.creci);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, proposal.agent_user_id]);

  useEffect(() => {
    if (creci1) setForm((prev) => (prev.corretor1_creci ? prev : { ...prev, corretor1_creci: creci1 }));
  }, [creci1]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const valorNum = parsePtNumber(form.valor_venda);
  const valorFromPct = (pct: string) => {
    const p = Number(pct.replace(',', '.'));
    return Number.isFinite(p) && p > 0 && valorNum > 0 ? (valorNum * p) / 100 : 0;
  };

  const comissaoValor = valorFromPct(form.comissao_pct);
  const lotusValor = valorFromPct(form.lotus_pct);
  const corretor1Valor = valorFromPct(form.corretor1_pct);
  const corretor2Valor = valorFromPct(form.corretor2_pct);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Descrição ocupa as 2 lacunas do documento; quebra na última palavra inteira que couber
      const descricao = form.imovel_descricao.trim().replace(/\s+/g, ' ');
      let linha1 = descricao;
      let linha2 = '';
      if (descricao.length > 95) {
        const cut = descricao.lastIndexOf(' ', 95);
        linha1 = descricao.slice(0, cut > 0 ? cut : 95);
        linha2 = descricao.slice(cut > 0 ? cut + 1 : 95);
      }

      const money = (v: number) => (v > 0 ? formatBRL(v) : '');
      const moneyExt = (v: number) => (v > 0 ? valorPorExtenso(v) : '');

      const data: TermoComissaoData = {
        comprador1_nome: form.comprador1_nome,
        comprador1_cpf: form.comprador1_cpf,
        comprador1_email: form.comprador1_email,
        comprador2_nome: form.comprador2_nome,
        comprador2_cpf: form.comprador2_cpf,
        comprador2_email: form.comprador2_email,
        data_dia: form.data_dia,
        data_mes: form.data_mes,
        data_ano: form.data_ano,
        imovel_descricao1: linha1,
        imovel_descricao2: linha2,
        valor_venda: money(valorNum),
        valor_venda_extenso: moneyExt(valorNum),
        comissao_pct: form.comissao_pct,
        comissao_pct_extenso: pctPorExtenso(form.comissao_pct),
        comissao_valor: money(comissaoValor),
        comissao_valor_extenso: moneyExt(comissaoValor),
        lotus_pct: form.lotus_pct,
        lotus_valor: money(lotusValor),
        corretor1_pct: form.corretor1_pct,
        corretor1_valor: money(corretor1Valor),
        corretor1_nome: form.corretor1_nome,
        corretor1_creci: form.corretor1_creci,
        corretor2_pct: form.corretor2_pct,
        corretor2_valor: money(corretor2Valor),
        corretor2_nome: form.corretor2_nome,
        corretor2_creci: form.corretor2_creci,
        lotus_banco_agencia_conta: form.lotus_banco_agencia_conta,
        lotus_pagamento_valor: money(lotusValor),
        lotus_pagamento_data: form.lotus_pagamento_data,
        corretor1_pgto_valor: money(corretor1Valor),
        corretor1_pgto_valor_extenso: moneyExt(corretor1Valor),
        corretor1_pgto_nome: form.corretor1_nome,
        corretor1_pgto_cpf: form.corretor1_pgto_cpf,
        corretor1_pix: form.corretor1_pix,
        corretor1_pgto_data: form.corretor1_pgto_data,
        corretor2_pgto_valor: money(corretor2Valor),
        corretor2_pgto_valor_extenso: moneyExt(corretor2Valor),
        corretor2_pgto_nome: form.corretor2_nome,
        corretor2_pgto_cpf: form.corretor2_pgto_cpf,
        corretor2_pix: form.corretor2_pix,
        corretor2_pgto_data: form.corretor2_pgto_data,
      };

      const clientSlug = (form.comprador1_nome || 'cliente')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\w-]/g, '')
        .toUpperCase();
      await generateTermoComissao(data, `TERMO_COMISSAO_${clientSlug}.docx`);
      toast.success('Termo de comissão gerado com sucesso');
      onOpenChange(false);
    } catch (error) {
      console.error('[termo-comissao] falha ao gerar', error);
      toast.error('Não foi possível gerar o termo. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar termo de comissão</DialogTitle>
          <DialogDescription>
            Revise os dados pré-preenchidos. Campos deixados em branco saem como lacunas no documento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Section title="Comprador 1">
            <Field label="Nome completo" value={form.comprador1_nome} onChange={set('comprador1_nome')} className="sm:col-span-2" />
            <Field label="CPF" value={form.comprador1_cpf} onChange={set('comprador1_cpf')} />
            <Field label="E-mail" value={form.comprador1_email} onChange={set('comprador1_email')} />
          </Section>

          <Section title="Comprador 2 (opcional)">
            <Field label="Nome completo" value={form.comprador2_nome} onChange={set('comprador2_nome')} className="sm:col-span-2" />
            <Field label="CPF" value={form.comprador2_cpf} onChange={set('comprador2_cpf')} />
            <Field label="E-mail" value={form.comprador2_email} onChange={set('comprador2_email')} />
          </Section>

          <Section title="Negócio">
            <Field label="Dia" value={form.data_dia} onChange={set('data_dia')} />
            <Field label="Mês (por extenso)" value={form.data_mes} onChange={set('data_mes')} />
            <Field label="Ano" value={form.data_ano} onChange={set('data_ano')} />
            <div className="sm:col-span-3">
              <Label className="text-xs">Descrição do imóvel (unidade/lote, quadra, matrícula, cartório, endereço)</Label>
              <Textarea rows={2} value={form.imovel_descricao} onChange={set('imovel_descricao')} className="mt-1" />
            </div>
            <Field label="Valor da venda (R$)" value={form.valor_venda} onChange={set('valor_venda')} />
            {valorNum > 0 && (
              <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">{valorPorExtenso(valorNum)}</p>
            )}
          </Section>

          <Section title="Comissão">
            <Field label="% total" value={form.comissao_pct} onChange={set('comissao_pct')} placeholder="ex.: 5" />
            <Derived label="Valor total" value={comissaoValor} />
            <div />
            <Field label="% Lotus" value={form.lotus_pct} onChange={set('lotus_pct')} />
            <Derived label="Valor Lotus" value={lotusValor} />
          </Section>

          <Section title="Corretor(a) 1">
            <Field label="Nome" value={form.corretor1_nome} onChange={set('corretor1_nome')} />
            <Field label="CRECI/SP" value={form.corretor1_creci} onChange={set('corretor1_creci')} />
            <Field label="%" value={form.corretor1_pct} onChange={set('corretor1_pct')} />
            <Derived label="Valor" value={corretor1Valor} />
            <Field label="CPF/CNPJ" value={form.corretor1_pgto_cpf} onChange={set('corretor1_pgto_cpf')} />
            <Field label="Chave PIX" value={form.corretor1_pix} onChange={set('corretor1_pix')} />
            <Field label="Data pgto (dd/mm/aaaa)" value={form.corretor1_pgto_data} onChange={set('corretor1_pgto_data')} />
          </Section>

          <Section title="Corretor(a) 2 (opcional)">
            <Field label="Nome" value={form.corretor2_nome} onChange={set('corretor2_nome')} />
            <Field label="CRECI/SP" value={form.corretor2_creci} onChange={set('corretor2_creci')} />
            <Field label="%" value={form.corretor2_pct} onChange={set('corretor2_pct')} />
            <Derived label="Valor" value={corretor2Valor} />
            <Field label="CPF/CNPJ" value={form.corretor2_pgto_cpf} onChange={set('corretor2_pgto_cpf')} />
            <Field label="Chave PIX" value={form.corretor2_pix} onChange={set('corretor2_pix')} />
            <Field label="Data pgto (dd/mm/aaaa)" value={form.corretor2_pgto_data} onChange={set('corretor2_pgto_data')} />
          </Section>

          <Section title="Pagamento Lotus">
            <Field label="Banco / Agência / Conta" value={form.lotus_banco_agencia_conta} onChange={set('lotus_banco_agencia_conta')} className="sm:col-span-2" />
            <Field label="Data pgto (dd/mm/aaaa)" value={form.lotus_pagamento_data} onChange={set('lotus_pagamento_data')} />
          </Section>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Gerar .docx
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={onChange} placeholder={placeholder} className="mt-1 h-9" />
    </div>
  );
}

function Derived({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <p className="mt-1 flex h-9 items-center rounded-md border border-dashed border-slate-200 px-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
        {value > 0 ? `R$ ${formatBRL(value)}` : '—'}
      </p>
    </div>
  );
}
