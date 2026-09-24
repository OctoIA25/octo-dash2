/**
 * Aba Construtoras.
 *
 * QUEM É CADA CONSTRUTORA vem do CRM (tabela `construtoras`), por decisão do
 * chefe em 18/09/2026. Antes os cards saíam do texto exato da planilha, e por
 * isso "Tebas" e "tebas" viravam dois cards — e "Sebel" e "SEBEL
 * EMPREENDIMENTOS", que normalização nenhuma junta, viravam outros dois.
 * Renomear no cadastro agora renomeia o card e a coluna da tabela.
 *
 * O DETALHE DO EMPREENDIMENTO (tipo, valor, materiais) continua vindo da
 * planilha-espelho até o item das tipologias migrar esses dados para a Dash.
 * As linhas são atribuídas à construtora do cadastro pelo nome normalizado; o
 * que não casa com ninguém fica num grupo visível de "fora do cadastro", em
 * vez de sumir.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { ExternalLink, FileText, Image as ImageIcon, RefreshCw, Search, Youtube } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { Pencil } from 'lucide-react';
import { useConstrutoras } from '@/features/imoveis/hooks/useConstrutoras';
import { ConstrutoraFormDialog } from '@/features/imoveis/components/ConstrutoraFormDialog';
import { oQueFaltaNaConstrutora, type Construtora } from '@/features/imoveis/services/construtorasService';

/** Mesma regra do banco (normalizar_texto): sem acento, minúscula, espaços colapsados. */
const chaveDoNome = (t: string) =>
  (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
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
  // `youtube` e `folhetos` saíram em 23/09: eram consequência do cabeçalho
  // deslocado — as posições que o código lia com esses nomes não existem na
  // planilha operacional. Os links de vídeo e folheto que apareciam ali eram,
  // na verdade, outros campos.
];

const CAMPOS_DETALHE: { key: keyof EmpreendimentoCatalogo; label: string }[] = [
  // O código do empreendimento existia na planilha desde sempre e nunca
  // chegava à tela: era ele que o sistema lia como se fosse o tipo do imóvel.
  { key: 'codigo', label: 'Código na Dash' },
  { key: 'endereco', label: 'Endereço' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'previsao_entrega', label: 'Previsão de entrega' },
  { key: 'unidades', label: 'Lotes/unidades' },
  { key: 'valor', label: 'Valor' },
  { key: 'vagas', label: 'Vagas' },
  { key: 'dormitorios', label: 'Dormitórios' },
  { key: 'suites', label: 'Suítes' },
  // `Garden` está VAZIA nas 84 linhas da planilha, medido em 23/09. Mantida na
  // tela por enquanto: a coluna existe na operacional e a equipe pode começar
  // a preenchê-la — diferente de `condominio`/`iptu`, que saíram porque nem
  // posição tinham.
  { key: 'garden', label: 'Garden' },
  // COMISSÃO FORA DA TELA, de propósito, por decisão do chefe em 18/09/2026.
  //
  // Enquanto esta aba se alimentar da planilha do Google, a comissão é um dado
  // comercial numa URL aberta: quem tem o endereço lê, sem login. Tirar a
  // coluna não fecha a planilha — fecha a exposição a todo corretor que abre a
  // aba, que é o alcance que dá para resolver daqui.
  //
  // Ela volta quando a aba passar a ler o cadastro `construtoras`, onde a
  // comissão é protegida pelo próprio banco: fica fora do SELECT do navegador
  // e só sai pela RPC `construtoras_comissao`, que confere o cargo.
  // `Condomínio` e `IPTU` saíram em 23/09 pelo mesmo motivo do Youtube: o que
  // a tela mostrava nesses campos vinha de posições deslocadas. As colunas
  // existem na operacional e estão vazias nas 84 linhas — voltam quando
  // tiverem dado.
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
  const [editando, setEditando] = useState<Construtora | null>(null);
  const [criando, setCriando] = useState(false);

  // Quem é cada construtora vem do CRM.
  const {
    construtoras: cadastro,
    comissoes,
    cnpjs,
    salvando,
    erro: erroCadastro,
    criar: criarConstrutora,
    atualizar: atualizarConstrutora,
    salvarCnpj,
  } = useConstrutoras();

  /*
   * Nome E APELIDOS apontando para o mesmo código.
   *
   * Sem os apelidos, "APLAUSI" não acha "Applausi" e "GRUPO ZARIN" não acha
   * "Zarin": 12 das 82 linhas da planilha caem em "fora do cadastro" com o
   * cadastro inteiro certo — e quem olha conclui que falta cadastrar.
   *
   * O nome canônico entra por último: se um apelido disputar a chave com o
   * nome de outra construtora, quem tem o nome de verdade ganha.
   */
  const codigoPorChave = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cadastro) for (const a of c.aliases) m.set(chaveDoNome(a), c.codigo);
    for (const c of cadastro) m.set(chaveDoNome(c.nome), c.codigo);
    return m;
  }, [cadastro]);

  /*
   * O QUE FALTA em cada construtora — o marcador vermelho que o chefe pediu
   * em 24/09, para ir preenchendo uma a uma.
   *
   * Os três campos são os que o sistema de fato precisa: CNPJ e razão social
   * são o tomador da nota fiscal (o P4.6 já lista "falta o CNPJ da X"), e o
   * responsável é com quem se fala.
   *
   * A COMISSÃO fica de fora de propósito. O banco não a concede a todo mundo,
   * então um marcador que a considerasse acenderia para uns e não para outros
   * — e um marcador que muda conforme quem olha não serve para ir preenchendo.
   */
  const faltaEm = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of cadastro) {
      const falta = oQueFaltaNaConstrutora(c, cnpjs.get(c.id));
      if (falta.length) m.set(c.codigo, falta);
    }
    return m;
  }, [cadastro, cnpjs]);

  const { user } = useAuth();
  const tenantId = user?.tenantId;

  // Lançamentos do tenant (aba Lançamentos), para linkar o item do catálogo
  // à página /imoveis/lancamentos/:id pelo nome.
  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos-nomes', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, nome')
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const lancamentoIdPorNome = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lancamentos) map.set(l.nome.trim().toLowerCase(), l.id);
    return map;
  }, [lancamentos]);

  // Clique na linha: se o empreendimento existe na aba Lançamentos, abre a
  // página dele em nova guia; senão, mostra o modal com os dados da planilha.
  const abrirLancamento = (e: EmpreendimentoCatalogo) => {
    const id = lancamentoIdPorNome.get(e.empreendimento.trim().toLowerCase());
    if (id) window.open(`/imoveis/lancamentos/${id}`, '_blank', 'noopener');
    else setSelecionado(e);
  };

  // Um card por construtora CADASTRADA. O texto da planilha é atribuído pelo
  // nome normalizado — é o que junta "Tebas" e "tebas" num card só.
  const construtoras = useMemo(() => {
    const porCodigo = new Map<string, { nome: string; total: number; cidades: Set<string>; cadastro: Construtora | null }>();
    for (const c of cadastro) {
      porCodigo.set(c.codigo, { nome: c.nome, total: 0, cidades: new Set(), cadastro: c });
    }
    const FORA = '__fora_do_cadastro__';
    for (const e of catalogo) {
      if (!e.construtora) continue;
      const codigo = codigoPorChave.get(chaveDoNome(e.construtora)) ?? FORA;
      if (!porCodigo.has(codigo)) {
        porCodigo.set(codigo, { nome: 'Fora do cadastro', total: 0, cidades: new Set(), cadastro: null });
      }
      const atual = porCodigo.get(codigo)!;
      atual.total += 1;
      if (e.cidade) atual.cidades.add(e.cidade);
    }

    return [...porCodigo.entries()]
      .map(([codigo, { nome, total, cidades, cadastro: c }]) => ({
        codigo,
        nome,
        total,
        cadastro: c,
        cidades: [...cidades].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      }))
      // O grupo "fora do cadastro" vai para o fim: ele é pendência, não catálogo.
      .sort((a, b) =>
        a.cadastro === b.cadastro ? a.nome.localeCompare(b.nome, 'pt-BR') : a.cadastro ? -1 : 1
      );
  }, [catalogo, cadastro, codigoPorChave]);

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
      if (construtoraFilter !== 'todas') {
        const cod = codigoPorChave.get(chaveDoNome(e.construtora)) ?? '__fora_do_cadastro__';
        if (cod !== construtoraFilter) return false;
      }
      if (tipoFilter !== 'todos' && e.tipo !== tipoFilter) return false;
      if (!busca) return true;
      return [e.construtora, e.empreendimento, e.bairro, e.cidade, e.endereco]
        .some((campo) => campo.toLowerCase().includes(busca));
    });
  }, [catalogo, searchTerm, construtoraFilter, tipoFilter, codigoPorChave]);

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
      {/* Falha ao ler o cadastro não pode virar "nenhuma construtora". */}
      {erroCadastro && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Não foi possível carregar o cadastro de construtoras: {erroCadastro}
        </p>
      )}

      <ConstrutoraFormDialog
        aberto={Boolean(editando) || criando}
        onFechar={() => { setEditando(null); setCriando(false); }}
        construtora={editando}
        comissao={editando ? comissoes.get(editando.id)?.comissaoPadraoPct ?? null : undefined}
        cnpj={editando ? cnpjs.get(editando.id) ?? null : null}
        salvando={salvando}
        onCriar={criarConstrutora}
        onAtualizar={atualizarConstrutora}
        onSalvarCnpj={salvarCnpj}
      />

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

          <Button type="button" variant="outline" size="sm" onClick={() => setCriando(true)}>
            Nova construtora
          </Button>
        </div>

      </div>

      {/* Um card por construtora: clicar filtra a tabela; clicar de novo desmarca. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {construtoras.map(({ codigo, nome, total, cidades, cadastro: c }) => {
          const ativa = construtoraFilter === codigo;
          const falta = c ? faltaEm.get(codigo) : undefined;
          return (
            <div
              key={codigo}
              className={`relative rounded-xl border transition-colors ${
                ativa
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : falta
                    // Vermelho: cadastrada, mas falta dado. Pendência de
                    // preenchimento, e é o próprio card que diz o quê.
                    ? 'border-red-300 bg-red-50/50 hover:bg-red-50 dark:border-red-900 dark:bg-red-950/20'
                    : c
                      ? 'border-border bg-card/60 hover:bg-muted/60'
                      // Âmbar: nem cadastrada está. Outra pendência, outra cor.
                      : 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'
              }`}
            >
            <button
              type="button"
              onClick={() => setConstrutoraFilter(ativa ? 'todas' : codigo)}
              className="w-full p-4 text-left"
            >
              <p className="font-medium text-text-primary truncate pr-6" title={nome}>{nome}</p>
              <p className="text-xs text-text-secondary mt-1">
                {total} {total === 1 ? 'lançamento' : 'lançamentos'}
              </p>
              {cidades.length > 0 && (
                <p className="text-xs text-text-secondary truncate" title={cidades.join(', ')}>
                  {cidades.join(', ')}
                </p>
              )}
              {!c && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  Nomes da planilha que não batem com nenhuma construtora cadastrada.
                </p>
              )}
              {/* Dizer O QUE falta, e não só que falta: senão o cartão vira
                  enfeite vermelho e ninguém sabe o que ir buscar. */}
              {falta && (
                <p className="mt-1 text-[11px] text-red-700 dark:text-red-400">
                  Falta {falta.join(', ')}
                </p>
              )}
            </button>
            {c && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title={`Editar ${c.nome}`}
                onClick={() => setEditando(c)}
                className="absolute right-1 top-1 h-7 w-7 p-0 text-muted-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            </div>
          );
        })}
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
                onClick={() => abrirLancamento(e)}
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
