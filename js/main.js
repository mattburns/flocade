const gallery = document.getElementById('gallery');

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
