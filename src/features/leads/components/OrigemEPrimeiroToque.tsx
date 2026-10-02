/**
 * Na criação do lead: de onde ele veio e, se o corretor já falou com o
 * cliente, o primeiro toque da cadência.
 *
 * Pedido do Erick em 01/10: "na área onde coloca pra criar um novo lead,
 * precisa ter o campo para o corretor falar o canal (se veio do portal, do
 * meta, do plantão, de contato pessoal do corretor...) e já pode colocar
 * cadência também, porque se o corretor fez, já conta desde o início".
 *
 * O canal vai para `leads.source` — a mesma coluna que os relatórios de
 * origem e o filtro de canal do Kanban já leem. Antes todo lead criado aqui
 * gravava 'Manual', e a origem se perdia.
 *
 * As opções vêm do cadastro de origens da imobiliária (Configurações). Vazio
 * — e em 01/10 estava vazio em todas as casas —, vale a lista padrão abaixo,
 * escrita com os nomes que a Lotus já usa nos leads (Instagram, Facebook,
 * ZAP Imóveis, Imovelweb).
 */
import { useEffect, useState } from 'react';
import { Megaphone, PhoneCall } from 'lucide-react';
import { fetchOrigens } from '@/features/relatorios/services/origemRegistryService';
import { CANAIS, RESULTADOS } from '../utils/cadenciaToques';
import type { CanalToque, NovoToque, ResultadoToque } from '../services/toquesService';

export const CANAIS_DE_ORIGEM_PADRAO = [
  'Contato pessoal do corretor',
  'Indicação',
  'Plantão',
  'Instagram',
  'Facebook',
  'ZAP Imóveis',
  'Imovelweb',
  'Outro portal',
  'Outro',
];

type Proximo = 'nenhum' | 'amanha' | 'tres_dias';

export interface PrimeiroToque {
  canal: CanalToque | '';
  resultado: ResultadoToque | '';
  proximo: Proximo;
}

export const PRIMEIRO_TOQUE_VAZIO: PrimeiroToque = { canal: '', resultado: '', proximo: 'nenhum' };

/**
 * O toque a registrar, `null` quando o corretor não preencheu nada, ou a frase
 * do que falta. "Próximo" às 9h: é a hora em que o aviso chega — e o próximo
 * vira atividade de retorno na agenda, por isso o padrão é não ter próximo.
 */
export function toqueDaCriacao(t: PrimeiroToque, agora = new Date()): NovoToque | null | string {
  if (!t.canal && !t.resultado) return null;
  if (!t.canal) return 'Diga por onde foi o primeiro contato.';
  if (!t.resultado) return 'Diga como foi o primeiro contato.';
  let proximo: string | null = null;
  if (t.proximo !== 'nenhum') {
    const d = new Date(agora);
    d.setDate(d.getDate() + (t.proximo === 'amanha' ? 1 : 3));
    d.setHours(9, 0, 0, 0);
    proximo = d.toISOString();
  }
  return { canal: t.canal, resultado: t.resultado, proximo_toque_em: proximo };
}

const rotulo = 'flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5';
const campo = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60';

export function OrigemEPrimeiroToque({ tenantId, origem, onOrigem, toque, onToque, disabled }: {
  tenantId: string | null | undefined;
  origem: string;
  onOrigem: (v: string) => void;
  toque: PrimeiroToque;
  onToque: (t: PrimeiroToque) => void;
  disabled?: boolean;
}) {
  const [opcoes, setOpcoes] = useState(CANAIS_DE_ORIGEM_PADRAO);
  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    let ativo = true;
    fetchOrigens(tenantId).then((origens) => {
      const nomes = origens.filter((o) => o.ativo).map((o) => o.nome);
      if (ativo && nomes.length > 0) setOpcoes(nomes);
    });
    return () => { ativo = false; };
  }, [tenantId]);

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="origem-do-lead" className={rotulo}>
          <Megaphone className="w-4 h-4 text-slate-400" />
          De onde veio o lead *
        </label>
        <select id="origem-do-lead" value={origem} onChange={(e) => onOrigem(e.target.value)} disabled={disabled} className={campo}>
          <option value="">Escolha o canal…</option>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <fieldset className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <legend className={`${rotulo} px-1 mb-0`}>
          <PhoneCall className="w-4 h-4 text-slate-400" />
          Já fez o primeiro contato? <span className="font-normal text-slate-400">(entra na cadência)</span>
        </legend>
        <div className="grid gap-2">
          <select aria-label="Por onde foi o contato" value={toque.canal} disabled={disabled}
            onChange={(e) => onToque({ ...toque, canal: e.target.value as PrimeiroToque['canal'] })} className={campo}>
            <option value="">Ainda não</option>
            {CANAIS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select aria-label="Como foi o contato" value={toque.resultado} disabled={disabled || !toque.canal}
            onChange={(e) => onToque({ ...toque, resultado: e.target.value as PrimeiroToque['resultado'] })} className={campo}>
            <option value="">Resultado…</option>
            {RESULTADOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select aria-label="Próximo toque" value={toque.proximo} disabled={disabled || !toque.canal}
            onChange={(e) => onToque({ ...toque, proximo: e.target.value as Proximo })} className={campo}>
            <option value="nenhum">Sem próximo</option>
            <option value="amanha">Próximo amanhã, 9h</option>
            <option value="tres_dias">Próximo em 3 dias</option>
          </select>
        </div>
      </fieldset>
    </div>
  );
}
