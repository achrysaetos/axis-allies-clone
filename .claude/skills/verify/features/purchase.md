# Purchase

In the purchase phase the player buys units with IPCs, limited by the treasury and by how many units their industrial complexes can mobilize, and pays 1 IPC per point to repair bomb damage.

## Sub-features

- `buy-units` buys and removes units with tray cards and shows IPCs left and units against capacity. Shift-click buys as many as fit.
- `buy-limit` disables cards the player cannot afford or has no production room for (FAQ rule).
- `buy-repair` repairs a damaged complex at 1 IPC per damage point.
- `buy-no-capital` replaces the purchase chart with `<capital> has fallen, so nothing can be bought or repaired until it is freed.` for a power whose capital the enemy holds, and the hint line is hidden. Reach it with the `no-capital` scenario.

## How to get to it (user POV)

- The tray at the bottom of the screen (`.tray`) during a human power's purchase phase. It has a `button.card` per unit type.
- Click a card to buy one, or shift-click to buy as many as the IPCs and capacity allow. Right-click or alt-click a card to remove one.
- `Repair <space> (<damage>)` buttons appear in the tray head when one of the power's complexes is damaged. A `clear` link empties the purchase.

## Driving it with the browser pane

Preconditions:

- The `opening` scenario is loaded, with Russians to purchase and 24 IPCs, and `Start turn` pressed. The tray head reads `24 IPCs left · 0 of 14 units your factories can place`.
- For repairs, load `repair` instead (Germans to purchase, the Germany complex with 4 damage).

- **Buy.** Shift-click the Infantry card (or click it 8 times, waiting for each click to render). The tray head reads `0 IPCs left · 8 of 14 units your factories can place`, and the state snippet shows `purchases: [{type: "infantry", count: 8}]`.
- **Remove.** Right-click the `Infantry` card. The count drops by one and the IPCs left rise by 3. Click it again to restore.
- **Refuse overspend.** After buying 7 infantry (3 IPCs left), the Tank card (cost 6) is disabled. A card disables when the IPCs left fall below its cost or no production room is left, unless some of it are already bought. Clicking a disabled card does nothing and the purchases are unchanged.
- **Warn on nothing bought.** Click `clear`, then press the end button (`End phase (E)`). The overlay reads `You have not bought anything. Your 24 IPCs will carry over to next turn.`; press `Go back`.
- **Pay.** Buy again and press the end button. The top bar shows `Treasury 0 · Income 24`, a `To place` chip with the infantry, the current phase `Combat move`, and the end button `Next: Combat`. The log ends with `Russians buys 8 infantry`.
- **Repair.** In `repair`, press `Repair Germany (4)`. The treasury drops by 4, the complex's `damage` is 0, the log reads `Germans repairs 4 damage to the industrial complex in Germany`, and the button disappears. A repair spends up to the IPCs left after purchases.

## Gotchas

- Rapid scripted clicks can read stale state. Wait a frame between card clicks or check the state snippet.
- A right-click needs a `contextmenu` event. With `computer`, use `right_click` on the card. Alt-click also removes one.
- IPCs are deducted when the phase ends, not as the cards are clicked.
- Cards are named by their tooltip in `find`, for example `Infantry: attack 1, defense 2, move 1…`.
- Shift-clicking a card buys as many of that unit as the IPCs left and the production limit allow.
