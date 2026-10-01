/**
 * Compositor de comunicado. Sem campo "quem enviou": o remetente é quem está
 * logado, e a etiqueta sai do servidor.
 *
 * Dois passos (A.2): escrever e escolher o público → ver QUEM recebe, nome por
 * nome → enviar. Nenhum aviso sai sem essa confirmação.
 *
 * O que dá para escolher vem do banco (opcoes_do_comunicado): a Diretoria vê a
 * casa, as equipes, os cargos e todas as pessoas; o gerente, só as equipes que
 * lidera e quem responde a ele. O servidor confere de novo — esconder aqui é
 * só conforto.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DESTINO_COM_ID, LIMITES, carregarOpcoes, enviarComunicado, filtrarPessoas, podeEnviar,
  previaDoComunicado, rotuloDaEscolha,
  type Destino, type OpcoesDoComunicado, type Pessoa, type Publico, type TipoDeDestino,
} from '../services/comunicadosService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  /** Gerente: só equipes que lidera e pessoas que respondem a ele. */
  ehGerente: boolean;
}

const PUBLICOS: { id: Publico; rotulo: string; soDiretoria: boolean }[] = [
  { id: 'todos', rotulo: 'Toda a imobiliária', soDiretoria: true },
  { id: 'equipes', rotulo: 'Equipes', soDiretoria: false },
  { id: 'cargos', rotulo: 'Cargos', soDiretoria: true },
  { id: 'pessoas', rotulo: 'Pessoas', soDiretoria: false },
];

const DESTINOS: { id: TipoDeDestino | 'nada'; rotulo: string }[] = [
  { id: 'nada', rotulo: 'Nada — só o aviso' },
  { id: 'lancamento', rotulo: 'Um lançamento' },
  { id: 'material', rotulo: 'Um material de estudo' },
  { id: 'metas', rotulo: 'A tela de Metas' },
  { id: 'bolsao', rotulo: 'O Bolsão' },
];

const SEM_OPCOES: OpcoesDoComunicado = { equipes: [], cargos: [], pessoas: [], lancamentos: [], materiais: [] };

/** "Corretor da Equipe A", "Diretoria", "Equipe B". */
const detalhe = (p: Pessoa) => (p.cargo && p.equipe ? `${p.cargo} da ${p.equipe}` : p.cargo || p.equipe || '');

export function NovoComunicadoDialog({ open, onOpenChange, tenantId, ehGerente }: Props) {
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [publico, setPublico] = useState<Publico>(ehGerente ? 'equipes' : 'todos');
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [cargoIds, setCargoIds] = useState<string[]>([]);
  const [pessoaIds, setPessoaIds] = useState<string[]>([]);
  const [destino, setDestino] = useState<Destino | null>(null);
  const [importante, setImportante] = useState(false);
  const [exigeCiente, setExigeCiente] = useState(false);
  const [opcoes, setOpcoes] = useState<OpcoesDoComunicado>(SEM_OPCOES);
  const [opcoesFalharam, setOpcoesFalharam] = useState(false);
  // Uma chave por abertura: repetir o clique reusa a chave e não duplica.
  const [chave] = useState(() => crypto.randomUUID());
  // null = escrevendo; lista = conferindo quem recebe.
  const [previa, setPrevia] = useState<Pessoa[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarOpcoes(tenantId)
      .then((o) => {
        if (!vivo) return;
        setOpcoes(o);
        if (ehGerente && o.equipes.length === 1) setEquipeIds([o.equipes[0].id]);
      })
      .catch(() => vivo && setOpcoesFalharam(true));
    return () => { vivo = false; };
  }, [tenantId, ehGerente]);

  const escolha = { publico, equipeIds, cargoIds, pessoaIds };
  const rascunho = { titulo, mensagem, destino, ...escolha };
  const paraQuem = rotuloDaEscolha(escolha, opcoes);

  const revisar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar(rascunho) || ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      setPrevia(await previaDoComunicado(tenantId, escolha));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para conferir quem recebe. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async () => {
    if (!previa || previa.length === 0 || ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const n = await enviarComunicado({
        tenantId, ...rascunho, importante, exigeCiente, idempotencyKey: chave,
      });
      toast.success(`Comunicado enviado para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}.`);
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para enviar. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const publicos = PUBLICOS.filter((p) => !(ehGerente && p.soDiretoria));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!ocupado) onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{previa ? 'Confira quem recebe' : 'Novo comunicado'}</DialogTitle>
          <DialogDescription>
            {previa
              ? 'Chega no sino de cada pessoa abaixo e aparece como aviso na tela.'
              : 'Chega no sino de cada pessoa e aparece como aviso na tela. Sai com o seu nome e o seu cargo.'}
          </DialogDescription>
        </DialogHeader>

        {previa ? (
          <Conferencia
            previa={previa}
            titulo={titulo}
            paraQuem={paraQuem}
            destino={destino}
            opcoes={opcoes}
            exigeCiente={exigeCiente}
            erro={erro}
            ocupado={ocupado}
            onVoltar={() => { setPrevia(null); setErro(null); }}
            onEnviar={enviar}
          />
        ) : (
          <form onSubmit={revisar} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="comunicado-titulo">Título</Label>
                <span className="text-xs text-slate-500">{titulo.trim().length}/{LIMITES.titulo}</span>
              </div>
              <Input id="comunicado-titulo" value={titulo} maxLength={LIMITES.titulo} disabled={ocupado}
                onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reunião geral amanhã às 9h" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="comunicado-mensagem">Mensagem</Label>
                <span className="text-xs text-slate-500">{mensagem.trim().length}/{LIMITES.mensagem}</span>
              </div>
              <Textarea id="comunicado-mensagem" rows={5} value={mensagem} maxLength={LIMITES.mensagem} disabled={ocupado}
                onChange={(e) => setMensagem(e.target.value)} />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Para</legend>
              <RadioGroup value={publico} onValueChange={(v) => setPublico(v as Publico)} className="flex flex-wrap gap-x-4 gap-y-2">
                {publicos.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm"><RadioGroupItem value={p.id} />{p.rotulo}</label>
                ))}
              </RadioGroup>
              {opcoesFalharam && (
                <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                  Não deu para carregar equipes, cargos e pessoas. Feche e abra de novo.
                </p>
              )}
              {publico === 'equipes' && (
                <Chips
                  itens={opcoes.equipes.map((e) => ({ id: e.id, rotulo: e.nome }))}
                  marcados={equipeIds} onMudar={setEquipeIds} desligado={ocupado}
                  vazio={ehGerente ? 'Você ainda não lidera nenhuma equipe.' : 'Esta imobiliária ainda não tem equipes.'}
                />
              )}
              {publico === 'cargos' && (
                <Chips
                  itens={opcoes.cargos.map((c) => ({ id: c.id, rotulo: `${c.nome} · ${c.pessoas}` }))}
                  marcados={cargoIds} onMudar={setCargoIds} desligado={ocupado}
                  vazio="Nenhum cargo tem gente ainda. Atribua os cargos em Configurações › Cargos."
                />
              )}
              {publico === 'pessoas' && (
                <EscolhaDePessoas pessoas={opcoes.pessoas} marcadas={pessoaIds} onMudar={setPessoaIds} desligado={ocupado}
                  vazio={ehGerente ? 'Ninguém responde a você ainda.' : 'Esta imobiliária ainda não tem outras pessoas.'} />
              )}
            </fieldset>

            <EscolhaDoDestino destino={destino} onMudar={setDestino} opcoes={opcoes} desligado={ocupado} />

            <label className="flex items-start gap-3">
              <Switch checked={importante} onCheckedChange={setImportante} disabled={ocupado} />
              <span className="text-sm">
                <span className="font-medium">Importante</span>
                <span className="block text-xs text-slate-500">Fica mais tempo na tela e ganha destaque.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <Switch checked={exigeCiente} onCheckedChange={setExigeCiente} disabled={ocupado} />
              <span className="text-sm">
                <span className="font-medium">Pedir ciente</span>
                <span className="block text-xs text-slate-500">
                  Fica no sino de cada pessoa até ela clicar em "Ciente". Em Enviados você vê quem já confirmou.
                </span>
              </span>
            </label>

            {/* A mesma linha "de quem → para quem" que o aviso vai mostrar na lista. */}
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Você</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <span className="sr-only">para</span>
              <span className="text-slate-700 dark:text-slate-300">{paraQuem || 'escolha para quem vai'}</span>
            </p>

            {erro && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={ocupado || !podeEnviar(rascunho)}>
                {ocupado ? 'Conferindo…' : 'Conferir quem recebe'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Chips({ itens, marcados, onMudar, desligado, vazio }: {
  itens: { id: string; rotulo: string }[];
  marcados: string[];
  onMudar: (ids: string[]) => void;
  desligado: boolean;
  vazio: string;
}) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">{vazio}</p>;
  const alternar = (id: string) => onMudar(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {itens.map((i) => {
        const marcado = marcados.includes(i.id);
        return (
          <button key={i.id} type="button" aria-pressed={marcado} disabled={desligado} onClick={() => alternar(i.id)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              marcado
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
            }`}>
            {i.rotulo}
          </button>
        );
      })}
    </div>
  );
}

function EscolhaDePessoas({ pessoas, marcadas, onMudar, desligado, vazio }: {
  pessoas: Pessoa[];
  marcadas: string[];
  onMudar: (ids: string[]) => void;
  desligado: boolean;
  vazio: string;
}) {
  const [busca, setBusca] = useState('');
  const visiveis = useMemo(() => filtrarPessoas(pessoas, busca), [pessoas, busca]);
  if (pessoas.length === 0) return <p className="text-sm text-slate-500">{vazio}</p>;
  const alternar = (id: string, marcar: boolean) =>
    onMudar(marcar ? [...marcadas, id] : marcadas.filter((x) => x !== id));

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-700">
        <Search className="h-4 w-4 text-slate-400" aria-hidden />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} disabled={desligado}
          aria-label="Buscar pessoa por nome, cargo ou equipe" placeholder="Buscar por nome, cargo ou equipe"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
        <span className="shrink-0 text-xs text-slate-500">{marcadas.length} escolhida{marcadas.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="max-h-48 overflow-y-auto py-1">
        {visiveis.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Ninguém com esse nome.</li>}
        {visiveis.map((p) => {
          const marcada = marcadas.includes(p.id);
          return (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <Checkbox checked={marcada} disabled={desligado} onCheckedChange={(v) => alternar(p.id, v === true)} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{p.nome}</span>
                  {detalhe(p) && <span className="ml-1.5 text-slate-500">{detalhe(p)}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EscolhaDoDestino({ destino, onMudar, opcoes, desligado }: {
  destino: Destino | null;
  onMudar: (d: Destino | null) => void;
  opcoes: OpcoesDoComunicado;
  desligado: boolean;
}) {
  const tipo = destino?.tipo ?? 'nada';
  const registros = tipo === 'lancamento'
    ? opcoes.lancamentos.map((l) => ({ id: l.id, rotulo: l.nome }))
    : tipo === 'material'
      ? opcoes.materiais.map((m) => ({ id: m.id, rotulo: m.titulo }))
      : [];

  return (
    <div className="space-y-2">
      <Label htmlFor="comunicado-destino">Ao tocar no aviso, abrir</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={tipo} disabled={desligado}
          onValueChange={(v) => onMudar(v === 'nada' ? null : { tipo: v as TipoDeDestino })}>
          <SelectTrigger id="comunicado-destino" className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DESTINOS.map((d) => <SelectItem key={d.id} value={d.id}>{d.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
        {destino && DESTINO_COM_ID.has(destino.tipo) && (
          registros.length === 0 ? (
            <p className="self-center text-sm text-slate-500">
              {destino.tipo === 'lancamento' ? 'Nenhum lançamento cadastrado.' : 'Nenhum material publicado.'}
            </p>
          ) : (
            <Select value={destino.id ?? ''} disabled={desligado}
              onValueChange={(id) => onMudar({ tipo: destino.tipo, id })}>
              <SelectTrigger aria-label={destino.tipo === 'lancamento' ? 'Qual lançamento' : 'Qual material'} className="min-w-0 flex-1">
                <SelectValue placeholder={destino.tipo === 'lancamento' ? 'Escolha o lançamento' : 'Escolha o material'} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {registros.map((r) => <SelectItem key={r.id} value={r.id}>{r.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        )}
      </div>
    </div>
  );
}

function Conferencia({ previa, titulo, paraQuem, destino, opcoes, exigeCiente, erro, ocupado, onVoltar, onEnviar }: {
  previa: Pessoa[];
  titulo: string;
  paraQuem: string;
  destino: Destino | null;
  opcoes: OpcoesDoComunicado;
  exigeCiente: boolean;
  erro: string | null;
  ocupado: boolean;
  onVoltar: () => void;
  onEnviar: () => void;
}) {
  const n = previa.length;
  const abre = destino
    ? destino.tipo === 'lancamento' ? opcoes.lancamentos.find((l) => l.id === destino.id)?.nome
      : destino.tipo === 'material' ? opcoes.materiais.find((m) => m.id === destino.id)?.titulo
        : DESTINOS.find((d) => d.id === destino.tipo)?.rotulo
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/60">
        <p className="font-semibold text-slate-900 dark:text-slate-50">{titulo.trim()}</p>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Para <strong>{paraQuem}</strong>
          {abre && <> · abre <strong>{abre}</strong></>}
          {exigeCiente && <> · pede ciente</>}
        </p>
      </div>

      {n === 0 ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          Ninguém recebe esse comunicado. Volte e escolha outro público.
        </p>
      ) : (
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Vai para {n} {n === 1 ? 'pessoa' : 'pessoas'}:
          </p>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {previa.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm">
                <span className="truncate font-medium text-slate-800 dark:text-slate-100">{p.nome}</span>
                <span className="shrink-0 text-xs text-slate-500">{detalhe(p)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={ocupado} onClick={onVoltar}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Voltar
        </Button>
        <Button type="button" disabled={ocupado || n === 0} onClick={onEnviar}>
          {ocupado ? 'Enviando…' : `Enviar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}
        </Button>
      </DialogFooter>
    </div>
  );
}
