// Wraps IP addresses in <ipco-ip> elements and shows an owner tooltip on hover.
// Lookups happen only when you hover, never for every IP on the page.
(() => {
  if (window.__ipcoLoaded) return;
  window.__ipcoLoaded = true;

  const TAG = 'IPCO-IP';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT',
    'OPTION', 'TITLE', 'IFRAME', 'CANVAS', 'SVG', 'MATH', TAG, 'IPCO-TIP']);
  const HOVER_DELAY_MS = 150;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));

  // ---------- scanning ----------

  function shouldSkip(textNode) {
    for (let el = textNode.parentElement; el; el = el.parentElement) {
      if (SKIP.has(el.tagName.toUpperCase()) || el.isContentEditable ||
          (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')) return true;
    }
    return false;
  }

  function wrapMatches(textNode) {
    const matches = IPDetect.findIPs(textNode.data);
    // Back to front, so earlier offsets stay valid as the node is split.
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const mid = textNode.splitText(m.start);
      mid.splitText(m.end - m.start);
      const el = document.createElement('ipco-ip');
      el.dataset.ip = m.ip;
      if (m.reserved) el.dataset.reserved = m.reserved;
      mid.replaceWith(el);
      el.appendChild(mid);
    }
  }

  function collect(root, out) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!shouldSkip(root)) out.push(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName.toUpperCase())) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data.length >= 7 && !shouldSkip(n)) out.push(n);
    }
  }

  // Process in slices so huge pages don't jank.
  function process(nodes) {
    let i = 0;
    const step = (deadline) => {
      const t0 = performance.now();
      while (i < nodes.length) {
        const n = nodes[i++];
        if (n.isConnected) wrapMatches(n);
        const out = deadline?.timeRemaining ? deadline.timeRemaining() < 2 : performance.now() - t0 > 8;
        if (out) break;
      }
      if (i < nodes.length) idle(step);
    };
    idle(step);
  }

  function scan(roots) {
    const nodes = [];
    for (const r of roots) if (r.isConnected) collect(r, nodes);
    if (nodes.length) process(nodes);
  }

  // ---------- dynamic content ----------

  const pending = new Set();
  let flushTimer = null;
  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === 'characterData') {
        if (rec.target.parentElement?.tagName !== TAG) pending.add(rec.target);
        continue;
      }
      for (const n of rec.addedNodes) {
        // Ignore the nodes we create ourselves.
        if (n.nodeType === Node.ELEMENT_NODE && SKIP.has(n.tagName.toUpperCase())) continue;
        if (n.nodeType === Node.TEXT_NODE && n.parentElement?.tagName === TAG) continue;
        pending.add(n);
      }
    }
    if (pending.size && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const roots = [...pending];
        pending.clear();
        scan(roots);
      }, 300);
    }
  });

  // ---------- tooltip ----------

  let tip, tipBody;
  function ensureTip() {
    if (tip?.isConnected) return;
    tip = document.createElement('ipco-tip');
    tip.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:none;';
    const root = tip.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .box {
          font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
          background: #20303f; color: #eef3f7;
          padding: 8px 11px; border-radius: 6px; max-width: 320px;
          box-shadow: 0 4px 14px rgba(15, 25, 35, .35);
        }
        .name { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
        .meta { color: #a9bccb; margin-top: 2px; display: flex; flex-wrap: wrap; column-gap: 10px; }
        .asn { color: #86d3c9; }
        .note { color: #a9bccb; }
      </style>
      <div class="box"></div>`;
    tipBody = root.querySelector('.box');
    document.documentElement.appendChild(tip);
  }

  function line(cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  }

  function render(info) {
    tipBody.replaceChildren();
    if (info.loading) return tipBody.append(line('note', 'Looking up owner…'));
    if (info.reserved) return tipBody.append(line('name', info.reserved), line('note', 'Not a public address'));
    if (!info.ok) return tipBody.append(line('note', info.error || 'Lookup failed'));
    tipBody.append(line('name', info.name || 'No owner on record'));
    const meta = document.createElement('div');
    meta.className = 'meta';
    for (const [cls, v] of [['asn', info.asn], ['', info.domain], ['', info.country]]) {
      if (!v) continue;
      const s = document.createElement('span');
      if (cls) s.className = cls;
      s.textContent = v;
      meta.append(s);
    }
    if (meta.childNodes.length) tipBody.append(meta);
  }

  function place(target) {
    tip.style.display = 'block';
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let x = Math.min(Math.max(4, r.left), window.innerWidth - t.width - 4);
    let y = r.bottom + 6;
    if (y + t.height > window.innerHeight - 4) y = r.top - t.height - 6;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(4, y))}px)`;
  }

  const memo = new Map(); // ip -> result, for this page
  function lookup(ip) {
    if (memo.has(ip)) return Promise.resolve(memo.get(ip));
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'lookup', ip }, (res) => {
          if (chrome.runtime.lastError || !res) {
            return resolve({ ok: false, error: 'Lookup failed. Reload the page and try again.' });
          }
          if (res.ok) memo.set(ip, res);
          resolve(res);
        });
      } catch {
        // Extension was reloaded or updated while this page was open.
        resolve({ ok: false, error: 'Extension was updated. Reload the page.' });
      }
    });
  }

  let current = null;
  let hoverTimer = null;

  function hide() {
    clearTimeout(hoverTimer);
    current = null;
    if (tip) tip.style.display = 'none';
  }

  async function show(el) {
    ensureTip();
    const { ip, reserved } = el.dataset;
    if (reserved) {
      render({ reserved });
      return place(el);
    }
    if (!memo.has(ip)) {
      render({ loading: true });
      place(el);
    }
    const info = await lookup(ip);
    if (current !== el) return; // pointer moved on while we waited
    render(info);
    place(el);
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target instanceof Element ? e.target.closest('ipco-ip') : null;
    if (el === current) return;
    hide();
    if (!el) return;
    current = el;
    hoverTimer = setTimeout(() => show(el), HOVER_DELAY_MS);
  }, true);
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);

  // ---------- go ----------

  if (document.body) {
    scan([document.body]);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
})();
