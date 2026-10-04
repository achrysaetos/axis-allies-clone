# Movement

In the combat move and noncombat move phases the player drags pieces from a territory or sea zone onto a destination, or picks units up one at a time and clicks a destination. The game finds a legal path, highlights reachable spaces, and refuses illegal moves with the rule as the message. Moves can be undone within the phase.

## Sub-features

- `move-select` picks up one unit by clicking a piece, or the whole stack with shift-click or double-click, and puts one back with right-click or Esc.
- `move-highlight` shows dashed highlights on every space the held or dragged units can legally reach, and a yellow route arrow to the hovered target.
- `move-mixed` drags a stack and leaves behind the units that cannot reach the target, with an info toast. Faded pieces are spent.
- `move-blitz` moves a tank through an empty hostile territory, capturing it.
- `move-load` loads land units by dragging them onto the sea zone.
- `move-offload` offloads cargo by dragging the cargo piece (dashed outline) onto land, as an amphibious assault in combat move or into friendly land in noncombat.
- `move-raid-choice` asks "Bomb the industrial complex" or "Attack <space>" when bombers are dropped on an enemy industrial complex in combat move.
- `move-undo` reverts the last move of the current phase.
- `move-refuse` rejects an illegal move with an error toast.

## How to get to it (user POV)

- Drag a piece onto a space during a movement phase to move the whole stack.
- Or click a piece to pick up one unit (shift-click or double-click takes the stack, right-click puts one back, Esc lets go), then click a highlighted space.
- Hover a space to see it in the `.hover-card` at the top left of the map.
- Press `Undo` in the top bar, or Ctrl/Cmd+Z.

## Driving it with the browser pane

Preconditions:

- For `move-offload`, the `amphibious` scenario is loaded (British combat move, loaded transport in `8 Sea Zone`).
- For `move-mixed` and `move-blitz`, the `opening` scenario is loaded and the purchase phase ended.

- **Mixed attack.** Read the rect of a `[data-space="Karelia S.S.R."] [data-stack]` piece and of `data-space="Belorussia"`, then `left_click_drag` from the piece to the space. Karelia's units, including the fighter, appear in Belorussia, and the state snippet shows them there with `movedInCombat: true`.
- **Undo.** Press `Undo`. The units are back in `Karelia S.S.R.`.
- **Amphibious offload.** In `amphibious`, find the cargo piece in `data-space="8 Sea Zone"` (a `data-stack` whose third field is `1`, drawn with a dashed outline) and `left_click_drag` it onto `data-space="France"`. The cargo stays aboard, marked as committed to France, until the battle. Ending combat move lists a land battle in France.
- **Pick up.** Click a piece in `Russia`. One unit is held and reachable spaces get dashed highlights. Press Esc and the highlights clear.
- **Raid choice.** Drag bombers onto an enemy industrial complex in combat move. The choice offers `Bomb the industrial complex` and `Attack <space>`. Record which one the state shows.
- **Refusal.** In combat move, drag a unit to a friendly territory, then press `End phase`. A toast says the unit cannot end a combat move in friendly territory.

## Gotchas

- Drags must use `left_click_drag` between piece and target coordinates. Take the coordinates from `getBoundingClientRect()` of the `[data-stack]` element, and from the target `[data-space]` element, and scale them from CSS pixels to the screenshot frame. A synthetic `click` on a piece does not drag.
- Screenshots lag one frame. Wait a second or read the state snippet before trusting one after a drag.
- Reachability highlighting takes a moment after a pick up. Clicking the destination too fast does nothing.
- The map opens at zoom 1.35, so a target can be off screen. Check its rect against the viewport before dragging.
- Pieces share a space with other stacks. Match `data-stack` exactly, including the carried and spent flags.
- An offload in combat move does not put units ashore immediately. They land when the battle starts.
- Undo clears as soon as any non-move action happens, such as ending the phase or starting a battle.
- Dragging a cargo piece lifts that type; shift-dragging lifts everything aboard the same transports. Dropping it on a coast the transport has not reached sails the transport to an adjacent sea zone first, then lands the cargo. The route arrow shows both legs.
- Dragging a carrier into a hostile sea zone during combat move launches its own fighters so they fight. In noncombat they ride along as cargo.
- A failed drop shows the reason and releases the held units. A drop off the board shows `Dropped off the board, so nothing moved`.
- While units are held during combat move, hovering an enemy space shows `N% if you go` above it, the odds that attack would have with the held units added.
- Faint arrows (`.trails line`) run from where the moving power's pieces started the turn to where they are now, from combat move through noncombat move.
- Shift-dragging a piece that is not cargo moves everything the player can move in that space. The browser pane's drag tool does not pass Shift, so verify it with synthetic `PointerEvent`s carrying `shiftKey: true` (pointerdown on the piece, pointermoves and pointerup on `window`).
- A press within 14 px of a piece grabs that piece instead of panning the map.
- In a space with both sides, each side's pieces sit on their own rows.
