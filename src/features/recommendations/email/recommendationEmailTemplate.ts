/**
 * ✉️ Template de e-mail de recomendação de imóveis (puro).
 *
 * Renderiza o HTML e a versão texto do e-mail a partir de dados estruturados.
 * É a ÚNICA fonte de verdade do layout: o preview na UI e o corpo efetivamente
 * enviado usam exatamente este render — garantindo fidelidade total entre o que
 * o usuário vê e o que o lead recebe. Não contém regra de negócio.
 */

/** Imóvel já formatado para exibição no e-mail (sem dependência do domínio). */
export interface EmailImovel {
  referencia: string;
  titulo: string;
  /** Localização legível (ex.: "Centro, São Paulo - SP"). */
  localizacao: string;
  /** Preço já formatado (ex.: "R$ 450.000"). */
  precoFormatado: string;
  /** Atributos curtos (ex.: ["3 quartos", "2 banheiros", "120 m²"]). */
  atributos: string[];
  /** URL da foto de capa (opcional). */
  fotoUrl?: string;
  /** Link para a página do imóvel (CTA por item, opcional). */
  url?: string;
}

/** Dados de marca/remetente exibidos no cabeçalho e rodapé. */
export interface EmailBranding {
  empresaNome: string;
  corretorNome?: string;
  corretorEmail?: string;
  corretorTelefone?: string;
  /** Cor de destaque (hex). Default: azul da marca. */
  corPrimaria?: string;
  /** Texto e URL do call-to-action principal (opcional). */
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface RecommendationEmailData {
  leadNome: string;
  /** Mensagem personalizada escrita pelo corretor (texto simples, multilinha). */
  mensagem: string;
  imoveis: EmailImovel[];
  branding: EmailBranding;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_PRIMARY = '#2563eb';

/** Escapa HTML para impedir quebra de layout/injeção a partir de dados livres. */
export const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Assunto padrão, usado quando o usuário não personaliza. */
export const defaultSubject = (leadNome: string, count: number): string => {
  const nome = leadNome?.trim();
  const saudacao = nome ? `${nome}, ` : '';
  if (count === 1) return `${saudacao}encontramos um imóvel pra você`;
  return `${saudacao}encontramos ${count} imóveis pra você`;
};

const renderParagraphs = (mensagem: string): string =>
  escapeHtml(mensagem)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br />'))
    .filter((p) => p.trim().length > 0)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${p}</p>`,
    )
    .join('');

const renderImovelCard = (imovel: EmailImovel, cor: string): string => {
  const foto = imovel.fotoUrl
    ? `<img src="${escapeHtml(imovel.fotoUrl)}" alt="${escapeHtml(imovel.titulo)}" width="160" style="width:160px;height:120px;object-fit:cover;border-radius:8px;display:block;" />`
    : `<div style="width:160px;height:120px;border-radius:8px;background:#f3f4f6;"></div>`;

  const atributos = imovel.atributos
    .map(
      (a) =>
        `<span style="display:inline-block;font-size:12px;color:#6b7280;background:#f3f4f6;border-radius:9999px;padding:3px 10px;margin:0 6px 6px 0;">${escapeHtml(a)}</span>`,
    )
    .join('');

  const tituloLinkAberto = imovel.url
    ? `<a href="${escapeHtml(imovel.url)}" style="color:${cor};text-decoration:none;">`
    : '';
  const tituloLinkFechado = imovel.url ? '</a>' : '';

  const ctaItem = imovel.url
    ? `<a href="${escapeHtml(imovel.url)}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:${cor};text-decoration:none;">Ver imóvel →</a>`
    : '';

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:16px;vertical-align:top;width:160px;">${foto}</td>
      <td style="padding:16px 16px 16px 0;vertical-align:top;">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Ref. ${escapeHtml(imovel.referencia)}</div>
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:4px;">${tituloLinkAberto}${escapeHtml(imovel.titulo)}${tituloLinkFechado}</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:10px;">${escapeHtml(imovel.localizacao)}</div>
        <div style="font-size:18px;font-weight:800;color:${cor};margin-bottom:10px;">${escapeHtml(imovel.precoFormatado)}</div>
        <div>${atributos}</div>
        ${ctaItem}
      </td>
    </tr>
  </table>`;
};

/** Renderiza o e-mail completo (HTML + texto). */
export const renderRecommendationEmail = (
  data: RecommendationEmailData,
): RenderedEmail => {
  const cor = data.branding.corPrimaria || DEFAULT_PRIMARY;
  const empresa = data.branding.empresaNome || 'Sua imobiliária';
  const subject = defaultSubject(data.leadNome, data.imoveis.length);

  const cards = data.imoveis.map((i) => renderImovelCard(i, cor)).join('');

  const ctaPrincipal =
    data.branding.ctaLabel && data.branding.ctaUrl
      ? `<div style="text-align:center;margin:8px 0 24px;">
           <a href="${escapeHtml(data.branding.ctaUrl)}" style="display:inline-block;background:${cor};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:9999px;">${escapeHtml(data.branding.ctaLabel)}</a>
         </div>`
      : '';

  const assinatura = [
    data.branding.corretorNome,
    data.branding.corretorTelefone,
    data.branding.corretorEmail,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(String(line)))
    .join('<br />');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr>
            <td style="background:${cor};padding:24px 32px;">
              <div style="font-size:18px;font-weight:800;color:#ffffff;">${escapeHtml(empresa)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">Olá ${escapeHtml(data.leadNome || 'tudo bem')}!</p>
              ${renderParagraphs(data.mensagem)}
              <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin:24px 0 12px;">Imóveis selecionados pra você</div>
              ${cards}
              ${ctaPrincipal}
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                Qualquer dúvida, é só responder este e-mail.<br />
                ${assinatura}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <div style="font-size:12px;color:#9ca3af;">${escapeHtml(empresa)} — recomendações personalizadas de imóveis.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = renderText(data, empresa);

  return { subject, html, text };
};

/** Versão texto puro (fallback para clientes sem HTML). */
const renderText = (data: RecommendationEmailData, empresa: string): string => {
  const lines: string[] = [];
  lines.push(empresa.toUpperCase());
  lines.push('');
  lines.push(`Olá ${data.leadNome || 'tudo bem'}!`);
  lines.push('');
  lines.push(data.mensagem.trim());
  lines.push('');
  lines.push('IMÓVEIS SELECIONADOS PRA VOCÊ');
  lines.push('');
  for (const imovel of data.imoveis) {
    lines.push(`• ${imovel.titulo} (Ref. ${imovel.referencia})`);
    lines.push(`  ${imovel.localizacao}`);
    lines.push(`  ${imovel.precoFormatado}`);
    if (imovel.atributos.length) lines.push(`  ${imovel.atributos.join(' · ')}`);
    if (imovel.url) lines.push(`  ${imovel.url}`);
    lines.push('');
  }
  if (data.branding.ctaLabel && data.branding.ctaUrl) {
    lines.push(`${data.branding.ctaLabel}: ${data.branding.ctaUrl}`);
    lines.push('');
  }
  const assinatura = [
    data.branding.corretorNome,
    data.branding.corretorTelefone,
    data.branding.corretorEmail,
  ].filter(Boolean);
  if (assinatura.length) {
    lines.push('—');
    lines.push(...assinatura.map(String));
  }
  return lines.join('\n');
};
