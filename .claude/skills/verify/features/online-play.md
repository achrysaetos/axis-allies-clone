# Online play

Friends play one game from separate browsers. One player creates a room from the setup screen and shares its link. Each player enters a name, takes one or more powers from the seat strip, and plays only those powers. Moves appear on every screen as they happen. A battle's defender chooses their own casualties on their own screen. The game lives on the server, so players can leave and come back days later.

## Sub-features

- Creating a room with `Play online with friends`, which opens `#/g/<room id>`.
- The `Join this game` name prompt on first visit. A reload keeps the player and their seats.
- The seat strip under the top bar. It shows each power's holder and an online dot, and `Copy invite link`. Clicking an open seat takes it, clicking your own seat offers to release it, and clicking an offline player's seat asks before taking it over.
- The hint line while someone else acts, `Soviet Union (Alex) is playing…`, or `Nobody holds Soviet Union yet…` for an empty seat.
- Live moves, purchases, phase changes and Undo arriving on the other screen.
- Cross-player battles. The attacker sees `Waiting for Germany (Bea)…` while the defender gets the casualty decision.
- A `▶ ` title prefix when it becomes your move in a background tab, and `Reconnecting…` while the socket is down.
- A room link that does not exist shows `There is no game at this link.`
- Push notifications to a player whose tab is closed, and the bell after `Copy invite link` that turns them on or off.

## How to get to it (user POV)

Setup screen, then `Play online with friends`. Send the invite link to a friend, who opens it in their own browser.

## Driving it with the browser pane

- Online play needs the Worker as well as vite. Start `npm run dev:worker` (port 8787) in the background, and serve vite on 127.0.0.1 so a second origin exists: `npx vite --port 5180 --strictPort --host 127.0.0.1`. Vite proxies `/api` to the Worker. Smoke the Worker with `curl -s -X POST http://127.0.0.1:8787/api/rooms -d '{}'`, which returns `{"id":...}`.
- Player A uses `http://127.0.0.1:5180/` and player B uses `http://localhost:5180/#/g/<id>` in a second tab (`tabs_create`). Different origins keep separate player tokens. Two tabs on the same origin share one token and act as the same player.
- In A, click `Play online with friends`, type a name in the prompt and press Return, then click a seat in the strip. Do the same in B with a different seat. The Soviet Union moves first.
- Prove a live move by dragging in A and reading B's `[data-space="<name>"] [data-stack]` handles or screenshot. Prove a cross-player battle by attacking B's power, pressing `Roll dice` in A, and finding `<Power> (Axis player): N hits to take` in B.
- Prove reload persistence with `location.reload()` through `javascript_tool`. The name prompt must not return, and the strip must still show the player's seats.

- Push needs VAPID keys in `.dev.vars` (README, "Push notifications"). The browser pane cannot register a service worker and its notification permission is denied, so the bell stays hidden there. Prove delivery with `npx tsx scripts/verify/push.ts`, which plays a Firefox-style browser at Mozilla's push service, and look for `push to updates.push.services.mozilla.com: 201` in the Worker log.

## Gotchas

- Navigating to the same URL with only a hash does not reload the page. Use `location.reload()`.
- Clicks sent while the browser pane is hidden can be lost. Show the pane, or click through `javascript_tool`, and confirm the state changed.
- A dice roll waits for the server before the screen changes. Moves show at once.
- Stop the Worker and the extra vite server you started. Local rooms persist in `.wrangler/` and are safe to delete.
