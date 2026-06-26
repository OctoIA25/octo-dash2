/**
 * WhatsAppPreview — mostra um texto como bolha de mensagem do WhatsApp dentro de
 * uma moldura de celular. No C1 o body vem cru (variáveis {{nome}} literais);
 * no C2 o chamador injeta valores reais. Apenas visual, sem estado.
 */
interface WhatsAppPreviewProps {
  body: string;
}

export function WhatsAppPreview({ body }: WhatsAppPreviewProps) {
  const hasBody = Boolean(body && body.trim());
  return (
    <div className="mx-auto w-[260px] rounded-[2rem] border-4 border-slate-800 bg-slate-800 shadow-lg">
      {/* topo do "celular" */}
      <div className="h-6 rounded-t-[1.6rem] bg-slate-800" />
      {/* tela com fundo estilo WhatsApp */}
      <div className="min-h-[320px] rounded-b-[1.6rem] bg-[#e5ddd5] dark:bg-[#0b141a] px-3 py-4">
        <div className="flex justify-end">
          <div
            data-testid="whatsapp-preview-bubble"
            className="max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 text-[13px] text-slate-800 dark:text-slate-100 shadow-sm whitespace-pre-wrap break-words"
          >
            {hasBody ? body : <span className="text-slate-400 dark:text-slate-500">Sua mensagem aparecerá aqui…</span>}
            <span className="block text-right text-[10px] text-slate-500 dark:text-slate-400 mt-1">agora ✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WhatsAppPreview;
