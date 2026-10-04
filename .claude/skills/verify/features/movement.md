# Movement

In the combat move and noncombat move phases the player selects units in a territory or sea zone and clicks a destination. The game finds a legal path, highlights reachable spaces, and refuses illegal moves with the rule as the message. Moves can be undone within the phase.

## Sub-features

- `move-select` picks units by type and remaining movement, including `Select all`.
- `move-highlight` highlights every space the selection can legally reach.
- `move-mixed` sends land, sea and air units in one selection as separate legal moves.
- `move-blitz` moves a tank through an empty hostile territory, capturing it.
- `move-load` loads land units onto a transport in an adjacent sea zone.
- `move-offload` offloads cargo, as an amphibious assault in combat move or into friendly land in noncombat.
- `move-undo` reverts the last move of the current phase.
- `move-refuse` rejects an illegal move with an error toast.

## How to get to it (user POV)

- Click a territory or sea zone during a movement phase to open the `Move from <space>` panel.
- Set counts per unit type, then click a highlighted destination on the map.
- Transports are listed one by one with their cargo; tick a cargo row marked `offload` to offload it.
- Press `Undo` in the top bar, or Ctrl/Cmd+Z.

## Driving it with the browser pane

Preconditions:

- For `move-offload`, the `amphibious` scenario is loaded (British combat move, loaded transport in `8 Sea Zone`).
- For `move-mixed` and `move-blitz`, the `opening` scenario is loaded and the purchase phase ended.

- **Mixed attack.** Click `data-space="Karelia S.S.R."`, press `Select all`, then click `data-space="Belorussia"`. Karelia's units, including the fighter, appear in Belorussia, and the state snippet shows them there with `movedInCombat: true`.
- **Undo.** Press `Undo`. The units are back in `Karelia S.S.R.`.
- **Amphibious offload.** In `amphibious`, click `data-space="8 Sea Zone"`, tick the transport's cargo, then click `data-space="France"`. The cargo stays aboard, marked as committed to France, until the battle. Ending combat move lists a land battle in France.
- **Refusal.** In combat move, select a unit in a friendly territory and click a friendly destination, then press `End phase`. A toast says the unit cannot end a combat move in friendly territory.

## Gotchas

- Reachability highlighting takes a moment after selection. Clicking the destination too fast does nothing.
- An offload in combat move does not put units ashore immediately. They land when the battle starts.
- Undo clears as soon as any non-move action happens, such as ending the phase or starting a battle.
