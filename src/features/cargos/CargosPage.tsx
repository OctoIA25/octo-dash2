/**
 * Configurações › Cargos (P4.1).
 *
 * Um cargo é um pacote de permissões que vale para todo mundo que o tem. É o
 * contrário do que existe hoje: medido em produção em 21/09, são 13
 * combinações diferentes para 19 pessoas na Lotus — cada uma com a sua.
 *
 * Duas coisas a tela diz em letra, porque escondê-las seria repetir o defeito
 * que o item veio desfazer:
 *
 *  1. QUAIS PERMISSÕES NÃO FAZEM NADA. Das 33 do catálogo, 17 são gravadas e
 *     nunca lidas pelo app. Um interruptor que não faz nada é pior que um
 *     interruptor ausente: quem o desliga acredita ter restringido.
 *
 *  2. QUEM AINDA NÃO TEM CARGO segue na regra antiga. É isso que faz a virada
 *     não mudar a tela de ninguém — e precisa aparecer, senão "0 pessoas" num
 *     cargo recém-criado parece defeito.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Info, Loader2, Plus, Shield, Trash2, X } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import {
  O_QUE_O_PAPEL_PODE, ROTULO_DO_PAPEL, agruparPorModulo, resumoDoCargo, semEfeito,
  type Cargo, type PermissaoDoCatalogo,
} from './cargos';
import {
  carregarCargos, carregarCatalogo, definirCargoDoMembro, excluirCargo, salvarCargo,
} from './cargosService';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';

const inputCls = 'h-8 w-full rounded-md border bg-background px-2 text-xs';

export function CargosPage() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Cargo | 'novo' | null>(null);

  const quadro = useQuery({
    queryKey: ['cargos', tenantId],
    queryFn: () => carregarCargos(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const catalogo = useQuery({
    queryKey: ['permissoes-catalogo'],
    queryFn: carregarCatalogo,
  });

  const excluir = useMutation({
    mutationFn: (c: Cargo) => excluirCargo(c.id),
    onSuccess: async (r) => {
      toast({ title: `Cargo "${r.nome}" excluído` });
      await qc.invalidateQueries({ queryKey: ['cargos'] });
    },
    onError: (e: Error) => toast({ title: 'Não deu para excluir', description: e.message, variant: 'destructive' }),
  });

  const inertes = useMemo(
    () => (catalogo.data ?? []).filter((p) => !p.em_uso).length,
    [catalogo.data]
  );

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para ver os cargos.</p>;
  }

  const recusado = quadro.isSuccess && quadro.data === null;
  const dados = quadro.data;

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cargos</h1>
          <p className="text-xs text-muted-foreground">
            Um pacote de permissões que vale para todo mundo que o tem. Mudar o cargo muda para todos.
          </p>
        </div>
        <button onClick={() => setEditando('novo')}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
          <Plus className="h-3.5 w-3.5" /> Novo cargo
        </button>
      </header>

      {recusado && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Cargos são de quem administra a imobiliária.</strong> A sua conta não é
            administradora aqui, então o banco recusa a leitura.
          </span>
        </p>
      )}

      {quadro.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}

      {dados && (
        <>
          {dados.sem_cargo > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{dados.sem_cargo} de {dados.membros} pessoas ainda não têm cargo.</strong> Elas
                seguem com as permissões individuais de hoje, e nada muda na tela delas até alguém
                escolher um cargo. É de propósito: a virada não tira acesso de ninguém.
              </span>
            </p>
          )}

          {inertes > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{inertes} das {catalogo.data?.length} permissões do catálogo ainda não têm
                efeito</strong> — são gravadas e nenhuma tela as lê. Elas aparecem no editor num bloco
                à parte, para ninguém desligar uma acreditando ter restringido algo.
              </span>
            </p>
          )}

          {dados.cargos.length === 0 && (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              Nenhum cargo ainda. Crie o primeiro — normalmente <strong>Corretor</strong>,{' '}
              <strong>Líder de equipe</strong> e <strong>Administrador</strong>.
            </div>
          )}

          <ul className="grid gap-2">
            {dados.cargos.map((c) => {
              const inertesNoCargo = semEfeito(c, catalogo.data ?? []);
              return (
                <li key={c.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{c.nome}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                          {ROTULO_DO_PAPEL[c.role]}
                        </span>
                        <span className="text-xs text-muted-foreground">{resumoDoCargo(c)}</span>
                      </div>
                      {c.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{c.descricao}</p>}
                      {inertesNoCargo > 0 && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                          {inertesNoCargo} permissão(ões) marcadas aqui ainda não têm efeito.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => setEditando(c)}
                        className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent">
                        Editar
                      </button>
                      <button
                        onClick={() => excluir.mutate(c)}
                        disabled={excluir.isPending}
                        title={c.pessoas > 0 ? 'Mova as pessoas para outro cargo antes' : 'Excluir'}
                        className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dados && dados.cargos.length > 0 && (
        <Pessoas tenantId={tenantId} cargos={dados.cargos} />
      )}

      {editando && (
        <EditorDeCargo
          cargo={editando === 'novo' ? null : editando}
          catalogo={catalogo.data ?? []}
          onFechar={() => setEditando(null)}
          onSalvar={async (c) => {
            const r = await salvarCargo(tenantId, c);
            toast({
              title: `Cargo "${r.nome}" salvo`,
              description: r.pessoas > 0
                ? `${r.permissoes} permissões, valendo agora para ${r.pessoas} pessoa(s).`
                : `${r.permissoes} permissões. Ninguém tem este cargo ainda.`,
            });
            setEditando(null);
            await qc.invalidateQueries({ queryKey: ['cargos'] });
          }}
        />
      )}
    </div>
  );
}

/**
 * Quem tem qual cargo.
 *
 * É o segundo critério de pronto do plano: "novo corretor configurado só
 * escolhendo o cargo". Escolher aqui define as permissões E o nível de acesso
 * de uma vez — são as duas coisas que hoje se configuram em telas diferentes.
 */
function Pessoas({ tenantId, cargos }: { tenantId: string; cargos: Cargo[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const membros = useQuery({
    queryKey: ['cargos-membros', tenantId],
    queryFn: () => fetchTenantMembers(tenantId),
    enabled: !!tenantId,
  });

  const atribuir = useMutation({
    mutationFn: ({ userId, cargoId }: { userId: string; cargoId: string | null }) =>
      definirCargoDoMembro(tenantId, userId, cargoId),
    // `await` nas invalidações: sem ele a mutação termina antes de os dados
    // voltarem, e a lista fica mostrando o estado antigo por alguns segundos —
    // visto no navegador em 21/09, o cargo dizia "0 pessoas" logo depois de
    // alguém ser atribuído a ele.
    onSuccess: async (r) => {
      toast({
        title: r.cargo ? `Cargo "${r.cargo}" aplicado` : 'Cargo removido',
        description: r.role_antes !== r.role_depois
          ? `O nível de acesso mudou de ${r.role_antes} para ${r.role_depois}.`
          : undefined,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cargos'] }),
        qc.invalidateQueries({ queryKey: ['cargos-membros'] }),
      ]);
    },
    onError: (e: Error) =>
      toast({ title: 'Não deu para aplicar o cargo', description: e.message, variant: 'destructive' }),
  });

  const lista = membros.data ?? [];

  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold">Quem tem qual cargo</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Escolher o cargo define as permissões <strong>e</strong> o nível de acesso da pessoa. Quem
        fica em “sem cargo” segue com as permissões individuais de hoje.
      </p>

      {membros.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando pessoas…
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {lista.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{m.email}</span>
            <span className="shrink-0 text-muted-foreground">{m.role}</span>
            <select
              className={`${inputCls} w-auto shrink-0`}
              value={m.cargo_id ?? ''}
              disabled={atribuir.isPending}
              onChange={(e) => atribuir.mutate({ userId: m.user_id, cargoId: e.target.value || null })}
            >
              <option value="">Sem cargo</option>
              {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditorDeCargo({
  cargo, catalogo, onFechar, onSalvar,
}: {
  cargo: Cargo | null;
  catalogo: PermissaoDoCatalogo[];
  onFechar: () => void;
  onSalvar: (c: {
    id?: string | null; nome: string; descricao: string;
    nivel_acesso: number; role: Cargo['role']; permissoes: string[];
  }) => Promise<void>;
}) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();

  const [nome, setNome] = useState(cargo?.nome ?? '');
  const [descricao, setDescricao] = useState(cargo?.descricao ?? '');
  const [role, setRole] = useState<Cargo['role']>(cargo?.role ?? 'corretor');
  const [nivel, setNivel] = useState(cargo?.nivel_acesso ?? 10);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(cargo?.permissoes ?? []));
  const [salvando, setSalvando] = useState(false);

  const grupos = useMemo(() => agruparPorModulo(catalogo), [catalogo]);

  const alternar = (codigo: string) => {
    setMarcadas((antes) => {
      const novo = new Set(antes);
      if (novo.has(codigo)) novo.delete(codigo);
      else novo.add(codigo);
      return novo;
    });
  };

  const salvar = async () => {
    if (!nome.trim()) {
      toast({ title: 'O cargo precisa de um nome', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await onSalvar({
        id: cargo?.id ?? null, nome: nome.trim(), descricao,
        nivel_acesso: nivel, role, permissoes: [...marcadas],
      });
    } catch (e) {
      toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar} role="presentation">
      <div className="h-full w-full max-w-lg overflow-y-auto bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label={cargo ? `Editar ${cargo.nome}` : 'Novo cargo'}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{cargo ? `Editar ${cargo.nome}` : 'Novo cargo'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {cargo && cargo.pessoas > 0 && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>{cargo.pessoas} pessoa(s) têm este cargo.</strong> O que for desmarcado aqui some
              da tela delas no próximo carregamento.
            </span>
          </p>
        )}

        <div className="mb-4 grid gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls}
              placeholder="Ex.: Corretor Sênior" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Descrição</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls}
              placeholder="O que faz quem tem este cargo" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Nível de acesso</span>
              <select value={role} onChange={(e) => {
                const r = e.target.value as Cargo['role'];
                setRole(r);
                setNivel(r === 'admin' ? 30 : r === 'team_leader' ? 20 : 10);
              }} className={inputCls}>
                {(Object.keys(ROTULO_DO_PAPEL) as Cargo['role'][]).map((r) => (
                  <option key={r} value={r}>{ROTULO_DO_PAPEL[r]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordem na lista</span>
              <input type="number" value={nivel} onChange={(e) => setNivel(Number(e.target.value) || 0)}
                className={inputCls} />
            </label>
          </div>
          <p className="rounded-md border p-2 text-[11px] text-muted-foreground">
            <strong>{ROTULO_DO_PAPEL[role]}:</strong> {O_QUE_O_PAPEL_PODE[role]} O nível de acesso decide
            o que a pessoa <em>pode fazer</em> nos dados; as permissões abaixo decidem o que ela{' '}
            <em>vê</em> no menu.
          </p>
        </div>

        {grupos.map((g) => (
          <section key={g.modulo} className="mb-4">
            <h3 className="mb-1 text-sm font-semibold">{g.modulo}</h3>
            {!g.em_uso && (
              <p className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Estas ainda <strong>não têm efeito</strong>: são gravadas e nenhuma tela as lê. Ficam
                aqui para não sumirem de vista — marcar ou desmarcar não muda nada hoje.
              </p>
            )}
            <ul className="grid gap-px overflow-hidden rounded-md border bg-border">
              {g.permissoes.map((p) => (
                <li key={p.codigo} className="bg-background">
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-accent/50">
                    <input type="checkbox" checked={marcadas.has(p.codigo)}
                      onChange={() => alternar(p.codigo)} className="h-3.5 w-3.5" />
                    <span className="min-w-0 flex-1">
                      {p.descricao}
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">{p.codigo}</span>
                    </span>
                    {!p.em_uso && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        sem efeito
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t bg-background px-5 py-3">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar cargo
          </button>
        </div>
      </div>
    </div>
  );
}
