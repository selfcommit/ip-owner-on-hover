// Smoke test for content.js in a simulated page (jsdom).
// Run with: npm install && node test/content.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const dom = new JSDOM(
  `<body>
     <p id="a">Edge at 104.22.160.44 and 2606:4700::1111, lan 192.168.0.1.</p>
     <textarea>8.8.8.8</textarea>
     <script>var x = "9.9.9.9"</script>
     <div contenteditable>1.1.1.1</div>
   </body>`,
  { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;

// Fake extension messaging: answer every lookup as Cloudflare.
const sent = [];
w.chrome = {
  runtime: {
    sendMessage: (msg, cb) => {
      sent.push(msg);
      setTimeout(() => cb({ ok: true, name: 'Cloudflare, Inc.', asn: 'AS13335', domain: 'cloudflare.com', country: 'US' }), 5);
    },
  },
};
w.eval(fs.readFileSync(path.join(root, 'ip-detect.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(root, 'content.js'), 'utf8'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(100);
  const els = [...w.document.querySelectorAll('ipco-ip')];
  // Only the 3 addresses in normal text are wrapped; textarea, script and contenteditable are skipped.
  assert.deepStrictEqual(Array.from(els, (e) => e.dataset.ip), ['104.22.160.44', '2606:4700::1111', '192.168.0.1']);
  assert.strictEqual(els[2].dataset.reserved, 'Private network (192.168.0.0/16)');
  // Page text is unchanged by the wrapping.
  assert.strictEqual(w.document.getElementById('a').textContent,
    'Edge at 104.22.160.44 and 2606:4700::1111, lan 192.168.0.1.');

  // No lookups until hover.
  assert.strictEqual(sent.length, 0);

  // Content added later gets scanned too.
  const p = w.document.createElement('p');
  p.textContent = 'late 8.8.4.4';
  w.document.body.appendChild(p);

  // Hovering triggers exactly one lookup and shows the tooltip.
  els[0].dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
  await wait(600);
  assert.strictEqual(w.document.querySelectorAll('ipco-ip').length, 4);
  // Messages come from the page's JS realm, so compare by value.
  assert.strictEqual(JSON.stringify(sent), JSON.stringify([{ type: 'lookup', ip: '104.22.160.44' }]));
  assert.strictEqual(w.document.querySelector('ipco-tip').style.display, 'block');

  console.log('all content-script tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
