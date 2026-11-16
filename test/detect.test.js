// Run with: node test/detect.test.js
const assert = require('assert');
const { findIPs } = require('../ip-detect.js');
const ips = (s) => findIPs(s).map((m) => m.ip);

// IPv4
assert.deepStrictEqual(ips('server 104.22.160.44 is up'), ['104.22.160.44']);
assert.deepStrictEqual(ips('ends with 8.8.8.8.'), ['8.8.8.8']);
assert.deepStrictEqual(ips('IP:1.1.1.1, port 1.1.1.1:443'), ['1.1.1.1', '1.1.1.1']);
assert.deepStrictEqual(ips('http://93.184.216.34/path and 10.0.0.0/8'), ['93.184.216.34', '10.0.0.0']);
assert.deepStrictEqual(ips('1.2.3.4.5 256.1.1.1 1.2.3 1.2.3.4abc x1.2.3.4 1.2.3.456'), []);
assert.strictEqual(findIPs('192.168.1.1')[0].reserved, 'Private network (192.168.0.0/16)');
assert.strictEqual(findIPs('8.8.8.8')[0].reserved, null);

// IPv6
assert.deepStrictEqual(ips('dns 2606:4700:4700::1111 ok'), ['2606:4700:4700::1111']);
assert.deepStrictEqual(ips('2001:4860:4860:0:0:0:0:8888.'), ['2001:4860:4860::8888']);
assert.deepStrictEqual(ips('[2A00:1450:4001:81B::200E]:443'), ['2a00:1450:4001:81b::200e']);
assert.deepStrictEqual(ips('mapped ::ffff:8.8.4.4 here'), ['8.8.4.4']);
assert.strictEqual(findIPs('fe80::1')[0].reserved, 'Link-local');
assert.strictEqual(findIPs('fd12:3456::1')[0].reserved, 'Unique local address (fc00::/7)');
// Things that look vaguely like IPv6 but aren't
assert.deepStrictEqual(ips('12:34:56 aa:bb:cc:dd:ee:ff std::cout :: 10:30 1:2:3:4:5:6:7:8:9'), []);
// Mixed, with correct offsets
const t = 'a 1.1.1.1 b 2606:4700::1 c';
for (const m of findIPs(t)) assert.ok(['1.1.1.1', '2606:4700::1'].includes(t.slice(m.start, m.end)));
assert.strictEqual(findIPs(t).length, 2);
assert.deepStrictEqual(ips('10.0.0.1:aa:bb'), ['10.0.0.1']);

console.log('all detection tests passed');
