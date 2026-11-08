// Minimal QR code encoder (byte mode, error correction M, versions 1–10) for share links such as a listing's public
// page (LEAS-01). Follows ISO/IEC 18004 as laid out in Project Nayuki's reference encoder. qrMatrix(text) → rows of
// booleans (true = dark), or null when the text is longer than version 10 holds (213 bytes).

const MAX_VERSION = 10;
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMAT_ECL_M = 0;

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMul(coef, factor);
    });
  }
  return result;
}

function rawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (ver) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// Data codewords: mode, length, bytes, terminator and pad bytes.
function encodeData(bytes, ver) {
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

// Split into blocks, add error correction, interleave.
function withErrorCorrection(data, ver) {
  const numBlocks = BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]);
    });
  }
  return result;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Runs of five or more, 2×2 blocks and dark/light balance (the finder-lookalike rule is left out; any mask decodes).
function penalty(m) {
  const size = m.length;
  let score = 0;
  for (let a = 0; a < size; a += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let b = 1; b <= size; b += 1) {
        const same = b < size && (horizontal ? m[a][b] === m[a][b - 1] : m[b][a] === m[b - 1][a]);
        if (same) run += 1;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (m[y][x]) dark += 1;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  }
  const total = size * size;
  return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text ?? ""))];
  let ver = 1;
  while (ver <= MAX_VERSION && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver += 1;
  if (ver > MAX_VERSION) return null;

  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };

  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const align = alignmentPositions(ver, size);
  align.forEach((ay, i) =>
    align.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );

  const drawFormat = (mask) => {
    const data = (FORMAT_ECL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6));
    set(8, 8, bit(bits, 7));
    set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(bits, i));
      set(b, a, bit(bits, i));
    }
  }

  const codewords = withErrorCorrection(encodeData(bytes, ver), ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i += 1;
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!fixed[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(mask);
    drawFormat(mask);
    const score = penalty(modules);
    if (score < bestScore) [best, bestScore] = [mask, score];
    applyMask(mask);
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

// SVG path ("M x y h1 v1 h-1 z" per dark module) for a matrix, offset by a quiet zone of `margin` modules.
export function qrPath(matrix, margin = 4) {
  let d = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }),
  );
  return d;
}
