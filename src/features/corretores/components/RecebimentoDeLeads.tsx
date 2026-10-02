/**
 * "Liberado / Bloqueado para receber leads" — no cadastro e na edição do membro.
 *
 * Pedido do Erick (01/10): pausar quem pede sem precisar apagar o corretor, e
 * cadastrar quem ainda não começou sem que ele já receba lead. O dado é o que
 * já existia, `permissions.lead_limit.receives_auto_leads === false`; só a
 * pergunta ficou direta. Bloqueado vale para a roleta, para a consulta da Lia
 * (`/api/v1/distribuicao/destino`) e para o Bolsão.
 */
import type { BrokerLeadLimitOverride } from '@/features/corretores/services/tenantLeadLimitService';

const MOTIVOS = [
  { valor: 'pausa', titulo: 'Pausa', ajuda: 'Férias, afastamento, ou ainda não começou.' },
  { valor: 'captador', titulo: 'Captador', ajuda: 'Função permanente: capta imóvel, não atende cliente.' },
] as const;

export function RecebimentoDeLeads({
  valor,
  onChange,
  nome,
}: {
  valor: BrokerLeadLimitOverride;
  onChange: (proximo: BrokerLeadLimitOverride) => void;
  /** Agrupa os rádios: a tela de edição e a de cadastro não podem dividir o mesmo grupo. */
  nome: string;
}) {
  const bloqueado = valor.receives_auto_leads === false;
  const opcao = (ativo: boolean) =>
    `flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-gray-50 dark:bg-slate-950 ${
      ativo ? 'border-gray-500 dark:border-slate-400' : 'border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-2">
      <label className={opcao(!bloqueado)}>
        <input
          type="radio"
          name={`${nome}-recebe`}
          checked={!bloqueado}
          // Liberar limpa o motivo junto, senão sobra rótulo órfão: o save grava
          // o objeto inteiro de lead_limit.
          onChange={() => onChange({ ...valor, receives_auto_leads: undefined, motivo: undefined })}
          className="h-4 w-4 mt-0.5 border-gray-300"
        />
        <div>
          <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Liberado para receber leads</span>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Entra na roleta e pode assumir lead do Bolsão.</p>
        </div>
      </label>

      <label className={opcao(bloqueado)}>
        <input
          type="radio"
          name={`${nome}-recebe`}
          checked={bloqueado}
          onChange={() => onChange({ ...valor, receives_auto_leads: false, motivo: valor.motivo ?? 'pausa' })}
          className="h-4 w-4 mt-0.5 border-gray-300"
        />
        <div>
          <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Bloqueado para receber leads</span>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Não recebe lead novo de ninguém: fica fora da roleta, a Lia é avisada de que ele não
            pode receber, e o Bolsão não deixa assumir. Os leads que já são dele continuam com ele.
          </p>
        </div>
      </label>

      {bloqueado && (
        <div className="pl-3 space-y-2">
          <p className="text-xs text-gray-600 dark:text-slate-400 font-medium">Motivo (aparece na lista da equipe)</p>
          {MOTIVOS.map((m) => (
            <label key={m.valor} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name={`${nome}-motivo`}
                checked={valor.motivo === m.valor}
                onChange={() => onChange({ ...valor, motivo: m.valor })}
                className="h-4 w-4 border-gray-300"
              />
              <span className="text-sm text-gray-800 dark:text-slate-200">{m.titulo}</span>
              <span className="text-xs text-gray-500 dark:text-slate-400">{m.ajuda}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
