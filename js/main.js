const gallery = document.getElementById('gallery');

// The service worker precaches every game on first visit, so the whole
// arcade works offline from then on (see sw.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// "Get the app" pill: native install prompt where the browser supports it
// (Chrome/Edge via beforeinstallprompt), a Share → Add to Home Screen hint on
// iOS Safari (which has no install API). Hidden once installed or dismissed.
(function offerInstall() {
  const pill = document.getElementById('install-pill');
  const button = document.getElementById('install-button');
  const iosHint = document.getElementById('install-ios-hint');
  const dismiss = document.getElementById('install-dismiss');
  const DISMISS_KEY = 'flocade-install-dismissed';

  const isInstalled = matchMedia('(display-mode: standalone)').matches
    || navigator.standalone === true;
  if (isInstalled || localStorage.getItem(DISMISS_KEY)) return;

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // suppress Chrome's own mini-infobar; we offer our pill instead
    deferredPrompt = event;
    button.hidden = false;
    pill.hidden = false;
  });

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  if (isIOS) {
    iosHint.hidden = false;
    pill.hidden = false;
  }

  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === 'accepted') pill.hidden = true;
  });

  dismiss.addEventListener('click', () => {
    pill.hidden = true;
    localStorage.setItem(DISMISS_KEY, '1');
  });

  window.addEventListener('appinstalled', () => { pill.hidden = true; });
})();

// no-store bypasses the browser cache so new games appear immediately,
// despite GitHub Pages' 10-minute max-age on everything it serves
fetch('games.json', { cache: 'no-store' })
  .then(res => res.json())
  .then(renderGallery)
  .catch(() => {
    gallery.innerHTML = '<p class="empty-state">COULDN\'T LOAD GAMES<br>(try refreshing)</p>';
  });

function renderGallery(games) {
  if (games.length === 0) {
    gallery.innerHTML = '<p class="empty-state">INSERT COIN<br>(games coming soon)</p>';
    return;
  }
  for (const game of games) {
    const card = document.createElement('a');
    card.className = 'game-card';
    card.href = `games/${game.slug}/`;

    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = game.icon;

    const title = document.createElement('h2');
    title.textContent = game.title;

    const desc = document.createElement('p');
    desc.textContent = game.description;

    card.append(icon, title, desc);
    gallery.appendChild(card);
  }
}
