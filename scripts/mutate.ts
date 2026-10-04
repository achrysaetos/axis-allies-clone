import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

interface Mutation {
  name: string;
  file: string;
  from: string;
  to: string;
}

const M: Mutation[] = [
  {
    name: 'artillery supports nobody',
    file: 'src/engine/combat.ts',
    from: "side === 'attacker'\n      ? Math.min(",
    to: "side === 'nobody'\n      ? Math.min(",
  },
  { name: 'AA fires once per gun', file: 'src/engine/combat.ts', from: 'Math.min(aa * 3, air)', to: 'Math.min(aa, air)' },
  {
    name: 'subs can hit aircraft',
    file: 'src/engine/combat.ts',
    from: "u.type === 'submarine' ? 'notAir'",
    to: "u.type === 'submarine' ? 'any'",
  },
  {
    name: 'destroyer does not cancel surprise strike',
    file: 'src/engine/combat.ts',
    from: "if (other.some((u) => u.type === 'destroyer')) return [];",
    to: '',
  },
  {
    name: 'no defenseless transports',
    file: 'src/engine/combat.ts',
    from: 'if (transports.length > 0 && canHit(att, transports',
    to: 'if (false && canHit(att, transports',
  },
  {
    name: 'battleships stay damaged',
    file: 'src/engine/combat.ts',
    from: "    if (u.type === 'battleship') u.damage = 0;\n  }\n  b.winner",
    to: '  }\n  b.winner',
  },
  {
    name: 'unlimited bombardment',
    file: 'src/engine/combat.ts',
    from: 'max: Math.min(ships.length, b.seaborne.length)',
    to: 'max: ships.length',
  },
  {
    name: 'seaborne may retreat',
    file: 'src/engine/combat.ts',
    from: 'const leaving = att.filter((u) => !b.seaborne.includes(u.id));',
    to: 'const leaving = att;',
  },
  { name: 'raid damage uncapped', file: 'src/engine/combat.ts', from: 'Math.min(total, cap - factory.damage)', to: 'total' },
  { name: 'no capital plunder', file: 'src/engine/capture.ts', from: 'draft.treasury[by] += plunder;', to: '' },
  {
    name: 'no liberation',
    file: 'src/engine/capture.ts',
    from: 'if (original && original !== by && areAllied(original, by)) {',
    to: 'if (false) {',
  },
  {
    name: 'blitz through occupied territory',
    file: 'src/engine/movement.ts',
    from: "u.type === 'armour') && enemyUnitsAt(state, s, power).length === 0",
    to: "u.type === 'armour')",
  },
  { name: 'subs blocked by any warship', file: 'src/engine/movement.ts', from: 'if (allSubs) {', to: 'if (false) {' },
  {
    name: 'canals always open',
    file: 'src/engine/queries.ts',
    from: 'return canal.landTerritories.every(',
    to: 'return true || canal.landTerritories.every(',
  },
  {
    name: 'transports carry 3 infantry',
    file: 'src/engine/data.ts',
    from: 'TRANSPORT_CAPACITY = 5',
    to: 'TRANSPORT_CAPACITY = 6',
  },
  {
    name: 'combat loads need not assault',
    file: 'src/engine/movement.ts',
    from: "if (u.loadedIn === 'combatMove' && u.offloadedTo === null)",
    to: 'if (false)',
  },
  {
    name: 'air may land in captured territory',
    file: 'src/engine/queries.ts',
    from: 'return start !== undefined && areAllied(start, power) && isFriendlyLand(state, id, power);',
    to: 'return isFriendlyLand(state, id, power);',
  },
  { name: 'no purchase capacity limit', file: 'src/engine/game.ts', from: 'if (units > capacity)', to: 'if (false)' },
  {
    name: 'Allies need 9',
    file: 'src/engine/data.ts',
    from: 'standard: { Axis: 9, Allies: 10 }',
    to: 'standard: { Axis: 9, Allies: 9 }',
  },
  {
    name: 'transports chosen freely',
    file: 'src/engine/casualties.ts',
    from: 'if (nonTransport !== need.nonTransport)',
    to: 'if (false)',
  },
  {
    name: 'fighters stay behind moving carriers',
    file: 'src/engine/movement.ts',
    from: '      boardWaitingFighters(draft, plan.units);\n',
    to: '',
  },
  {
    name: 'income without capital',
    file: 'src/engine/game.ts',
    from: 'if (capitalHeld(s, power)) {\n    const gained',
    to: 'if (true) {\n    const gained',
  },
];

let survived = 0;
for (const m of M) {
  const original = readFileSync(m.file, 'utf8');
  if (!original.includes(m.from)) {
    console.log(`STALE   ${m.name}: pattern not found in ${m.file}`);
    survived++;
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let killed = false;
  try {
    execSync('npx vitest run --reporter=dot', { stdio: 'pipe' });
  } catch {
    killed = true;
  } finally {
    writeFileSync(m.file, original);
  }
  if (!killed) survived++;
  console.log(`${killed ? 'killed ' : 'SURVIVED'} ${m.name}`);
}
console.log(`${M.length - survived}/${M.length} mutations detected`);
process.exit(survived > 0 ? 1 : 0);
