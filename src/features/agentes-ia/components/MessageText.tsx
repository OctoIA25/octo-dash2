/**
 * Renderiza o texto de uma mensagem de agente interpretando um subconjunto de
 * Markdown (títulos #/##/###, negrito **, listas com - e numeradas 1.).
 *
 * Compartilhado entre os chats dos agentes (Marketing/Caio e Comportamental/Elaine)
 * para que todos renderizem a resposta de forma consistente. NÃO usa
 * dangerouslySetInnerHTML: o conteúdo vira nós React, então o HTML do usuário/IA
 * continua escapado por padrão.
 */

/** Aplica formatação inline (apenas **negrito**) preservando o restante como texto. */
export function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={`${part}-${index}`} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

/**
 * Remove a sintaxe Markdown, deixando texto puro para colar em WhatsApp/e-mail.
 * A tela renderiza o Markdown bonito, mas ao copiar o usuário quer o conteúdo
 * sem os marcadores crus (#, **, *, `, -, [texto](url)).
 */
export function stripMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let out = line.replace(/^\s*#{1,6}\s+/, ''); // títulos: # a ######
      out = out.replace(/^(\s*)[-*+]\s+/, '$1• '); // listas: -, *, + → •
      out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links: [texto](url) → texto
      out = out.replace(/(\*\*|__)(.+?)\1/g, '$2'); // negrito
      out = out.replace(/(\*|_)(.+?)\1/g, '$2'); // itálico
      out = out.replace(/`([^`]+)`/g, '$1'); // código inline
      return out;
    })
    .join('\n');
}

/** Copia o conteúdo sem Markdown quando o usuário seleciona e usa Ctrl+C. */
function handleCopy(event: React.ClipboardEvent<HTMLDivElement>) {
  const selected = window.getSelection()?.toString();
  if (!selected) return;

  event.clipboardData.setData('text/plain', stripMarkdown(selected));
  event.preventDefault();
}

/** Renderiza o texto multilinha aplicando títulos, listas e parágrafos. */
export function MessageText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-sm leading-relaxed" onCopy={handleCopy}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={`blank-${index}`} className="h-1" />;
        }

        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/); // Regex de markdown
        if (heading) {
          const level = heading[1].length;

          const className =
            level === 1
              ? 'text-base font-bold'
              : level === 2
                ? 'text-[15px] font-bold'
                : 'text-sm font-semibold';

          return (
            <p key={`heading-${index}`} className={className}>
              <InlineMarkdown text={heading[2]} />
            </p>
          );
        }

        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        if (bullet) {
          return (
            <div key={`bullet-${index}`} className="flex gap-2">
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span className="min-w-0">
                <InlineMarkdown text={bullet[1]} />
              </span>
            </div>
          );
        }

        const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (numbered) {
          return (
            <div key={`numbered-${index}`} className="flex gap-2">
              <span className="shrink-0 font-semibold opacity-70">{numbered[1]}.</span>
              <span className="min-w-0">
                <InlineMarkdown text={numbered[2]} />
              </span>
            </div>
          );
        }

        return (
          <p key={`line-${index}`}>
            <InlineMarkdown text={line} />
          </p>
        );
      })}
    </div>
  );
}
