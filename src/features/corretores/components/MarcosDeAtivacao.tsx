import { useCallback, useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { LABEL_MARCO, diasDesde } from '../domain/recruitmentStages';
import { recruitmentService, type MarcoAtivacao } from '../services/recruitmentService';

/**
 * Os 30 dias entre o "sim" e o produtivo (spec §"Ativação").
 *
 * Os cinco marcos são criados pelo banco quando a decisão sai aprovada; aqui
 * eles ganham dono humano. Marco vencido sem conclusão entra na fila de ação —
 * é o quinto gatilho dela, e sem esta lista ninguém teria como fechá-lo.
 */
export const MarcosDeAtivacao = ({ candidatoId }: { candidatoId: string }) => {
  const [marcos, setMarcos] = useState<MarcoAtivacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setMarcos(await recruitmentService.getMarcos(candidatoId));
    } catch {
      setMarcos([]);
    } finally {
      setCarregando(false);
    }
  }, [candidatoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const alternar = async (marco: MarcoAtivacao, concluido: boolean) => {
    // Otimista: a lista tem 5 itens e o clique precisa responder na hora.
    setMarcos((atual) => atual.map((m) => (
      m.id === marco.id ? { ...m, concluido_em: concluido ? new Date().toISOString() : null } : m
    )));
    try {
      await recruitmentService.concluirMarco(marco.id, concluido);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o marco');
      carregar();
    }
  };

  if (carregando || marcos.length === 0) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
      <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
        Ativação — 30 dias
      </h4>
      <p className="mb-4 text-xs text-gray-500 dark:text-slate-400">
        Cada marco tem prazo. Vencido sem conclusão, aparece na fila de ação.
      </p>

      <ul className="flex flex-col gap-3">
        {marcos.map((m) => {
          const concluido = Boolean(m.concluido_em);
          const atrasado = !concluido && m.prazo < hoje;
          return (
            <li key={m.id} className="flex items-start gap-3">
              <Checkbox
                id={`marco-${m.id}`}
                checked={concluido}
                onCheckedChange={(v) => alternar(m, v === true)}
                className="mt-0.5"
              />
              <label htmlFor={`marco-${m.id}`} className="min-w-0 cursor-pointer">
                <span className={`block text-sm ${concluido
                  ? 'text-gray-400 dark:text-slate-500 line-through'
                  : 'text-gray-800 dark:text-slate-200 font-medium'}`}>
                  {LABEL_MARCO[m.marco] ?? m.marco}
                </span>
                <span className={`block text-xs ${atrasado
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : 'text-gray-500 dark:text-slate-400'}`}>
                  {concluido
                    ? `Concluído${diasDesde(m.concluido_em) > 0 ? ` há ${diasDesde(m.concluido_em)} dias` : ' hoje'}`
                    : atrasado
                      ? `Atrasado desde ${new Date(`${m.prazo}T12:00:00`).toLocaleDateString('pt-BR')}`
                      : `Prazo ${new Date(`${m.prazo}T12:00:00`).toLocaleDateString('pt-BR')}`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
