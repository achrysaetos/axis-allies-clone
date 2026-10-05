# Turn flow and guidance

Two players share the screen. Each power's turn opens with a turn card naming the player and power, the money to spend, and what happened since that power's last turn. During the turn, a hint line explains the current phase, win-percentage tags on the map forecast planned attacks, and the game asks before ending a phase that would lose planes, refund units or skip buying.

## Sub-features

- `flow-card` shows the turn card at each human power's turn, and recenters the map on its capital when dismissed (on the open battle instead, when one is being viewed).
- `flow-recap` lists captures, battle results with losses, raids and lost planes since the power's last turn.
- `flow-guide` shows a one-line hint pill (`.hint-line`) at the top center of the map.
- `flow-odds` shows a win-percentage pill (`.map-tag`, tones good, warn, bad) above each planned attack space, and `~N dmg` for raids.
- `flow-warn` asks for confirmation before ending purchase with nothing bought (3 IPCs or more and the capital held), noncombat with unlanded planes, or mobilize with unplaced units or planes still needing a new carrier.
- `flow-help` opens the How to play overlay from the menu or the `?` key.
- `flow-small-screens` keeps the top bar's Undo, menu and end button on screen at any width. Below 1600 px only the current phase shows. Below 640 px (phones) the bar keeps the power and controls, the setup and turn cards fit the width, the battle dialog becomes a bottom sheet with the battle centered above it, and touch screens (`(pointer: coarse)`) get tap hints instead of shift and right-click hints. Two fingers pinch-zoom the map, and tapping a space shows its info card. Check with `resize_window` presets `mobile` and `tablet`, and reload after switching.
- `flow-map-zoom`: any mouse wheel zooms the map about the pointer, including smooth high-resolution wheels, while a trackpad's two-finger scroll pans and a pinch zooms. Scroll events right after a pinch are ignored, and ctrl-wheel or a pinch anywhere else never zooms or scrolls the page. Simulate a mouse wheel with a `WheelEvent` whose `wheelDeltaY` is redefined to 120 (a trackpad's is `-3 × deltaY`), and reload first, since hot reload keeps the old wheel listener.
- `flow-sound` plays a thunk on each drop, a dice rattle on each roll, a blast when units die, a two-note call on a capture, a chime when the power to move changes and a fanfare on a win, for remote and computer moves too. `Menu`, then `Turn sound off` or `Turn sound on`, mutes it, and the choice is remembered in this browser. Prove it by wrapping `AudioContext.prototype.createOscillator` and `createBufferSource` with counters, since the pane cannot be heard.
- `flow-log` opens the game log overlay from the menu or the `L` key.

## How to get to it (user POV)

- End a power's turn, or press `Continue` on the setup screen, to see the turn card.
- Move units into an enemy space during combat move to see the win-percentage tag on that space.
- Press the end button with a plane in a territory that was not friendly at the start of the turn, in noncombat, to see the warning.
- Press `Menu` in the top bar, then `How to play (?)` or `Game log (L)`. The `?` and `L` keys do the same.

## Driving it with the browser pane

Preconditions:

- A two-player game started from the setup screen (`opening` scenario, or `Start new game`).

- **Card.** Start the game. The overlay reads `Round 1 · Allies player`, `Soviet Union`, `24 IPCs to spend`. Press Enter. The card closes. Hover `data-space="Russia"` and the `.hover-card` shows `Russia`.
- **Odds.** Press the end button (choose `End anyway` on the empty-purchase warning), drag a stack from `Russia` onto `data-space="West Russia"` with `left_click_drag`, then wait a second. A `.map-tag` percentage pill appears above `West Russia`. While still holding units over an enemy space, the pill reads `NN% if you go`.
- **Warning.** Win the battle, press the end button into noncombat, then press it again with the fighter still in West Russia. The confirmation names `1 fighter in West Russia`.
- **Recap.** Finish the turn. Germany's card shows `Since your last turn` with the Soviet capture and its losses line.
- **Hint.** Read `.hint-line` in each phase. Purchase starts `Click units in the chart below to buy them`, combat move `Drag pieces into enemy spaces to attack`, and combat reads `Click a ⚔ to fight that battle.` or `Every battle is fought. End the phase.`. It is hidden while a battle dialog is open.
- **Log.** Press `Menu`, then `Game log (L)`. The log overlay lists the turn's entries. Press Esc or L to close.
- **Help.** Press `Menu`, then `How to play (?)`. The `How to play` overlay opens with the piece controls (`Drag a piece.`, `Click a piece.`, and so on), then the turn order, a unit table and the shortcuts. Press Esc or `?` to close it.

## Gotchas

- Drags must use `left_click_drag` between piece and target coordinates, taken from `getBoundingClientRect()` of the `[data-stack]` and `[data-space]` elements and scaled to the screenshot frame. Screenshots lag one frame.
- Overlays block clicks on the map; a click that seems ignored usually means a card or confirmation is open.
- The first purchase phase with nothing bought triggers the empty-purchase warning; answer it before expecting the phase to change.
- Odds are simulated, so the exact percentage varies with the forces, not between reloads.
