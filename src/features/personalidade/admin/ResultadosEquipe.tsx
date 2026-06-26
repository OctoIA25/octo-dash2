/**
 * "Resultados da Equipe" — página com abas que substitui o Relatório Geral e os 3
 * modais de Statistics (DISC/Eneagrama/MBTI). Navegação por abas + drawer lateral
 * no drill-down do corretor (sem modais aninhados).
 *
 * Apresentação pura: agregação vem do testesEstatisticasService; perfis individuais
 * dos services do corretor. Nada de cálculo aqui.
 */

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEstatisticasEquipe } from './useEstatisticasEquipe';
import { distDisc, distEneagrama, distMbti, unirCorretores } from './distribuicoes';
import { AdesaoCard } from './components/AdesaoCard';
import { DistribuicaoBarras } from './components/DistribuicaoBarras';
import { CorretorRow } from './components/CorretorRow';
import { CorretorPainel } from './components/CorretorPainel';
import type { Metodologia } from '@/features/personalidade/components/tokens';

type Aba = 'overview' | Metodologia;

const ABAS_VALIDAS: Aba[] = ['overview', 'disc', 'eneagrama', 'mbti'];

interface AbaInicial {
  abaInicial?: Aba;
}

export function ResultadosEquipe({ abaInicial }: AbaInicial) {
  // tab da URL (?tab=disc) define a aba inicial quando vier dos atalhos do gestor.
  const tabUrl = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('tab');
  const abaPadrao: Aba = abaInicial ?? (ABAS_VALIDAS.includes(tabUrl as Aba) ? (tabUrl as Aba) : 'overview');
  const { loading, stats, totalCorretores } = useEstatisticasEquipe();
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<{ id: number; nome: string } | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<{ met: Metodologia; chave: string } | null>(null);

  const corretores = useMemo(
    () => unirCorretores(stats.disc, stats.eneagrama, stats.mbti),
    [stats],
  );

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return corretores.filter((c) => {
      if (termo && !c.nome.toLowerCase().includes(termo)) return false;
      if (filtroTipo) {
        if (filtroTipo.met === 'disc') return c.discTipo === filtroTipo.chave;
        if (filtroTipo.met === 'eneagrama') return String(c.eneagramaTipo) === filtroTipo.chave;
        if (filtroTipo.met === 'mbti') return (c.mbtiTipo ?? '').split('-')[0] === filtroTipo.chave;
      }
      return true;
    });
  }, [corretores, busca, filtroTipo]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'hsl(var(--text-secondary))' }} />
      </div>
    );
  }

  const lista = (
    <div className="space-y-2">
      {listaFiltrada.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'hsl(var(--text-secondary))' }}>
          Nenhum corretor encontrado.
        </p>
      ) : (
        listaFiltrada.map((c) => (
          <CorretorRow
            key={c.id}
            nome={c.nome}
            chips={c.chips}
            totalFeitos={c.totalFeitos}
            onClick={() => setSelecionado({ id: c.id, nome: c.nome })}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="min-h-screen p-6 sm:p-10" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'hsl(var(--text-primary))' }}>
            Resultados da Equipe
          </h1>
          <p className="text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>
            Como sua equipe age, pensa e se desenvolve
          </p>
        </header>

        <Tabs defaultValue={abaPadrao}>
          <TabsList>
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="disc">DISC</TabsTrigger>
            <TabsTrigger value="eneagrama">Eneagrama</TabsTrigger>
            <TabsTrigger value="mbti">MBTI</TabsTrigger>
          </TabsList>

          {/* VISÃO GERAL */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {stats.disc && <AdesaoCard nome="DISC" comTeste={stats.disc.comTeste} total={totalCorretores} metodologia="disc" />}
              {stats.mbti && <AdesaoCard nome="MBTI" comTeste={stats.mbti.comTeste} total={totalCorretores} metodologia="mbti" />}
              {stats.eneagrama && <AdesaoCard nome="Eneagrama" comTeste={stats.eneagrama.comTeste} total={totalCorretores} metodologia="eneagrama" />}
            </div>

            <BuscaCorretor busca={busca} setBusca={setBusca} />
            {lista}
          </TabsContent>

          {/* DISC */}
          <TabsContent value="disc" className="space-y-6 mt-6">
            {stats.disc && (
              <DistribuicaoBarras
                {...distDisc(stats.disc)}
                total={stats.disc.comTeste}
                metodologia="disc"
                onSelecionarTipo={(chave) => setFiltroTipo((f) => (f?.chave === chave && f.met === 'disc' ? null : { met: 'disc', chave }))}
                tipoSelecionado={filtroTipo?.met === 'disc' ? filtroTipo.chave : null}
              />
            )}
            <BuscaCorretor busca={busca} setBusca={setBusca} />
            {lista}
          </TabsContent>

          {/* ENEAGRAMA */}
          <TabsContent value="eneagrama" className="space-y-6 mt-6">
            {stats.eneagrama && (
              <DistribuicaoBarras
                {...distEneagrama(stats.eneagrama)}
                total={stats.eneagrama.comTeste}
                metodologia="eneagrama"
                onSelecionarTipo={(chave) => setFiltroTipo((f) => (f?.chave === chave && f.met === 'eneagrama' ? null : { met: 'eneagrama', chave }))}
                tipoSelecionado={filtroTipo?.met === 'eneagrama' ? filtroTipo.chave : null}
              />
            )}
            <BuscaCorretor busca={busca} setBusca={setBusca} />
            {lista}
          </TabsContent>

          {/* MBTI */}
          <TabsContent value="mbti" className="space-y-6 mt-6">
            {stats.mbti && (
              <DistribuicaoBarras
                {...distMbti(stats.mbti)}
                total={stats.mbti.comTeste}
                metodologia="mbti"
                onSelecionarTipo={(chave) => setFiltroTipo((f) => (f?.chave === chave && f.met === 'mbti' ? null : { met: 'mbti', chave }))}
                tipoSelecionado={filtroTipo?.met === 'mbti' ? filtroTipo.chave : null}
              />
            )}
            <BuscaCorretor busca={busca} setBusca={setBusca} />
            {lista}
          </TabsContent>
        </Tabs>
      </div>

      <CorretorPainel
        corretorId={selecionado?.id ?? null}
        corretorNome={selecionado?.nome ?? ''}
        onClose={() => setSelecionado(null)}
      />
    </div>
  );
}

function BuscaCorretor({ busca, setBusca }: { busca: string; setBusca: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--text-secondary))' }} />
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar corretor…"
        className="pl-9"
      />
    </div>
  );
}

export default ResultadosEquipe;
