/**
 * Histórico de alterações de um imóvel local.
 *
 * As linhas vêm de imoveis_locais_log, preenchida por trigger no banco — não há
 * escrita a partir daqui (a tabela é append-only e o front nem tem INSERT).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useCaptadores, mapCaptadoresPorId } from '@/features/imoveis/hooks/useCaptadores';
import { Loader2 } from 'lucide-react';

interface LogRow {
  id: string;
  acao: 'criado' | 'editado' | 'excluido';
  alteracoes: Record<string, { de: unknown; para: unknown }> | null;
  alterado_por: string | null;
  created_at: string;
}

/** Colunas que mudam sozinhas ou não dizem nada ao usuário. */
const CAMPOS_OCULTOS = new Set(['id', 'tenant_id', 'created_at', 'criado_por']);

const CAMPOS_MOEDA = new Set(['valor_venda', 'valor_locacao', 'valor_condominio', 'valor_iptu']);

const ROTULOS: Record<string, string> = {
  titulo: 'Título',
  tipo: 'Tipo',
  finalidade: 'Finalidade',
  logradouro: 'Logradouro',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  estado: 'Estado',
  cep: 'CEP',
  condominio_id: 'Condomínio',
  area_total: 'Área total',
  area_util: 'Área útil',
  metragem_m2: 'Metragem',
  quartos: 'Quartos',
  suites: 'Suítes',
  banheiros: 'Banheiros',
  vagas: 'Vagas',
  salas: 'Salas',
  valor_venda: 'Valor de venda',
  valor_locacao: 'Valor de locação',
  valor_condominio: 'Condomínio',
  valor_iptu: 'IPTU',
  descricao: 'Descrição',
  fotos: 'Fotos (quantidade)',
  publicar_site: 'Publicar no site',
  destaque: 'Destaque',
  super_destaque: 'Super destaque',
  exclusivo: 'Exclusivo',
  aceita_troca: 'Aceita troca',
  link_video: 'Vídeo',
  tour_virtual: 'Tour virtual',
  proprietario_nome: 'Proprietário',
  proprietario_telefone: 'Telefone do proprietário',
  proprietario_email: 'E-mail do proprietário',
  obs_interna: 'Observação interna',
  captador_id: 'Captador',
  status_aprovacao: 'Status de aprovação',
  motivo_aprovacao: 'Motivo da aprovação',
  aprovado_por: 'Aprovado por',
  aprovado_em: 'Aprovado em',
  codigo_imovel: 'Código',
  tipo_simplificado: 'Categoria',
  area_comum: 'Área comum',
  area_privativa: 'Área privativa',
};

export const rotuloCampo = (campo: string): string =>
  ROTULOS[campo] || campo.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const formatarValor = (campo: string, valor: unknown): string => {
  if (valor === null || valor === undefined || valor === '') return 'vazio';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length > 0 ? valor.join(', ') : 'vazio';
  if (typeof valor === 'number') {
    if (CAMPOS_MOEDA.has(campo)) {
      return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    }
    return String(valor);
  }
  if (typeof valor === 'object') return JSON.stringify(valor).slice(0, 80);
  const texto = String(valor);
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
};

const formatarData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

async function fetchHistorico(tenantId: string, codigoImovel: string): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from('imoveis_locais_log')
    .select('id, acao, alteracoes, alterado_por, created_at')
    .eq('tenant_id', tenantId)
    .eq('codigo_imovel', codigoImovel)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []) as LogRow[];
}

interface ImovelHistoricoProps {
  tenantId?: string;
  codigoImovel?: string;
}

export const ImovelHistorico = ({ tenantId, codigoImovel }: ImovelHistoricoProps) => {
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['imovel-historico', tenantId, codigoImovel],
    enabled: Boolean(tenantId && codigoImovel),
    queryFn: () => fetchHistorico(tenantId as string, codigoImovel as string),
  });

  const { data: captadores } = useCaptadores(tenantId);
  const nomePorId = mapCaptadoresPorId(captadores || []);
  // Sem autor = escrita do backend (sync, marca d'água, jobs).
  const autor = (userId: string | null) => (userId ? nomePorId[userId] || 'Usuário' : 'Sistema');

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando histórico…
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-text-secondary">Não foi possível carregar o histórico.</p>;
  }

  if (!logs || logs.length === 0) {
    return <p className="text-sm text-text-secondary">Nenhuma alteração registrada.</p>;
  }

  return (
    <ol className="space-y-3">
      {logs.map((log) => {
        const campos = Object.entries(log.alteracoes || {}).filter(
          ([campo]) => !CAMPOS_OCULTOS.has(campo)
        );

        return (
          <li key={log.id} className="rounded-lg border border-border p-3">
            <p className="text-xs text-text-secondary">
              {formatarData(log.created_at)} · {autor(log.alterado_por)}
            </p>
            <p className="text-sm font-medium text-text-primary capitalize">{log.acao}</p>
            {campos.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {campos.map(([campo, { de, para }]) => (
                  <li key={campo} className="text-xs text-text-secondary">
                    <span className="text-text-primary">{rotuloCampo(campo)}:</span>{' '}
                    {formatarValor(campo, de)} → {formatarValor(campo, para)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
};

