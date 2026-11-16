// Finds IPv4 / IPv6 addresses in a string. No DOM or chrome.* usage, so it
// can be unit-tested in Node (see test/detect.test.js).
(() => {
  const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
  // Not preceded by a word char or dot, not followed by more digits/word chars
  // (so 1.2.3.4.5 and 1.2.3.4abc are rejected, "1.2.3.4." at sentence end is fine).
  const V4 = `(?<![\\w.])(?:${OCTET}\\.){3}${OCTET}(?!\\.?\\d)(?!\\w)`;
  // Loose IPv6 candidate: a run of hex/colons containing at least two colons,
  // optionally ending in a dotted quad. Real validation happens in parseV6().
  const V6 = '(?<![\\w:.])(?=[0-9a-f:]*:[0-9a-f:]*:)[0-9a-f:]+(?:\\.\\d{1,3}){0,3}(?![\\w:])';
  const RE = new RegExp(`${V4}|${V6}`, 'gi');

  // The URL parser implements the full IPv6 grammar; let it validate and
  // canonicalise (lowercase, compressed) for us.
  function parseV6(s) {
    try {
      const host = new URL(`http://[${s}]`).hostname;
      return host.slice(1, -1);
    } catch {
      return null;
    }
  }

  function reservedV4(ip) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 10) return 'Private network (10.0.0.0/8)';
    if (a === 172 && b >= 16 && b <= 31) return 'Private network (172.16.0.0/12)';
    if (a === 192 && b === 168) return 'Private network (192.168.0.0/16)';
    if (a === 127) return 'Loopback';
    if (a === 169 && b === 254) return 'Link-local';
    if (a === 100 && b >= 64 && b <= 127) return 'Carrier-grade NAT (100.64.0.0/10)';
    if (a === 0) return 'Reserved (0.0.0.0/8)';
    if (a >= 224 && a <= 239) return 'Multicast';
    if (a >= 240) return 'Reserved';
    if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113)) return 'Documentation range';
    if (a === 198 && (b === 18 || b === 19)) return 'Benchmarking range';
    return null;
  }

  function reservedV6(canon) {
    if (canon === '::1') return 'Loopback';
    if (canon.startsWith('::')) return 'Reserved';
    const h = parseInt(canon.split(':')[0], 16);
    if (h === 0) return 'Reserved';
    if ((h & 0xfe00) === 0xfc00) return 'Unique local address (fc00::/7)';
    if ((h & 0xffc0) === 0xfe80) return 'Link-local';
    if ((h & 0xff00) === 0xff00) return 'Multicast';
    if (canon.startsWith('2001:db8:')) return 'Documentation range';
    return null;
  }

  /**
   * @returns {{start:number,end:number,ip:string,reserved:string|null}[]}
   *   `ip` is the canonical form to look up; text.slice(start,end) is what's on the page.
   */
  function findIPs(text) {
    const out = [];
    if (text.length < 3 || !(text.includes('.') || text.includes(':'))) return out;
    RE.lastIndex = 0;
    let m;
    while ((m = RE.exec(text))) {
      const raw = m[0];
      const start = m.index;
      const end = start + raw.length;
      if (!raw.includes(':')) {
        out.push({ start, end, ip: raw, reserved: reservedV4(raw) });
        continue;
      }
      const canon = parseV6(raw);
      if (!canon || canon === '::') continue;
      // IPv4-mapped IPv6 (::ffff:1.2.3.4): look up the embedded IPv4 address.
      const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
      if (mapped) {
        out.push({ start, end, ip: mapped[1], reserved: reservedV4(mapped[1]) });
      } else {
        out.push({ start, end, ip: canon, reserved: reservedV6(canon) });
      }
    }
    return out;
  }

  const api = { findIPs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.IPDetect = api;
})();
