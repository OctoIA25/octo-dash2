import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MOTIVOS_PERDA } from '../domain/recruitmentStages';
import { recruitmentService, type IndicadoresProcesso } from '../services/recruitmentService';

const LABEL_MOTIVO = Object.fromEntries(MOTIVOS_PERDA.map((m) => [m.id, m.label]));

/** "—" quando não há base para o cálculo: zero seria mentira, não informação. */
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

const espera = (min: number | null) => {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const horas = min / 60;
  return horas < 48 ? `${horas.toFixed(1)} h` : `${Math.round(horas / 24)} dias`;
};

/**
 * Os indicadores do processo (spec §10). São de SLA e de qualidade do público —
 * respondem "o funil está sendo trabalhado no tempo certo?", enquanto o funil
 * responde "onde ele vaza?".
 */
export const IndicadoresDoProcesso = ({ tenantId }: { tenantId?: string }) => {
  const [dados, setDados] = useState<IndicadoresProcesso | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    recruitmentService.getIndicadores(tenantId).then(setDados).catch(() => setDados(null));
  }, [tenantId]);

  if (!tenantId || !dados) return null;

  const indicadores = [
    { label: 'Até o 1º contato', valor: espera(dados.medianaPrimeiroContatoMin), nota: 'Mediana · meta abaixo de 1h' },
    { label: 'Respondem o 1º contato', valor: pct(dados.pctRespondeuPrimeiroContato), nota: 'Qualidade do canal e da mensagem' },
    { label: 'Passam nas três condições', valor: pct(dados.pctPassouTresCondicoes), nota: 'Qualidade do público que o anúncio atrai' },
    { label: 'Reuniões que acontecem', valor: pct(dados.pctReunioesAconteceram), nota: 'Mede o efeito da confirmação da véspera' },
    { label: 'Matrícula dentro do prazo', valor: pct(dados.pctMatriculaNoPrazo), nota: 'Calibra o gate de iniciativa' },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Indicadores do processo</h3>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col divide-y divide-gray-100 dark:divide-slate-800">
            {indicadores.map((i) => (
              <div key={i.label} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <dt className="text-sm font-medium text-gray-800 dark:text-slate-200">{i.label}</dt>
                  <dd className="text-xs text-gray-500 dark:text-slate-400">{i.nota}</dd>
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums text-gray-900 dark:text-slate-100">
                  {i.valor}
                </span>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-gray-100 dark:border-slate-800 pt-3 text-xs text-gray-500 dark:text-slate-400">
            Falta “dias do sim à 1ª venda”: exige ligar o candidato ao corretor que ele virou, e esse vínculo ainda não é guardado.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Conversão por canal</h3>
        </CardHeader>
        <CardContent>
          {dados.porCanal.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Sem candidaturas no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    <th className="pb-2 font-medium">Canal</th>
                    <th className="pb-2 text-right font-medium">Candidaturas</th>
                    <th className="pb-2 text-right font-medium">Qualificados</th>
                    <th className="pb-2 text-right font-medium">Onboard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {dados.porCanal.map((c) => (
                    <tr key={c.canal}>
                      <td className="py-2 text-gray-800 dark:text-slate-200">{c.canal}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600 dark:text-slate-300">{c.candidaturas}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600 dark:text-slate-300">{c.qualificados}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-slate-100">{c.onboard}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dados.motivosPerda.length > 0 && (
            <div className="mt-4 border-t border-gray-100 dark:border-slate-800 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Por que saíram
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {dados.motivosPerda.map((m) => (
                  <li key={m.motivo} className="text-sm text-gray-700 dark:text-slate-300">
                    {LABEL_MOTIVO[m.motivo] ?? m.motivo}
                    <span className="ml-1 font-semibold tabular-nums">{m.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
