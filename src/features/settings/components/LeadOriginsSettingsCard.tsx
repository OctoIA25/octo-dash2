/**
 * Cadastro de Origem de Lead (Configurações > Canais de Lead).
 *
 * O problema que resolve (P0.4): hoje a origem é o texto cru que a
 * integração manda. Daí a mesma LIA aparece cinco vezes, "Excel" vira um
 * canal de captação e "Santa Angela" — uma construtora — vira origem.
 *
 * Duas listas:
 *   1. o que CHEGA nos leads, com a origem que o sistema resolveu para cada
 *      texto e um seletor para corrigir;
 *   2. o CADASTRO em si — nome, cor, ordem e as duas chaves (mídia paga,
 *      orgânica) que os relatórios usam.
 *
 * Nada some do relatório: origem sem cadastro cai na sugestão mecânica, e
 * sugestão que não casa cai no próprio texto.
 */

import { useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrigemRegistry } from '@/features/relatorios/hooks/useOrigemRegistry';
import { chaveOrigem, sugerirOrigem, type OrigemCadastrada } from '@/features/relatorios/utils/origemRegistry';
import { Tags, Trash2, Loader2, Plus, Sparkles, UserCheck, HelpCircle } from 'lucide-react';

const SEM_CADASTRO = '__sem_cadastro__';

interface LeadOriginsSettingsCardProps {
  leads?: ProcessedLead[];
}

interface TextoBrutoRow {
  chave: string;
  /** O texto como aparece no lead (a variante mais recente encontrada). */
  texto: string;
  total: number;
}

/** "Lia (Japi Terceiros)" -> "lia_japi_terceiros". Sugestão; o admin edita. */
function codigoSugerido(texto: string): string {
  return chaveOrigem(texto).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'origem';
}

const CORES_PADRAO = ['#0F6B54', '#1877F2', '#E4405F', '#F59E0B', '#8B5CF6', '#64748B'];

export const LeadOriginsSettingsCard = ({ leads }: LeadOriginsSettingsCardProps) => {
  const { toast } = useToast();
  const {
    origens,
    conversoes,
    loading,
    saving,
    resolver,
    salvarOrigem,
    removerOrigem,
    salvarConversao,
    removerConversao,
  } = useOrigemRegistry();

  const [novoNome, setNovoNome] = useState('');

  // Os textos crus que realmente chegam nos leads deste tenant.
  const textosBrutos: TextoBrutoRow[] = useMemo(() => {
    const contagem: Record<string, TextoBrutoRow> = {};
    (leads ?? []).forEach((l) => {
      const texto = (l.origem_lead || '').trim();
      if (!texto) return;
      const chave = chaveOrigem(texto);
      if (!contagem[chave]) contagem[chave] = { chave, texto, total: 0 };
      contagem[chave].total += 1;
    });
    return Object.values(contagem).sort((a, b) => b.total - a.total);
  }, [leads]);

  const avisa = (ok: boolean, titulo: string, descricao: string) => {
    toast(
      ok
        ? { title: titulo, description: descricao, duration: 3000 }
        : {
            title: 'Não foi possível salvar',
            description: 'Tente novamente.',
            variant: 'destructive',
            duration: 4000,
          }
    );
  };

  const criarOrigem = async (nome: string, cor?: string) => {
    const limpo = nome.trim();
    if (!limpo) return;
    const ok = await salvarOrigem({
      codigo: codigoSugerido(limpo),
      nome: limpo,
      cor: cor ?? CORES_PADRAO[origens.length % CORES_PADRAO.length],
      ordem: origens.length + 1,
      midiaPaga: false,
      organica: false,
      ativo: true,
    });
    avisa(ok, 'Origem cadastrada', `"${limpo}" agora aparece nos relatórios com nome e cor próprios.`);
    if (ok) setNovoNome('');
  };

  const atualizar = async (origem: OrigemCadastrada, mudanca: Partial<OrigemCadastrada>) => {
    const { id, ...resto } = { ...origem, ...mudanca };
    const ok = await salvarOrigem(resto);
    if (!ok) avisa(false, '', '');
  };

  const ligarTexto = async (row: TextoBrutoRow, valor: string) => {
    if (valor === SEM_CADASTRO) {
      const ok = await removerConversao(row.texto);
      avisa(ok, 'Conversão removida', `"${row.texto}" voltou para a sugestão automática.`);
      return;
    }
    const alvo = origens.find((o) => o.codigo === valor);
    const ok = await salvarConversao(row.texto, valor);
    avisa(ok, 'Origem atualizada', `"${row.texto}" agora conta como "${alvo?.nome ?? valor}".`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-emerald-600/10 via-teal-600/10 to-emerald-600/10 border border-emerald-500/20 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Tags className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Origens de Lead
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              A origem que chega da integração é texto livre — por isso a mesma origem aparece escrita de
              várias formas e coisas que não são origem (como o método de importação) viram uma.
              Cadastre aqui as origens que a imobiliária reconhece e diga a qual delas cada texto pertence.
              O que não estiver cadastrado continua aparecendo, com o texto original.
            </p>
          </div>
          {(loading || saving) && <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />}
        </div>
      </div>

      {/* ═══ 1. O que chega nos leads ═══ */}
      <div>
        <h4 className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Origens encontradas nos leads
        </h4>
        {textosBrutos.length === 0 ? (
          <div
            className="border rounded-xl p-8 text-center"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'hsl(var(--border))' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma origem encontrada ainda. Assim que os leads chegarem, os textos aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {textosBrutos.map((row) => {
              const codigoLigado = conversoes[row.chave];
              const sugestao = sugerirOrigem(row.texto);
              const rotulo = resolver(row.texto);

              return (
                <div
                  key={row.chave}
                  className="flex flex-wrap items-center gap-3 p-4 rounded-xl border"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'hsl(var(--border))' }}
                >
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-[14px]" style={{ color: 'var(--text-primary)' }}>
                      {row.texto}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {row.total} {row.total === 1 ? 'lead' : 'leads'} · aparece nos relatórios como{' '}
                      <strong>{rotulo}</strong>
                    </p>
                  </div>

                  {codigoLigado ? (
                    <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1">
                      <UserCheck className="h-3 w-3" /> Cadastrada
                    </Badge>
                  ) : sugestao ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1">
                      <Sparkles className="h-3 w-3" /> Agrupada automaticamente
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                      <HelpCircle className="h-3 w-3" /> Sem cadastro
                    </Badge>
                  )}

                  <Select
                    value={codigoLigado ?? SEM_CADASTRO}
                    onValueChange={(v) => ligarTexto(row, v)}
                    disabled={saving}
                  >
                    <SelectTrigger
                      className="h-10 w-56"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'hsl(var(--border))',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <SelectValue placeholder="Escolher origem…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CADASTRO}>
                        {sugestao ? `Automático (${sugestao})` : 'Sem cadastro'}
                      </SelectItem>
                      {origens.map((o) => (
                        <SelectItem key={o.codigo} value={o.codigo}>
                          {o.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {!codigoLigado && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      disabled={saving}
                      title={`Cadastrar "${row.texto}" como uma origem`}
                      onClick={() => criarOrigem(row.texto)}
                      style={{ color: 'var(--text-secondary)', borderColor: 'hsl(var(--border))' }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ 2. O cadastro ═══ */}
      <div>
        <h4 className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Origens cadastradas
        </h4>

        <div className="flex items-center gap-2 mb-3">
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criarOrigem(novoNome);
            }}
            placeholder="Nome da nova origem (ex: Meta Lead Ads)"
            className="h-10 max-w-xs"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'hsl(var(--border))',
              color: 'var(--text-primary)',
            }}
          />
          <Button
            size="sm"
            className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!novoNome.trim() || saving}
            onClick={() => criarOrigem(novoNome)}
          >
            <Plus className="h-4 w-4 mr-1" /> Cadastrar
          </Button>
        </div>

        {origens.length === 0 ? (
          <div
            className="border rounded-xl p-8 text-center"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'hsl(var(--border))' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma origem cadastrada. Sem cadastro os relatórios mostram o texto cru, como hoje.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {origens.map((o) => (
              <div
                key={o.codigo}
                className="flex flex-wrap items-center gap-3 p-4 rounded-xl border"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'hsl(var(--border))' }}
              >
                <input
                  type="color"
                  value={o.cor}
                  aria-label={`Cor de ${o.nome}`}
                  disabled={saving}
                  onChange={(e) => atualizar(o, { cor: e.target.value })}
                  className="h-8 w-8 rounded cursor-pointer border-0 bg-transparent p-0"
                />

                <div className="flex-1 min-w-[180px]">
                  <Input
                    value={o.nome}
                    aria-label={`Nome de ${o.codigo}`}
                    disabled={saving}
                    onChange={(e) => atualizar(o, { nome: e.target.value })}
                    className="h-9 font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'hsl(var(--border))',
                      color: 'var(--text-primary)',
                    }}
                  />
                  {/* O código é a identidade nas integrações: renomear não quebra nada. */}
                  <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {o.codigo}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    Ordem
                  </span>
                  <Input
                    type="number"
                    value={o.ordem}
                    aria-label={`Ordem de ${o.nome}`}
                    disabled={saving}
                    onChange={(e) => atualizar(o, { ordem: Number(e.target.value) || 0 })}
                    className="h-9 w-16"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'hsl(var(--border))',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <Checkbox
                    checked={o.midiaPaga}
                    disabled={saving}
                    onCheckedChange={(v) => atualizar(o, { midiaPaga: v === true })}
                  />
                  Mídia paga
                </label>

                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <Checkbox
                    checked={o.organica}
                    disabled={saving}
                    onCheckedChange={(v) => atualizar(o, { organica: v === true })}
                  />
                  Orgânica
                </label>

                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <Checkbox
                    checked={o.ativo}
                    disabled={saving}
                    onCheckedChange={(v) => atualizar(o, { ativo: v === true })}
                  />
                  Ativa
                </label>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  title={`Apagar "${o.nome}" — os leads voltam a aparecer com o texto original`}
                  onClick={async () => {
                    const ok = await removerOrigem(o.codigo);
                    avisa(ok, 'Origem apagada', `Os leads de "${o.nome}" voltaram para o texto original.`);
                  }}
                  className="h-9 px-2 text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
