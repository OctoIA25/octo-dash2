/**
 * Abre o seletor de arquivos nativo por um <input> criado no document.body —
 * FORA da árvore de qualquer modal.
 *
 * Por quê: no Chrome/macOS, um <input type=file> embutido num modal com camada
 * de composição (ex.: DialogContent do Radix, que usa `transform` para
 * centralizar) faz o Chrome perder a pintura DESSE modal ao fechar/cancelar o
 * seletor nativo — o retângulo do modal fica branco mesmo com o conteúdo
 * intacto no DOM, e nada (resize, scroll, recompositing) recupera. O Safari
 * nunca teve o problema. Disparar o seletor por um input destacado do modal
 * evita o bug porque o picker deixa de estar associado à camada do modal.
 *
 * Resolve com a lista de arquivos selecionados (vazia se o usuário cancelar).
 */
export interface PickFilesOptions {
  /** Filtro do seletor, ex.: 'application/pdf,.pdf' ou 'image/*'. */
  accept?: string;
  /** Permite selecionar mais de um arquivo. */
  multiple?: boolean;
}

export function pickFiles(options?: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.accept) input.accept = options.accept;
    if (options?.multiple) input.multiple = true;
    // Mantém fora do fluxo visual sem usar display:none (alguns navegadores
    // ignoram .click() em inputs com display:none).
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocusFallback, true);
      input.remove();
      resolve(files);
    };

    input.addEventListener('change', () => {
      finish(input.files ? Array.from(input.files) : []);
    });

    // Forma correta de detectar cancelamento: evento nativo 'cancel'
    // (Chrome 113+, Safari 16.4+, Firefox 91+). Cancelar NÃO dispara 'change'.
    input.addEventListener('cancel', () => finish([]));

    // Fallback para navegadores sem o evento 'cancel': ao fechar o seletor a
    // janela reganha foco; um tick depois, se nada chegou, tratamos como
    // cancelado. O guard `settled` evita corrida com 'change'/'cancel'.
    const onFocusFallback = () => {
      setTimeout(() => {
        if (!settled) finish(input.files && input.files.length ? Array.from(input.files) : []);
      }, 300);
    };
    window.addEventListener('focus', onFocusFallback, true);

    document.body.appendChild(input);
    input.click();
  });
}
