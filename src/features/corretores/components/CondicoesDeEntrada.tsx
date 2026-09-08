import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { CONDICOES, SITUACOES_CONDICAO } from '../domain/recruitmentStages';
import { recruitmentService } from '../services/recruitmentService';
import { fetchTenantMembers, type TenantMember } from '../services/tenantMembersService';

interface Props {
  candidato: Record<string, any>;
  tenantId?: string;
  onSaved?: () => void;
}

/**
 * As três condições de entrada (spec §"A régua"): região, tempo e verba.
 *
 * São ELIMINATÓRIAS e verificadas cedo — não entram em score, se verificam.
 * Quando as três ficam aprovadas, o candidato é qualificado e o evento
 * correspondente entra na timeline sozinho.
 *
 * Os dias por semana ficam aqui porque não são triagem: o mínimo é o mínimo, e
 * o número serve para prever quanto tempo até a primeira venda.
 */
export const CondicoesDeEntrada = ({ candidato, tenantId, onSaved }: Props) => {
  const [form, setForm] = useState({
    cond_regiao: candidato.cond_regiao ?? 'pendente',
    cond_tempo: candidato.cond_tempo ?? 'pendente',
    cond_verba: candidato.cond_verba ?? 'pendente',
    dias_semana: candidato.dias_semana ?? '',
    score_cultural: candidato.score_cultural ?? '',
    score_aderencia: candidato.score_aderencia ?? '',
    coordenador_id: candidato.coordenador_id ?? '',
  });
  const [membros, setMembros] = useState<TenantMember[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    fetchTenantMembers(tenantId)
      .then((todos) => setMembros(todos.filter((m) => m.role !== 'corretor')))
      .catch(() => setMembros([]));
  }, [tenantId]);

  const tresAprovadas = CONDICOES.every((c) => form[c.id as keyof typeof form] === 'aprovado');

  const salvar = async () => {
    if (!tenantId) return;
    setSalvando(true);
    try {
      await recruitmentService.updateCondicoes(String(candidato.id), tenantId, {
        ...form,
        dias_semana: form.dias_semana === '' ? undefined : Number(form.dias_semana),
        score_cultural: form.score_cultural === '' ? undefined : Number(form.score_cultural),
        score_aderencia: form.score_aderencia === '' ? undefined : Number(form.score_aderencia),
        coordenador_id: form.coordenador_id || undefined,
      });
      toast.success(tresAprovadas ? 'Condições aprovadas — candidato qualificado' : 'Condições salvas');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar as condições');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
          Condições de entrada
        </h4>
        {tresAprovadas && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            As três aprovadas
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {CONDICOES.map((cond) => (
          <div key={cond.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{cond.label}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{cond.pergunta}</p>
            </div>
            <Select
              value={form[cond.id as keyof typeof form] as string}
              onValueChange={(v) => setForm({ ...form, [cond.id]: v })}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SITUACOES_CONDICAO.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-800 pt-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Dias por semana</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Quem dedica mais vende antes</p>
          </div>
          <Input
            type="number"
            min={0}
            max={7}
            className="w-44"
            value={form.dias_semana}
            onChange={(e) => setForm({ ...form, dias_semana: e.target.value })}
          />
        </div>

        {/* Scores do RECRUTADOR (spec §7). Ficam depois das condições porque não
            são triagem: condição elimina, score ordena quem já passou. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-800 pt-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Score cultural</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">0 a 100 · avaliação do RECRUTADOR</p>
          </div>
          <Input
            type="number" min={0} max={100} className="w-44"
            value={form.score_cultural}
            onChange={(e) => setForm({ ...form, score_cultural: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-800 pt-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Score de aderência</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">0 a 100 · encaixe com a operação</p>
          </div>
          <Input
            type="number" min={0} max={100} className="w-44"
            value={form.score_aderencia}
            onChange={(e) => setForm({ ...form, score_aderencia: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-slate-800 pt-3">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Coordenador</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Sem Coordenador o candidato não é ativado (regra D062)
            </p>
          </div>
          <Select
            value={form.coordenador_id}
            onValueChange={(v) => setForm({ ...form, coordenador_id: v })}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="Definir" /></SelectTrigger>
            <SelectContent>
              {membros.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar condições'}
        </Button>
      </div>
    </div>
  );
};
