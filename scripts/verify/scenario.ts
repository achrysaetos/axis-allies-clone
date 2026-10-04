import { mkdirSync, writeFileSync } from 'node:fs';
import { startTurn } from '../../src/engine/game';
import { freshUnit, newGame } from '../../src/engine/state';
import { POWERS } from '../../src/engine/types';
import type { GameState, Options, Phase, Power, SpaceId, UnitType } from '../../src/engine/types';

type Placement = [Power, UnitType, SpaceId, number?];

interface Scenario {
  summary: string;
  build: () => GameState;
}

function board(
  power: Power,
  phase: Phase,
  units: Placement[],
  extra: { owners?: Record<SpaceId, Power>; options?: Partial<Options>; cargo?: [SpaceId, Power, UnitType[]] } = {},
): GameState {
  const s = newGame(1942, extra.options ?? {});
  s.units = [];
  Object.assign(s.owner, extra.owners ?? {});
  s.power = power;
  s.phase = phase;
  for (const [owner, type, at, count = 1] of units)
    for (let i = 0; i < count; i++) s.units.push(freshUnit(s.nextUnitId++, type, owner, at));
  if (extra.cargo) {
    const [zone, owner, types] = extra.cargo;
    const t = s.units.find((u) => u.at === zone && u.owner === owner && u.type === 'transport')!;
    for (const type of types) {
      const u = freshUnit(s.nextUnitId++, type, owner, zone);
      u.carriedBy = t.id;
      s.units.push(u);
    }
  }
  startTurn(s);
  return s;
}

const SCENARIOS: Record<string, Scenario> = {
  opening: { summary: 'The printed 1942 setup, Russians to purchase.', build: () => newGame(1942) },
  amphibious: {
    summary: 'British combat move: loaded transport, battleship and cruiser in 8 Sea Zone; one German infantry in France.',
    build: () =>
      board(
        'British',
        'combatMove',
        [
          ['British', 'transport', '8 Sea Zone'],
          ['British', 'battleship', '8 Sea Zone'],
          ['British', 'cruiser', '8 Sea Zone'],
          ['Germans', 'infantry', 'France'],
        ],
        {
          cargo: ['8 Sea Zone', 'British', ['infantry', 'armour']],
        },
      ),
  },
  'sub-strike': {
    summary: 'German combat move: two submarines in 12 Sea Zone next to a British cruiser and transport in 13 Sea Zone.',
    build: () =>
      board('Germans', 'combatMove', [
        ['Germans', 'submarine', '12 Sea Zone', 2],
        ['British', 'cruiser', '13 Sea Zone'],
        ['British', 'transport', '13 Sea Zone'],
      ]),
  },
  'raid-intercept': {
    summary:
      'British combat move with the escorts/interceptors rule on: 2 bombers and a fighter in the UK, German complex and 2 fighters in Germany.',
    build: () =>
      board(
        'British',
        'combatMove',
        [
          ['British', 'bomber', 'United Kingdom', 2],
          ['British', 'fighter', 'United Kingdom'],
          ['Germans', 'factory', 'Germany'],
          ['Germans', 'fighter', 'Germany', 2],
        ],
        {
          owners: { 'Northwestern Europe': 'British' },
          options: { sbrEscortsInterceptors: true },
        },
      ),
  },
  'carrier-loss': {
    summary: 'German combat move: 3 battleships in 5 Sea Zone against a British carrier with 2 fighters in 6 Sea Zone.',
    build: () =>
      board('Germans', 'combatMove', [
        ['Germans', 'battleship', '5 Sea Zone', 3],
        ['British', 'carrier', '6 Sea Zone'],
        ['British', 'fighter', '6 Sea Zone', 2],
      ]),
  },
  mobilize: {
    summary: 'German mobilize phase holding 4 infantry and 1 destroyer, with complexes in Germany and Italy.',
    build: () => {
      const s = board('Germans', 'mobilize', [
        ['Germans', 'factory', 'Germany'],
        ['Germans', 'factory', 'Italy'],
      ]);
      s.purchases = [
        { type: 'infantry', count: 4 },
        { type: 'destroyer', count: 1 },
      ];
      return s;
    },
  },
  victory: {
    summary: 'US mobilize phase with the Axis holding 9 victory cities; ending the turn wins for the Axis.',
    build: () =>
      board('Americans', 'mobilize', [], { owners: { Russia: 'Germans', 'Karelia S.S.R.': 'Germans', India: 'Japanese' } }),
  },
};

const [name, ...flags] = process.argv.slice(2);
if (!name || !SCENARIOS[name]) {
  console.error(`usage: npx tsx scripts/verify/scenario.ts <name> [--ai Power,Power]\n`);
  for (const [n, sc] of Object.entries(SCENARIOS)) console.error(`  ${n.padEnd(15)} ${sc.summary}`);
  process.exit(2);
}
const aiIdx = flags.indexOf('--ai');
const ai = aiIdx >= 0 ? (flags[aiIdx + 1] ?? '').split(',') : [];
const controllers = Object.fromEntries(POWERS.map((p) => [p, ai.includes(p) ? 'ai' : 'human']));
const saved = { version: 1, state: SCENARIOS[name].build(), controllers };
mkdirSync('.verify/scenarios', { recursive: true });
const out = `.verify/scenarios/${name}.json`;
writeFileSync(out, JSON.stringify(saved));
console.log(`${out}  (${SCENARIOS[name].summary})`);
