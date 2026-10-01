/**
 * A.7 · As abas da Universidade, no topo de Materiais de estudo.
 *
 * Aba vazia não aparece para a equipe: "Cursos" só com curso publicado (o
 * plano pede dois cursos reais antes de abrir), "Minha trilha" só para quem
 * monta trilhas ou já tem item na sua. A diretoria vê as duas sempre.
 */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { carregarCursos, carregarTrilha } from './universidadeService';

type Aba = 'cursos' | 'materiais' | 'trilha';

export function AbasDaUniversidade({ tenantId }: { tenantId: string }) {
  const { user } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const atual: Aba = params.get('aba') === 'cursos' ? 'cursos' : params.get('aba') === 'trilha' ? 'trilha' : 'materiais';
  const cursos = useQuery({ queryKey: ['universidade-cursos', tenantId], queryFn: () => carregarCursos(tenantId) });
  const minha = useQuery({
    queryKey: ['trilha', tenantId, user?.id], queryFn: () => carregarTrilha(tenantId, user!.id), enabled: !!user?.id,
  });

  const gere = cursos.data?.pode_gerir ?? false;
  const monta = gere || user?.systemRole === 'team_leader';
  const visiveis: Aba[] = [
    ...(gere || (cursos.data?.cursos.length ?? 0) > 0 ? (['cursos'] as const) : []),
    'materiais',
    ...(monta || (minha.data?.itens.length ?? 0) > 0 ? (['trilha'] as const) : []),
  ];
  if (visiveis.length === 1) return null;

  const trocar = (a: Aba) => {
    const p = new URLSearchParams(params);
    if (a === 'materiais') p.delete('aba'); else p.set('aba', a);
    p.delete('curso');
    setParams(p, { replace: true });
  };
  const rotulo: Record<Aba, string> = { cursos: 'Cursos', materiais: 'Materiais', trilha: monta ? 'Trilhas' : 'Minha trilha' };

  return (
    <div role="tablist" aria-label="Universidade" className="mb-4 inline-flex rounded-lg border border-border p-0.5">
      {visiveis.map((a) => (
        <button key={a} type="button" role="tab" aria-selected={atual === a} onClick={() => trocar(a)}
          className={`h-8 rounded-md px-3 text-sm font-medium ${atual === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
          {rotulo[a]}
        </button>
      ))}
    </div>
  );
}
