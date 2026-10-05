# Movement

In the combat move and noncombat move phases the player drags pieces from a territory or sea zone onto a destination, or picks units up one at a time and clicks a destination. The game finds a legal path, highlights reachable spaces, and refuses illegal moves with the rule as the message. Moves can be undone within the phase.

## Sub-features

- `move-select` picks up one unit by clicking a piece, or all of that type with shift-click or double-click, and puts one back with right-click or alt-click. Esc lets go.
- `move-highlight` shows dashed highlights on every space the held or dragged units can legally reach, and a yellow route arrow to the hovered target.
- `move-mixed` drags a stack (shift-drag for everything in the space) and leaves behind the units that cannot reach the target, with an info toast naming them and the rule, such as `1 artillery stayed in United Kingdom: not enough transport capacity`. A drop on a neutral space says it is neutral. Faded pieces are spent.
- `move-blitz` moves a tank through an empty hostile territory, capturing it.
- `move-load` loads land units by dragging them onto the sea zone.
- `move-offload` offloads cargo by dragging the cargo piece (dashed outline) onto land, as an amphibious assault in combat move or into friendly land in noncombat.
- `move-raid-choice` asks "Bomb the industrial complex" or "Attack <space>" when bombers are dropped on an enemy industrial complex in combat move.
- `move-undo` reverts the last engine move of the current phase, with the toast `Last move undone`. One drag is one Undo, even when it moves planes and land units or sails a transport and lands its cargo.
- `move-refuse` rejects an illegal drop with an error toast naming the reason, and rejects ending combat move while a unit sits in friendly territory.

## How to get to it (user POV)

- Drag a piece onto a space during a movement phase to move every unit of that type there. Shift-drag moves everything the player can move in the space.
- Or click a piece to pick up one unit (shift-click or double-click takes all of that type, right-click or alt-click puts one back, Esc lets go), then click a highlighted space.
- Hover a space to see it in the `.hover-card` at the top left of the map.
- Press `Undo` in the top bar, or Ctrl/Cmd+Z.

## Driving it with the browser pane

Preconditions:

- For `move-offload`, the `amphibious` scenario is loaded (British combat move, loaded transport in `8 Sea Zone`).
- For `move-mixed`, the `opening` scenario is loaded, `Start turn` pressed, and the purchase phase ended (with nothing bought, answer the warning with `End anyway`).
- For `move-blitz`, the `blitz` scenario is loaded (German tank in Belorussia, empty Soviet West Russia, one Soviet infantry in Russia). Pan the map so Russia is on screen.

- **Mixed attack.** Shift-drag a `[data-space="Karelia S.S.R."] [data-stack]` piece onto Belorussia with synthetic shift `PointerEvent`s (see SKILL.md). Karelia's infantry, artillery and fighter appear in Belorussia, and a `.map-tag` near `98%` appears over it.
- **Undo.** Press `Undo` once. The toast reads `Last move undone`, everything is back in `Karelia S.S.R.`, and `Undo` is disabled.
- **Blitz.** In `blitz`, `left_click_drag` the tank from Belorussia onto the Soviet infantry in Russia. The tank ends in Russia with `blitzed: true`, `owner["West Russia"]` becomes `Germans`, and the log reads `Germans captures West Russia`.
- **Amphibious offload.** In `amphibious`, find the cargo piece in `data-space="8 Sea Zone"` (a `data-stack` whose third field is `1`, drawn with a dashed outline) and shift-drag it onto France to land everything aboard, or plain-drag to land only that type. The cargo stays aboard with `offloadedTo: "France"` until the battle, and a white landing arrow (`.route.landing`) runs to the beach. Ending combat move opens the France battle.
- **Pick up.** Click a piece in `Russia`. One unit is held (a gold `1` badge, `.picked-count`), reachable spaces get yellow dashed highlights (`path.highlight`), and the hint reads `Drop on a highlighted space…`. Press Esc and the highlights and badge clear.
- **Raid choice.** Load `raid-intercept` and shift-drag the UK bombers onto Germany. The choice offers `Bomb the industrial complex` and `Attack Germany`. After `Bomb…`, the units show `sbr: true` and the map tag reads `~N dmg`. Fighters join a raid only when the escorts rule is on, as it is in this scenario.
- **Refusal.** In combat move, drag a Russia infantry into friendly Archangel. The drop succeeds with no toast. Press the end button. The toast reads `infantry in Archangel cannot end a combat move in friendly territory` and the phase stays combat move. Toasts last about 4.5 seconds, so read them promptly.

## Gotchas

- Drags must use `left_click_drag` between piece and target coordinates, or synthetic `PointerEvent`s for a shift-drag. Take the coordinates from `getBoundingClientRect()` of the `[data-stack]` element, and from the target `[data-space]` element, and scale them from CSS pixels to the screenshot frame. A synthetic `click` on a piece does not drag. A sea zone's bounding box can overlap other spaces, so confirm a target point with `document.elementFromPoint(x, y).closest('[data-space]')`.
- Screenshots lag one frame. Wait a second or read the state snippet before trusting one after a drag.
- The map opens at zoom 1.35, so a target can be off screen. Check its rect against the viewport before dragging.
- Pieces share a space with other stacks. Match `data-stack` exactly, including the carried and spent flags.
- An offload in combat move does not put units ashore immediately. They land when the battle starts.
- Undo clears as soon as any non-move action happens, such as ending the phase or starting a battle.
- Dragging a cargo piece lifts that type; shift-dragging lifts everything aboard the same transports. Dropping it on a coast the transport has not reached sails the transport to an adjacent sea zone first, then lands the cargo. The route arrow shows both legs.
- Dragging a carrier into a hostile sea zone during combat move launches its own fighters so they fight. In noncombat they ride along as cargo.
- A failed drag-and-drop shows the reason and releases the held units; a failed click-to-move keeps them held. Dropping back on the source space releases silently. A drop off the board shows `Dropped off the board, so nothing moved`.
- While units are held during combat move, hovering an enemy space shows `N% if you go` above it, the odds that attack would have with the held units added.
- Faint arrows (`.trails line`) run from where the moving power's pieces started the turn to where they are now, through combat move, combat and noncombat move. Cargo is left out.
- A press within 14 px of a piece grabs that piece instead of panning the map.
- In a space with both sides, each side's pieces sit on their own rows.
