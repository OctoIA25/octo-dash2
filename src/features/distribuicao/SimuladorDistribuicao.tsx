/**
 * Simulador da distribuição (P1.2).
 *
 * Responde, sem tocar em lead nenhum: "se este lead chegasse agora, de quem
 * seria?". Roda a MESMA função que a rota do servidor usa — importada de
 * `server/distribuicao/`, sem cópia — então o que a tela mostra é o que a Lia
 * vai receber quando consultar.
 *
 * O botão de rodar vários leads existe por um motivo específico: a roleta é
 * RODÍZIO, e isso só fica visível na sequência. Um lead de cada vez não
 * mostra que quem está pausado é pulado E mantém a vez.
 */

import { useMemo, useState } from 'react';
import { Play, RotateCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  decidirDestino,
  janelaDaConfiguracao,
  prazoDeAtendimento,
  minutosDePrazo,
  TEXTO_DO_MOTIVO,
  type ParticipanteDaRoleta,
  type PonteiroDaRoleta,
} from './regraDoServidor';

interface SimuladorProps {
  participantes: ParticipanteDaRoleta[];
  /**
   * A equipe inteira, para escolher o captador. NÃO é a fila: o captador pode
   * estar fora do rodízio e ainda assim receber o lead que captou.
   */
  equipe?: ParticipanteDaRoleta[];
  /** O `horario_funcionamento` CRU do banco. `{}` significa "use o padrão". */
  horarioFuncionamento: unknown;
  /** A configuração de prazo, também crua. */
  configPrazo: { tempo_expiracao_exclusivo?: number | null } | null;
  /**
   * Quem recebe os tipos de dono fixo (recrutamento, vendedores). Vem de
   * `tenant_bolsao_config.destino_por_tipo`. Nulo = ninguém configurado, e a
   * simulação mostra "falta dizer quem recebe" em vez de cair na roleta.
   */
  destinoPorTipo?: Record<string, string> | null;
  /** Quem recebeu por último, para a simulação começar de onde a fila está. */
  ponteiro?: PonteiroDaRoleta;
}

interface Passo {
  n: number;
  tipo: string;
  destino: string;
  corretor: string;
  motivo: string;
  prazo: string | null;
}

const hora = (d: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

export function SimuladorDistribuicao({
  participantes,
  equipe,
  horarioFuncionamento,
  configPrazo,
  destinoPorTipo = null,
  ponteiro = { posicao: -1, corretorId: null },
}: SimuladorProps) {
  const candidatos = equipe?.length ? equipe : participantes;
  const [tipo, setTipo] = useState('terceiros');
  const [codigo, setCodigo] = useState('');
  const [liaPassou, setLiaPassou] = useState(false);
  const [quantos, setQuantos] = useState(5);
  const [passos, setPassos] = useState<Passo[]>([]);

  const janela = useMemo(() => janelaDaConfiguracao(horarioFuncionamento), [horarioFuncionamento]);
  const minutos = useMemo(() => minutosDePrazo(configPrazo), [configPrazo]);

  const nomeDe = (id: string | null) =>
    id ? candidatos.find((p) => p.id === id)?.nome || id.slice(0, 8) : '—';

  const rodar = () => {
    // A simulação parte de onde a fila está HOJE, não do começo: um gestor que
    // vê "o próximo é a Ana" precisa que a tela concorde com a realidade.
    let ptr: PonteiroDaRoleta = { ...ponteiro };
    const saida: Passo[] = [];

    for (let n = 1; n <= quantos; n += 1) {
      const decisao = decidirDestino({
        lead: {
          codigoImovel: tipo === 'terceiros' ? codigo || 'SIMULADO' : undefined,
          tipoImovel: tipo,
          liaPassou,
        },
        // SEM CAPTADOR, desde 24/09 — o chefe pediu para tirar o campo.
        //
        // O captador não é uma escolha de quem simula: é um fato do imóvel.
        // Preencher à mão convidava a montar um cenário que não existe. A
        // simulação passa a mostrar o caminho de um imóvel SEM captador
        // cadastrado, e a tela diz isso com todas as letras logo abaixo.
        captador: null,
        destinoPorTipo,
        participantes,
        ultimaPosicao: ptr,
      });

      const prazo = decisao.destino === 'corretor' ? prazoDeAtendimento(new Date(), minutos, janela) : null;

      saida.push({
        n,
        tipo: decisao.tipo,
        destino: decisao.destino,
        corretor: nomeDe(decisao.corretorId),
        motivo: TEXTO_DO_MOTIVO[decisao.motivo] ?? decisao.motivo,
        prazo: hora(prazo),
      });

      // O ponteiro só anda quando a roleta escolheu alguém — captador e Lia
      // não consomem a vez de ninguém.
      if (decisao.destino === 'corretor' && Number.isInteger(decisao.posicao)) {
        ptr = { posicao: decisao.posicao as number, corretorId: decisao.corretorId };
      }
    }
    setPassos(saida);
  };

  const disponiveis = participantes.filter((p) => !p.pausado && !p.semPermissao && !p.noLimite).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        {/*
          Reescrito em 24/09 a pedido do chefe: "explicar melhor que o botão
          serve pra mostrar para quem a Lia passaria, afinal sempre passa pela
          mão dela". A frase antiga ("de quem seria?") dava a entender que o
          Octo distribui — e ele não distribui desde a decisão de 19/09.
        */}
        <p className="text-[13px] text-text-secondary">
          <strong>Todo lead passa pela Lia primeiro.</strong> Este botão responde uma coisa só:
          <strong> para quem a Lia passaria este lead depois de atender</strong>. Ele{' '}
          <strong>não atribui nada</strong>, não encosta em lead nenhum e não avisa ninguém — roda a
          mesma regra que a Lia consulta, e mostra a resposta.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Tipo do lead</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="terceiros">Imóvel de terceiros</SelectItem>
                <SelectItem value="lancamento">Lançamento</SelectItem>
                <SelectItem value="indefinido">Sem imóvel</SelectItem>
                {/* 24/09 — os dois que não são cliente comprador e não entram
                    no rodízio. Cada um tem dono fixo, dito em Configurações. */}
                <SelectItem value="recrutamento">Recrutamento (quer trabalhar aqui)</SelectItem>
                <SelectItem value="vendedores">Vendedor (quer vender o imóvel)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === 'terceiros' && (
            <div className="space-y-1.5">
              <Label htmlFor="sim-codigo">Código do imóvel</Label>
              <Input id="sim-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="AP0961" />
            </div>
          )}

          {/* Desde 22/09 TODO lead espera a Lia, não só lançamento. Com o
              checkbox escondido nos outros tipos, a tela ficaria presa em "a
              Lia atende primeiro" sem jeito de simular o depois. */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={liaPassou} onCheckedChange={(v) => setLiaPassou(v === true)} />
              A Lia já passou o lead
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-qtd">Quantos leads</Label>
            <Input
              id="sim-qtd"
              type="number"
              min={1}
              max={50}
              value={quantos}
              onChange={(e) => setQuantos(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={rodar} disabled={participantes.length === 0}>
            <Play className="mr-2 h-4 w-4" /> Simular
          </Button>
          {passos.length > 0 && (
            <Button variant="ghost" onClick={() => setPassos([])}>
              <RotateCcw className="mr-2 h-4 w-4" /> Limpar
            </Button>
          )}
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {disponiveis} de {participantes.length} disponíveis
          </Badge>
          <span className="text-[12px] text-text-secondary">prazo: {minutos} min de expediente</span>
        </div>

        {tipo === 'terceiros' && (
          <p className="mt-3 text-[13px] text-text-secondary">
            Esta simulação mostra o caminho de um imóvel <strong>sem captador cadastrado</strong>.
            Quando o imóvel tem captador, a Lia passa para ele — e só cai na roleta se ele não
            puder atender.
          </p>
        )}

        {(tipo === 'recrutamento' || tipo === 'vendedores') && (
          <p className="mt-3 text-[13px] text-text-secondary">
            Este tipo <strong>não entra no rodízio</strong>: tem dono fixo, definido em
            Configurações. A Lia atende primeiro do mesmo jeito; o que muda é para quem ela passa.
          </p>
        )}

        {participantes.length === 0 && (
          <p className="mt-3 text-[13px] text-amber-600 dark:text-amber-400">
            Nenhum corretor na roleta desta imobiliária. Com a fila vazia, todo lead cai em “ninguém”.
          </p>
        )}
      </div>

      {passos.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-semibold">#</th>
                <th className="px-4 py-2 font-semibold">Vai para</th>
                <th className="px-4 py-2 font-semibold">Por quê</th>
                <th className="px-4 py-2 font-semibold">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {passos.map((p) => (
                <tr key={p.n} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 text-text-secondary">{p.n}</td>
                  <td className="px-4 py-2 font-medium">
                    {p.destino === 'corretor' ? p.corretor : p.destino === 'lia' ? 'A Lia' : 'Ninguém'}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{p.motivo}</td>
                  <td className="px-4 py-2 text-text-secondary">{p.prazo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
