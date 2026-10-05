import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANALS, SETUP, SPACE_IDS, STATS, TURKISH_STRAITS_ZONE, VICTORY_THRESHOLD, isNeutral, space } from '../src/engine/data';
import { POWERS, type UnitType } from '../src/engine/types';

// Board and setup parity against TripleA's official map for this edition, vendor/triplea/WW2v5_1942_2nd.xml.
const xml = readFileSync(new URL('../vendor/triplea/WW2v5_1942_2nd.xml', import.meta.url), 'utf8').replace(
  /<!--[\s\S]*?-->/g,
  '',
);

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const tags = (name: string) => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => attrs(m[0]));

const territories = new Map(tags('territory').map((t) => [t.name!, t.water === 'true']));
const edges = tags('connection').map((c) => [c.t1!, c.t2!] as const);

interface Attachment {
  attachTo: string;
  kind: string;
  options: Record<string, string>;
}
const attachments: Attachment[] = [...xml.matchAll(/<attachment\b([^>]*)>([\s\S]*?)<\/attachment>/g)].map((m) => {
  const a = attrs(m[1]!);
  return {
    attachTo: a.attachTo!,
    kind: a.javaClass!.split('.').pop()!,
    options: Object.fromEntries([...m[2]!.matchAll(/<option\b[^>]*>/g)].map((o) => [attrs(o[0]).name!, attrs(o[0]).value!])),
  };
});
const territoryAttachment = (id: string) =>
  attachments.find((a) => a.kind === 'TerritoryAttachment' && a.attachTo === id)?.options ?? {};
const xmlOwner = new Map(tags('territoryOwner').map((t) => [t.territory!, t.owner!]));
const property = (name: string) => tags('property').find((p) => p.name === name)?.value;

const key = (owner: string, type: string, at: string) => `${owner} ${type} @ ${at}`;
function tally(rows: { owner: string; type: string; at: string; count: number }[]) {
  const m: Record<string, number> = {};
  for (const r of rows) m[key(r.owner, r.type, r.at)] = (m[key(r.owner, r.type, r.at)] ?? 0) + r.count;
  return m;
}

describe('board parity with TripleA WW2v5_1942_2nd.xml <map>', () => {
  it('has exactly the same 161 spaces with the same land/water split', () => {
    expect(territories.size).toBe(161);
    expect([...SPACE_IDS].sort()).toEqual([...territories.keys()].sort());
    const mismatched = SPACE_IDS.filter((id) => space(id).water !== territories.get(id));
    expect(mismatched).toEqual([]);
  });

  it('every adjacency matches <connection> exactly and is symmetric', () => {
    const expected = new Set(edges.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
    const actual = new Set(SPACE_IDS.flatMap((id) => space(id).neighbors.map((n) => `${id}|${n}`)));
    expect([...actual].filter((e) => !expected.has(e)).sort(), 'extra in map.json').toEqual([]);
    expect([...expected].filter((e) => !actual.has(e)).sort(), 'missing from map.json').toEqual([]);
  });

  it('IPC values match territoryAttachment production', () => {
    const diffs = SPACE_IDS.filter((id) => !space(id).water)
      .map((id) => ({ id, ours: space(id).ipc, triplea: Number(territoryAttachment(id).production ?? 0) }))
      .filter((d) => d.ours !== d.triplea);
    expect(diffs).toEqual([]);
  });

  it('original owners match <ownerInitialize>', () => {
    const diffs = SPACE_IDS.map((id) => ({ id, ours: space(id).originalOwner, triplea: xmlOwner.get(id) ?? null })).filter(
      (d) => d.ours !== d.triplea,
    );
    expect(diffs).toEqual([]);
  });

  it('capitals and victory cities match territoryAttachment', () => {
    const diffs = SPACE_IDS.map((id) => {
      const t = territoryAttachment(id);
      return { id, capital: [space(id).capital, t.capital ?? null], vc: [space(id).victoryCity, t.victoryCity === '1'] };
    }).filter((d) => d.capital[0] !== d.capital[1] || d.vc[0] !== d.vc[1]);
    expect(diffs).toEqual([]);
  });

  it('impassable neutrals are exactly the ownerless land territories (rulebook p.21: neutrals cannot be entered)', () => {
    const impassable = SPACE_IDS.filter((id) => territoryAttachment(id).isImpassable === 'true').sort();
    expect(impassable).toHaveLength(16);
    expect(SPACE_IDS.filter((id) => isNeutral(id)).sort()).toEqual(impassable);
  });

  it('canals match CanalAttachment (Suez: Egypt + Trans-Jordan, Panama: Central America)', () => {
    const fromXml = new Map<string, { seaZones: Set<string>; land: string }>();
    for (const a of attachments.filter((x) => x.kind === 'CanalAttachment')) {
      const c = fromXml.get(a.options.canalName!) ?? { seaZones: new Set<string>(), land: a.options.landTerritories! };
      c.seaZones.add(a.attachTo);
      fromXml.set(a.options.canalName!, c);
    }
    expect(CANALS.map((c) => c.name).sort()).toEqual([...fromXml.keys()].sort());
    for (const c of CANALS) {
      const x = fromXml.get(c.name)!;
      expect([...c.seaZones].sort(), c.name).toEqual([...x.seaZones].sort());
      expect([...c.landTerritories].sort(), c.name).toEqual(x.land.split(':').sort());
    }
  });

  it('the optional Turkish Straits rule closes the Black Sea, SZ16', () => {
    expect(TURKISH_STRAITS_ZONE).toBe('16 Sea Zone');
    expect(space('16 Sea Zone').neighbors).toContain('Turkey');
  });
});

describe('starting setup parity with TripleA <initialize>', () => {
  it('every starting unit per power per space matches <unitPlacement>', () => {
    const expected = tally(
      tags('unitPlacement').map((u) => ({ owner: u.owner!, type: u.unitType!, at: u.territory!, count: Number(u.quantity) })),
    );
    const actual = tally(SETUP.units);
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    const diffs = keys
      .filter((k) => expected[k] !== actual[k])
      .map((k) => `${k}: ours ${actual[k] ?? 0}, TripleA ${expected[k] ?? 0}`);
    expect(diffs).toEqual([]);
  });

  it('every power starts with its rulebook income in the bank (resourceGiven)', () => {
    const given = Object.fromEntries(tags('resourceGiven').map((r) => [r.player!, Number(r.quantity)]));
    expect(SETUP.treasury).toEqual(given);
    for (const p of POWERS) {
      const income = SPACE_IDS.filter((id) => space(id).originalOwner === p).reduce((n, id) => n + space(id).ipc, 0);
      expect(income, p).toBe(given[p]);
    }
  });

  it('turn order is Soviet Union, Germany, United Kingdom, Japan, United States', () => {
    const order = tags('step')
      .filter((s) => s.delegate === 'purchase')
      .map((s) => s.player);
    expect([...POWERS]).toEqual(order);
  });

  it('victory cities and their first holders match FAQ errata to rulebook p.6 (Honolulu added, 6 Axis / 7 Allies)', () => {
    const vcs = SPACE_IDS.filter((id) => space(id).victoryCity);
    const holders = Object.fromEntries(vcs.map((id) => [id, space(id).originalOwner]));
    expect(holders).toEqual({
      'Eastern United States': 'Americans', // Washington
      'Western United States': 'Americans', // San Francisco
      'Hawaiian Islands': 'Americans', // Honolulu
      'United Kingdom': 'British', // London
      India: 'British', // Calcutta
      Russia: 'Russians', // Moscow
      'Karelia S.S.R.': 'Russians', // Leningrad
      Germany: 'Germans', // Berlin
      France: 'Germans', // Paris
      Italy: 'Germans', // Rome
      Japan: 'Japanese', // Tokyo
      Kiangsu: 'Japanese', // Shanghai
      'Philippine Islands': 'Japanese', // Manila
    });
  });

  it('victory thresholds: 9 Axis / 10 Allies standard, 13 / 13 total victory', () => {
    expect(VICTORY_THRESHOLD.standard).toEqual({
      Axis: Number(property('Axis Honorable Victory VCs')),
      Allies: Number(property('Allies Honorable Victory VCs')),
    });
    expect(VICTORY_THRESHOLD.total).toEqual({
      Axis: Number(property('Axis Total Victory VCs')),
      Allies: Number(property('Allies Total Victory VCs')),
    });
  });

  it('unit cost, attack, defense, move and transport cost match unitAttachment and productionRule', () => {
    const frontier = xml.match(/<productionFrontier name="production">([\s\S]*?)<\/productionFrontier>/)![1]!;
    const base = new Set([...frontier.matchAll(/<frontierRules name="([^"]*)"/g)].map((m) => m[1]));
    const cost = Object.fromEntries(
      [...xml.matchAll(/<productionRule name="([^"]*)">([\s\S]*?)<\/productionRule>/g)]
        .filter((m) => base.has(m[1]))
        .map((m) => [
          attrs(m[2]!.match(/<result\b[^>]*>/)![0]).resourceOrUnit!,
          Number(attrs(m[2]!.match(/<cost\b[^>]*>/)![0]).quantity),
        ]),
    );
    const diffs: string[] = [];
    for (const [type, s] of Object.entries(STATS) as [UnitType, (typeof STATS)[UnitType]][]) {
      const o = attachments.find((a) => a.kind === 'UnitAttachment' && a.attachTo === type)?.options ?? {};
      const want = {
        cost: cost[type],
        attack: Number(o.attack ?? 0),
        defense: Number(o.defense ?? 0),
        move: Number(o.movement ?? 0),
        hitPoints: Number(o.hitPoints ?? 1),
        transportCost: o.transportCost === undefined ? undefined : Number(o.transportCost),
      };
      for (const [k, v] of Object.entries(want))
        if (s[k as keyof typeof s] !== v) diffs.push(`${type}.${k}: ours ${s[k as keyof typeof s]}, TripleA ${v}`);
    }
    expect(diffs).toEqual([]);
  });
});
