import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react';
import { recruitmentService, type ItemFilaAcao } from '../services/recruitmentService';
import { descreveMotivoFila, diasDesde } from '../domain/recruitmentStages';

/**
 * A fila de ação — "a tela que o Erick abre de manhã. Substitui procurar
 * conversa esquecida no WhatsApp" (spec §7).
 *
 * Ordenada por prioridade e antiguidade, com o WhatsApp a um clique. Some da
 * lista assim que a ação é feita: fila que não esvazia é fila que ninguém abre
 * na segunda semana.
 */
export const FilaDeAcao = ({ tenantId }: { tenantId?: string }) => {
  const [itens, setItens] = useState<ItemFilaAcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      setItens(await recruitmentService.getFilaAcao(tenantId));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a fila');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!tenantId) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
            Fila de ação
          </h3>
          {!carregando && itens.length > 0 && (
            <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
              {itens.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          <span className="sr-only">Atualizar fila</span>
        </Button>
      </CardHeader>

      <CardContent>
        {erro && (
          <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>
        )}

        {!erro && carregando && (
          <p className="text-sm text-gray-500 dark:text-slate-400">Carregando…</p>
        )}

        {!erro && !carregando && itens.length === 0 && (
          <div className="flex items-center gap-2 py-2 text-sm text-gray-600 dark:text-slate-300">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            Ninguém esperando resposta. A fila está limpa.
          </div>
        )}

        {!erro && !carregando && itens.length > 0 && (
          <ul className="flex flex-col divide-y divide-gray-100 dark:divide-slate-800">
            {itens.map((item) => {
              const dias = diasDesde(item.desde);
              return (
                <li
                  key={`${item.id}-${item.motivo}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`h-8 w-1 shrink-0 rounded-full ${
                        item.prioridade === 1
                          ? 'bg-red-500'
                          : item.prioridade === 2
                            ? 'bg-amber-500'
                            : 'bg-gray-300 dark:bg-slate-600'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                        {item.nome}
                      </p>
                      <p className="truncate text-xs text-gray-600 dark:text-slate-400">
                        {descreveMotivoFila(item.motivo)}
                        {dias > 0 && ` · há ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
                      </p>
                    </div>
                  </div>

                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`https://wa.me/${item.telefone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
