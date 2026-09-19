/**
 * Seleção de construtora com busca (P0.3).
 *
 * Substitui o campo de texto livre dos formulários de lançamento e condomínio.
 * Era o texto livre que produzia "Tebas" e "tebas", "Sebel" e "SEBEL
 * EMPREENDIMENTOS" como construtoras diferentes.
 *
 * Guarda as DUAS coisas: o vínculo (`construtoraId`, que é o que vale daqui em
 * diante) e o texto (`nome`), porque a coluna de texto continua sendo lida
 * pelo Portal público do site. Renomeia antes de dropar.
 *
 * Aceita texto que ainda não está no cadastro, de propósito: quem está
 * cadastrando um lançamento às onze da noite não pode ficar bloqueado. O
 * campo avisa que a construtora é nova e oferece cadastrar.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Construtora } from '../services/construtorasService';

interface ConstrutoraSelectProps {
  id?: string;
  construtoras: Construtora[];
  /** O texto gravado hoje — pode não estar no cadastro ainda. */
  nome: string;
  construtoraId: string | null;
  onChange: (valor: { nome: string; construtoraId: string | null }) => void;
  onCadastrar?: (nome: string) => void;
  disabled?: boolean;
}

const chave = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function ConstrutoraSelect({
  id,
  construtoras,
  nome,
  construtoraId,
  onChange,
  onCadastrar,
  disabled,
}: ConstrutoraSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');

  const ativas = useMemo(() => construtoras.filter((c) => c.ativa), [construtoras]);

  const filtradas = useMemo(() => {
    const k = chave(busca);
    if (!k) return ativas;
    return ativas.filter((c) => chave(c.nome).includes(k) || chave(c.razaoSocial ?? '').includes(k));
  }, [ativas, busca]);

  // Texto preenchido que não casa com nada do cadastro: é o caso que produzia
  // duplicata por grafia, então a tela avisa em vez de aceitar calado.
  const foraDoCadastro =
    Boolean(nome.trim()) && !construtoraId && !ativas.some((c) => chave(c.nome) === chave(nome));

  const escolher = (c: Construtora) => {
    onChange({ nome: c.nome, construtoraId: c.id });
    setAberto(false);
    setBusca('');
  };

  return (
    <div className="space-y-1.5">
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setAberto((v) => !v)}
        className="w-full justify-between font-normal"
      >
        <span className={cn('truncate', !nome && 'text-muted-foreground')}>
          {nome || 'Selecione a construtora'}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {foraDoCadastro && (
        <p className="flex items-start gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            “{nome}” ainda não está no cadastro. Sem cadastrar, ela pode acabar repetida com outra
            grafia.
          </span>
        </p>
      )}

      {aberto && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar construtora…"
            className="h-9"
          />

          <div className="mt-2 max-h-56 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="px-2 py-3 text-[13px] text-muted-foreground">
                {ativas.length === 0
                  ? 'Nenhuma construtora cadastrada ainda.'
                  : 'Nenhuma construtora com esse nome.'}
              </p>
            ) : (
              filtradas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => escolher(c)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{c.nome}</span>
                    {c.razaoSocial && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {c.razaoSocial}
                      </span>
                    )}
                  </span>
                  {construtoraId === c.id && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              ))
            )}
          </div>

          {onCadastrar && busca.trim() && filtradas.length === 0 && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 w-full justify-start text-[13px]"
              onClick={() => {
                onCadastrar(busca.trim());
                setAberto(false);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Cadastrar “{busca.trim()}”
            </Button>
          )}

          {nome && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 w-full justify-start text-[13px] text-muted-foreground"
              onClick={() => {
                onChange({ nome: '', construtoraId: null });
                setAberto(false);
              }}
            >
              Limpar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
