# Autonomous run: AAA gameplay polish

Playbook (Autonomous run), verbatim:
1. State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero).
2. Pick the wake mechanism using Claude Code's `loop` skill (built-in). An event to watch (CI, a merge, a ref advancing) gets a watcher subagent that wakes you on the event, with a long time-based heartbeat as fallback. No event gets a fixed-interval heartbeat sized to when the result is worth re-checking. -- skip: the stop hook keeps the session driving; background agents notify on completion.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
4. Mid-run discoveries are yours.
5. Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved. (docs/decisions.tsv)
6. Stop when the predicate is met. A plateau is not a stop.

Predicate: a fresh player can finish a full turn for each power without reading the rules or hitting a confusing state; every friction item found in play-testing is fixed or consciously declined with a reason; tests, typecheck, build, fuzz and mutation stay green; each change is verified in the browser.

## Friction log (from play-testing)

## Scope change (user)
AI work paused. MVP = two human players hotseat (Allies vs Axis). AI hill-climb branch left as is in its worktree.

---
# Feature: online multiplayer (Cloudflare, live + async, friends with links)

Playbook (Feature), verbatim:
1. `how` over the affected subsystem. -- skip: read engine/state.ts, ui/session.ts, App.tsx, SetupScreen directly; the subsystem is one reducer plus one session wrapper, and the measured facts (state ~80 KB, session ~140 KB, rng in state, undo only for moves) settled the design.
2. `architect` for parallel design exploration. -- skip: the user chose the architecture in the brainstorm (authoritative room on Cloudflare); the remaining forks (undo by replay vs state stack, optimistic vs round-trip) were decided by measurement (state size) and determinism.
3. Write the throughput checkpoint as four todo items.
   - Blocking first steps: protocol types + pure room logic + tests gate the worker and the client.
   - Independent workstreams: worker shell and client could split after the protocol, but both depend on the room logic shape. n/a at parent level.
   - Shared mutable state: one worktree, one owner; master untouched until review.
   - Smallest safe decomposition: one owner, because protocol, worker and client change together and must agree on one message shape.
4. Delegate code-writing to a subagent ... own worktree. -- in progress (opus, worktree).
5. Verify on the matching surface. -- two browser tabs against wrangler dev + vite.
6. Rebase into small, ordered commits.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**. -- repo commits directly to master; deploy needs user go-ahead.

Data shape: protocol.ts (ClientMsg / ServerMsg / RoomView), stored room record { seats, players, session, phaseStart, moves, version }; pure handle(record, player, msg) reducer; DO is a thin shell.
