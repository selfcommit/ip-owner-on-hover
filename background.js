// Service worker: does the IPinfo lookups and caches each answer for a day.

const TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'ip:';
const inflight = new Map(); // ip -> Promise, so parallel hovers share one request

const IP_SHAPE = /^[0-9a-f:.]{3,45}$/i;

async function getToken() {
  const { token } = await chrome.storage.sync.get('token');
  return (token || '').trim();
}

// "AS13335 Cloudflare, Inc." -> { asn: "AS13335", name: "Cloudflare, Inc." }
function splitOrg(org) {
  const m = /^(AS\d+)\s+(.*)$/.exec(org || '');
  return m ? { asn: m[1], name: m[2] } : { asn: null, name: org || null };
}

async function fetchInfo(ip) {
  const token = await getToken();
  let res;
  try {
    res = token
      // IPinfo Lite: free, unlimited, needs a token. Returns asn / as_name / as_domain / country.
      ? await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`)
      // No token: fall back to the unauthenticated endpoint, which is rate-limited.
      : await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
  } catch {
    return { ok: false, error: 'Could not reach ipinfo.io' };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: token ? 'IPinfo rejected the token. Check it in the extension options.'
                                     : 'Add a free IPinfo token in the extension options.' };
  }
  if (res.status === 429) {
    return { ok: false, error: token ? 'IPinfo rate limit reached. Try again shortly.'
                                     : 'Rate limit reached. Add a free IPinfo token in the extension options.' };
  }
  if (!res.ok) return { ok: false, error: `IPinfo returned ${res.status}` };

  let j;
  try { j = await res.json(); } catch { return { ok: false, error: 'Unexpected response from IPinfo' }; }
  if (j.bogon) return { ok: true, name: 'Reserved address (bogon)', asn: null, domain: null, country: null };

  const org = splitOrg(j.org);
  return {
    ok: true,
    // Paid plans return a real `company` object; otherwise use the AS name.
    name: j.company?.name || j.as_name || j.asn?.name || org.name || null,
    asn: (typeof j.asn === 'string' ? j.asn : j.asn?.asn) || org.asn,
    domain: j.company?.domain || j.as_domain || j.asn?.domain || null,
    country: j.country_code || j.country || null,
  };
}

async function lookup(ip) {
  if (typeof ip !== 'string' || !IP_SHAPE.test(ip)) return { ok: false, error: 'Not an IP address' };
  const key = PREFIX + ip;
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit && Date.now() - hit.t < TTL_MS) return hit.d;
  if (inflight.has(ip)) return inflight.get(ip);

  const p = fetchInfo(ip)
    .then(async (d) => {
      if (d.ok) await chrome.storage.local.set({ [key]: { t: Date.now(), d } });
      return d;
    })
    .finally(() => inflight.delete(ip));
  inflight.set(ip, p);
  return p;
}

async function prune(all = false) {
  const items = await chrome.storage.local.get(null);
  const now = Date.now();
  const dead = Object.keys(items).filter(
    (k) => k.startsWith(PREFIX) && (all || now - items[k].t >= TTL_MS));
  if (dead.length) await chrome.storage.local.remove(dead);
  return dead.length;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'lookup') {
    lookup(msg.ip).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'clear-cache') {
    prune(true).then((n) => sendResponse({ removed: n }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('prune', { periodInMinutes: 24 * 60 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'prune') prune();
});
