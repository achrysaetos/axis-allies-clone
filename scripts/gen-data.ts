import { readFileSync, writeFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const XML = 'vendor/triplea/WW2v5_1942_2nd.xml';
const POWERS = ['Russians', 'Germans', 'British', 'Japanese', 'Americans'] as const;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (_n: string, _p: unknown, _l: boolean, isAttr: boolean) => !isAttr });
const root = parser.parse(readFileSync(XML, 'utf8')).game[0];

type Attrs = Record<string, string>;
const map = root.map[0];
const territories: Attrs[] = map.territory;
const connections: Attrs[] = map.connection;

const attachments: Array<Attrs & { option?: Attrs[] }> = root.attachmentList[0].attachment;
const options = (a: { option?: Attrs[] }) =>
  Object.fromEntries((a.option ?? []).map((o) => [o.name, o.value]));

const init = root.initialize[0];
const owners: Attrs[] = init.ownerInitialize[0].territoryOwner;
const placements: Attrs[] = init.unitInitialize[0].unitPlacement;
const resources: Attrs[] = init.resourceInitialize[0].resourceGiven;

const ownerOf = new Map(owners.map((o) => [o.territory, o.owner]));

const spaces = territories.map((t) => {
  const att = attachments.find((a) => a.name === 'territoryAttachment' && a.attachTo === t.name);
  const o = att ? options(att) : {};
  const water = t.water === 'true';
  return {
    id: t.name!,
    water,
    ipc: Number(o.production ?? 0),
    originalOwner: ownerOf.get(t.name) ?? null,
    capital: o.capital ?? null,
    victoryCity: o.victoryCity === '1' || o.victoryCity === 'true',
    neighbors: [] as string[],
  };
});
const byId = new Map(spaces.map((s) => [s.id, s]));
for (const c of connections) {
  const a = byId.get(c.t1!);
  const b = byId.get(c.t2!);
  if (!a || !b) throw new Error(`bad connection ${c.t1} - ${c.t2}`);
  if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
  if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
}
for (const s of spaces) s.neighbors.sort();

const canalGroups = new Map<string, { name: string; seaZones: string[]; landTerritories: string[] }>();
for (const a of attachments.filter((x) => x.javaClass?.endsWith('CanalAttachment'))) {
  const o = options(a);
  const g = canalGroups.get(o.canalName!) ?? { name: o.canalName!, seaZones: [] as string[], landTerritories: o.landTerritories!.split(':') };
  g.seaZones.push(a.attachTo!);
  canalGroups.set(o.canalName!, g);
}

const units = placements.map((p) => ({
  type: p.unitType,
  at: p.territory,
  owner: p.owner,
  count: Number(p.quantity),
}));
for (const u of units) {
  if (!byId.has(u.at!)) throw new Error(`unknown territory in setup: ${u.at}`);
  if (!POWERS.includes(u.owner as (typeof POWERS)[number])) throw new Error(`unknown owner ${u.owner}`);
}

const treasury = Object.fromEntries(resources.map((r) => [r.player, Number(r.quantity)]));

writeFileSync(
  'src/data/map.json',
  JSON.stringify({ spaces, canals: [...canalGroups.values()] }, null, 1) + '\n',
);
writeFileSync('src/data/setup.json', JSON.stringify({ treasury, units }, null, 1) + '\n');

type Pt = [number, number];
function simplify(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0]!;
  const [bx, by] = points[points.length - 1]!;
  let maxD = -1;
  let idx = 0;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]!;
    const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [points[0]!, points[points.length - 1]!];
  return [...simplify(points.slice(0, idx + 1), eps).slice(0, -1), ...simplify(points.slice(idx), eps)];
}

const parsePoints = (s: string): Pt[] => [...s.matchAll(/\((-?\d+),(-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const geometry: Record<string, { center: Pt; polygons: string[] }> = {};
for (const line of readFileSync('vendor/triplea/centers.txt', 'utf8').split('\n')) {
  const m = line.match(/^(.*?)\s+\((-?\d+),(-?\d+)\)/);
  if (m) geometry[m[1]!] = { center: [Number(m[2]), Number(m[3])], polygons: [] };
}
for (const line of readFileSync('vendor/triplea/polygons.txt', 'utf8').split('\n')) {
  const m = line.match(/^(.*?)\s+</);
  if (!m) continue;
  const name = m[1]!;
  const g = geometry[name];
  if (!g) throw new Error(`polygon without center: ${name}`);
  for (const poly of line.slice(m[0].length - 1).split('>')) {
    const pts = parsePoints(poly);
    if (pts.length < 3) continue;
    const half = Math.floor(pts.length / 2);
    const simple = [...simplify(pts.slice(0, half + 1), 1.2).slice(0, -1), ...simplify([...pts.slice(half), pts[0]!], 1.2).slice(0, -1)];
    g.polygons.push('M' + simple.map(([x, y]) => `${x},${y}`).join('L') + 'Z');
  }
}
for (const s of spaces) if (!geometry[s.id]) throw new Error(`no geometry for ${s.id}`);
writeFileSync('src/data/geometry.json', JSON.stringify({ width: 3500, height: 2000, spaces: geometry }) + '\n');

console.log(`spaces=${spaces.length} connections=${connections.length} placements=${units.length} canals=${canalGroups.size}`);
