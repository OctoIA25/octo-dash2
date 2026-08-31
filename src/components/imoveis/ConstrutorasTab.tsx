/**
 * Aba Construtoras — catálogo de lançamentos das construtoras da região,
 * lido da planilha-espelho pública no Google Sheets (ver useConstrutorasCatalogo).
 * Somente leitura: a edição acontece na planilha operacional da equipe.
 */

import { useMemo, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, RefreshCw, Search, Youtube } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  EmpreendimentoCatalogo,
  isLink,
  useConstrutorasCatalogo,
} from '@/features/imoveis/hooks/useConstrutorasCatalogo';

const LINKS_MATERIAIS: { key: keyof EmpreendimentoCatalogo; label: string; icon: typeof FileText }[] = [
  { key: 'book', label: 'Book', icon: FileText },
  { key: 'decorado', label: 'Decorado', icon: ImageIcon },
  { key: 'fotos', label: 'Fotos', icon: ImageIcon },
  { key: 'landing_page', label: 'Landing page', icon: ExternalLink },
  { key: 'youtube', label: 'Youtube', icon: Youtube },
  { key: 'folhetos', label: 'Folhetos', icon: FileText },
];

const CAMPOS_DETALHE: { key: keyof EmpreendimentoCatalogo; label: string }[] = [
  { key: 'endereco', label: 'Endereço' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'previsao_entrega', label: 'Previsão de entrega' },
  { key: 'unidades', label: 'Lotes/unidades' },
  { key: 'valor', label: 'Valor' },
  { key: 'vagas', label: 'Vagas' },
  { key: 'dormitorios', label: 'Dormitórios' },
  { key: 'suites', label: 'Suítes' },
  { key: 'garden', label: 'Garden' },
  { key: 'comissao', label: 'Comissão' },
  { key: 'condominio', label: 'Condomínio' },
  { key: 'iptu', label: 'IPTU' },
  { key: 'atualizado_em', label: 'Atualizado em' },
];

/** Ícones de materiais (book/fotos/...) cujo valor na planilha é uma URL. */
function MaterialLinks({ empreendimento }: { empreendimento: EmpreendimentoCatalogo }) {
  const links = LINKS_MATERIAIS.filter(({ key }) => isLink(empreendimento[key]));
  if (links.length === 0) return <span className="text-text-secondary">-</span>;
  return (
    <div className="flex items-center gap-1">
      {links.map(({ key, label, icon: Icon }) => (
        <a
          key={key}
          href={empreendimento[key]}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-muted transition-colors"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

export function ConstrutorasTab() {
  const { data: catalogo = [], isLoading, isError, refetch, isRefetching } = useConstrutorasCatalogo();

  const [searchTerm, setSearchTerm] = useState('');
  const [construtoraFilter, setConstrutoraFilter] = useState('todas');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [selecionado, setSelecionado] = useState<EmpreendimentoCatalogo | null>(null);

  const construtoras = useMemo(
    () =>
      [...new Set(catalogo.map((e) => e.construtora).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [catalogo],
  );

  const tipos = useMemo(
    () =>
      [...new Set(catalogo.map((e) => e.tipo).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [catalogo],
  );

  const filtrados = useMemo(() => {
    const busca = searchTerm.trim().toLowerCase();
    return catalogo.filter((e) => {
      if (construtoraFilter !== 'todas' && e.construtora !== construtoraFilter) return false;
      if (tipoFilter !== 'todos' && e.tipo !== tipoFilter) return false;
      if (!busca) return true;
      return [e.construtora, e.empreendimento, e.bairro, e.cidade, e.endereco]
        .some((campo) => campo.toLowerCase().includes(busca));
    });
  }, [catalogo, searchTerm, construtoraFilter, tipoFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <OctoDashLoader />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-10 text-center space-y-3">
        <p className="text-text-primary font-medium">Catálogo indisponível no momento</p>
        <p className="text-sm text-text-secondary">
          Não foi possível carregar a planilha de lançamentos das construtoras.
        </p>
        <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 w-full lg:w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              placeholder="Empreendimento, construtora, bairro ou cidade"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={construtoraFilter} onValueChange={setConstrutoraFilter}>
            <SelectTrigger className="w-full lg:w-[220px]">
              <SelectValue placeholder="Construtora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as construtoras</SelectItem>
              {construtoras.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-full lg:w-[220px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="secondary" className="shrink-0 lg:ml-auto">
            {filtrados.length} de {catalogo.length}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Construtora</TableHead>
              <TableHead>Empreendimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Previsão de entrega</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Atualizado em</TableHead>
              <TableHead>Materiais</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((e, i) => (
              <TableRow
                key={`${e.construtora}-${e.empreendimento}-${i}`}
                className="cursor-pointer"
                onClick={() => setSelecionado(e)}
              >
                <TableCell className="whitespace-nowrap">{e.construtora || '-'}</TableCell>
                <TableCell className="font-medium text-text-primary">{e.empreendimento}</TableCell>
                <TableCell className="whitespace-nowrap">{e.tipo || '-'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {[e.bairro, e.cidade].filter(Boolean).join(' · ') || '-'}
                </TableCell>
                <TableCell className="max-w-[220px] truncate" title={e.previsao_entrega}>
                  {e.previsao_entrega || '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">{e.valor || '-'}</TableCell>
                <TableCell className="whitespace-nowrap" title={e.atualizado_em}>
                  {/* Só a data; hora completa no title e no modal */}
                  {e.atualizado_em ? e.atualizado_em.split(' ')[0] : '-'}
                </TableCell>
                <TableCell>
                  <MaterialLinks empreendimento={e} />
                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-text-secondary">
                  Nenhum empreendimento encontrado com os filtros atuais.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selecionado)} onOpenChange={(open) => !open && setSelecionado(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle>{selecionado.empreendimento}</DialogTitle>
                <p className="text-sm text-text-secondary">
                  {[selecionado.construtora, selecionado.tipo].filter(Boolean).join(' · ')}
                </p>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {CAMPOS_DETALHE.filter(({ key }) => selecionado[key]).map(({ key, label }) => (
                  <div key={key} className="flex justify-between gap-4 border-b border-border/60 py-1.5">
                    <span className="text-text-secondary shrink-0">{label}</span>
                    <span className="text-text-primary text-right">{selecionado[key]}</span>
                  </div>
                ))}
              </div>

              {selecionado.descricao && (
                <p className="text-sm text-text-secondary whitespace-pre-line">
                  {selecionado.descricao}
                </p>
              )}

              <MaterialLinks empreendimento={selecionado} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
