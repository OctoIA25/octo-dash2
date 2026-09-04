/**
 * Planilha de Clientes Proprietários.
 *
 * Fonte única e real: os proprietários preenchidos no cadastro de imóveis
 * (CriarImovelForm → imoveis_locais). Uma linha por pessoa, com todos os
 * imóveis dela agrupados; o clique abre a ficha completa.
 *
 * Mesmo formato da aba Construtoras (busca + filtro + tabela + modal).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Mail, Phone, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ProprietarioRow,
  listarProprietarios,
} from '@/features/imoveis/services/proprietarioService';

const moeda = (v: number) =>
  v > 0
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '-';

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');

interface ProprietariosPlanilhaProps {
  /** Sub-aba ativa: vendedor mostra quem tem imóvel à venda; locatário, à locação. */
  tipo?: 'vendedor' | 'locatario';
}

export function ProprietariosPlanilha({ tipo = 'vendedor' }: ProprietariosPlanilhaProps) {
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  const { data: proprietarios = [], isLoading } = useQuery({
    queryKey: ['proprietarios-planilha', tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => listarProprietarios(tenantId as string),
  });

  const [busca, setBusca] = useState('');
  const [cidadeFiltro, setCidadeFiltro] = useState('todas');
  const [selecionado, setSelecionado] = useState<ProprietarioRow | null>(null);

  const doTipo = useMemo(
    () =>
      proprietarios.filter((p) =>
        tipo === 'locatario' ? p.imoveis_locacao > 0 : p.imoveis_venda > 0,
      ),
    [proprietarios, tipo],
  );

  const cidades = useMemo(
    () =>
      [...new Set(doTipo.flatMap((p) => p.cidades))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [doTipo],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return doTipo.filter((p) => {
      if (cidadeFiltro !== 'todas' && !p.cidades.includes(cidadeFiltro)) return false;
      if (!termo) return true;
      return [p.nome, p.telefone, p.email, ...p.bairros, ...p.cidades]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo));
    });
  }, [doTipo, busca, cidadeFiltro]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <OctoDashLoader />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 w-full lg:w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              placeholder="Nome, telefone, e-mail, bairro ou cidade"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={cidadeFiltro} onValueChange={setCidadeFiltro}>
            <SelectTrigger className="w-full lg:w-[220px]">
              <SelectValue placeholder="Cidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as cidades</SelectItem>
              {cidades.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="secondary" className="shrink-0 lg:ml-auto">
            {filtrados.length} de {doTipo.length}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proprietário</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="text-right">Imóveis</TableHead>
              <TableHead className="text-right">Exclusivos</TableHead>
              <TableHead>Local</TableHead>
              <TableHead className="text-right">
                {tipo === 'locatario' ? 'Locação / mês' : 'Portfólio'}
              </TableHead>
              <TableHead>Último cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((p) => (
              <TableRow
                key={p.chave}
                className="cursor-pointer"
                onClick={() => setSelecionado(p)}
              >
                <TableCell className="font-medium text-text-primary">{p.nome}</TableCell>
                <TableCell className="whitespace-nowrap">{p.telefone || '-'}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={p.email ?? ''}>
                  {p.email || '-'}
                </TableCell>
                <TableCell className="text-right">
                  {tipo === 'locatario' ? p.imoveis_locacao : p.imoveis_venda}
                  {p.total_imoveis > (tipo === 'locatario' ? p.imoveis_locacao : p.imoveis_venda) && (
                    <span className="text-text-secondary"> / {p.total_imoveis}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{p.exclusivos || '-'}</TableCell>
                <TableCell className="max-w-[240px] truncate" title={[...p.bairros, ...p.cidades].join(', ')}>
                  {[p.bairros.join(', '), p.cidades.join(', ')].filter(Boolean).join(' · ') || '-'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {moeda(tipo === 'locatario' ? p.valor_locacao_total : p.valor_venda_total)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{data(p.ultimo_cadastro)}</TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-text-secondary">
                  {proprietarios.length === 0
                    ? 'Nenhum proprietário cadastrado ainda. Os dados vêm da seção "Proprietário" do cadastro de imóveis.'
                    : 'Nenhum proprietário encontrado com os filtros atuais.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selecionado)} onOpenChange={(open) => !open && setSelecionado(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle>{selecionado.nome}</DialogTitle>
                <p className="text-sm text-text-secondary">
                  {selecionado.total_imoveis}{' '}
                  {selecionado.total_imoveis === 1 ? 'imóvel cadastrado' : 'imóveis cadastrados'}
                  {selecionado.exclusivos > 0 && ` · ${selecionado.exclusivos} exclusivo(s)`}
                </p>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  { label: 'Celular', valor: selecionado.telefone, icone: Phone },
                  { label: 'Tel. residencial', valor: selecionado.tel_residencial, icone: Phone },
                  { label: 'Tel. comercial', valor: selecionado.tel_comercial, icone: Phone },
                  { label: 'E-mail', valor: selecionado.email, icone: Mail },
                ]
                  .filter((c) => c.valor)
                  .map(({ label, valor, icone: Icone }) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-border/60 py-1.5">
                      <span className="text-text-secondary shrink-0 flex items-center gap-1.5">
                        <Icone className="h-3.5 w-3.5" />
                        {label}
                      </span>
                      <span className="text-text-primary text-right break-all">{valor}</span>
                    </div>
                  ))}
                <div className="flex justify-between gap-4 border-b border-border/60 py-1.5">
                  <span className="text-text-secondary shrink-0">Valor em venda</span>
                  <span className="text-text-primary">{moeda(selecionado.valor_venda_total)}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/60 py-1.5">
                  <span className="text-text-secondary shrink-0">Valor em locação</span>
                  <span className="text-text-primary">{moeda(selecionado.valor_locacao_total)}</span>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead className="text-right">Venda</TableHead>
                      <TableHead className="text-right">Locação</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selecionado.imoveis.map((i) => (
                      <TableRow key={i.codigo_imovel}>
                        <TableCell className="whitespace-nowrap font-medium text-text-primary">
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            {i.codigo_imovel}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{i.tipo || '-'}</TableCell>
                        <TableCell className="max-w-[260px] truncate">
                          {[[i.logradouro, i.numero].filter(Boolean).join(', '), i.bairro, i.cidade]
                            .filter(Boolean)
                            .join(' · ') || '-'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{moeda(i.valor_venda ?? 0)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{moeda(i.valor_locacao ?? 0)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {i.exclusivo && <Badge variant="secondary" className="mr-1">Exclusivo</Badge>}
                          {i.status_aprovacao || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
