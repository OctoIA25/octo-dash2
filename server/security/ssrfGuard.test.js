import { describe, it, expect } from 'vitest';
import { ipIsDisallowed, parseHttpUrl, assertSafeHttpUrl } from './ssrfGuard.js';

describe('ipIsDisallowed — IPv4', () => {
  it('bloqueia loopback / privados / link-local / reservados', () => {
    for (const ip of [
      '127.0.0.1', '127.255.255.255', '10.0.0.1', '10.255.255.255',
      '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.168.255.255',
      '169.254.169.254', '169.254.0.1', '0.0.0.0', '100.64.0.1',
      '198.18.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    ]) {
      expect(ipIsDisallowed(ip), `${ip} deveria ser bloqueado`).toBe(true);
    }
  });
  it('permite IPs públicos', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '11.0.0.1', '172.15.255.255']) {
      expect(ipIsDisallowed(ip), `${ip} deveria ser permitido`).toBe(false);
    }
  });
});

describe('ipIsDisallowed — IPv6', () => {
  it('bloqueia loopback/unspecified/ULA/link-local/multicast/IPv4-mapped', () => {
    for (const ip of [
      '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
      '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254',
      '::ffff:7f00:1', // forma hex de ::ffff:127.0.0.1 (como o Node normaliza)
      // IPv4-compatible ::/96 (deprecado) embutindo interno:
      '::127.0.0.1', '::10.0.0.1', '::169.254.169.254',
      // NAT64 64:ff9b::/96 embutindo interno (incl. forma hex a9fe:a9fe = 169.254.169.254):
      '64:ff9b::127.0.0.1', '64:ff9b::10.0.0.1', '64:ff9b::169.254.169.254', '64:ff9b::a9fe:a9fe',
    ]) {
      expect(ipIsDisallowed(ip), `${ip} deveria ser bloqueado`).toBe(true);
    }
  });
  it('permite IPv6 público e IPv4-mapped público', () => {
    for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
      expect(ipIsDisallowed(ip), `${ip} deveria ser permitido`).toBe(false);
    }
  });
  it('NAT64 para IPv4 público permanece permitido (uso legítimo de tradução)', () => {
    expect(ipIsDisallowed('64:ff9b::8.8.8.8')).toBe(false);
  });
  it('strings inválidas falham fechado (bloqueadas)', () => {
    expect(ipIsDisallowed('not-an-ip')).toBe(true);
    expect(ipIsDisallowed('')).toBe(true);
  });
});

describe('parseHttpUrl (síncrono, sem DNS)', () => {
  it('rejeita scheme não-http(s), credenciais, localhost e IP literal privado', () => {
    expect(parseHttpUrl('ftp://x.com').ok).toBe(false);
    expect(parseHttpUrl('file:///etc/passwd').ok).toBe(false);
    expect(parseHttpUrl('http://user:pass@evil.com/').reason).toBe('credentials_in_url');
    expect(parseHttpUrl('http://localhost/').reason).toBe('localhost');
    expect(parseHttpUrl('http://api.localhost/').reason).toBe('localhost');
    expect(parseHttpUrl('http://localhost./').reason).toBe('localhost'); // FQDN com ponto final
    expect(parseHttpUrl('http://LOCALHOST/').reason).toBe('localhost'); // case-insensitive
    expect(parseHttpUrl('http://127.0.0.1/').reason).toBe('private_ip');
    expect(parseHttpUrl('http://169.254.169.254/latest/meta-data/').reason).toBe('private_ip');
    // formas ofuscadas de IP que o WHATWG URL normaliza para dotted-decimal:
    expect(parseHttpUrl('http://2130706433/').reason).toBe('private_ip'); // 127.0.0.1
    expect(parseHttpUrl('http://0x7f000001/').reason).toBe('private_ip');
    expect(parseHttpUrl('http://[::1]/').reason).toBe('private_ip');
    expect(parseHttpUrl('lixo').ok).toBe(false);
  });
  it('aceita URL pública http/https bem-formada', () => {
    expect(parseHttpUrl('https://hooks.example.com/abc').ok).toBe(true);
    expect(parseHttpUrl('http://8.8.8.8/path').ok).toBe(true);
  });
});

describe('assertSafeHttpUrl (com DNS injetável)', () => {
  const lookupTo = (addrs) => async () => addrs.map((address) => ({ address, family: net_family(address) }));
  function net_family(a) { return a.includes(':') ? 6 : 4; }

  it('bloqueia hostname que resolve para IP privado', async () => {
    const r = await assertSafeHttpUrl('https://rebind.example.com/', { lookup: lookupTo(['10.0.0.5']) });
    expect(r).toEqual({ ok: false, reason: 'resolves_to_private_ip' });
  });
  it('bloqueia se QUALQUER endereço resolvido for privado', async () => {
    const r = await assertSafeHttpUrl('https://multi.example.com/', { lookup: lookupTo(['8.8.8.8', '127.0.0.1']) });
    expect(r.ok).toBe(false);
  });
  it('permite hostname que resolve só para IPs públicos', async () => {
    const r = await assertSafeHttpUrl('https://ok.example.com/', { lookup: lookupTo(['93.184.216.34']) });
    expect(r).toEqual({ ok: true });
  });
  it('falha fechado quando o DNS não resolve', async () => {
    const r = await assertSafeHttpUrl('https://nxdomain.example.com/', {
      lookup: async () => { throw new Error('ENOTFOUND'); },
    });
    expect(r).toEqual({ ok: false, reason: 'dns_resolution_failed' });
  });
  it('IP literal não dispara DNS e é validado direto', async () => {
    let called = false;
    const r = await assertSafeHttpUrl('http://8.8.8.8/', { lookup: async () => { called = true; return []; } });
    expect(r.ok).toBe(true);
    expect(called).toBe(false);
  });
  it('rejeita antes do DNS quando parseHttpUrl já reprova', async () => {
    const r = await assertSafeHttpUrl('http://localhost/', { lookup: async () => [{ address: '8.8.8.8', family: 4 }] });
    expect(r.reason).toBe('localhost');
  });
});
