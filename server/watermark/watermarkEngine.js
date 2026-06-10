/**
 * 🎨 Motor de marca d'água — funções PURAS sobre Buffers (sem I/O, sem Supabase).
 *
 * Usa sharp (libvips): fração da memória do ImageMagick para o mesmo trabalho —
 * importante porque uma foto de 12MP descomprimida ocupa ~50MB em RAM e o
 * gargalo do pipeline é justamente CPU + memória.
 *
 * Duas operações:
 *   1. buildLogoWatermark(logo)  → executada UMA vez por troca de logo.
 *   2. composeWatermark(master, logo, opts) → por imagem/tamanho.
 *
 * A marca preserva as CORES originais do logo, translúcida e centralizada, com
 * um halo escuro atrás para continuar legível em fundos claros e escuros.
 */
import sharp from 'sharp';

// Limita o uso de threads do libvips por imagem; o paralelismo real vem do
// worker (várias imagens ao mesmo tempo), não de uma única imagem multi-thread.
sharp.concurrency(1);
sharp.cache(false); // evita reter buffers grandes entre jobs

/**
 * Normaliza o logo do tenant para um PNG RGBA com FUNDO TRANSPARENTE, preservando
 * as cores. Pré-computado e guardado no Storage — nunca recalculado por foto.
 *
 *   - Logo já com transparência → usado como está (só garante RGBA).
 *   - Logo sobre fundo branco (sem alpha) → o branco vira transparente
 *     (alpha = distância do branco), mantendo as cores do desenho.
 *
 * @param {Buffer} logoBuffer
 * @returns {Promise<Buffer>} PNG RGBA colorido, fundo transparente
 */
export async function buildLogoWatermark(logoBuffer) {
  const meta = await sharp(logoBuffer).metadata();
  if (!meta.width || !meta.height) throw new Error('Logo inválido: dimensões ausentes');

  // Já tem transparência útil → mantém cores e alpha.
  if (await hasMeaningfulAlpha(logoBuffer, meta)) {
    return sharp(logoBuffer).ensureAlpha().png().toBuffer();
  }

  // Sem alpha (fundo branco): recorta o branco preservando as cores.
  const { data, info } = await sharp(logoBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 4 (RGBA)
  let opaque = 0;
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += ch) {
    const minc = Math.min(data[i], data[i + 1], data[i + 2]);
    // Quão longe do branco está o canal mais escuro: branco→0 (transparente),
    // cor/escuro→opaco. O fator reforça mid-tones para a marca não sumir.
    const a = Math.min(255, Math.round((255 - minc) * 1.4));
    data[i + 3] = a;
    if (a > 200) opaque++;
  }
  // Guard: se quase tudo ficou opaco, não é um logo "sobre branco" — é uma foto/
  // imagem cheia. Recusar evita cobrir todo o acervo com um bloco gigante.
  if (opaque / total > 0.7) {
    throw new Error(
      'Logo inadequado: a imagem é quase toda opaca (parece uma foto, não um logo). ' +
        'Envie um PNG com fundo transparente ou um logo desenhado sobre fundo branco.',
    );
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
}

/**
 * Aplica a marca d'água (logo colorido) centralizada e translúcida sobre o master.
 *
 * @param {Buffer} masterBuffer  original sem marca
 * @param {Buffer} logoBuffer    logo RGBA colorido (saída de buildLogoWatermark)
 * @param {object} opts
 * @param {{width:number,height:number,quality:number,watermark?:boolean}} opts.size
 * @param {number} opts.opacity  0..1
 * @param {number} opts.scale    fração da largura ocupada pelo logo
 * @returns {Promise<Buffer>} WebP final
 */
export async function composeWatermark(masterBuffer, logoBuffer, { size, opacity, scale }) {
  // 1. Normaliza orientação (EXIF) e redimensiona dentro do bounding box.
  //    Materializa em buffer para ler as dimensões REAIS já redimensionadas —
  //    sharp.metadata() devolve as dimensões da ENTRADA, não do resultado do
  //    resize, então usá-las dimensionaria a marca pelo tamanho do original
  //    (fotos grandes → marca maior que a base → erro de composite).
  const baseBuf = await sharp(masterBuffer)
    .rotate() // aplica orientação EXIF antes de descartar metadados
    .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  // thumb (ou perfil marcado com watermark:false) sai sem marca.
  if (size.watermark === false) {
    return sharp(baseBuf).webp({ quality: size.quality }).toBuffer();
  }

  const baseMeta = await sharp(baseBuf).metadata();
  const baseW = baseMeta.width || size.width;
  const baseH = baseMeta.height || size.height;
  // Caixa da marca = fração da base nas DUAS dimensões. fit:inside garante que a
  // marca caiba na foto mesmo em formatos extremos (panorâmica baixa, retrato
  // estreito), evitando "composite must be same dimensions or smaller".
  const boxW = Math.max(32, Math.round(baseW * scale));
  const boxH = Math.max(32, Math.round(baseH * scale));

  // 2a. SOMBRA/HALO escuro borrado atrás da marca — torna o logo legível mesmo
  // sobre fotos claras (paredes/cama brancas); sem ela, cores claras somem.
  const shadowOpacity = Math.min(0.85, clamp01(opacity) * 1.1);
  const shadow = await tintedShape(logoBuffer, boxW, boxH, [0, 0, 0], shadowOpacity, Math.max(2, boxW * 0.02));

  // 2b. Logo COLORIDO translúcido (mantém as cores originais).
  const logo = await scaledLogo(logoBuffer, boxW, boxH, clamp01(opacity));

  // 3. Compõe sombra + logo, centralizados, e exporta WebP.
  return sharp(baseBuf)
    .composite([
      { input: shadow, gravity: 'center' },
      { input: logo, gravity: 'center' },
    ])
    .webp({ quality: size.quality })
    .toBuffer();
}

/** Logo colorido redimensionado p/ caber na caixa, com opacidade global. */
async function scaledLogo(logoBuffer, boxW, boxH, opacity) {
  return sharp(logoBuffer)
    .resize({ width: boxW, height: boxH, fit: 'inside' })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * clamp01(opacity))]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

/**
 * Recolore a FORMA do logo (seu alpha) para uma cor sólida, com opacidade e blur.
 * Usada para a sombra/halo escuro por baixo da marca colorida.
 */
async function tintedShape(logoBuffer, boxW, boxH, [r, g, b], opacity, blurSigma) {
  let img = sharp(logoBuffer).resize({ width: boxW, height: boxH, fit: 'inside' }).ensureAlpha();
  // RGB → cor sólida, preservando o canal alpha (a forma). linear: canal*a + b.
  img = img.linear([0, 0, 0, 1], [r, g, b, 0]);
  if (blurSigma > 0) img = img.blur(blurSigma);
  return img
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * clamp01(opacity))]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

/** Decide se o alpha do logo descreve a forma (logo transparente) ou é só opaco. */
async function hasMeaningfulAlpha(buffer, meta) {
  if (!meta.hasAlpha) return false;
  // Estatística do canal alpha: se o mínimo é alto, é praticamente opaco (sem forma).
  const stats = await sharp(buffer).stats();
  const alphaChannel = stats.channels[stats.channels.length - 1];
  return alphaChannel && alphaChannel.min < 250;
}

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));
