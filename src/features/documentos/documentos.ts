/**
 * Pasta do cliente (P4.7) — a parte que pensa, sem tela e sem banco.
 *
 * A REGRA 1 DO PLANO MORA AQUI TAMBÉM: o que a IA leu entra no campo como
 * ponto de partida, nunca como resposta. `valorInicial` é o que a caixa mostra;
 * o que vale é o que a pessoa deixar nela e confirmar.
 */

import type { CampoDoDocumento, DocumentoDaPasta, Pasta } from './documentosService';

/** Abaixo disto a leitura vem em amarelo (Regra 2). */
export const CONFIANCA_MINIMA = 0.8;

/**
 * O que a caixa de texto mostra ao abrir.
 *
 * Já confirmado vence a sugestão: reabrir um documento conferido não pode
 * trocar o que a pessoa decidiu pelo que a máquina achou.
 */
export const valorInicial = (c: CampoDoDocumento): string =>
  c.valor_final ?? c.valor_sugerido ?? '';

/** O que vai para o banco na confirmação: o que está na tela, campo a campo. */
export function camposParaConfirmar(
  campos: CampoDoDocumento[],
  edicoes: Record<string, string>
): Array<{ campo: string; valor: string }> {
  return (campos ?? []).map((c) => ({
    campo: c.campo,
    valor: (edicoes[c.campo] ?? valorInicial(c)).trim(),
  }));
}

/**
 * Se o botão de confirmar pode ficar habilitado.
 *
 * Só olha o que a pessoa vê: campo obrigatório vazio. O erro de verdade — CPF
 * com dígito errado, holerite vencido — quem decide é o banco, na hora de
 * confirmar. Repetir a regra aqui seria uma segunda verdade sobre o mesmo dado,
 * e a que estivesse desatualizada mentiria.
 */
export function faltaPreencher(
  campos: CampoDoDocumento[],
  edicoes: Record<string, string>
): string[] {
  return (campos ?? [])
    .filter((c) => c.obrigatorio && !(edicoes[c.campo] ?? valorInicial(c)).trim())
    .map((c) => c.rotulo);
}

export const ROTULO_DO_STATUS: Record<DocumentoDaPasta['status'], string> = {
  enviado: 'Aguardando conferência',
  lido: 'Lido — falta conferir',
  conferido: 'Conferido',
  recusado: 'Recusado',
};

/**
 * A frase que diz de onde veio a leitura.
 *
 * Dizer "lido pela LIA" é diferente de "conferido": quem lê a tela precisa
 * saber que aquilo ainda é palpite de máquina. É a Regra 1 aparecendo em letra.
 */
export function comoFoiLido(d: Pick<DocumentoDaPasta, 'status' | 'lido_por'>): string | null {
  if (d.status === 'conferido') return null;
  if (d.lido_por === 'ia') return 'A LIA leu e sugeriu os campos. Falta uma pessoa conferir.';
  if (d.lido_por === 'regra') return 'Lido pelo padrão aprendido deste layout. Falta uma pessoa conferir.';
  return null;
}

/**
 * O placar da pasta: conta o que FALTA.
 *
 * Mesma escolha da conciliação bancária — é o número que decide se a pasta
 * pode ser dada por pronta, e ele some se a tela contar o que já foi feito.
 */
export function resumoDaPasta(p: Pasta | null | undefined): string {
  if (!p || p.total_tipos === 0) return 'Nenhum tipo de documento cadastrado.';
  if (p.faltam === 0) return `Pasta completa — os ${p.total_tipos} documentos foram conferidos.`;
  return `Faltam ${p.faltam} de ${p.total_tipos} documentos.`;
}

/**
 * O aviso do que precisa de olho.
 *
 * Separa "ninguém olhou ainda" de "alguém olhou e tem pendência": são coisas
 * diferentes e a segunda é mais urgente.
 */
export function avisoDaPasta(p: Pasta | null | undefined): string | null {
  const docs = (p?.tipos ?? []).flatMap((t) => t.documentos ?? []);
  const comAlerta = docs.filter((d) => d.status === 'lido' && d.alertas > 0).length;
  const recusados = docs.filter((d) => d.status === 'recusado').length;

  const partes: string[] = [];
  if (comAlerta > 0) partes.push(`${comAlerta} documento(s) com campo para revisar`);
  if (recusados > 0) partes.push(`${recusados} recusado(s), esperando reenvio`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** "97%" para a tela mostrar ao lado do campo lido pela máquina. */
export const confiancaEmTexto = (c: number | null | undefined): string | null =>
  c == null ? null : `${Math.round(c * 100)}%`;
