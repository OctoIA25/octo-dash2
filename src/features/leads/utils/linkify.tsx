import type { ReactNode } from 'react';

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;

/**
 * Torna URLs de um texto clicáveis, preservando o restante como texto puro.
 * Usado nas Observações do lead — a descrição vinda dos portais carrega o
 * link da conversa WhatsApp anexado pelo trigger do banco.
 */
export function linkify(texto: string): ReactNode[] {
  return texto.split(URL_SPLIT).map((parte, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={parte}
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-600 dark:text-emerald-400 hover:underline break-all"
      >
        {parte}
      </a>
    ) : (
      parte
    ),
  );
}
