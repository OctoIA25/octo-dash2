/**
 * Gerador de Relatório de Avaliação Imobiliária
 * Gera HTML completo com dados do estudo de mercado
 */

interface AmostraReport {
  link: string;
  valorTotal: number;
  metragem: number;
  estado: string;
  cidade: string;
  bairro: string;
  condominio: string;
  rua: string;
  imagem?: string;
  imagemZapImoveis?: string;
  diferenciais?: string;
  tipo?: string;
}

interface ReportData {
  amostras: AmostraReport[];
  metragemImovel: number;
  correcaoMercado: number;
  margemExclusividade: number;
  nomeCliente: string;
  enderecoImovel: string;
  observacoes: string;
  mediaPorM2: number;
  valorBase: number;
  valorMercado: number;
  valorExclusividade: number;
  // Dados do corretor
  corretorNome?: string;
  corretorEmail?: string;
  corretorTelefone?: string;
  corretorEquipe?: string;
  corretorRole?: string;
  corretorFoto?: string;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const getDataAtual = (): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
};

const getDataCurta = (): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
};

export function generateReport(data: ReportData, options?: { skipDownload?: boolean }): string {
  const validas = data.amostras.filter(a => a.valorTotal > 0 && a.metragem > 0);

  if (validas.length === 0) {
    alert('Preencha pelo menos um imóvel com valor e metragem para gerar o relatório.');
    return '';
  }

  const mediaMetragem = validas.reduce((s, a) => s + a.metragem, 0) / validas.length;
  const mediaValor = validas.reduce((s, a) => s + a.valorTotal, 0) / validas.length;

  const valorFinal = data.valorMercado;
  const piramidePercent = data.margemExclusividade > 0 ? data.margemExclusividade : 5;
  const valorBaseMedio = data.mediaPorM2 * data.metragemImovel;
  const valorJusto = data.valorMercado;
  const valorCompetitivo = data.valorMercado * 0.95;
  const valorMaximo = data.valorMercado * (1 + piramidePercent / 100);

  const letraImovel = (i: number) => String.fromCharCode(65 + i); // A, B, C...

  // ---- Gerar linhas da tabela ----
  const tabelaLinhas = validas.map((a, i) => `
    <tr style="border-bottom: 1px solid var(--border-light); background: ${i % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-card)'};">
      <td style="padding: 1rem; font-weight: 600; color: var(--accent-blue);">${i + 1}</td>
      <td style="padding: 1rem;">
        ${a.link ? `<a href="${a.link}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 500;">Ver Imóvel</a>` : `<span style="color: var(--text-secondary);">${a.rua || 'Sem endereço'}</span>`}
      </td>
      <td style="padding: 1rem; text-align: center; font-weight: 600;">${a.metragem}</td>
      <td style="padding: 1rem; text-align: right; font-weight: 600; color: var(--accent-green);">${formatCurrency(a.valorTotal)}</td>
      <td style="padding: 1rem; text-align: right; font-weight: 600; color: var(--accent-purple);">${formatCurrency(a.valorTotal / a.metragem)}</td>
    </tr>
  `).join('');

  // ---- Gerar galeria de imóveis ----
  const galeriaCards = validas.map((a, i) => {
    const imgSrc = a.imagemZapImoveis || a.imagem;
    const imgHtml = imgSrc
      ? `<img src="${imgSrc}" alt="Imóvel ${letraImovel(i)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);background:linear-gradient(135deg,var(--bg-tertiary),var(--bg-secondary));font-size:14px;">Sem imagem</div>`;

    const detalhes = [
      a.estado ? `<div class="detail-item"><span class="detail-label">Estado:</span><span class="detail-value">${a.estado}</span></div>` : '',
      a.cidade ? `<div class="detail-item"><span class="detail-label">Cidade:</span><span class="detail-value">${a.cidade}</span></div>` : '',
      a.bairro ? `<div class="detail-item"><span class="detail-label">Bairro:</span><span class="detail-value">${a.bairro}</span></div>` : '',
      a.rua ? `<div class="detail-item"><span class="detail-label">Endereço:</span><span class="detail-value">${a.rua}</span></div>` : '',
      a.condominio ? `<div class="detail-item"><span class="detail-label">Condomínio:</span><span class="detail-value">${a.condominio}</span></div>` : '',
      a.diferenciais ? `<div class="detail-item"><span class="detail-label">Diferenciais:</span><div class="detail-value" style="flex:1;">${a.diferenciais}</div></div>` : '',
    ].filter(Boolean).join('');

    return `
      <div class="gallery-card">
        <div class="gallery-image">${imgHtml}
          ${a.link ? `<div class="gallery-overlay"><a href="${a.link}" target="_blank" rel="noopener noreferrer" class="gallery-link">Ver Imóvel</a></div>` : ''}
        </div>
        <div class="gallery-content">
          <div class="gallery-header">
            <h3 class="gallery-title">Imóvel ${letraImovel(i)}</h3>
            <div class="gallery-badge">${a.metragem}m²</div>
          </div>
          <div class="gallery-details">${detalhes}</div>
          <div class="price-summary">
            <div class="price-item"><span class="price-label">Valor Total</span><span class="price-value total">${formatCurrency(a.valorTotal)}</span></div>
            <div class="price-item"><span class="price-label">Valor por m²</span><span class="price-value per-sqm">${formatCurrency(a.valorTotal / a.metragem)}/m²</span></div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ---- Dados para gráficos ----
  const labels = validas.map((_, i) => `'Imóvel ${i + 1}'`).join(',');
  const precosM2 = validas.map(a => Math.round(a.valorTotal / a.metragem)).join(',');
  const precosTotal = validas.map(a => a.valorTotal).join(',');
  const scatterData = validas.map(a => `{x:${a.metragem},y:${a.valorTotal}}`).join(',');

  // ---- HTML Completo ----
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Avaliação Imobiliária</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
  <style>
    :root{--bg-primary:#fff;--bg-secondary:#f7f6f3;--bg-tertiary:#f1f1ef;--bg-card:#fff;--text-primary:#2f3437;--text-secondary:#787774;--text-muted:#9b9a97;--accent-blue:#2383e2;--accent-green:#0f7b6c;--accent-red:#e03e3e;--accent-yellow:#dfab01;--accent-purple:#6940a5;--accent-orange:#d9730d;--border-light:#e9e9e7;--border-medium:#e3e2e0;--shadow-sm:0 1px 2px rgba(0,0,0,.04);--shadow-md:0 2px 4px rgba(0,0,0,.06);--shadow-lg:0 4px 8px rgba(0,0,0,.08)}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg-primary);color:var(--text-primary);line-height:1.5;font-size:16px}
    .header{background:var(--bg-primary);border-bottom:1px solid var(--border-light);padding:1rem 0}
    .header-content{max-width:1200px;margin:0 auto;padding:0 2rem;display:flex;align-items:center;justify-content:space-between}
    .logo{display:flex;align-items:center;gap:.5rem;font-weight:600;font-size:1.1rem}
    .logo img{height:40px;width:auto}
    .container{max-width:1200px;margin:0 auto;padding:0 2rem}
    .page-title-section{background:var(--bg-secondary);padding:3rem 0;text-align:center;border-bottom:1px solid var(--border-light)}
    .page-title{font-size:2.5rem;font-weight:700;margin-bottom:.5rem}
    .page-subtitle{color:var(--text-secondary);font-size:1.1rem}
    .section{padding:3rem 0;border-bottom:1px solid var(--border-light)}
    .section-title{font-size:1.5rem;font-weight:600;margin-bottom:2rem;display:flex;align-items:center;gap:.5rem}
    .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:2rem;margin-bottom:2rem}
    .info-card{background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;padding:1.5rem;box-shadow:var(--shadow-sm)}
    .info-card-title{font-weight:600;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem}
    .info-item{display:flex;justify-content:space-between;margin-bottom:.5rem}
    .info-label{color:var(--text-secondary);font-weight:500}
    .info-value{font-weight:600}
    .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.5rem;margin-bottom:3rem}
    .summary-card{background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;padding:1.5rem;box-shadow:var(--shadow-sm)}
    .summary-card-title{font-weight:600;color:var(--text-secondary);font-size:.9rem;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.5px}
    .summary-card-value{font-size:1.8rem;font-weight:700;color:var(--accent-blue);margin-bottom:.25rem}
    .summary-card-subtitle{color:var(--text-secondary);font-size:.9rem}
    .charts-section{background:var(--bg-secondary);padding:3rem 0;border-bottom:1px solid var(--border-light)}
    .charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:2rem}
    .chart-card{background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;padding:1.5rem;box-shadow:var(--shadow-sm)}
    .chart-title{font-weight:600;margin-bottom:1rem;font-size:1.1rem}
    .chart-container{height:300px;position:relative}
    .property-gallery-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:2rem;margin-top:2rem}
    .gallery-card{background:var(--bg-card);border:1px solid var(--border-light);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm);transition:all .3s ease}
    .gallery-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
    .gallery-image{position:relative;height:240px;overflow:hidden;background:var(--bg-tertiary)}
    .gallery-image img{width:100%;height:100%;object-fit:cover}
    .gallery-overlay{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom,transparent,rgba(0,0,0,.7));display:flex;align-items:flex-end;justify-content:center;padding:1rem;opacity:0;transition:opacity .3s}
    .gallery-card:hover .gallery-overlay{opacity:1}
    .gallery-link{background:var(--accent-blue);color:#fff;padding:.5rem 1rem;border-radius:6px;text-decoration:none;font-weight:500;font-size:.9rem}
    .gallery-content{padding:1.5rem}
    .gallery-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;gap:1rem}
    .gallery-title{font-size:1.1rem;font-weight:600}
    .gallery-badge{background:var(--accent-blue);color:#fff;padding:.35rem .75rem;border-radius:6px;font-size:.85rem;font-weight:600;white-space:nowrap}
    .gallery-details{display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem}
    .detail-item{display:flex;align-items:flex-start;gap:.5rem;padding:.5rem 0;border-bottom:1px solid var(--border-light)}
    .detail-item:last-child{border-bottom:none}
    .detail-label{font-weight:600;color:var(--text-secondary);font-size:.9rem;min-width:fit-content}
    .detail-value{color:var(--text-primary);font-size:.9rem;line-height:1.4;word-break:break-word;flex:1}
    .price-summary{display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding-top:1rem;border-top:2px solid var(--border-light);margin-top:1rem}
    .price-item{display:flex;flex-direction:column;gap:.25rem}
    .price-label{font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
    .price-value{font-size:1.1rem;font-weight:700}
    .price-value.total{color:var(--accent-green)}
    .price-value.per-sqm{color:var(--accent-blue)}
    .value-highlight{background:#fff3cd;border:1px solid #ffeaa7;border-radius:4px;padding:.25rem .5rem;font-weight:600;color:#856404}
    @media(max-width:768px){.container{padding:0 1rem}.info-grid,.summary-grid,.charts-grid,.property-gallery-grid{grid-template-columns:1fr}.page-title{font-size:2rem}}
    @media print{.header{position:relative}.gallery-overlay{display:none!important}.section,.charts-section{page-break-inside:avoid}}
  </style>
</head>
<body>
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <img src="https://i.ibb.co/qLX974Kp/Gemini-Generated-Image-wa2p93wa2p93wa2p.png" alt="Imobiliária Japi" />
        Imobiliária Japi
      </div>
      <nav style="display:flex;gap:2rem;">
        <a href="#resumo" style="color:var(--text-secondary);text-decoration:none;font-weight:500;">Resumo</a>
        <a href="#comparaveis" style="color:var(--text-secondary);text-decoration:none;font-weight:500;">Comparáveis</a>
        <a href="#avaliacao" style="color:var(--accent-blue);text-decoration:none;font-weight:500;border-bottom:2px solid var(--accent-blue);padding-bottom:4px;">Avaliação</a>
      </nav>
    </div>
  </header>

  <section class="page-title-section">
    <div class="container">
      <h1 class="page-title">Relatório de Avaliação Imobiliária</h1>
      <p class="page-subtitle">Estudo de mercado baseado em comparativos</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <h2 class="section-title">Informações do Estudo</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-card-title" style="color:var(--accent-blue);">Dados do Cliente e Imóvel</div>
          ${data.nomeCliente ? `<div class="info-item"><span class="info-label">Cliente:</span><span class="info-value">${data.nomeCliente}</span></div>` : ''}
          ${data.enderecoImovel ? `<div class="info-item"><span class="info-label">Endereço do Imóvel:</span><span class="info-value">${data.enderecoImovel}</span></div>` : ''}
          <div class="info-item"><span class="info-label">Metragem:</span><span class="info-value">${data.metragemImovel} m²</span></div>
          <div class="info-item"><span class="info-label">Data do Relatório:</span><span class="info-value">${getDataCurta()}</span></div>
          ${data.observacoes ? `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-light);"><span class="info-label" style="display:block;margin-bottom:0.25rem;">Observações:</span><p style="color:var(--text-secondary);line-height:1.6;font-size:0.95rem;">${data.observacoes}</p></div>` : ''}
        </div>
        <div class="info-card" style="background:#ffffff;border-color:#e5e7eb;">
          <div class="info-card-title" style="color:var(--accent-blue);">Corretor Responsável</div>
          ${data.corretorFoto ? `
          <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #bfdbfe;">
            <img src="${data.corretorFoto}" alt="${data.corretorNome || 'Corretor'}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #93c5fd;box-shadow:0 2px 8px rgba(59,130,246,0.2);" />
            <div>
              <div style="font-weight:700;font-size:1.1rem;color:var(--text-primary);">${data.corretorNome || ''}</div>
              ${data.corretorRole ? `<div style="font-size:0.85rem;color:var(--accent-blue);text-transform:capitalize;font-weight:500;">${data.corretorRole}</div>` : ''}
            </div>
          </div>` : `
          ${data.corretorNome ? `<div class="info-item"><span class="info-label">Nome:</span><span class="info-value" style="font-weight:700;">${data.corretorNome}</span></div>` : ''}
          ${data.corretorRole ? `<div class="info-item"><span class="info-label">Cargo:</span><span class="info-value" style="text-transform:capitalize;">${data.corretorRole}</span></div>` : ''}
          `}
          ${data.corretorEmail ? `<div class="info-item"><span class="info-label">Email:</span><span class="info-value">${data.corretorEmail}</span></div>` : ''}
          ${data.corretorTelefone ? `<div class="info-item"><span class="info-label">Telefone:</span><span class="info-value">${data.corretorTelefone}</span></div>` : ''}
          ${data.corretorEquipe ? `<div class="info-item"><span class="info-label">Equipe:</span><span class="info-value" style="text-transform:capitalize;">${data.corretorEquipe}</span></div>` : ''}
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="comparaveis">
    <div class="container">
      <h2 class="section-title">Imóveis Comparáveis</h2>
      <p style="color:var(--text-secondary);margin-bottom:2rem;">Dados detalhados dos imóveis utilizados na análise</p>
      <div style="overflow-x:auto;margin:2rem 0;">
        <table style="width:100%;border-collapse:collapse;background:var(--bg-card);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-md);">
          <thead>
            <tr style="background:var(--accent-blue);color:#fff;">
              <th style="padding:1rem;text-align:left;font-weight:600;">#</th>
              <th style="padding:1rem;text-align:left;font-weight:600;">Endereço/Link</th>
              <th style="padding:1rem;text-align:center;font-weight:600;">Área (m²)</th>
              <th style="padding:1rem;text-align:right;font-weight:600;">Valor Total</th>
              <th style="padding:1rem;text-align:right;font-weight:600;">Valor/m²</th>
            </tr>
          </thead>
          <tbody>${tabelaLinhas}</tbody>
          <tfoot>
            <tr style="background:var(--bg-tertiary);border-top:2px solid var(--accent-blue);">
              <td colspan="2" style="padding:1rem;font-weight:700;">MÉDIA DOS COMPARÁVEIS</td>
              <td style="padding:1rem;text-align:center;font-weight:700;">${Math.round(mediaMetragem)}</td>
              <td style="padding:1rem;text-align:right;font-weight:700;color:var(--accent-green);">${formatCurrency(mediaValor)}</td>
              <td style="padding:1rem;text-align:right;font-weight:700;color:var(--accent-purple);">${formatCurrency(data.mediaPorM2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="background:var(--bg-tertiary);padding:1.5rem;border-radius:12px;margin-top:1.5rem;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;text-align:center;">
          <div>
            <div style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.5rem;">Total de Imóveis</div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-blue);">${validas.length}</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.5rem;">Metragem Média</div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-orange);">${Math.round(mediaMetragem)} m²</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.5rem;">Preço Médio/m²</div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-purple);">${formatCurrency(data.mediaPorM2)}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="resumo">
    <div class="container">
      <h2 class="section-title">Resumo da Análise</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-card-title">Metodologia</div>
          <div class="summary-card-subtitle">Análise Comparativa de Mercado (ACM) baseada em ${validas.length} imóveis similares na região.</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-title">Valor Médio</div>
          <div class="summary-card-value">${formatCurrency(data.mediaPorM2)}/m²</div>
          <div class="summary-card-subtitle">Baseado na análise dos imóveis comparáveis</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-title">Valor Sugerido</div>
          <div class="summary-card-value value-highlight">${formatCurrency(valorFinal)}</div>
          <div class="summary-card-subtitle">Para ${data.metragemImovel} m² ${data.correcaoMercado !== 0 ? `(correção de ${data.correcaoMercado}%)` : ''}</div>
        </div>
      </div>
      <div class="summary-card" style="margin-top:1.5rem;">
        <div class="summary-card-title" style="margin-bottom:1rem;">Faixa de Valores</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.5rem;">
          <span class="info-label">Valor Competitivo (-5%):</span>
          <span class="info-value">${formatCurrency(valorCompetitivo)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:.5rem;">
          <span class="info-label">Valor Justo:</span>
          <span class="info-value" style="color:var(--accent-blue);">${formatCurrency(valorJusto)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span class="info-label">Valor Máximo de Oferta (+${piramidePercent}%):</span>
          <span class="info-value">${formatCurrency(valorMaximo)}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="section" style="background:var(--bg-secondary);" id="avaliacao">
    <div class="container">
      <div style="text-align:center;margin-bottom:3rem;">
        <h2 class="section-title" style="font-size:2.5rem;color:var(--accent-blue);margin-bottom:1rem;justify-content:center;">Avaliação Final</h2>
        <p style="font-size:1.2rem;color:var(--text-secondary);">Valor de mercado equilibrado</p>
      </div>
      <div style="text-align:center;max-width:800px;margin:0 auto;">
        <div style="font-size:1.3rem;color:var(--text-secondary);margin-bottom:2rem;font-weight:600;">Valor Estimado para ${data.metragemImovel} m²</div>
        
        <div style="position:relative;margin:4rem 0;display:flex;justify-content:center;width:100%;">
          <div style="display:flex;align-items:center;justify-content:center;gap:4rem;width:100%;max-width:1100px;">
            <div style="display:flex;flex-direction:column;justify-content:space-between;height:450px;align-items:flex-end;padding:50px 0;">
              <div style="text-align:right;"><div style="color:#dc2626;font-weight:600;">+${piramidePercent}%</div><div style="color:#dc2626;font-weight:500;font-size:.9rem;">VALOR MÁXIMO</div></div>
              <div style="text-align:right;"><div style="color:#2563eb;font-weight:600;">0%</div><div style="color:#2563eb;font-weight:500;font-size:.9rem;">VALOR JUSTO</div></div>
              <div style="text-align:right;"><div style="color:#059669;font-weight:600;">-5%</div><div style="color:#059669;font-weight:500;font-size:.9rem;">VALOR COMPETITIVO</div></div>
            </div>
            <div style="position:relative;width:600px;height:450px;display:flex;align-items:center;justify-content:center;">
              <svg width="600" height="450" viewBox="0 0 600 450" style="filter:drop-shadow(0 12px 30px rgba(0,0,0,.15));">
                <path d="M 300 40 L 220 160 L 380 160 Z" fill="#dc2626" stroke="white" stroke-width="4"/>
                <path d="M 220 160 L 380 160 L 460 280 L 140 280 Z" fill="#2563eb" stroke="white" stroke-width="4"/>
                <path d="M 140 280 L 460 280 L 540 400 L 60 400 Z" fill="#059669" stroke="white" stroke-width="4"/>
                <line x1="0" y1="90" x2="600" y2="90" stroke="#dc2626" stroke-width="2" stroke-dasharray="6,3" opacity=".7"/>
                <line x1="0" y1="225" x2="600" y2="225" stroke="#2563eb" stroke-width="3" stroke-dasharray="8,4" opacity=".8"/>
                <line x1="0" y1="360" x2="600" y2="360" stroke="#059669" stroke-width="2" stroke-dasharray="6,3" opacity=".7"/>
              </svg>
            </div>
            <div style="display:flex;flex-direction:column;justify-content:space-between;height:450px;align-items:flex-start;padding:50px 0;">
              <div><div style="color:#dc2626;font-weight:700;font-size:1.1rem;">${formatCurrency(valorMaximo)}</div><div style="color:#9ca3af;font-size:.8rem;margin-top:.2rem;">Poucos interessados</div></div>
              <div><div style="color:#2563eb;font-weight:800;font-size:1.2rem;">${formatCurrency(valorJusto)}</div><div style="color:#9ca3af;font-size:.8rem;margin-top:.2rem;">Interesse equilibrado</div></div>
              <div><div style="color:#059669;font-weight:700;font-size:1.1rem;">${formatCurrency(valorCompetitivo)}</div><div style="color:#9ca3af;font-size:.8rem;margin-top:.2rem;">Muitos interessados</div></div>
            </div>
          </div>
        </div>

        <div style="font-size:4rem;font-weight:900;color:var(--accent-blue);margin:2rem 0 1rem;line-height:1;">${formatCurrency(valorJusto)}</div>
        <div style="font-size:1.3rem;color:var(--text-secondary);margin-bottom:3rem;font-weight:600;">Valor de mercado equilibrado e competitivo</div>

        <div style="background:var(--bg-tertiary);padding:2rem;border-radius:8px;margin-bottom:2rem;border:1px solid var(--border-light);">
          <div style="font-weight:600;margin-bottom:1rem;color:var(--accent-blue);font-size:1.1rem;">Metodologia Utilizada</div>
          <div style="color:var(--text-secondary);font-size:1rem;line-height:1.6;">
            Análise baseada em <strong>${validas.length} propriedades similares</strong><br>
            Preço médio de mercado: <strong>${formatCurrency(data.mediaPorM2)}/m²</strong>
            ${data.correcaoMercado !== 0 ? `<br>Correção mercadológica: <strong>${data.correcaoMercado > 0 ? '+' : ''}${data.correcaoMercado}%</strong>` : ''}
            ${data.margemExclusividade !== 0 ? `<br>Margem de exclusividade: <strong>+${data.margemExclusividade}%</strong>` : ''}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5rem;text-align:center;">
          <div style="padding:1.5rem;border-radius:8px;background:var(--accent-green);box-shadow:var(--shadow-md);">
            <div style="color:#fff;font-size:.9rem;margin-bottom:.5rem;font-weight:600;">VALOR COMPETITIVO</div>
            <div style="color:#fff;font-size:1.3rem;font-weight:bold;">${formatCurrency(valorCompetitivo)}</div>
          </div>
          <div style="padding:1.5rem;border-radius:8px;background:var(--accent-blue);box-shadow:var(--shadow-md);transform:scale(1.05);">
            <div style="color:#fff;font-size:.9rem;margin-bottom:.5rem;font-weight:600;">VALOR JUSTO</div>
            <div style="color:#fff;font-size:1.3rem;font-weight:bold;">${formatCurrency(valorJusto)}</div>
          </div>
          <div style="padding:1.5rem;border-radius:8px;background:var(--accent-red);box-shadow:var(--shadow-md);">
            <div style="color:#fff;font-size:.9rem;margin-bottom:.5rem;font-weight:600;">VALOR MÁXIMO</div>
            <div style="color:#fff;font-size:1.3rem;font-weight:bold;">${formatCurrency(valorMaximo)}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="charts-section">
    <div class="container">
      <h2 class="section-title">Análise Gráfica</h2>
      <div class="charts-grid">
        <div class="chart-card">
          <h3 class="chart-title">Comparativo de Preços por m²</h3>
          <div class="chart-container"><canvas id="pricePerSqmChart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3 class="chart-title">Comparativo de Preços Totais</h3>
          <div class="chart-container"><canvas id="priceTotalChart"></canvas></div>
        </div>
      </div>
    </div>
  </section>

  <section class="charts-section">
    <div class="container">
      <div class="charts-grid">
        <div class="chart-card">
          <h3 class="chart-title">Preço Total por Imóvel</h3>
          <div class="chart-container"><canvas id="totalPriceChart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3 class="chart-title">Relação Área x Preço</h3>
          <div class="chart-container"><canvas id="scatterChart"></canvas></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" style="background:var(--bg-secondary);">
    <div class="container">
      <div style="text-align:center;margin-bottom:2rem;">
        <h2 class="section-title" style="justify-content:center;">Galeria dos Imóveis Comparáveis</h2>
        <p style="color:var(--text-secondary);margin-bottom:1rem;">Conheça os imóveis utilizados na análise comparativa de mercado</p>
      </div>
      <div class="property-gallery-grid">${galeriaCards}</div>
    </div>
  </section>

  <footer style="background:var(--bg-secondary);border-top:1px solid var(--border-light);padding:3rem 0;">
    <div class="container" style="text-align:center;">
      <div style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;">Sistema de Avaliação Imobiliária</div>
      <div style="color:var(--text-secondary);margin-bottom:2rem;">Relatório gerado em ${getDataAtual()}</div>
      <div style="color:var(--text-muted);font-size:.9rem;">© ${new Date().getFullYear()} - Octo Dash - Todos os direitos reservados</div>
    </div>
  </footer>

  <script>
    document.addEventListener('DOMContentLoaded', function(){
      Chart.defaults.color='#495057';
      Chart.defaults.borderColor='#dee2e6';
      var labels=[${labels}];
      var precosM2=[${precosM2}];
      var precosTotal=[${precosTotal}];
      var sugM2=${Math.round(data.mediaPorM2)};
      var sugTotal=${Math.round(valorFinal)};

      // Preço por m²
      var c1=document.getElementById('pricePerSqmChart');
      if(c1){new Chart(c1.getContext('2d'),{type:'bar',data:{labels:labels,datasets:[{label:'Preço por m²',data:precosM2,backgroundColor:precosM2.map(function(p){return p>sugM2?'#ffc107':'#dc3545'}),borderColor:precosM2.map(function(p){return p>sugM2?'#e0a800':'#bb2d3b'}),borderWidth:2,borderRadius:6},{type:'line',label:'Valor Sugerido/m²',data:new Array(precosM2.length).fill(sugM2),borderColor:'#0066cc',backgroundColor:'transparent',borderWidth:3,pointRadius:0,borderDash:[8,4],fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#e9ecef'},ticks:{callback:function(v){return'R$ '+v.toLocaleString('pt-BR')}}},x:{grid:{display:false}}}}});}

      // Preço total bar
      var c2=document.getElementById('priceTotalChart');
      if(c2){new Chart(c2.getContext('2d'),{type:'bar',data:{labels:labels,datasets:[{label:'Preço Total',data:precosTotal,backgroundColor:precosTotal.map(function(p){return p>sugTotal?'#ffc107':'#dc3545'}),borderColor:precosTotal.map(function(p){return p>sugTotal?'#e0a800':'#bb2d3b'}),borderWidth:2,borderRadius:6},{type:'line',label:'Preço Sugerido',data:new Array(precosTotal.length).fill(sugTotal),borderColor:'#28a745',backgroundColor:'transparent',borderWidth:3,pointRadius:0,borderDash:[8,4],fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#e9ecef'},ticks:{callback:function(v){return'R$ '+(v/1000).toFixed(0)+'k'}}},x:{grid:{display:false}}}}});}

      // Preço total line
      var c3=document.getElementById('totalPriceChart');
      if(c3){new Chart(c3.getContext('2d'),{type:'line',data:{labels:labels,datasets:[{label:'Preço Total',data:precosTotal,borderColor:'#22d3ee',backgroundColor:'rgba(34,211,238,.1)',borderWidth:2,fill:true,tension:.1,pointBackgroundColor:'#22d3ee',pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'#495057'}}},scales:{y:{grid:{color:'#e9ecef'},ticks:{callback:function(v){return'R$ '+v.toLocaleString('pt-BR')}}},x:{grid:{display:false}}}}});}

      // Scatter
      var c4=document.getElementById('scatterChart');
      if(c4){new Chart(c4.getContext('2d'),{type:'scatter',data:{datasets:[{label:'Amostras Comparáveis',data:[${scatterData}],backgroundColor:'#ff6b9d',borderColor:'#ff6b9d',pointRadius:8},{label:'Amostra Atual (${data.metragemImovel}m²)',data:[{x:${data.metragemImovel},y:${Math.round(valorFinal)}}],backgroundColor:'#3b82f6',borderColor:'#1d4ed8',pointRadius:8,pointBorderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'#495057'}}},scales:{x:{title:{display:true,text:'Área (m²)',color:'#495057'},grid:{color:'#e9ecef'}},y:{title:{display:true,text:'Preço Total (R$)',color:'#495057'},grid:{color:'#e9ecef'},ticks:{callback:function(v){return'R$ '+v.toLocaleString('pt-BR')}}}}}});}
    });
  <\/script>
</body>
</html>`;

  // Fazer download do arquivo HTML (se não pulado)
  if (!options?.skipDownload) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-avaliacao-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Retornar o HTML para uso externo (salvar no banco, etc.)
  return html;
}
