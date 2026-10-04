# Combat

In the combat phase the player resolves battles in the rulebook's order: strategic bombing raids, then amphibious assaults, then general combat. Each battle opens a dialog with both sides, the dice rolled so far and the decision currently pending, which may belong to the attacker or to a defender.

## Sub-features

- `combat-order` disables `Start` with the reason when a raid or amphibious assault must go first.
- `combat-skip` declines an optional battle against only submarines or transports.
- `combat-casualties` assigns hits under the rules (air cannot hit subs without a destroyer, transports last, battleships take two hits).
- `combat-retreat` retreats to a space the attackers came from, or presses on.
- `combat-submerge` submerges submarines instead of a surprise strike.
- `combat-bombard` chooses battleships and cruisers to bombard, at most one per seaborne land unit.
- `combat-intercept` chooses defending interceptors when the escorts option is on.
- `combat-stranded` lands defending fighters whose carrier sank, within one space.
- `combat-capture` changes territory control and income when the attacker wins with land units.

## How to get to it (user POV)

- The `Battles` panel during the combat phase, with `Start` (accessible name `Fight this battle`), `Skip` and `view` per battle.
- The battle dialog's decision area: `Confirm casualties`, `Auto`, `Press on`, retreat destination buttons, and checkboxes for submerge, bombard and intercept.

## Driving it with the browser pane

Preconditions:

- Load the scenario the step names. Unless the scenario is AI-controlled, every power in it is human, so you answer both sides' decisions.

- **Amphibious with bombardment.** Load `amphibious`, offload the cargo into `France` as in movement.md, and press `End phase`. Press `Start` on France. The bombard decision offers the battleship and cruiser with a maximum of 2, the number of seaborne units. Press `Bombard`, then answer casualties and retreat prompts until the dialog shows a winner. The dice log starts with a `bombardment` row. If the British win, the state snippet shows `owner.France: "British"`.
- **Surprise strike.** Load `sub-strike`, move both submarines from `12 Sea Zone` to `13 Sea Zone`, end the phase and press `Start`. Answer the submerge prompts. The dialog shows a `surprise strike` dice row, and a British casualty from it never fires back.
- **Interception.** Load `raid-intercept`, select the bombers and the fighter in `United Kingdom`, tick the raid checkbox, click `data-space="Germany"`, end the phase and press `Start`. Germany's intercept decision appears. The dice log shows `escort fire`, `interceptor fire`, `factory air defense` and `bombing damage`, and the factory badge in Germany shows the damage.
- **Stranded fighters.** Load `carrier-loss`, attack `6 Sea Zone` with the battleships, sink the carrier, then retreat or win. On ending combat, Britain is asked to land each fighter within one space, and the state shows them in `United Kingdom` or destroyed.

## Gotchas

- Decisions alternate between attacker and defender. Read `pending.power` before answering.
- Casualty steppers start filled with the cheapest legal choice, so pressing `Confirm casualties` without changes is a valid answer.
- A battle that ends with no attacking land units never captures, even if the defenders are gone.
- Dice are random unless the scenario scripts them. Prove rules from the dice rows actually shown, not from the outcome alone.
