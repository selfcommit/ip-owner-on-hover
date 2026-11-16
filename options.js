const $ = (id) => document.getElementById(id);
const say = (t) => { $('status').textContent = t; };

chrome.storage.sync.get('token').then(({ token }) => { $('token').value = token || ''; });

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ token: $('token').value.trim() });
  say('Token saved');
});

$('clear').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clear-cache' }, (r) => {
    say(`Cleared ${r?.removed ?? 0} cached lookups`);
  });
});
