/**
 * 🛡️ Proteção SSRF para fetch de URLs externas (webhooks de saída e, futuramente,
 * scraper). Bloqueia destinos que apontam para a própria infraestrutura: loopback,
 * redes privadas (RFC1918), link-local (inclui 169.254.169.254 = metadata de cloud),
 * CGNAT, multicast e ranges reservados — em IPv4 e IPv6 (incl. IPv4-mapped,
 * IPv4-compatible e NAT64 64:ff9b::/96, classificados pelo IPv4 embutido).
 *
 * Núcleo PURO e testável (classificação de IP/URL). A resolução DNS
 * (assertSafeHttpUrl) é injetável via `lookup` para testes determinísticos.
 *
 * Limitação conhecida (documentada): há uma janela TOCTOU de DNS rebinding entre a
 * verificação e o fetch real. O vetor dominante (URL apontando direto para host
 * interno/metadata, ou hostname que resolve para IP privado) é bloqueado.
 */
import net from 'node:net';
import dnsPromises from 'node:dns/promises';

// ---------- IPv4 ----------
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

// Ranges IPv4 que NÃO devem ser alvos de fetch a partir do servidor.
const IPV4_BLOCKS = [
  ['0.0.0.0', 8],        // "this network" / unspecified
  ['10.0.0.0', 8],       // privado
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local (inclui metadata 169.254.169.254)
  ['172.16.0.0', 12],    // privado
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['192.168.0.0', 16],   // privado
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reservado
  ['255.255.255.255', 32], // broadcast
].map(([base, bits]) => {
  const network = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { network: (network & mask) >>> 0, mask };
});

function ipv4IsDisallowed(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // não parseável → bloqueia (fail-safe)
  return IPV4_BLOCKS.some(({ network, mask }) => ((n & mask) >>> 0) === network);
}

// ---------- IPv6 ----------
// Expande um endereço IPv6 (incl. compressão "::" e IPv4 embutido) em 8 hextets.
function ipv6Hextets(ipRaw) {
  let ip = ipRaw.split('%')[0].toLowerCase(); // remove zone id

  // Converte IPv4 embutido (ex.: ::ffff:1.2.3.4) nos dois últimos hextets.
  const v4match = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4match) {
    const n = ipv4ToInt(v4match[1]);
    if (n === null) return null;
    const high = ((n >>> 16) & 0xffff).toString(16);
    const low = (n & 0xffff).toString(16);
    ip = ip.slice(0, v4match.index) + high + ':' + low;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let hextets;
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    hextets = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    hextets = head;
  }
  if (hextets.length !== 8) return null;

  const nums = hextets.map((h) => (h === '' ? 0 : parseInt(h, 16)));
  if (nums.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff)) return null;
  return nums;
}

function ipv6IsDisallowed(ip) {
  const h = ipv6Hextets(ip);
  if (h === null) return true; // fail-safe

  if (h.every((x) => x === 0)) return true; // :: (unspecified)
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 &&
      h[4] === 0 && h[5] === 0 && h[6] === 0 && h[7] === 1) return true; // ::1 loopback

  const embeddedV4 = () => `${(h[6] >> 8) & 0xff}.${h[6] & 0xff}.${(h[7] >> 8) & 0xff}.${h[7] & 0xff}`;

  // IPv4-mapped ::ffff:0:0/96 → classifica pelo IPv4 embutido.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    return ipv4IsDisallowed(embeddedV4());
  }

  // IPv4-compatible ::/96 (deprecado, ex.: ::127.0.0.1) → classifica pelo IPv4 embutido.
  // (:: e ::1 já foram tratados acima.) Endereços IPv6 públicos têm h[0] != 0, sem falso positivo.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return ipv4IsDisallowed(embeddedV4());
  }

  // NAT64 well-known prefix 64:ff9b::/96 (RFC 6052) → classifica pelo IPv4 embutido.
  // Em redes IPv6-only/NAT64 isso é traduzido para o IPv4 embutido (ex.: 64:ff9b::a9fe:a9fe
  // -> 169.254.169.254 / metadata). Bloqueia se o IPv4 embutido for interno; NAT64 para
  // IPv4 público segue permitido.
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return ipv4IsDisallowed(embeddedV4());
  }

  const firstByte = (h[0] >> 8) & 0xff;
  const secondByte = h[0] & 0xff;
  if (firstByte === 0xfc || firstByte === 0xfd) return true;                 // fc00::/7 ULA
  if (firstByte === 0xfe && secondByte >= 0x80 && secondByte <= 0xbf) return true; // fe80::/10 link-local
  if (firstByte === 0xff) return true;                                        // ff00::/8 multicast
  return false;
}

/** Classifica um IP literal (v4 ou v6) como destino proibido (true) ou permitido (false). */
export function ipIsDisallowed(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4IsDisallowed(ip);
  if (kind === 6) return ipv6IsDisallowed(ip);
  return true; // não é IP válido → fail-safe
}

/**
 * Validação SÍNCRONA (sem DNS) de uma URL para fetch de saída.
 * Rejeita: URL inválida, scheme != http/https, credenciais embutidas, localhost,
 * e host que seja um IP literal proibido.
 * @returns {{ ok: true, url: URL, host: string } | { ok: false, reason: string }}
 */
export function parseHttpUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_scheme' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials_in_url' };
  }
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1); // tira colchetes IPv6
  host = host.replace(/\.+$/, ''); // normaliza FQDN com ponto final (ex.: "localhost.")
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost' };
  }
  if (net.isIP(host) !== 0 && ipIsDisallowed(host)) {
    return { ok: false, reason: 'private_ip' };
  }
  return { ok: true, url, host };
}

/**
 * Validação ASSÍNCRONA completa: parseHttpUrl + resolução DNS, bloqueando se QUALQUER
 * endereço resolvido cair em range proibido.
 * @param {string} urlString
 * @param {{ lookup?: function }} [opts]  lookup injetável (default dns.promises.lookup)
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function assertSafeHttpUrl(urlString, { lookup = dnsPromises.lookup } = {}) {
  const parsed = parseHttpUrl(urlString);
  if (!parsed.ok) return parsed;

  // IP literal já foi validado em parseHttpUrl.
  if (net.isIP(parsed.host) !== 0) return { ok: true };

  let addresses;
  try {
    addresses = await lookup(parsed.host, { all: true });
  } catch {
    return { ok: false, reason: 'dns_resolution_failed' };
  }
  if (!addresses || addresses.length === 0) {
    return { ok: false, reason: 'no_dns_records' };
  }
  for (const a of addresses) {
    if (ipIsDisallowed(a.address)) return { ok: false, reason: 'resolves_to_private_ip' };
  }
  return { ok: true };
}
