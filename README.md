# IP Owner on Hover

A Chrome extension (Manifest V3). It underlines every IPv4 and IPv6 address on a web page; hover one to see who owns it, using [IPinfo](https://ipinfo.io).

**Status:** v0.1.0 prototype. The automated tests pass, but it hasn't yet been tested in live Chrome against the real IPinfo API. Section 2 below is that test.

## 1. Run the automated tests (about 2 min)

You need Node.js 18 or newer.

```sh
npm install   # installs jsdom for the page simulation test
npm test
```

Expected output:

```
all detection tests passed
all content-script tests passed
```

- `test/detect.test.js` checks IPv4/IPv6 detection, edge cases and reserved-range labels.
- `test/content.test.js` loads the content script in a simulated page. It checks that the right addresses are wrapped, that text areas, scripts and editable areas are skipped, that lookups happen only on hover, and that content added later is scanned.

## 2. Test it in Chrome (about 10 min)

1. **Get an IPinfo token (optional, 3 min).** Sign up free at https://ipinfo.io/signup and copy your access token. Without a token, the extension uses IPinfo's rate-limited unauthenticated endpoint.
2. **Load the extension (1 min).** Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and select this repo's folder.
3. **Add the token (1 min).** On the extension's card, click **Details → Extension options**, paste the token and click **Save token**.
4. **Allow file access (30 s).** On the same Details page, turn on **Allow access to file URLs**. The test page in the next step is a local file.
5. **Open the test page (5 min).** Drag `test/manual.html` into a Chrome tab. Each line gives the expected result in [brackets]. Check that:
   - public IPv4 and IPv6 addresses are underlined, and hovering shows the owner name, ASN, domain and country;
   - private and reserved addresses show a local label such as "Private network";
   - text in the text area and the editable box is **not** underlined;
   - after clicking **Add an IP to the page**, the new address is underlined within about a second.
6. **Try a real page (1 min).** Visit any page that lists IPs, such as https://www.cloudflare.com/ips/.

### If something doesn't work

| Symptom | Where to look |
|---|---|
| Nothing is underlined | Reload the page after loading the extension. Check `chrome://extensions` for errors. |
| Tooltip says "Lookup failed" | On the extension's card, click **Service worker** to open its DevTools and check the Console and Network tabs. |
| "IPinfo rejected the token" | Re-copy the token from your IPinfo dashboard into the options page. |
| "Rate limit reached" | Add a token (step 3). |
| Stale results | Options page → **Clear cached lookups**. Answers are cached for 24 h. |

After editing any file, click the reload icon on the extension's card, then reload the page you're testing.

## How it works

- `ip-detect.js`: finds addresses in text. IPv4 octets are checked strictly; IPv6 is validated and canonicalised by the URL parser. Private, loopback, link-local and other reserved ranges are labelled with no network call.
- `content.js`: wraps each address in an `<ipco-ip>` element, watches for new content with a MutationObserver, and shows a shadow-DOM tooltip on hover.
- `background.js`: service worker that calls the IPinfo Lite API (`api.ipinfo.io/lite/<ip>`) when a token is set, otherwise `ipinfo.io/<ip>/json`. It caches each answer in `chrome.storage.local` for 24 h and prunes the cache daily.
- `options.html` / `options.js`: token setting and a clear-cache button.

## Known limits

- The tooltip shows IPinfo's AS / organisation name. IPinfo's separate **Company** field needs a paid plan; if your token returns a `company` object, the extension uses it.
- 4-part version strings such as `1.2.3.4` look like IPs and get underlined.
- Text inside shadow DOM, form inputs and editable areas isn't scanned.
- Wrapping text nodes could upset some React-style pages. If that happens, the fix is to detect the address under the cursor without changing the page.
- Not built yet: a daily bulk cache of IP ranges from IPinfo's downloadable datasets (CSV/MMDB), which would allow lookups without per-IP network calls.

## Packaging

```sh
npm run package   # creates ip-owner-on-hover.zip with just the extension files
```
