# Combat

In the combat phase the player resolves battles in the rulebook's order: strategic bombing raids, then amphibious assaults, then general combat. Each battle opens a dialog from the map with both sides, the dice rolled so far and the decision currently pending, which may belong to the attacker or to a defender.

## Sub-features

- `combat-order` shows `Not yet: <reason>` instead of the roll buttons when a raid or amphibious assault must go first.
- `combat-skip` presses `Skip` to decline an optional battle against only submarines or transports.
- `combat-casualties` assigns hits under the rules (air cannot hit subs without a destroyer, transports last, battleships take two hits).
- `combat-retreat` retreats to a space the attackers came from, by `Retreat to <space>` or by clicking that highlighted space on the map, or presses on.
- `combat-submerge` submerges submarines instead of a surprise strike.
- `combat-bombard` fires battleships and cruisers at the shore automatically, strongest first, at most one per seaborne land unit. There is no prompt.
- `combat-intercept` chooses defending interceptors when the escorts option is on.
- `combat-stranded` lands defending fighters whose carrier sank, within one space.
- `combat-capture` changes territory control and income when the attacker wins with land units.

## How to get to it (user POV)

- When the combat phase starts, the first fightable battle's dialog opens automatically. Clicking a battle space on the map opens its dialog.
- A not-yet-started battle shows both sides, the forecast line, and `Roll dice`, `Fight it out automatically` and `Skip` (optional battles only).
- A finished battle shows `Next: <space>` or `Back to the map`.
- The casualty picker lists the side's units as `button.tile` tiles under "In the fight: pick who takes each hit" with a dashed `Casualty zone · n/m` row below. Clicking a tile in the fight moves one hit into the zone. Clicking a tile in the zone, or right-clicking it, moves it back.
- The battle dialog's decision area: `Remove casualties`, `Suggest`, `Press on`, retreat destination buttons, and piece tiles (`button.tile`, `aria-pressed`) that toggle submerge and intercept choices.

## Driving it with the browser pane

Preconditions:

- Load the scenario the step names. Unless the scenario is AI-controlled, every power in it is human, so you answer both sides' decisions.

- **Amphibious with bombardment.** Load `amphibious`, shift-drag the cargo into `France` as in movement.md, and press the end button. The `Battle for France` dialog opens by itself with `Roll dice` and `Fight it out automatically` and no `Skip`. Press `Roll dice`. No bombard prompt appears: the dice log opens with a `Before the battle` group holding a `United Kingdom · bombardment` row. Answer casualties and retreat prompts until the dialog shows a winner. If the British win, the result reads `United Kingdom takes France` and the state shows `owner.France: "British"`.
- **Surprise strike.** Load `sub-strike`, pan to the Atlantic, drag the submarines from `12 Sea Zone` onto the British ships in `13 Sea Zone`, end the phase and press `Roll dice`. The submerge prompt comes first, before any dice; answer it with `Keep fighting` (or click sub tiles and press `Submerge n`). Then the dialog shows a `Germany · surprise strike` row, and a British casualty from it never fires back.
- **Retreat on the map.** At the attacker's `Press on` / `Retreat to 12 Sea Zone` prompt, click inside `12 Sea Zone` on the map (it is highlighted). The log reads `Germans retreats from 13 Sea Zone`.
- **Interception.** Load `raid-intercept`, shift-drag the bombers and the fighter from `United Kingdom` onto `data-space="Germany"`, choose `Bomb the industrial complex`, end the phase and press `Roll dice`. Germany's intercept decision appears with its fighters as pressed tiles; press `Intercept`. The dice log shows `escort fire`, `interceptor fire`, `factory air defense` and `bombing damage`, and the factory badge in Germany shows the damage. Before rolling, the `.map-tag` over Germany reads `~N dmg`.
- **Order.** Load `order`. Drag the tank from Northwestern Europe into France, drag the bomber onto Germany and choose `Bomb the industrial complex`, then end the phase. The raid's dialog opens first. Click France on the map. Its dialog reads `Not yet: resolve strategic bombing raids, then amphibious assaults, first.` with no roll buttons. Finish the raid and it offers `Next: France`.
- **Stranded fighters.** Load `carrier-loss`, drag the battleships onto `6 Sea Zone`, end the phase and press `Roll dice`. When Britain takes its casualty, click the Carrier tile in the fight so the carrier sinks instead of a fighter, then `Remove casualties`. At the German retreat prompt choose `Retreat to 5 Sea Zone`. Press `Back to the map`, then the end button. Britain's dialog reads `United Kingdom: land fighters whose carrier was sunk`; press `Land fighters` and the fighter is in `United Kingdom`. If the battle is fought out instead, the defaults sink the fighters first and nothing is stranded.

## Gotchas

- The dialog opens automatically at the start of combat and after `Next: <space>`. A click on a map space with no battle does nothing. The map centers each battle to the left of the dialog.
- Decisions alternate between attacker and defender. Read `pending.power` before answering.
- The casualty zone starts filled with the cheapest legal choice, so pressing `Remove casualties` without changes is a valid answer. Once `n/m` is full, clicking a tile in the fight swaps it for a piece already in the zone.
- A battle that ends with no attacking land units never captures, even if the defenders are gone.
- Dice are random unless the scenario scripts them. Prove rules from the dice rows actually shown, not from the outcome alone.
