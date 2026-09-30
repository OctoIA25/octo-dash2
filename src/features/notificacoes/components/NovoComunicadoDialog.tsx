/**
 * Compositor de comunicado. Sem campo "quem enviou": o remetente é quem está
 * logado, e a etiqueta sai do servidor. O gerente só vê as equipes que lidera
 * (o servidor confere de novo — esconder aqui é só conforto).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { fetchTeams, type Team } from '@/features/corretores/services/teamsManagementService';
import { enviarComunicado, LIMITES, podeEnviar } from '../services/comunicadosService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string;
  /** Diretoria escolhe qualquer público; o gerente, só as equipes que lidera. */
  soEquipesQueLidera: boolean;
}

export function NovoComunicadoDialog({ open, onOpenChange, tenantId, userId, soEquipesQueLidera }: Props) {
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [publico, setPublico] = useState<'todos' | 'equipes'>(soEquipesQueLidera ? 'equipes' : 'todos');
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [importante, setImportante] = useState(false);
  const [equipes, setEquipes] = useState<Team[]>([]);
  // Uma chave por abertura: repetir o clique reusa a chave e não duplica.
  const [chave] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchTeams(tenantId).then((todas) => {
      if (!vivo) return;
      const visiveis = soEquipesQueLidera
        ? todas.filter((t) => t.leader_user_id === userId || t.leader_user_ids.includes(userId))
        : todas;
      setEquipes(visiveis);
      if (soEquipesQueLidera && visiveis.length === 1) setEquipeIds([visiveis[0].id]);
    });
    return () => { vivo = false; };
  }, [tenantId, userId, soEquipesQueLidera]);

  const alternarEquipe = (id: string) =>
    setEquipeIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  const rascunho = { titulo, mensagem, publico, equipeIds };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar(rascunho) || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const n = await enviarComunicado({ tenantId, ...rascunho, importante, idempotencyKey: chave });
      toast.success(`Comunicado enviado para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}.`);
      onOpenChange(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para enviar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  const nomesEscolhidos = equipes.filter((t) => equipeIds.includes(t.id)).map((t) => t.name).join(', ');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Novo comunicado</DialogTitle>
          <DialogDescription>
            Chega no sino de cada pessoa e aparece como aviso na tela. Sai com o seu nome e o seu cargo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="comunicado-titulo">Título</Label>
              <span className="text-xs text-slate-500">{titulo.trim().length}/{LIMITES.titulo}</span>
            </div>
            <Input id="comunicado-titulo" value={titulo} maxLength={LIMITES.titulo} disabled={enviando}
              onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reunião geral amanhã às 9h" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="comunicado-mensagem">Mensagem</Label>
              <span className="text-xs text-slate-500">{mensagem.trim().length}/{LIMITES.mensagem}</span>
            </div>
            <Textarea id="comunicado-mensagem" rows={5} value={mensagem} maxLength={LIMITES.mensagem} disabled={enviando}
              onChange={(e) => setMensagem(e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Para</legend>
            {!soEquipesQueLidera && (
              <RadioGroup value={publico} onValueChange={(v) => setPublico(v as 'todos' | 'equipes')} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="todos" />Toda a imobiliária</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="equipes" />Equipes</label>
              </RadioGroup>
            )}
            {publico === 'equipes' && (
              equipes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {soEquipesQueLidera ? 'Você ainda não lidera nenhuma equipe.' : 'Esta imobiliária ainda não tem equipes.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {equipes.map((t) => {
                    const marcada = equipeIds.includes(t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={marcada} disabled={enviando}
                        onClick={() => alternarEquipe(t.id)}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                          marcada
                            ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </fieldset>

          <label className="flex items-start gap-3">
            <Switch checked={importante} onCheckedChange={setImportante} disabled={enviando} />
            <span className="text-sm">
              <span className="font-medium">Importante</span>
              <span className="block text-xs text-slate-500">Fica mais tempo na tela e ganha destaque.</span>
            </span>
          </label>

          <p className="text-xs text-slate-500">
            Vai para: {publico === 'todos' ? 'toda a imobiliária' : nomesEscolhidos || 'escolha ao menos uma equipe'}
          </p>

          {erro && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={enviando} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={enviando || !podeEnviar(rascunho)}>
              {enviando ? 'Enviando…' : 'Enviar comunicado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
