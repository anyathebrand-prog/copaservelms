/**
 * Trace the CopaServe mark out of its PNG into SVG path data.
 *
 * The brand mark only ever existed as a bitmap, so it could be placed but not
 * drawn, masked or animated. This recovers the geometry once; the result is
 * committed as components/brand/mark-paths.ts and this script is not part of
 * the build.
 *
 * The letterform is a knockout — transparent in the artwork, so whatever sits
 * behind the mark shows through it. Inside the green square, "not green" is
 * precisely the shape wanted.
 *
 * Every edge is straight, so square-tracing the pixel corners and then running
 * Douglas-Peucker recovers the real geometry. Epsilon 2 is what the committed
 * paths were traced at: below it anti-aliasing survives as an 88-vertex
 * staircase, above it the bottom edge visibly bows.
 *
 * Pass a second argument to render the result back over the source, because a
 * vertex count says nothing about whether the shape is still the logo.
 *
 *   npx tsx scripts/trace-mark.ts [epsilon] [preview.png]
 */
import sharp from "sharp";

const SOURCE = "public/brand/copaserve-mark.png";
const EPSILON = Number(process.argv[2] ?? 2);
const PREVIEW = process.argv[3] ?? null;

type Point = { x: number; y: number };

/** Ramer-Douglas-Peucker. Straight edges collapse to their endpoints. */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;

  const a = points[0]!;
  const b = points[points.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const norm = Math.hypot(dx, dy) || 1;

  let index = 0;
  let far = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const distance = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / norm;
    if (distance > far) {
      far = distance;
      index = i;
    }
  }

  if (far <= epsilon) return [a, b];
  return [
    ...simplify(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(index), epsilon),
  ];
}

async function main() {
  const image = sharp(SOURCE);
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error("no dimensions");

  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const isGreen = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i + 3]! > 128 && data[i + 1]! > data[i]! + 20 && data[i + 1]! > data[i + 2]! + 20;
  };

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isGreen(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  console.log(`green square: ${minX},${minY} .. ${maxX},${maxY} (${w}x${h})`);

  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) ink[y * w + x] = isGreen(x + minX, y + minY) ? 0 : 1;
  }
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : ink[y * w + x]!);

  // Connected components, so each slab becomes its own path.
  const label = new Int32Array(w * h).fill(-1);
  const components: number[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!get(x, y) || label[y * w + x] !== -1) continue;
      const pixels: number[] = [];
      const stack = [y * w + x];
      label[y * w + x] = components.length;
      while (stack.length) {
        const index = stack.pop()!;
        pixels.push(index);
        const px = index % w;
        const py = (index - px) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (!get(nx, ny) || label[ny * w + nx] !== -1) continue;
          label[ny * w + nx] = components.length;
          stack.push(ny * w + nx);
        }
      }
      components.push(pixels);
    }
  }

  components.sort((a, b) => b.length - a.length);
  console.log(`components: ${components.map((c) => c.length).slice(0, 6).join(", ")}`);

  /** Square-tracing along pixel corners, so edges land on the true boundary. */
  function trace(member: (x: number, y: number) => boolean, start: Point): Point[] {
    const path: Point[] = [];
    const step = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
    let { x, y } = start;
    let dir = 0;
    const first = { x, y };
    let guard = 0;

    do {
      path.push({ x, y });
      const upLeft = member(x - 1, y - 1);
      const upRight = member(x, y - 1);
      const downLeft = member(x - 1, y);
      const downRight = member(x, y);

      const filled = (d: number) => {
        if (d === 0) return upRight && !downRight;
        if (d === 1) return downRight && !downLeft;
        if (d === 2) return downLeft && !upLeft;
        return upLeft && !upRight;
      };

      const left = (dir + 3) % 4;
      const right = (dir + 1) % 4;
      dir = filled(left) ? left : filled(dir) ? dir : filled(right) ? right : (dir + 2) % 4;
      x += step[dir]![0];
      y += step[dir]![1];
    } while ((x !== first.x || y !== first.y) && ++guard < 4_000_000);

    return path;
  }

  const outlines: Point[][] = [];
  for (const pixels of components) {
    if (pixels.length < 2000) continue;

    const set = new Set(pixels);
    const member = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && set.has(y * w + x);
    const firstIndex = Math.min(...pixels);
    const sx = firstIndex % w;
    const sy = (firstIndex - sx) / w;

    outlines.push(simplify(trace(member, { x: sx, y: sy }), EPSILON));
  }

  const scale = 100 / Math.max(w, h);
  const round = (n: number) => Math.round(n * 1000) / 1000;

  const paths = outlines.map(
    (outline) =>
      outline
        .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x * scale)} ${round(p.y * scale)}`)
        .join("") + "Z",
  );

  for (const [i, d] of paths.entries()) {
    console.log(`\n--- slab ${i} (${(d.match(/L/g) ?? []).length + 1} vertices) ---`);
    console.log(d);
  }

  // Render the result back out, because a vertex count says nothing about
  // whether the shape is still the logo.
  if (PREVIEW) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${w}" height="${w}">` +
      `<rect width="100" height="100" fill="#0d5c17"/>` +
      paths.map((d) => `<path d="${d}" fill="#ffffff"/>`).join("") +
      `</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(PREVIEW);
    console.log(`\nwrote ${PREVIEW}`);
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
