// Pixel Paint picture library.
// Builds 500+ colour-by-number pictures deterministically at load time, so the
// served site stays a pure static file (no build step) and every device sees
// the same art. Pictures are grouped by category and tagged with a difficulty.
//
// Each picture: { id, name, category, difficulty, palette:{char:hex}, rows:[...] }
// — the same { palette, rows } shape the paint engine already understands.
(function (root) {
  'use strict';

  // ---- deterministic PRNG (so procedural art is identical every load) ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PICTURES = [];
  const seenIds = new Set();

  // Difficulty tracks how many numbers a player must juggle: the distinct
  // colour count (background included, since that's painted too).
  function autoDifficulty(rows, palette) {
    const colors = Object.keys(palette).length;
    if (colors <= 3) return 'easy';
    if (colors <= 4) return 'medium';
    return 'hard';
  }

  // pad a sprite out to a square with background '.' so every board is square
  function squarify(rows) {
    const h = rows.length, w = rows[0].length;
    const t = Math.max(w, h);
    if (t === w && t === h) return rows;
    const padL = Math.floor((t - w) / 2), padR = t - w - padL;
    const padT = Math.floor((t - h) / 2), padB = t - h - padT;
    const blank = '.'.repeat(t);
    const out = [];
    for (let i = 0; i < padT; i++) out.push(blank);
    for (const r of rows) out.push('.'.repeat(padL) + r + '.'.repeat(padR));
    for (let i = 0; i < padB; i++) out.push(blank);
    return out;
  }

  function add(p) {
    if (seenIds.has(p.id)) throw new Error('duplicate id: ' + p.id);
    if ('.' in p.palette) p.rows = squarify(p.rows);
    // validate rectangular + palette coverage
    const w = p.rows[0].length;
    for (const r of p.rows) {
      if (r.length !== w) throw new Error('ragged rows in ' + p.id + ' (' + r.length + ' != ' + w + ')');
      for (const ch of r) if (!(ch in p.palette)) throw new Error('char "' + ch + '" not in palette of ' + p.id);
    }
    if (Object.keys(p.palette).length < 2) throw new Error('needs 2+ colours: ' + p.id);
    seenIds.add(p.id);
    if (!p.difficulty) p.difficulty = autoDifficulty(p.rows, p.palette);
    PICTURES.push(p);
  }

  // ---- formula rasteriser: pred(nx, ny) over normalised [-1,1] coords ----
  function raster(w, h, pred) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const nx = ((x + 0.5) / w) * 2 - 1;
        const ny = ((y + 0.5) / h) * 2 - 1; // y points down
        row += pred(nx, ny) ? 'X' : '.';
      }
      rows.push(row);
    }
    return rows;
  }

  // ================= SHAPES =================
  const SHAPE_BG = '#f3f0ff';
  const SHAPE_COLORS = [
    { s: 'red', n: 'Red', hex: '#ff4757' },
    { s: 'pink', n: 'Pink', hex: '#ff5db1' },
    { s: 'orange', n: 'Orange', hex: '#ff8a2b' },
    { s: 'yellow', n: 'Yellow', hex: '#ffd200' },
    { s: 'green', n: 'Green', hex: '#2ec27e' },
    { s: 'teal', n: 'Teal', hex: '#00d0e0' },
    { s: 'blue', n: 'Blue', hex: '#4a7dff' },
    { s: 'purple', n: 'Purple', hex: '#a55eea' },
  ];
  const MOON_COLORS = [
    { s: 'silver', n: 'Silver', hex: '#dfe4f0' },
    { s: 'gold', n: 'Gold', hex: '#ffd200' },
    { s: 'pink', n: 'Pink', hex: '#ff9ec7' },
    { s: 'blue', n: 'Blue', hex: '#9fc6ff' },
  ];

  const SHAPES = {
    heart: function (nx, ny) {
      const X = nx * 1.28;
      const Y = -ny * 1.28 + 0.32;
      const v = Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y;
      return v <= 0;
    },
    star: function (nx, ny) {
      const ang = Math.atan2(ny, nx) + Math.PI / 2; // point up
      const r = Math.hypot(nx, ny);
      const step = Math.PI / 5;
      let m = ((ang % (2 * step)) + 2 * step) % (2 * step);
      m = Math.abs(m - step);
      const rad = 0.42 + (0.98 - 0.42) * (m / step);
      return r <= rad;
    },
    diamond: function (nx, ny) {
      return Math.abs(nx) + Math.abs(ny) <= 0.96;
    },
    circle: function (nx, ny) {
      return nx * nx + ny * ny <= 0.86 * 0.86;
    },
    square: function (nx, ny) {
      return Math.max(Math.abs(nx), Math.abs(ny)) <= 0.82;
    },
    triangle: function (nx, ny) {
      const t = (ny + 0.85) / 1.7; // 0 at apex (top), 1 at base
      if (t < 0 || t > 1) return false;
      return Math.abs(nx) <= 0.92 * t;
    },
    plus: function (nx, ny) {
      return Math.max(Math.abs(nx), Math.abs(ny)) <= 0.9 && (Math.abs(nx) <= 0.34 || Math.abs(ny) <= 0.34);
    },
    ring: function (nx, ny) {
      const r = Math.hypot(nx, ny);
      return r <= 0.9 && r >= 0.46;
    },
    moon: function (nx, ny) {
      const r = Math.hypot(nx, ny);
      return r <= 0.92 && Math.hypot(nx - 0.42, ny + 0.05) > 0.74;
    },
  };

  function shapeFamily(shapeKey, label, colors, sizeArg) {
    const size = sizeArg || 16;
    const rows = raster(size, size, SHAPES[shapeKey]);
    for (const c of colors) {
      add({
        id: 'shape-' + shapeKey + '-' + c.s,
        name: c.n + ' ' + label,
        category: 'shapes',
        difficulty: 'easy',
        palette: { '.': SHAPE_BG, X: c.hex },
        rows: rows,
      });
    }
  }

  shapeFamily('heart', 'Heart', SHAPE_COLORS);
  shapeFamily('star', 'Star', SHAPE_COLORS);
  shapeFamily('diamond', 'Diamond', SHAPE_COLORS);
  shapeFamily('circle', 'Circle', SHAPE_COLORS);
  shapeFamily('square', 'Square', SHAPE_COLORS.slice(0, 6));
  shapeFamily('triangle', 'Triangle', SHAPE_COLORS.slice(0, 6));
  shapeFamily('plus', 'Cross', SHAPE_COLORS.slice(0, 6));
  shapeFamily('ring', 'Ring', SHAPE_COLORS.slice(0, 6));
  shapeFamily('moon', 'Moon', MOON_COLORS);

  // ================= PIXEL FONT (letters & numbers) =================
  // 5x7 glyphs, '#' = ink. Rendered centred into a 12x12 grid.
  const FONT = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
    '5': ['#####', '#....', '#....', '####.', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  };
  const LETTER_BG = '#f7f4ff';
  const LETTER_INK = ['#ff2e88', '#ff7b00', '#ffb300', '#2ec27e', '#00c2d8', '#4a7dff', '#a55eea', '#ff5db1'];
  function renderGlyph(glyph, ink) {
    const W = 12, H = 12, gx = 3, gy = 2;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const gxx = x - gx, gyy = y - gy;
        const on = gyy >= 0 && gyy < 7 && gxx >= 0 && gxx < 5 && glyph[gyy][gxx] === '#';
        row += on ? 'X' : '.';
      }
      rows.push(row);
    }
    return { rows, palette: { '.': LETTER_BG, X: ink } };
  }
  let li = 0;
  for (const ch of Object.keys(FONT)) {
    const ink = LETTER_INK[li % LETTER_INK.length];
    li++;
    const g = renderGlyph(FONT[ch], ink);
    const isNum = ch >= '0' && ch <= '9';
    add({
      id: 'glyph-' + ch,
      name: (isNum ? 'Number ' : 'Letter ') + ch,
      category: isNum ? 'numbers' : 'letters',
      difficulty: 'easy',
      palette: g.palette,
      rows: g.rows,
    });
  }

  // ================= PROCEDURAL SNOWFLAKES =================
  // 4-fold symmetric random branches — each seed is a unique flake.
  function makeSnowflake(seed) {
    const N = 16, c = (N - 1) / 2;
    const grid = Array.from({ length: N }, () => new Array(N).fill('.'));
    const rnd = mulberry32(seed);
    const set = (x, y) => {
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      // mirror across both axes + diagonal for 8-fold symmetry
      const pts = [
        [x, y], [N - 1 - x, y], [x, N - 1 - y], [N - 1 - x, N - 1 - y],
        [y, x], [N - 1 - y, x], [y, N - 1 - x], [N - 1 - y, N - 1 - x],
      ];
      for (const [px, py] of pts) grid[py][px] = 'X';
    };
    // central spine
    for (let r = 0; r <= c; r++) set(Math.round(c), Math.round(c - r));
    // random side branches off the spine
    const branches = 2 + Math.floor(rnd() * 3);
    for (let b = 0; b < branches; b++) {
      const at = 2 + Math.floor(rnd() * (c - 1));
      const len = 1 + Math.floor(rnd() * 3);
      for (let k = 1; k <= len; k++) {
        set(Math.round(c) + k, Math.round(c - at));
        set(Math.round(c) + Math.round(k * 0.7), Math.round(c - at - Math.round(k * 0.7)));
      }
    }
    set(Math.round(c), Math.round(c)); // centre
    return grid.map((r) => r.join(''));
  }
  for (let i = 0; i < 12; i++) {
    add({
      id: 'snowflake-' + (i + 1),
      name: 'Snowflake #' + (i + 1),
      category: 'nature',
      difficulty: 'easy',
      palette: { '.': '#0a2a4a', X: '#bfe9ff' },
      rows: makeSnowflake(101 + i * 7),
    });
  }

  // ================= PROCEDURAL ALIENS / MONSTERS =================
  // Symmetric 12x12 "space invader" style critters; left half random, mirrored.
  function makeCreature(seed, bg, body, eye) {
    const W = 12, H = 12;
    const rnd = mulberry32(seed);
    const half = W / 2;
    const grid = Array.from({ length: H }, () => new Array(W).fill('.'));
    for (let y = 2; y < H - 1; y++) {
      for (let x = 0; x < half; x++) {
        const dense = y > 3 && y < H - 2 ? 0.62 : 0.4;
        if (rnd() < dense) {
          grid[y][x] = 'B';
          grid[y][W - 1 - x] = 'B';
        }
      }
    }
    // legs/feet row
    for (let x = 1; x < half; x += 2) {
      if (rnd() < 0.6) { grid[H - 1][x] = 'B'; grid[H - 1][W - 1 - x] = 'B'; }
    }
    // eyes
    const ey = 4 + Math.floor(rnd() * 2);
    grid[ey][3] = 'E'; grid[ey][W - 1 - 3] = 'E';
    return {
      rows: grid.map((r) => r.join('')),
      palette: { '.': bg, B: body, E: eye },
    };
  }
  const CREATURE_SKINS = [
    { bg: '#10122b', body: '#7ed957', eye: '#ffffff', n: 'Green' },
    { bg: '#10122b', body: '#ff5db1', eye: '#ffffff', n: 'Pink' },
    { bg: '#10122b', body: '#00d0e0', eye: '#10122b', n: 'Cyan' },
    { bg: '#10122b', body: '#ffd200', eye: '#10122b', n: 'Yellow' },
    { bg: '#10122b', body: '#a55eea', eye: '#ffffff', n: 'Purple' },
    { bg: '#10122b', body: '#ff7b00', eye: '#10122b', n: 'Orange' },
  ];
  for (let i = 0; i < 12; i++) {
    const skin = CREATURE_SKINS[i % CREATURE_SKINS.length];
    const c = makeCreature(2000 + i * 13, skin.bg, skin.body, skin.eye);
    add({
      id: 'monster-' + (i + 1),
      name: skin.n + ' Monster #' + (i + 1),
      category: 'space',
      difficulty: 'easy',
      palette: c.palette,
      rows: c.rows,
    });
  }

  // ================= RECOLOURABLE SPRITE FAMILIES =================
  // A base sprite uses 'B' for the recolourable body; each variant swaps it.
  function pad(rows) {
    const w = Math.max.apply(null, rows.map((r) => r.length));
    return rows.map((r) => r + '.'.repeat(w - r.length));
  }
  const BODY8 = [
    { s: 'red', n: 'Red', hex: '#ff4757' },
    { s: 'orange', n: 'Orange', hex: '#ff8a2b' },
    { s: 'yellow', n: 'Yellow', hex: '#ffd200' },
    { s: 'green', n: 'Green', hex: '#2ec27e' },
    { s: 'blue', n: 'Blue', hex: '#4a7dff' },
    { s: 'purple', n: 'Purple', hex: '#a55eea' },
    { s: 'pink', n: 'Pink', hex: '#ff5db1' },
    { s: 'teal', n: 'Teal', hex: '#00d0e0' },
  ];
  const BODY12 = BODY8.concat([
    { s: 'lime', n: 'Lime', hex: '#9be870' },
    { s: 'sky', n: 'Sky', hex: '#7ec8ff' },
    { s: 'coral', n: 'Coral', hex: '#ff6f61' },
    { s: 'indigo', n: 'Indigo', hex: '#6c5ce7' },
  ]);

  // family(opts): builds one picture per colour variant, swapping 'B'.
  function family(opts) {
    const colors = opts.colors || BODY8;
    for (const c of colors) {
      add({
        id: opts.id + '-' + c.s,
        name: c.n + ' ' + opts.label,
        category: opts.category,
        difficulty: opts.difficulty,
        palette: Object.assign({}, opts.palette, { B: c.hex }),
        rows: opts.rows,
      });
    }
  }

  family({
    id: 'balloon', label: 'Balloon', category: 'toys', colors: BODY12,
    palette: { '.': '#eaf6ff', B: '#ff4757', k: '#6b6480' },
    rows: pad([
      '......BBBB', '....BBBBBBBB', '...BBBBBBBBBB', '..BBBBBBBBBBBB',
      '..BBBBBBBBBBBB', '..BBBBBBBBBBBB', '..BBBBBBBBBBBB', '...BBBBBBBBBB',
      '...BBBBBBBBBB', '....BBBBBBBB', '.....BBBBBB', '......BBBB',
      '.......BB', '.......kk', '......k..k', '.......kk',
    ]),
  });

  family({
    id: 'fish', label: 'Fish', category: 'sea', colors: BODY12,
    palette: { '.': '#cdeeff', B: '#ff8a2b', k: '#10122b' },
    rows: pad([
      '', '', '.....BBBBB', '...BBBBBBBBB', '..BBBBBBBBBBB..B',
      '.BBBBBBBBBBBBBBB', '.BkBBBBBBBBBBBBB', '.BBBBBBBBBBBBBBB',
      '..BBBBBBBBBBB..B', '...BBBBBBBBB', '.....BBBBB',
    ]),
  });

  family({
    id: 'butterfly', label: 'Butterfly', category: 'bugs', colors: BODY12,
    palette: { '.': '#eef7ee', B: '#a55eea', d: '#3a2a4a' },
    rows: pad([
      '...d....d', '...d....d', '.BBBd..dBBB', '.BBBBddBBBB',
      'BBBBBddBBBBB', 'BBBBBddBBBBB', 'BBBBBddBBBBB', '.BBBBddBBBB',
      '..BBBddBBB', '..BBBddBBB', '...BBddBB', '....dd',
    ]),
  });

  family({
    id: 'mushroom', label: 'Mushroom', category: 'nature', colors: BODY8,
    palette: { '.': '#e9f7ef', B: '#ff4757', w: '#ffffff', s: '#f3e6c8' },
    rows: pad([
      '....BBBBBB', '..BBBBBBBBBB', '.BBwBBBBBwBB', '.BBBBBBBBBBB',
      '.BBBBwwBBBBB', 'BBBBBBBBBBBBB', 'BBBBwBBBBwBBB', '.BBBBBBBBBBB',
      '..BBBBBBBBBB', '....sssss', '....sssss', '....sssss', '...sssssss',
    ]),
  });

  family({
    id: 'car', label: 'Car', category: 'vehicles', colors: BODY8,
    palette: { '.': '#dff1ff', B: '#ff4757', g: '#bfe9ff', k: '#222233', y: '#ffe600' },
    rows: pad([
      '', '', '.....BBBBBB', '....BgggggB', '...BBBBBBBBBBB',
      '..BBBBBBBBBBBBBy', '..BBBBBBBBBBBBBB', '..BkkBBBBBBkkB',
      '...kk......kk',
    ]),
  });

  family({
    id: 'flower', label: 'Flower', category: 'nature', colors: BODY12,
    palette: { '.': '#eaf7ff', B: '#ff5db1', y: '#ffd200', g: '#3fae5a' },
    rows: pad([
      '....BBBB', '..BBBBBBBB', '..BBByyBBBB', '.BBByyyyBBB',
      '..BBByyBBBB', '..BBBBBBBB', '....BBBB', '.....gg',
      '.....gg', '..ggg.gg', '...ggggg', '.....gg', '.....gg',
    ]),
  });

  family({
    id: 'gift', label: 'Gift', category: 'holidays', colors: BODY12,
    palette: { '.': '#fdeef6', B: '#ff4757', r: '#ffd200' },
    rows: pad([
      '', '....r..r', '...rBrrBr', '....rBr', '..BBBBrBBBB',
      '..rrrrrrrrr', '..BBBBrBBBB', '..BBBBrBBBB', '..BBBBrBBBB', '..BBBBrBBBB',
    ]),
  });

  family({
    id: 'gem', label: 'Gem', category: 'toys', colors: BODY12,
    palette: { '.': '#1b2450', B: '#00d0e0', k: '#10122b', w: '#ffffff' },
    rows: pad([
      '', '...kkkkkkkk', '..kBBBBBBBBk', '.kBBwBBBBBBBk', '.kBBBBBBBBBBk',
      '..kBBBBBBBBk', '...kBBBBBBk', '....kBBBBk', '.....kBBk', '......kk',
    ]),
  });

  family({
    id: 'crayon', label: 'Crayon', category: 'toys', colors: BODY12,
    palette: { '.': '#f5f4ff', B: '#2ec27e', w: '#ffffff' },
    rows: pad([
      '.....BB', '....BBBB', '...BBBBBB', '...BBBBBB', '..wBBBBBBw',
      '..BBBBBBBB', '..wwwwwwww', '..wwwwwwww', '..BBBBBBBB', '..BBBBBBBB',
      '..BBBBBBBB', '..BBBBBBBB',
    ]),
  });

  family({
    id: 'ornament', label: 'Ornament', category: 'holidays', colors: BODY12,
    palette: { '.': '#0c1f3a', B: '#ff4757', y: '#ffd200', w: '#ffffff' },
    rows: pad([
      '......yy', '......yy', '....BBBBBB', '..BBBBBBBBBB', '.BBwBBBBBBBB',
      '.BBwBBBBBBBB', '.BBBBBBBBBBB', '.BBBBBBBBBBB', '..BBBBBBBBBB', '....BBBBBB',
    ]),
  });

  const FUR = [
    { s: 'ginger', n: 'Ginger', hex: '#f5a25d' },
    { s: 'grey', n: 'Grey', hex: '#9aa0b0' },
    { s: 'black', n: 'Black', hex: '#4a4a5a' },
    { s: 'white', n: 'Snowy', hex: '#eef0f5' },
    { s: 'brown', n: 'Brown', hex: '#a9744f' },
    { s: 'cream', n: 'Cream', hex: '#f0dcb0' },
  ];
  const GHOST_COLORS = [{ s: 'white', n: 'White', hex: '#eef0f5' }].concat(BODY8.slice(0, 6));

  family({
    id: 'cat', label: 'Cat', category: 'animals', colors: FUR,
    palette: { '.': '#dff3e6', B: '#f5a25d', p: '#ff9ec7', e: '#2b8a5a', n: '#ff5db1' },
    rows: pad([
      '.B............B', '.BB..........BB', '.BpB........BpB', '.BBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBB', 'BBeeBBBBBBBBeeBB', 'BBeeBBBBBBBBeeBB', 'BBBBBBBnnBBBBBBB',
      'BBBBBBBnnBBBBBBB', 'BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', '.BBBBBBBBBBBBBB',
      '..BBBBBBBBBBBB',
    ]),
  });

  family({
    id: 'dog', label: 'Dog', category: 'animals', colors: FUR,
    palette: { '.': '#dfeffb', B: '#a9744f', w: '#f7ecd0', k: '#2b2b38' },
    rows: pad([
      '.BB........BB', '.BBB......BBB', 'BBBBBBBBBBBBBB', 'BBBBBBBBBBBBBB',
      'BBkBBBBBBBBkBB', 'BBBBBBBBBBBBBB', 'BBBBBwwwwBBBBB', 'BBBBwwkkwwBBBB',
      'BBBBwwwwwwBBBB', '.BBBBBBBBBBBB', '..BBBBBBBBBB',
    ]),
  });

  family({
    id: 'bird', label: 'Bird', category: 'animals', colors: BODY8,
    palette: { '.': '#eaf7ff', B: '#4a7dff', w: '#ffffff', y: '#ffb300', k: '#10122b' },
    rows: pad([
      '....BBBBB', '..BBBBBBBBB', '.BBBBBBBBBBB', '.BBkBBBBBBBB',
      'yBBBBBBBBBBB', 'yBBBBBBBBBBB', '.BBwwwBBBBBB', '.BwwwwwBBBBB',
      '..wwwwwBBBB', '...wwwBBB', '....y...y',
    ]),
  });

  family({
    id: 'ghost', label: 'Ghost', category: 'holidays', colors: GHOST_COLORS,
    palette: { '.': '#0c1430', B: '#eef0f5', k: '#3a3a48' },
    rows: pad([
      '...BBBBBB', '..BBBBBBBB', '.BBBBBBBBBB', '.BkkBBkkBBB',
      '.BkkBBkkBBB', '.BBBBBBBBBB', '.BBBBBBBBBB', '.BBBkkBBBBB',
      '.BBBBBBBBBB', '.B.BB.BB.B',
    ]),
  });

  family({
    id: 'robot', label: 'Robot', category: 'toys', colors: BODY8.slice(0, 6),
    palette: { '.': '#0e1430', B: '#9aa0b0', g: '#10122b', e: '#00f0ff' },
    rows: pad([
      '.....B', '.....B', '..BBBBBBBB', '.BBBBBBBBBB', '.BggggggggB',
      '.BgeggggegB', '.BggggggggB', '.Bgg.ee.ggB', '.BBBBBBBBBB',
      '..B.BBBB.B', '...BBBBBB',
    ]),
  });

  family({
    id: 'planet', label: 'Planet', category: 'space', colors: BODY12,
    palette: { '.': '#0a0a23', B: '#4a7dff', r: '#ffd200', w: '#ffffff' },
    rows: pad([
      '.....BBBBB', '...BBBBBBBBB', '..BBwBBBBBBBB', '.BBBBBBBBBBBB',
      'rrrrrrrrrrrrrrrr', '.BBBBBBBBBBBB', '.BBBBBBBBBBBB', '..BBBBBBBBBB',
      '...BBBBBBBB', '.....BBBBB',
    ]),
  });

  family({
    id: 'kite', label: 'Kite', category: 'toys', colors: BODY8,
    palette: { '.': '#cdeeff', B: '#ff5db1', k: '#6b6480', r: '#ffd200' },
    rows: pad([
      '......B', '.....BBB', '....BBkBB', '...BBBkBBB', '..BBBBkBBBB',
      '.kkkkkkkkkkk', '..BBBBkBBBB', '...BBBkBBB', '....BBkBB', '.....BBB',
      '......B', '......k', '.....r.k', '......k.r', '.....r.k',
    ]),
  });

  family({
    id: 'umbrella', label: 'Umbrella', category: 'toys', colors: BODY8,
    palette: { '.': '#eaf7ff', B: '#ff4757', k: '#6b6480' },
    rows: pad([
      '.......B', '.....BBBBB', '...BBBBBBBBB', '..BBBBBBBBBBB',
      '.BBBBBBBBBBBBB', 'BBBBBBBBBBBBBBB', '.B.BB.BB.BB.B', '.......k',
      '.......k', '.......k', '......kk', '.....kk',
    ]),
  });

  family({
    id: 'potion', label: 'Potion', category: 'toys', colors: BODY8,
    palette: { '.': '#0e1430', B: '#a55eea', g: '#bfe9ff', d: '#a9744f', w: '#ffffff' },
    rows: pad([
      '.....dd', '.....dd', '....gggg', '....gggg', '...gggggg',
      '..gBBBBBBg', '.gBBBBBBBBg', '.gBBBBBBBBg', '.gBwBBBBBBg', '.gBBBBBBBBg',
      '.gBBBBBBBBg', '..gBBBBBBg', '...gggggg',
    ]),
  });

  family({
    id: 'airballoon', label: 'Hot Air Balloon', category: 'vehicles', colors: BODY8,
    palette: { '.': '#cdeeff', B: '#ff4757', w: '#ffe600', d: '#a9744f', k: '#6b6480' },
    rows: pad([
      '....BBBBB', '..BBBBBBBBB', '.BBwBBBBwBB', '.BBwBBBBwBB', 'BBBwBBBBwBBB',
      'BBBwBBBBwBBB', '.BBwBBBBwBB', '.BBBBBBBBBB', '..BBBBBBBB', '...k.k.k.k',
      '....dddd', '....dddd',
    ]),
  });

  family({
    id: 'donut', label: 'Donut', category: 'food', colors: BODY12,
    palette: { '.': '#fff3f8', B: '#ff9ec7', r: '#ff4757', y: '#ffd200', g: '#2ec27e', c: '#00d0e0' },
    rows: pad([
      '....BBBBBB', '..BBrBBgBBBB', '.BBBBBBBBBcB', '.ByBB....BBBB',
      '.BBB......BBr', '.BBB......BBB', '.BgBB....BByB', '.BBBBBBBBBBBB',
      '..BBcBBrBBBB', '....BBgBBB',
    ]),
  });

  family({
    id: 'cupcake', label: 'Cupcake', category: 'food', colors: BODY8,
    palette: { '.': '#fff3f8', B: '#ff9ec7', w: '#e8a23d', r: '#ff4757' },
    rows: pad([
      '.......r', '......BBB', '....BBBBBBB', '...BBBBBBBBB', '..BBBBBBBBBBB',
      '..BBBBBBBBBBB', '...wwwwwwww', '...w.w.w.w.w', '...w.w.w.w.w', '....wwwwww',
    ]),
  });

  family({
    id: 'popsicle', label: 'Ice Lolly', category: 'food', colors: BODY8,
    palette: { '.': '#cdeeff', B: '#ff4757', d: '#a9744f', w: '#ffffff' },
    rows: pad([
      '..BBBBBB', '.BBBBBBBB', '.BBwBBBBB', '.BBBBBBBB', '.BBBBBBBB',
      '.BBBBBBBB', '.BBBBBBBB', '.BBBBBBBB', '...dd', '...dd', '...dd', '...dd',
    ]),
  });

  family({
    id: 'lollipop', label: 'Lollipop', category: 'food', colors: BODY8,
    palette: { '.': '#fff3f8', B: '#ff5db1', w: '#ffffff' },
    rows: pad([
      '...BBBBB', '..BBBBBBB', '.BBwwBBBB', '.BBBwwBBB', '.BBBBwwBB',
      '.BBBBBwwB', '.BBwwBBBB', '..BBBBBB', '....w', '....w', '....w', '....w',
    ]),
  });

  family({
    id: 'candy', label: 'Candy', category: 'food', colors: BODY8,
    palette: { '.': '#0e1430', B: '#ff4757', w: '#ffd9a0' },
    rows: pad([
      '.w........w', '.ww.BBBB.ww', '.wwBBBBBBww', '.wBBBBBBBBw',
      '.wwBBBBBBww', '.ww.BBBB.ww', '.w........w',
    ]),
  });

  family({
    id: 'icecream', label: 'Ice Cream', category: 'food', colors: BODY8,
    palette: { '.': '#eaf7ff', B: '#ff9ec7', d: '#e0a85a' },
    rows: pad([
      '...BBBBB', '..BBBBBBB', '.BBBBBBBBB', '.BBBBBBBBB', '.BBBBBBBBB',
      '..BBBBBBB', '..ddddddd', '...ddddd', '...ddddd', '....ddd', '.....d',
    ]),
  });

  family({
    id: 'soda', label: 'Soda', category: 'food', colors: BODY8.slice(0, 6),
    palette: { '.': '#eaf7ff', B: '#ff4757', w: '#dfe4f0', r: '#ffd200' },
    rows: pad([
      '.....r', '.....r', '..wwwwwww', '..BBBBBBB', '..BBBBBBB',
      '..BBBBBBB', '...BBBBB', '...BBBBB', '....BBB',
    ]),
  });

  family({
    id: 'ball', label: 'Beach Ball', category: 'toys', colors: BODY8,
    palette: { '.': '#eaf7ff', B: '#ff4757', w: '#ffffff' },
    rows: pad([
      '....BBBBB', '..BBwBBwBB', '.BBBwBBwBBB', '.BwwwBBwwwB', 'BBBBBBBBBBB',
      '.BwwwBBwwwB', '.BBBwBBwBBB', '..BBwBBwBB', '....BBBBB',
    ]),
  });

  family({
    id: 'egg', label: 'Easter Egg', category: 'holidays', colors: BODY12,
    palette: { '.': '#eef7ee', B: '#ff5db1', w: '#ffffff', y: '#ffd200' },
    rows: pad([
      '....BBBB', '..BBBBBBBB', '.BBBBBBBBBB', '.wwwwwwwwww', '.BBBBBBBBBB',
      '.yByByByByB', '.BBBBBBBBBB', '.wwwwwwwwww', '.BBBBBBBBBB', '..BBBBBBBB', '....BBBB',
    ]),
  });

  family({
    id: 'tulip', label: 'Tulip', category: 'nature', colors: BODY8,
    palette: { '.': '#eaf7ff', B: '#ff4757', g: '#3fae5a' },
    rows: pad([
      '.B.B.B', 'BBBBBBB', 'BBBBBBB', 'BBBBBBB', '.BBBBB', '..BBB',
      '...g', '...g', '.g.g', '..gg.g', '...g', '...g',
    ]),
  });

  // ================= CLASSIC HAND-DRAWN ONE-OFFS =================
  function solo(id, name, category, palette, rows, difficulty) {
    add({ id: id, name: name, category: category, difficulty: difficulty, palette: palette, rows: pad(rows) });
  }

  solo('classic-panda', 'Panda', 'animals',
    { '.': '#aee7ff', k: '#1d1d2b', w: '#ffffff', p: '#ff9ec7' },
    [
      '................', '..kkk......kkk..', '.kkkkk....kkkkk.', '.kkwwwwwwwwwwkk.',
      '..wwwwwwwwwwww..', '.wwwwwwwwwwwwww.', '.wwkkkwwwwkkkww.', '.wwkwkwwwwkwkww.',
      '.wwkkkwwwwkkkww.', '.wwwwwwwwwwwwww.', '.wwwwwwkkwwwwww.', '.wwwwwkwwkwwwww.',
      '..wwwwwwwwwwww..', '..wwwpwwwwpwww..', '...wwwwwwwwww...', '................',
    ]);

  solo('classic-capybara', 'Capybara', 'animals',
    { '.': '#bfe8ff', b: '#b07d4f', d: '#7a5230', k: '#1d1d2b', g: '#7ed957' },
    [
      '................', '................', '................', '....bbbbbb......',
      '...bbbbbbbb.....', '..bbdbbbbbbbbb..', '..bbbbbbbbbbbb..', '..bkbbbbbbbbbb..',
      '..bbbbbbbbbbbb..', '..dbbbbbbbbbbb..', '...bbbbbbbbbb...', '...bb..bb..bb...',
      'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg',
    ]);

  // ===== external one-off batches get appended here by the build (see ONEOFFS) =====
  if (root.PIXEL_ONEOFFS && root.PIXEL_ONEOFFS.length) {
    for (const o of root.PIXEL_ONEOFFS) add({ id: o.id, name: o.name, category: o.category, difficulty: o.difficulty, palette: o.palette, rows: pad(o.rows) });
  }

  // ================= CATEGORY METADATA (display order + icons) =================
  const CATEGORY_META = [
    { id: 'animals', label: 'Animals', icon: '🐾' },
    { id: 'sea', label: 'Sea', icon: '🐠' },
    { id: 'bugs', label: 'Bugs', icon: '🐞' },
    { id: 'food', label: 'Food', icon: '🍔' },
    { id: 'nature', label: 'Nature', icon: '🌸' },
    { id: 'space', label: 'Space', icon: '🚀' },
    { id: 'vehicles', label: 'Vehicles', icon: '🚗' },
    { id: 'holidays', label: 'Holidays', icon: '🎁' },
    { id: 'toys', label: 'Toys', icon: '🧸' },
    { id: 'objects', label: 'Objects', icon: '🔑' },
    { id: 'faces', label: 'Faces', icon: '😀' },
    { id: 'shapes', label: 'Shapes', icon: '🔷' },
    { id: 'letters', label: 'Letters', icon: '🔤' },
    { id: 'numbers', label: 'Numbers', icon: '🔢' },
  ];

  // ---- exports (browser sets a global; node can require for validation) ----
  root.PIXEL_PICTURES = PICTURES;
  root.PIXEL_CATEGORIES = CATEGORY_META;
  if (typeof module !== 'undefined' && module.exports) module.exports = { PICTURES: PICTURES, CATEGORIES: CATEGORY_META };
})(typeof window !== 'undefined' ? window : globalThis);
