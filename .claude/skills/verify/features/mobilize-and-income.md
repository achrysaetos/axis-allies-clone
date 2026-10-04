# Mobilize and income

In the mobilize phase the player places purchased units at industrial complexes they held since the start of the turn, up to each complex's production capacity, with sea units in adjacent sea zones. Ending the turn refunds unplaced units, collects income, and after the US turn checks the victory cities.

## Sub-features

- `mob-place` places units by map click or with the `Place 1` and `Place N` buttons.
- `mob-capacity` limits each complex to its territory value minus damage.
- `mob-sea` places sea units in sea zones next to a complex.
- `turn-income` adds the territory income at the end of the turn, unless the capital is lost.
- `turn-victory` ends the game when a side holds enough victory cities after the US turn.

## How to get to it (user POV)

- The `Mobilize` panel lists each purchased unit type and the complexes that can take it.
- Highlighted spaces on the map accept a click to place one unit.
- `End turn` in the top bar.

## Driving it with the browser pane

Preconditions:

- Load `mobilize` for placement, or `victory` for the win check.

- **Capacity.** In `mobilize`, the panel shows `Italy` with a limit of 3 and `Germany` with 10. Press `Place 3` for Italy. The state shows 3 infantry in Italy, and Italy is no longer offered.
- **Sea unit.** Select the destroyer and click `data-space="15 Sea Zone"`. A destroyer appears in `15 Sea Zone`.
- **Income.** Press `End turn`. The log shows `Germans collects N IPCs`, the treasury rises by N, and the top bar moves to the British.
- **Victory.** Load `victory` and press `End turn`. A winner banner names the Axis and the state shows `winner: "Axis"`.

## Gotchas

- A complex captured or built this turn cannot mobilize anything.
- Unplaced units are refunded silently when the turn ends. Check the treasury, not just the map.
- Victory is checked only after the US turn. Ending any other power's turn never ends the game.
