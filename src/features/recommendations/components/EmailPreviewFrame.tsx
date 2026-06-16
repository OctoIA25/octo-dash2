/**
 * Preview fiel do e-mail: renderiza o HTML EXATO que será enviado, isolado num
 * iframe (sandbox) para que os estilos do e-mail não vazem para o app.
 */

interface EmailPreviewFrameProps {
  html: string;
}

export const EmailPreviewFrame = ({ html }: EmailPreviewFrameProps) => (
  <iframe
    title="Pré-visualização do e-mail"
    srcDoc={html}
    sandbox=""
    className="w-full h-[460px] rounded-lg border border-border bg-white"
  />
);
