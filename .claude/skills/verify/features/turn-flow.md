# Turn flow and guidance

Two players share the screen. Each power's turn opens with a turn card naming the player and power, the money to spend, and what happened since that power's last turn. During the turn, the sidebar explains the current phase, forecasts planned attacks, and the game asks before ending a phase that would lose planes, refund units or skip buying.

## Sub-features

- `flow-card` shows the turn card at each human power's turn, and recenters the map on its capital when dismissed.
- `flow-recap` lists captures, battle results with losses, raids and lost planes since the power's last turn.
- `flow-guide` shows a one-line guide for the current phase above the phase panel.
- `flow-odds` lists planned attacks with win chance and expected losses, and raids with expected damage.
- `flow-warn` asks for confirmation before ending a phase with unlanded planes, unplaced units or no purchase.
- `flow-help` opens the How to play overlay from the `?` button or key.

## How to get to it (user POV)

- End a power's turn, or press `Continue` on the setup screen, to see the turn card.
- Move units into an enemy space during combat move to see `Planned attacks`.
- Press `End phase` with a plane over enemy or newly captured territory in noncombat to see the warning.
- Press `?` in the top bar.

## Driving it with the browser pane

Preconditions:

- A two-player game started from the setup screen (`opening` scenario, or `Start new game`).

- **Card.** Start the game. The overlay reads `Round 1 · Allies player`, `Soviet Union`, `24 IPCs to spend`. Press Enter. The card closes and the info panel shows `Russia`.
- **Odds.** Press `End phase` (choose `End anyway` on the empty-purchase warning), click `data-space="Russia"`, press `Select all`, wait a second, click `data-space="West Russia"`. `Planned attacks` lists `West Russia` with a percentage tag.
- **Warning.** Win the battle, press `End phase` into noncombat, then press `End phase` again with the fighter still in West Russia. The confirmation names `1 fighter in West Russia`.
- **Recap.** Finish the turn. Germany's card shows `Since your last turn` with the Soviet capture and its losses line.
- **Help.** Press `?`. The `How to play` overlay lists the turn order and a unit table. Press Esc to close it.

## Gotchas

- Overlays block clicks on the map; a click that seems ignored usually means a card or confirmation is open.
- The first purchase phase with nothing bought triggers the empty-purchase warning; answer it before expecting the phase to change.
- Odds are simulated, so the exact percentage varies with the forces, not between reloads.
