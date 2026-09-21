/**
 * Configurações › IA › Tabela de preços (P2.8).
 *
 * Os preços moravam FIXOS no código, e só de modelos da OpenAI — mudar preço
 * exigia deploy, e o provedor da LIA (Anthropic) não estava lá, o que fazia a
 * mesma tela mostrar dois custos diferentes.
 *
 * CORRIGIR PREÇO CRIA VIGÊNCIA NOVA, não edita a antiga. Editar reescreveria o
 * custo já apurado de meses passados; com vigência nova, o passado continua
 * valendo pelo preço que valia — que é como contabilidade funciona.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { listarPrecos, marcarConferido, novaVigencia, type PrecoDeIa } from '../services/custoDeIaService';

export function PrecosDeIaPanel() {
  const { user, isOwner } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ entrada: '', cache: '', saida: '' });
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { data: precos, isLoading, isError, error } = useQuery({
    queryKey: ['ia-precos'],
    queryFn: listarPrecos,
  });

  // Só a vigência mais recente de cada modelo aparece; as antigas seguem
  // valendo para o passado, mas poluiriam a tela de configuração.
  const vigentes = (precos ?? []).filter(
    (p, i, todos) => todos.findIndex((x) => x.modelo === p.modelo && x.tenant_id === p.tenant_id) === i
  );

  const conferir = async (p: PrecoDeIa) => {
    if (!user?.id) return;
    setOcupado(p.id);
    try {
      await marcarConferido(p.id, user.id);
      await qc.invalidateQueries({ queryKey: ['ia-precos'] });
      toast({ title: 'Preço marcado como conferido' });
    } catch (e) {
      toast({ title: 'Não deu para marcar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const salvar = async (p: PrecoDeIa) => {
    if (!user?.id) return;
    const entrada = Number(rascunho.entrada.replace(',', '.'));
    const saida = Number(rascunho.saida.replace(',', '.'));
    const cache = rascunho.cache.trim() === '' ? null : Number(rascunho.cache.replace(',', '.'));
    if (!Number.isFinite(entrada) || !Number.isFinite(saida) || entrada < 0 || saida < 0) {
      toast({ title: 'Preço inválido', description: 'Entrada e saída precisam ser números.', variant: 'destructive' });
      return;
    }
    setOcupado(p.id);
    try {
      await novaVigencia(p, { entrada, cache, saida }, user.id);
      await qc.invalidateQueries({ queryKey: ['ia-precos'] });
      setEditando(null);
      toast({
        title: 'Preço atualizado',
        description: 'Vale a partir de hoje. O custo já apurado continua pelo preço anterior.',
      });
    } catch (e) {
      toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }
  if (isError) return <p className="text-sm text-rose-600">Não deu para ler os preços: {(error as Error).message}</p>;

  const naoConferidos = vigentes.filter((p) => !p.conferido_em).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Preço por milhão de tokens, em dólar, como os provedores publicam. Corrigir um preço cria uma
        vigência nova — o custo já apurado continua valendo pelo preço da época.
      </p>

      {naoConferidos > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {naoConferidos} preço(s) vieram do cadastro inicial e ninguém conferiu na página do provedor.
          Preço de IA muda com frequência, e um número velho vira custo errado sem ninguém notar.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Modelo</th>
              <th className="p-2 text-right">Entrada</th>
              <th className="p-2 text-right">Cache</th>
              <th className="p-2 text-right">Saída</th>
              <th className="p-2 text-left">Vigente de</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {vigentes.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{p.modelo}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.provedor ?? 'provedor não informado'}
                    {p.tenant_id ? ' · preço próprio' : ' · global'}
                  </div>
                </td>
                {editando === p.id ? (
                  <>
                    <td className="p-2">
                      <Input className="h-8 w-24 text-right" value={rascunho.entrada} onChange={(e) => setRascunho({ ...rascunho, entrada: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input className="h-8 w-24 text-right" value={rascunho.cache} onChange={(e) => setRascunho({ ...rascunho, cache: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input className="h-8 w-24 text-right" value={rascunho.saida} onChange={(e) => setRascunho({ ...rascunho, saida: e.target.value })} />
                    </td>
                    <td className="p-2 text-[11px] text-muted-foreground">a partir de hoje</td>
                    <td className="p-2 text-right">
                      <button onClick={() => salvar(p)} disabled={ocupado === p.id} className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
                        Salvar
                      </button>
                      <button onClick={() => setEditando(null)} className="ml-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-2 text-right tabular-nums">{Number(p.preco_entrada_por_milhao).toFixed(2)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {p.preco_cache_por_milhao == null ? '—' : Number(p.preco_cache_por_milhao).toFixed(2)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{Number(p.preco_saida_por_milhao).toFixed(2)}</td>
                    <td className="p-2 text-[11px]">
                      {p.vigente_de}
                      <span className={`ml-1 ${p.conferido_em ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {p.conferido_em ? `· conferido em ${p.conferido_em}` : '· não conferido'}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      {/* Preço global é da plataforma: um erro ali reescreve o
                          custo de todas as imobiliárias. */}
                      {(p.tenant_id ? true : isOwner) && (
                        <>
                          {!p.conferido_em && (
                            <button
                              onClick={() => conferir(p)}
                              disabled={ocupado === p.id}
                              title="Confirma que este preço está correto na página do provedor"
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" /> Conferi
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditando(p.id);
                              setRascunho({
                                entrada: String(p.preco_entrada_por_milhao),
                                cache: p.preco_cache_por_milhao == null ? '' : String(p.preco_cache_por_milhao),
                                saida: String(p.preco_saida_por_milhao),
                              });
                            }}
                            className="ml-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                          >
                            Corrigir
                          </button>
                        </>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
