# Purchase

In the purchase phase the player buys units with IPCs, limited by the treasury and by how many units their industrial complexes can mobilize, and pays 1 IPC per point to repair bomb damage.

## Sub-features

- `buy-units` adds and removes units with steppers and shows spent and remaining IPCs.
- `buy-limit` refuses purchases beyond the treasury or the production capacity (FAQ rule).
- `buy-repair` repairs a damaged complex at 1 IPC per damage point.
- `buy-no-capital` stops a power whose capital is held by the enemy from buying.

## How to get to it (user POV)

- The right-hand `Purchase` panel during a human power's purchase phase.
- Repair buttons appear in the same panel when one of the power's complexes is damaged.

## Driving it with the browser pane

Preconditions:

- The `opening` scenario is loaded, with Russians to purchase and 24 IPCs.

- **Buy.** Press `+` on the `Infantry` row 8 times, waiting for each click to render. The panel reads `Spent 24` and `Left 0`, and the state snippet shows `purchases: [{type: "infantry", count: 8}]`.
- **Refuse overspend.** Press `+` on `Tank`. An error toast appears and the purchases are unchanged.
- **Pay.** Press `End phase`. The top bar shows `0 IPC` and the phase `Combat move`.

## Gotchas

- Rapid scripted clicks can read stale state. Wait a frame between stepper clicks or check the state snippet.
- IPCs are deducted when the phase ends, not as the steppers change.
- No scenario has a damaged complex yet. To check repairs, generate one or report `buy-repair` as unverified.
