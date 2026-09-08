/**
 * Exportação da planilha de Clientes Proprietários para .xlsx.
 *
 * Reaproveita o gerador estilizado dos Relatórios (banda de título, cabeçalho
 * colorido, zebra, bordas, moeda formatada, cabeçalho congelado) em vez de
 * montar um segundo estilo de planilha.
 *
 * Duas abas:
 *  - "Proprietários": uma linha por pessoa (o que a tela mostra);
 *  - "Imóveis": uma linha por imóvel, para cruzar dono × imóvel.
 */

import {
  Block,
  downloadBlob,
  renderBlock,
} from '@/features/relatorios/export/generators/excelReportGenerator';
import type { ProprietarioRow } from './proprietarioService';

/** "R$ 498.200" — o parseCell do gerador reconhece e grava como número. */
const moeda = (v: number): string =>
  v > 0 ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : '';

const data = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '';

export function blocoProprietarios(linhas: ProprietarioRow[]): Block {
  return {
    columns: [
      'Proprietário',
      'Celular',
      'Tel. residencial',
      'Tel. comercial',
      'E-mail',
      'Imóveis',
      'À venda',
      'Para locação',
      'Exclusivos',
      'Bairros',
      'Cidades',
      'Valor em venda',
      'Valor em locação',
      'Último cadastro',
    ],
    rows: linhas.map((p) => [
      p.nome,
      p.telefone ?? '',
      p.tel_residencial ?? '',
      p.tel_comercial ?? '',
      p.email ?? '',
      p.total_imoveis,
      p.imoveis_venda,
      p.imoveis_locacao,
      p.exclusivos,
      p.bairros.join(', '),
      p.cidades.join(', '),
      moeda(p.valor_venda_total),
      moeda(p.valor_locacao_total),
      data(p.ultimo_cadastro),
    ]),
  };
}

export function blocoImoveis(linhas: ProprietarioRow[]): Block {
  return {
    columns: [
      'Proprietário',
      'Celular',
      'Código',
      'Tipo',
      'Finalidade',
      'Endereço',
      'Bairro',
      'Cidade',
      'CEP',
      'Área total (m²)',
      'Área útil (m²)',
      'Quartos',
      'Banheiros',
      'Vagas',
      'Valor de venda',
      'Valor de locação',
      'Exclusivo',
      'Status',
      'Cadastrado em',
    ],
    rows: linhas.flatMap((p) =>
      p.imoveis.map((i) => [
        p.nome,
        p.telefone ?? '',
        i.codigo_imovel,
        i.tipo ?? '',
        i.finalidade ?? '',
        [i.logradouro, i.numero].filter(Boolean).join(', '),
        i.bairro ?? '',
        i.cidade ?? '',
        i.cep ?? '',
        i.area_total ?? 0,
        i.area_util ?? 0,
        i.quartos ?? 0,
        i.banheiros ?? 0,
        i.vagas ?? 0,
        moeda(i.valor_venda ?? 0),
        moeda(i.valor_locacao ?? 0),
        i.exclusivo ? 'Sim' : 'Não',
        i.status_aprovacao ?? '',
        data(i.created_at),
      ]),
    ),
  };
}

export interface ExportarProprietariosArgs {
  proprietarios: ProprietarioRow[];
  /** 'vendedor' | 'locatario' — vira subtítulo e entra no nome do arquivo. */
  tipo: 'vendedor' | 'locatario';
  tenantName?: string | null;
}

/**
 * Monta e baixa o .xlsx. Devolve o nome do arquivo gerado.
 * Chame apenas para admin/owner — o gate fica na UI que dispara.
 */
export async function exportarProprietariosXlsx({
  proprietarios,
  tipo,
  tenantName,
}: ExportarProprietariosArgs): Promise<string> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OctoDash';
  workbook.created = new Date();

  const titulo = ['Clientes Proprietários', tenantName].filter(Boolean).join(' — ');
  const subtitulo = `${tipo === 'locatario' ? 'Locatários' : 'Vendedores'} • ${proprietarios.length} ${
    proprietarios.length === 1 ? 'proprietário' : 'proprietários'
  } • gerado em ${new Date().toLocaleString('pt-BR')}`;

  const abaPessoas = workbook.addWorksheet('Proprietários', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  renderBlock(abaPessoas, titulo, subtitulo, blocoProprietarios(proprietarios));

  const imoveis = blocoImoveis(proprietarios);
  if (imoveis.rows.length > 0) {
    const abaImoveis = workbook.addWorksheet('Imóveis', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    renderBlock(abaImoveis, titulo, `Um imóvel por linha • ${imoveis.rows.length} no total`, imoveis);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const nome = `clientes-proprietarios-${tipo}-${hoje}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, nome);
  return nome;
}
