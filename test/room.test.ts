import { describe, expect, it } from 'vitest';
import { handle, newRoom, parseClientMsg, view } from '../worker/room';
import type { RoomRecord } from '../worker/room';
import type { ClientMsg, PlayerId } from '../src/net/protocol';
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
  r = accepted(r, alex, { t: 'seat', power: 'Germans', take: true });
  r = accepted(r, bea, { t: 'seat', power: 'Russians', take: true });
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
    expect(send(r, bea, { t: 'seat', power: 'Germans', take: true }, new Set([alex])).error).toMatch(/another player/);
    const taken = accepted(r, bea, { t: 'seat', power: 'Germans', take: true }, new Set([bea]));
    expect(taken.seats.Germans).toBe(bea);
  });

  it('only the holder releases a seat, and someone who has not joined holds nothing', () => {
    const { r, alex, bea } = twoPlayers();
    expect(send(r, bea, { t: 'seat', power: 'Germans', take: false }).error).toBeDefined();
    expect(accepted(r, alex, { t: 'seat', power: 'Germans', take: false }).seats.Germans).toBeNull();
    expect(send(r, null, { t: 'seat', power: 'British', take: true }).error).toBeDefined();
  });

  it('seat changes keep the game version, so an action already in flight still lands', () => {
    const { r, alex } = twoPlayers();
    const after = accepted(r, alex, { t: 'seat', power: 'British', take: true });
    expect(after.version).toBe(r.version);
  });
});

describe('actions', () => {
  it('refuses an action from a player who does not hold the acting seat', () => {
    const { r, alex } = twoPlayers();
    const out = send(r, alex, { t: 'act', version: r.version, action: { type: 'endPhase' } });
    expect(out.error).toMatch(/not your move/);
    expect(out.record).toBe(r);
  });

  it('refuses a stale version', () => {
    const { r, bea } = twoPlayers();
    const r1 = accepted(r, bea, { t: 'act', version: r.version, action: { type: 'endPhase' } });
    expect(r1.version).toBe(r.version + 1);
    const out = send(r1, bea, { t: 'act', version: r.version, action: { type: 'endPhase' } });
    expect(out.error).toMatch(/moved on/);
    expect(out.record).toBe(r1);
  });

  it('undo replays the phase to the state before the last move, and a non-move ends the undo history', () => {
    const { r: base, bea } = twoPlayers();
    const s = scenario({ power: 'Russians', phase: 'noncombatMove', units: [['Russians', 'infantry', 'Karelia S.S.R.', 2]] });
    let r: RoomRecord = { ...base, session: { state: s, fallen: [] } };
    const [i1, i2] = ids(s, 'Russians', 'infantry', 'Karelia S.S.R.');
    const first: Action = { type: 'move', units: [i1!], path: ['Karelia S.S.R.', 'Archangel'] };
    r = accepted(r, bea, { t: 'act', version: r.version, action: first });
    const afterFirst = r.session.state;
    const second: Action = { type: 'move', units: [i2!], path: ['Karelia S.S.R.', 'Archangel'] };
    r = accepted(r, bea, { t: 'act', version: r.version, action: second });
    expect(view(r, nobody).canUndo).toBe(true);

    r = accepted(r, bea, { t: 'undo', version: r.version });
    expect(r.session.state).toEqual(afterFirst);
    r = accepted(r, bea, { t: 'undo', version: r.version });
    expect(r.session.state).toEqual(s);
    expect(r.phaseStart).toBeNull();
    expect(send(r, bea, { t: 'undo', version: r.version }).error).toMatch(/nothing to undo/);

    r = accepted(r, bea, { t: 'act', version: r.version, action: first });
    r = accepted(r, bea, { t: 'act', version: r.version, action: { type: 'endPhase' } });
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
    expect(send(out, alex, { t: 'act', version: out.version, action: { type: 'casualties', units: [] } }).error).toMatch(
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
    expect(parseClientMsg(JSON.stringify({ t: 'seat', power: 'Italians', take: true }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'act', version: '1', action: { type: 'endPhase' } }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'undo', version: 3 }))).toEqual({ t: 'undo', version: 3 });
  });
});
