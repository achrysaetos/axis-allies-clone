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

- Load `mobilize` for placement, or `victory` for the win check.

- **Capacity.** In `mobilize`, drag the `Infantry` card onto `data-space="Italy"`. Only 3 fit, so the state shows 3 infantry in Italy and the card count drops by 3. Italy no longer highlights. Germany takes up to 10.
- **Sea unit.** Drag the `Destroyer` card onto `data-space="15 Sea Zone"`. A destroyer appears in `15 Sea Zone`.
- **Income.** Press `End turn`. The log shows `Germans collects N IPCs`, the treasury rises by N, and the top bar moves to the British.
- **Victory.** Load `victory` and press `End turn`. A victory card reads `The Axis win`, lists the deciding victory cities and each power's income, and the state shows `winner: "Axis"`. `Look at the board` closes the card; the board is then frozen (no tray, the end button disabled) and the hint says to open the menu for a new game.

## Gotchas

- A complex captured or built this turn cannot mobilize anything.
- Drags must use `left_click_drag` between the card and the space. Take the card rect from `getBoundingClientRect()` of the `button.card`, scale it to the screenshot frame, and expect screenshots to lag one frame.
- Unplaced units are refunded silently when the turn ends. Check the treasury, not just the map.
- Victory is checked only after the US turn. Ending any other power's turn never ends the game.
- Picking up a new unit pans the map to the nearest legal space when none is on screen.
