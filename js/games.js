// The game registry. To add a game:
//   1. Create games/<slug>/index.html (self-contained — its own HTML/CSS/JS)
//   2. Add an entry here. `slug` must match the folder name.
const GAMES = [
  {
    slug: 'pong',
    title: 'Pong',
    icon: '🏓',
    description: 'The classic. First to 5 wins. You vs. the machine.',
  },
  {
    slug: 'head-chef',
    title: 'Head Chef',
    icon: '🐼',
    description: 'Cook tasty dishes for a hungry panda. No timers, no stress.',
  },
  {
    slug: 'pixel-paint',
    title: 'Pixel Paint',
    icon: '🎨',
    description: 'Colour by number! Paint the gallery, draw your own, or pixelify a selfie.',
  },
];
