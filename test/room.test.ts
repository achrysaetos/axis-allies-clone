import { describe, expect, it } from 'vitest';
import { PUSHES_PER_PLAYER, computerTurn, handle, newRoom, parseClientMsg, view, whoToNotify } from '../worker/room';
import type { RoomRecord } from '../worker/room';
import { COMPUTER } from '../src/net/protocol';
import type { ClientMsg, PlayerId, PushSubscriptionKeys } from '../src/net/protocol';
import type { Action } from '../src/engine/types';
import { ids, move, ok, scenario } from './helpers';

const nobody = new Set<PlayerId>();

function send(r: RoomRecord, me: PlayerId | null, msg: ClientMsg, online: ReadonlySet<PlayerId> = nobody) {
  return handle(r, me, msg, online);
}

function accepted(r: RoomRecord, me: PlayerId | null, msg: ClientMsg, online?: ReadonlySet<PlayerId>): RoomRecord {
  const out = send(r, me, msg, online);
  if (out.error) throw new Error(`expected ${msg.t} to be accepted: ${out.error}`);
  return out.record;
}

function join(r: RoomRecord, name: string): [RoomRecord, PlayerId, string] {
  const out = send(r, null, { t: 'join', name });
  if (out.reply?.t !== 'welcome' || !out.reply.player || !out.reply.token) throw new Error('no welcome');
  return [out.record, out.reply.player, out.reply.token];
}

/** Alex holds Germany and Bea holds the Soviet Union. */
function twoPlayers(): { r: RoomRecord; alex: PlayerId; bea: PlayerId } {
  let r = newRoom('abcdefghij', 1942, {});
  let alex: PlayerId, bea: PlayerId;
  [r, alex] = join(r, 'Alex');
  [r, bea] = join(r, 'Bea');
  r = accepted(r, alex, { t: 'seat', power: 'Germans', to: 'me' });
  r = accepted(r, bea, { t: 'seat', power: 'Russians', to: 'me' });
  return { r, alex, bea };
}

describe('players and seats', () => {
  it('a returning token is recognised and an unknown one is not', () => {
    let r = newRoom('abcdefghij', 1, {});
    let alex: PlayerId, token: string;
    [r, alex, token] = join(r, '  Alex  ');
    expect(r.players[0]!.name).toBe('Alex');
    expect(send(r, null, { t: 'hello', token }).reply).toEqual({ t: 'welcome', player: alex, token });
    expect(send(r, null, { t: 'hello', token: 'stolen' }).reply).toEqual({ t: 'welcome', player: null, token: null });
  });

  it('a seat held by an online player cannot be taken, but one held by an offline player can', () => {
    const { r, alex, bea } = twoPlayers();
    expect(send(r, bea, { t: 'seat', power: 'Germans', to: 'me' }, new Set([alex])).error).toMatch(/another player/);
    const taken = accepted(r, bea, { t: 'seat', power: 'Germans', to: 'me' }, new Set([bea]));
    expect(taken.seats.Germans).toBe(bea);
  });

  it('only the holder releases a seat, and someone who has not joined holds nothing', () => {
    const { r, alex, bea } = twoPlayers();
    expect(send(r, bea, { t: 'seat', power: 'Germans', to: 'open' }).error).toBeDefined();
    expect(accepted(r, alex, { t: 'seat', power: 'Germans', to: 'open' }).seats.Germans).toBeNull();
    expect(send(r, null, { t: 'seat', power: 'British', to: 'me' }).error).toBeDefined();
  });

  it('seat changes keep the game version, so an action already in flight still lands', () => {
    const { r, alex } = twoPlayers();
    const after = accepted(r, alex, { t: 'seat', power: 'British', to: 'me' });
    expect(after.version).toBe(r.version);
  });
});

describe('actions', () => {
  it('refuses an action from a player who does not hold the acting seat', () => {
    const { r, alex } = twoPlayers();
    const out = send(r, alex, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] });
    expect(out.error).toMatch(/not your move/);
    expect(out.record).toBe(r);
  });

  it('refuses a stale version', () => {
    const { r, bea } = twoPlayers();
    const r1 = accepted(r, bea, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] });
    expect(r1.version).toBe(r.version + 1);
    const out = send(r1, bea, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] });
    expect(out.error).toMatch(/moved on/);
    expect(out.record).toBe(r1);
  });

  it('a drop of several moves is one step: one undo takes all of it back', () => {
    const { r: base, bea } = twoPlayers();
    const s = scenario({ power: 'Russians', phase: 'noncombatMove', units: [['Russians', 'infantry', 'Karelia S.S.R.', 2]] });
    let r: RoomRecord = { ...base, session: { state: s, fallen: [] } };
    const [i1, i2] = ids(s, 'Russians', 'infantry', 'Karelia S.S.R.');
    const drop: Action[] = [
      { type: 'move', units: [i1!], path: ['Karelia S.S.R.', 'Archangel'] },
      { type: 'move', units: [i2!], path: ['Karelia S.S.R.', 'Archangel'] },
    ];
    r = accepted(r, bea, { t: 'act', version: r.version, actions: drop });
    expect(r.session.state.units.filter((u) => u.at === 'Archangel' && u.type === 'infantry').length).toBeGreaterThanOrEqual(2);
    r = accepted(r, bea, { t: 'undo', version: r.version });
    expect(r.session.state).toEqual(s);
    expect(view(r, nobody).canUndo).toBe(false);
  });

  it('a drop with an illegal move changes nothing', () => {
    const { r: base, bea } = twoPlayers();
    const s = scenario({ power: 'Russians', phase: 'noncombatMove', units: [['Russians', 'infantry', 'Karelia S.S.R.', 1]] });
    const r: RoomRecord = { ...base, session: { state: s, fallen: [] } };
    const [i1] = ids(s, 'Russians', 'infantry', 'Karelia S.S.R.');
    const out = send(r, bea, {
      t: 'act',
      version: r.version,
      actions: [
        { type: 'move', units: [i1!], path: ['Karelia S.S.R.', 'Archangel'] },
        { type: 'move', units: [i1!], path: ['Archangel', 'Russia'] },
      ],
    });
    expect(out.error).toBeTruthy();
    expect(out.record).toBe(r);
  });

  it('undo replays the phase to the state before the last move, and a non-move ends the undo history', () => {
    const { r: base, bea } = twoPlayers();
    const s = scenario({ power: 'Russians', phase: 'noncombatMove', units: [['Russians', 'infantry', 'Karelia S.S.R.', 2]] });
    let r: RoomRecord = { ...base, session: { state: s, fallen: [] } };
    const [i1, i2] = ids(s, 'Russians', 'infantry', 'Karelia S.S.R.');
    const first: Action = { type: 'move', units: [i1!], path: ['Karelia S.S.R.', 'Archangel'] };
    r = accepted(r, bea, { t: 'act', version: r.version, actions: [first] });
    const afterFirst = r.session.state;
    const second: Action = { type: 'move', units: [i2!], path: ['Karelia S.S.R.', 'Archangel'] };
    r = accepted(r, bea, { t: 'act', version: r.version, actions: [second] });
    expect(view(r, nobody).canUndo).toBe(true);

    r = accepted(r, bea, { t: 'undo', version: r.version });
    expect(r.session.state).toEqual(afterFirst);
    r = accepted(r, bea, { t: 'undo', version: r.version });
    expect(r.session.state).toEqual(s);
    expect(r.phaseStart).toBeNull();
    expect(send(r, bea, { t: 'undo', version: r.version }).error).toMatch(/nothing to undo/);

    r = accepted(r, bea, { t: 'act', version: r.version, actions: [first] });
    r = accepted(r, bea, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] });
    expect(view(r, nobody).canUndo).toBe(false);
  });

  it('quick play stops at a decision that belongs to another player', () => {
    const { r: base, alex, bea } = twoPlayers();
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia', 3],
        ['Russians', 'infantry', 'Archangel', 2],
        ['Russians', 'artillery', 'Archangel', 2],
      ],
      dice: [1, 1, 1],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Archangel']);
    s = ok(s, { type: 'endPhase' });
    const r: RoomRecord = { ...base, session: { state: s, fallen: [] } };

    const out = accepted(r, alex, { t: 'resolve', version: r.version, battle: s.battles[0]!.id });
    expect(out.session.state.pending).toMatchObject({ kind: 'casualties', power: 'Russians', side: 'defender' });
    expect(send(out, alex, { t: 'act', version: out.version, actions: [{ type: 'casualties', units: [] }] }).error).toMatch(
      /not your move/,
    );
    const answered = accepted(out, bea, { t: 'resolve', version: out.version, battle: s.battles[0]!.id });
    expect(answered.session.state.pending?.power ?? 'Germans').toBe('Germans');
  });
});

describe('the room view', () => {
  it('hides the dice generator and scripted dice but keeps them on the server', () => {
    const r = newRoom('abcdefghij', 1942, {});
    r.session.state.scriptedDice = [6, 6];
    const v = view(r, nobody);
    expect(v.state.rng).toBe(0);
    expect(v.state.scriptedDice).toEqual([]);
    expect(r.session.state.rng).not.toBe(0);
    expect(r.session.state.scriptedDice).toEqual([6, 6]);
  });

  it('reports who is online without exposing tokens', () => {
    const { r, alex } = twoPlayers();
    const v = view(r, new Set([alex]));
    expect(v.players.map((p) => [p.name, p.online])).toEqual([
      ['Alex', true],
      ['Bea', false],
    ]);
    expect(JSON.stringify(v)).not.toContain(r.players[0]!.token);
  });
});

describe('messages from the wire', () => {
  it('rejects malformed envelopes', () => {
    expect(parseClientMsg('nope')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'seat', power: 'Italians', to: 'me' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'act', version: '1', actions: [{ type: 'endPhase' }] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'undo', version: 3 }))).toEqual({ t: 'undo', version: 3 });
  });
});

/** Bea ends the Soviet turn, so Germany is up. */
function endSovietTurn(r: RoomRecord, bea: PlayerId): RoomRecord {
  while (r.session.state.power === 'Russians')
    r = accepted(r, bea, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] });
  return r;
}

describe('who hears about a change by push', () => {
  it('the player whose turn starts hears who handed it over', () => {
    const { r, alex, bea } = twoPlayers();
    const after = endSovietTurn(r, bea);
    expect(whoToNotify(r, after, new Set([bea]))).toEqual([
      { player: alex, title: 'Your move: Germany', body: 'Round 1 · Bea finished the Soviet turn' },
    ]);
  });

  it('a player with the game open hears nothing, since the tab alerts them', () => {
    const { r, alex, bea } = twoPlayers();
    expect(whoToNotify(r, endSovietTurn(r, bea), new Set([alex, bea]))).toEqual([]);
  });

  it('nobody hears about their own move, even when their next power is up', () => {
    const { r: base, bea } = twoPlayers();
    const r = accepted(base, bea, { t: 'seat', power: 'Germans', to: 'me' }, new Set([bea]));
    expect(whoToNotify(r, endSovietTurn(r, bea), nobody)).toEqual([]);
  });

  it('a defender hears that a battle needs their decision', () => {
    const { r: base, alex, bea } = twoPlayers();
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia', 3],
        ['Russians', 'infantry', 'Archangel', 2],
        ['Russians', 'artillery', 'Archangel', 2],
      ],
      dice: [1, 1, 1],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Archangel']);
    s = ok(s, { type: 'endPhase' });
    const r: RoomRecord = { ...base, session: { state: s, fallen: [] } };
    const after = accepted(r, alex, { t: 'resolve', version: r.version, battle: s.battles[0]!.id });
    expect(whoToNotify(r, after, new Set([alex]))).toEqual([
      { player: bea, title: 'Your move: Soviet Union', body: 'Soviet Union must choose casualties in Archangel' },
    ]);
  });

  it('everyone away hears once that the game is won', () => {
    const { r, alex, bea } = twoPlayers();
    const won: RoomRecord = { ...r, session: { ...r.session, state: { ...r.session.state, winner: 'Allies' } } };
    expect(whoToNotify(r, won, new Set([bea]))).toEqual([
      { player: alex, title: 'The Allies win', body: 'Round 1 · Bea finished the game' },
    ]);
    expect(whoToNotify(won, { ...won, version: won.version + 1 }, nobody)).toEqual([]);
  });
});

const sub = (n: number): PushSubscriptionKeys => ({
  endpoint: `https://push.example/send/${n}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
});

describe('push subscriptions', () => {
  it('stores one entry per endpoint, moving a shared browser to whoever subscribed last', () => {
    const { r, alex, bea } = twoPlayers();
    const once = accepted(r, alex, { t: 'subscribe', subscription: sub(1) });
    expect(once.pushes).toEqual([{ player: alex, ...sub(1) }]);
    expect(once.version).toBe(r.version);
    expect(accepted(once, alex, { t: 'subscribe', subscription: sub(1) })).toBe(once);
    expect(accepted(once, bea, { t: 'subscribe', subscription: sub(1) }).pushes).toEqual([{ player: bea, ...sub(1) }]);
  });

  it('needs a joined player and keeps only the newest few browsers per player', () => {
    let { r, alex, bea } = twoPlayers();
    expect(send(r, null, { t: 'subscribe', subscription: sub(1) }).error).toMatch(/name/);
    r = accepted(r, bea, { t: 'subscribe', subscription: sub(0) });
    for (let n = 1; n <= PUSHES_PER_PLAYER + 2; n++) r = accepted(r, alex, { t: 'subscribe', subscription: sub(n) });
    expect(r.pushes.filter((x) => x.player === alex).map((x) => x.endpoint)).toEqual(
      Array.from({ length: PUSHES_PER_PLAYER }, (_, i) => sub(i + 3).endpoint),
    );
    expect(r.pushes.filter((x) => x.player === bea)).toHaveLength(1);
  });

  it('accepts only an https endpoint with base64url keys of the right length', () => {
    const parse = (subscription: unknown) => parseClientMsg(JSON.stringify({ t: 'subscribe', subscription }));
    expect(parse(sub(1))).toEqual({ t: 'subscribe', subscription: sub(1) });
    expect(parse({ ...sub(1), endpoint: 'http://push.example/x' })).toBeNull();
    expect(parse({ ...sub(1), endpoint: 'not a url' })).toBeNull();
    expect(parse({ ...sub(1), keys: { p256dh: 'B'.repeat(86) + '=', auth: 'a'.repeat(22) } })).toBeNull();
    expect(parse({ ...sub(1), keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(23) } })).toBeNull();
    expect(parse({ endpoint: sub(1).endpoint })).toBeNull();
  });
});

describe('computer seats', () => {
  it('any player can hand an open seat to the computer, take it back, or open it again', () => {
    const { r, alex, bea } = twoPlayers();
    const r1 = accepted(r, alex, { t: 'seat', power: 'British', to: 'computer' });
    expect(r1.seats.British).toBe(COMPUTER);
    expect(accepted(r1, bea, { t: 'seat', power: 'British', to: 'me' }).seats.British).toBe(bea);
    expect(accepted(r1, bea, { t: 'seat', power: 'British', to: 'open' }).seats.British).toBeNull();
    expect(send(r, bea, { t: 'seat', power: 'Germans', to: 'computer' }, new Set([alex])).error).toMatch(/another player/);
  });

  it('the computer plays its power through to the next human, who is then notified', () => {
    const players = twoPlayers();
    let r: RoomRecord = { ...players.r, seats: { ...players.r.seats, Russians: COMPUTER } };
    expect(computerTurn(r, 50)).not.toBeNull();
    let before = r;
    for (let i = 0; i < 500; i++) {
      const out = computerTurn(r, 50);
      if (!out) break;
      expect(out.error).toBeUndefined();
      before = r;
      r = out.record;
    }
    expect(r.session.state.power).toBe('Germans');
    expect(computerTurn(r, 50)).toBeNull();
    expect(r.moves).toEqual([]);
    expect(whoToNotify(before, r, nobody)).toEqual([
      { player: players.alex, title: 'Your move: Germany', body: 'Round 1 · The computer finished the Soviet turn' },
    ]);
  });

  it('a human is never asked to act for the computer, and the computer never acts for a human', () => {
    const { r, bea } = twoPlayers();
    const r1 = { ...r, seats: { ...r.seats, Russians: COMPUTER } };
    expect(send(r1, bea, { t: 'act', version: r1.version, actions: [{ type: 'endPhase' }] }).error).toMatch(/not your move/);
    expect(computerTurn(r, 50)).toBeNull();
  });
});
