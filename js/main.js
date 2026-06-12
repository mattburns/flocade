const gallery = document.getElementById('gallery');

if (GAMES.length === 0) {
  gallery.innerHTML = '<p class="empty-state">INSERT COIN<br>(games coming soon)</p>';
} else {
  for (const game of GAMES) {
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
