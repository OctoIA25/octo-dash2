/**
 * Horário de não incomodar da LIA (P2.5).
 *
 * O banco guarda a janela em que PODE falar; a tela fala em silêncio, que é
 * como o plano escreve ("não incomodar, ex.: 20h–9h"). Mesma informação ao
 * contrário — e guardar assim evita que toda conta tenha de tratar uma janela
 * que cruza a meia-noite.
 *
 * Configuração PRÓPRIA, e não o horário de funcionamento da distribuição: o da
 * Lotus está gravado vazio, e reaproveitá-lo deixaria a LIA livre para mandar
 * mensagem às 3h da manhã.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  CONFIG_PADRAO, NOMES_DOS_DIAS, carregarConfig, salvarConfig, type ConfigDaAgenda,
} from '../services/agendaLiaService';
import { fraseDoNaoIncomodar } from '../utils/agendaLia';

interface Props {
  tenantId?: string | null;
  isAdmin: boolean;
}

export function AgendaLiaConfigPanel({ tenantId, isAdmin }: Props) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ConfigDaAgenda>(CONFIG_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    carregarConfig(tenantId)
      .then((c) => !cancelado && setCfg(c))
      .catch((e) => !cancelado && setErro((e as Error).message))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  const janelaInvertida = cfg.pode_falar_ate <= cfg.pode_falar_das;
  const semDia = cfg.dias_permitidos.length === 0;

  const alternarDia = (d: number) =>
    setCfg({
      ...cfg,
      dias_permitidos: cfg.dias_permitidos.includes(d)
        ? cfg.dias_permitidos.filter((x) => x !== d)
        : [...cfg.dias_permitidos, d].sort((a, b) => a - b),
    });

  const gravar = async () => {
    if (!tenantId) return;
    setSalvando(true);
    try {
      await salvarConfig(tenantId, cfg);
      toast({ title: 'Horário salvo' });
    } catch (e) {
      toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }
  if (erro) return <p className="text-sm text-rose-600">Não deu para ler a configuração: {erro}</p>;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">A LIA pode falar com o cliente</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input
            type="time"
            disabled={!isAdmin}
            className="w-32"
            value={cfg.pode_falar_das}
            onChange={(e) => setCfg({ ...cfg, pode_falar_das: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="time"
            disabled={!isAdmin}
            className="w-32"
            value={cfg.pode_falar_ate}
            onChange={(e) => setCfg({ ...cfg, pode_falar_ate: e.target.value })}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {janelaInvertida
            ? 'O fim tem que ser depois do começo.'
            : fraseDoNaoIncomodar(cfg.pode_falar_das, cfg.pode_falar_ate)}
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Em quais dias</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {NOMES_DOS_DIAS.map((nome, d) => {
            const ligado = cfg.dias_permitidos.includes(d);
            return (
              <button
                key={nome}
                type="button"
                disabled={!isAdmin}
                onClick={() => alternarDia(d)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  ligado ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
              >
                {nome}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {semDia
            ? 'Sem nenhum dia, a LIA não falaria com ninguém — escolha ao menos um.'
            : 'Um retorno pedido para um dia desligado é empurrado para o próximo dia permitido, e a LIA avisa o cliente.'}
        </p>
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Vale para o retorno que o cliente pede. Quando a hora pedida cai fora, a Dash devolve à LIA a
        primeira hora possível, para ela combinar isso com o cliente em vez de sumir.
      </p>

      {isAdmin && (
        <button
          onClick={gravar}
          disabled={salvando || janelaInvertida || semDia}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </button>
      )}
    </div>
  );
}
