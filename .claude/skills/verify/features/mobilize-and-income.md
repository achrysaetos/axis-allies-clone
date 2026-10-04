# Mobilize and income

In the mobilize phase the player places purchased units at industrial complexes they held since the start of the turn, up to each complex's production capacity, with sea units in adjacent sea zones. Ending the turn refunds unplaced units, collects income, and after the US turn checks the victory cities.

## Sub-features

- `mob-place` places units by dragging a tray card onto a highlighted space, or by picking a card up and clicking a space.
- `mob-capacity` limits each complex to its territory value minus damage.
- `mob-sea` places sea units in sea zones next to a complex.
- `turn-income` adds the territory income at the end of the turn, unless the capital is lost.
- `turn-victory` ends the game when a side holds enough victory cities after the US turn.

## How to get to it (user POV)

- The tray lists each purchased type with how many are left, and a check mark when all are placed.
- Drag a card onto a highlighted space to place as many as fit there.
- Or click a card to pick up one more (shift-click all, right-click one fewer), then click a highlighted space.
- `End turn` in the top bar.

## Driving it with the browser pane

Preconditions:

- Load `mobilize` for placement, or `victory` for the win check, and press `Start turn`. The hint reads `Drag new units from the tray onto a highlighted space…`.

- **Sea unit.** Click the Destroyer card. Its legal sea zones highlight (`5 Sea Zone` next to Germany and `15 Sea Zone` next to Italy). Click `5 Sea Zone`. A destroyer appears there and the card shows `✓`. Place the destroyer first: a ship uses the capacity of the complex it sits next to.
- **Capacity.** Drag the Infantry card onto Italy. Only 3 fit (Italy is worth 3), so the state shows 3 infantry in Italy and the card count drops from 4 to 1. Drag it onto Germany for the last one. The tray head reads `Everything is placed. End the turn.`
- **Income.** Press `End turn`. The log shows `Germans collects 41 IPCs`, the treasury rises by that much plus any refund, and the United Kingdom's turn card opens.
- **Victory.** Load `victory` and press `End turn`. A victory card reads `The Axis win`, lists the deciding victory cities and each power's income, and the state shows `winner: "Axis"`. `Look at the board` closes the card; the board is then frozen (no tray, the end button disabled) and the hint says to open the menu for a new game.

## Gotchas

- A complex captured or built this turn cannot mobilize anything.
- Drags must use `left_click_drag` between the card and the space. Take the card rect from `getBoundingClientRect()` of the `button.card`, scale it to the screenshot frame, and expect screenshots to lag one frame.
- Ending the turn with units unplaced warns first (`N unit you bought is not placed. Their cost will be refunded.`); `End anyway` refunds them. Check the treasury, not just the map.
- Every mobilize card has the same tooltip, `Drag onto the map to place all that fit…`, which is its name in `find`. Pick a card by its `.card-name` in a script.
- Victory is checked only after the US turn. Ending any other power's turn never ends the game.
- Picking up a new unit pans the map to the nearest legal space when none is on screen.
