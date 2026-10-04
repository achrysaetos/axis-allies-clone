# Purchase

In the purchase phase the player buys units with IPCs, limited by the treasury and by how many units their industrial complexes can mobilize, and pays 1 IPC per point to repair bomb damage.

## Sub-features

- `buy-units` buys and removes units with tray cards and shows IPCs left and units against capacity.
- `buy-limit` refuses purchases beyond the treasury or the production capacity (FAQ rule).
- `buy-repair` repairs a damaged complex at 1 IPC per damage point.
- `buy-no-capital` stops a power whose capital is held by the enemy from buying.

## How to get to it (user POV)

- The tray at the bottom of the screen (`.tray`) during a human power's purchase phase. It has a `button.card` per unit type.
- Click a card to buy one. Right-click or alt-click a card to remove one.
- `Repair <space> (<damage>)` buttons appear in the tray head when one of the power's complexes is damaged. A `clear` link empties the purchase.

## Driving it with the browser pane

Preconditions:

- The `opening` scenario is loaded, with Russians to purchase and 24 IPCs.

- **Buy.** Click the `Infantry` card 8 times, waiting for each click to render. The tray head reads `0 of 24 IPCs left` and `8/N units`, and the state snippet shows `purchases: [{type: "infantry", count: 8}]`.
- **Remove.** Right-click the `Infantry` card. The count drops by one and the IPCs left rise by 3. Click it again to restore.
- **Refuse overspend.** Click the `Tank` card. An error toast appears and the purchases are unchanged.
- **Pay.** Press `End phase`. The top bar shows `0 IPC` and the phase `Combat move`.

## Gotchas

- Rapid scripted clicks can read stale state. Wait a frame between card clicks or check the state snippet.
- A right-click needs a `contextmenu` event. With `computer`, use `right_click` on the card. Alt-click also removes one.
- IPCs are deducted when the phase ends, not as the cards are clicked.
- No scenario has a damaged complex yet. To check repairs, generate one or report `buy-repair` as unverified.
