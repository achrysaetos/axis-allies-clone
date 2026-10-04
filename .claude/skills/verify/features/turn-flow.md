# Turn flow and guidance

Two players share the screen. Each power's turn opens with a turn card naming the player and power, the money to spend, and what happened since that power's last turn. During the turn, a hint line explains the current phase, win-percentage tags on the map forecast planned attacks, and the game asks before ending a phase that would lose planes, refund units or skip buying.

## Sub-features

- `flow-card` shows the turn card at each human power's turn, and recenters the map on its capital when dismissed.
- `flow-recap` lists captures, battle results with losses, raids and lost planes since the power's last turn.
- `flow-guide` shows a one-line hint pill (`.hint-line`) at the top center of the map.
- `flow-odds` shows a win-percentage pill (`.map-tag`, tones good, warn, bad) above each planned attack space, and `~N dmg` for raids.
- `flow-warn` asks for confirmation before ending a phase with unlanded planes, unplaced units or no purchase.
- `flow-help` opens the How to play overlay from the menu or the `?` key.
- `flow-log` opens the game log overlay from the menu or the `L` key.

## How to get to it (user POV)

- End a power's turn, or press `Continue` on the setup screen, to see the turn card.
- Move units into an enemy space during combat move to see the win-percentage tag on that space.
- Press `End phase` with a plane over enemy or newly captured territory in noncombat to see the warning.
- Press `Menu` in the top bar, then `How to play (?)` or `Game log (L)`. The `?` and `L` keys do the same.

## Driving it with the browser pane

Preconditions:

- A two-player game started from the setup screen (`opening` scenario, or `Start new game`).

- **Card.** Start the game. The overlay reads `Round 1 · Allies player`, `Soviet Union`, `24 IPCs to spend`. Press Enter. The card closes. Hover `data-space="Russia"` and the `.hover-card` shows `Russia`.
- **Odds.** Press `End phase` (choose `End anyway` on the empty-purchase warning), drag a stack from `Russia` onto `data-space="West Russia"` with `left_click_drag`, then wait a second. A `.map-tag` percentage pill appears above `West Russia`.
- **Warning.** Win the battle, press `End phase` into noncombat, then press `End phase` again with the fighter still in West Russia. The confirmation names `1 fighter in West Russia`.
- **Recap.** Finish the turn. Germany's card shows `Since your last turn` with the Soviet capture and its losses line.
- **Hint.** Read `.hint-line` in each phase. It names the next step for the phase.
- **Log.** Press `Menu`, then `Game log (L)`. The log overlay lists the turn's entries. Press Esc or L to close.
- **Help.** Press `Menu`, then `How to play (?)`. The `How to play` overlay lists the turn order and a unit table. Press Esc to close it.

## Gotchas

- Drags must use `left_click_drag` between piece and target coordinates, taken from `getBoundingClientRect()` of the `[data-stack]` and `[data-space]` elements and scaled to the screenshot frame. Screenshots lag one frame.
- Overlays block clicks on the map; a click that seems ignored usually means a card or confirmation is open.
- The first purchase phase with nothing bought triggers the empty-purchase warning; answer it before expecting the phase to change.
- Odds are simulated, so the exact percentage varies with the forces, not between reloads.
