# Setup and saves

Players start a new game choosing Player or Computer for each side (Allies, Axis), the victory condition and the optional rules. The game autosaves after every action, can be resumed with Continue, and can be exported to or imported from a JSON file.

## Sub-features

- `setup-new` starts a game from the printed 1942 setup with the chosen controllers and options, confirming first when it would replace a saved game.
- `setup-options` sets total victory, the Turkish straits closure and raid escorts and interceptors.
- `setup-continue` resumes the autosaved game after a reload.
- `setup-import` loads a saved game file.
- `setup-export` downloads the current game as a JSON file.

## How to get to it (user POV)

- Open the app with no game in progress, or press `Menu` then `Main menu` in a game.
- Click a power's seat card to switch it between `Player` and `Computer` (or use the `Everyone plays`, `I play the Allies`, `I play the Axis` presets), open `Rules` to tick the options, then press `Start the war`.
- Press the `Continue your game` card on the home screen (it reads `Round N · Power · Phase`).
- Choose a file with `Import saved game…`.
- Press `Menu` then `Export save` in the top bar during a game.

## Driving it with the browser pane

Preconditions:

- The server is healthy and `.verify/scenarios/opening.json` exists.

- **New game.** Press `Start the war`; if a save exists, press `Replace saved game and start`. Dismiss the turn card. The top bar reads `Round 1`, `Soviet Union` and `Purchase`, with `Treasury 24 · Income 24` and `Axis 6/9 · Allies 7/10`.
- **Options.** On the setup screen, tick `Optional: fighters escort and intercept bombing raids` and choose `Total: all 13 cities`, then start. The state snippet shows `options.sbrEscortsInterceptors: true` and `options.victory: "total"`, and the top bar threshold reads `/13`.
- **Continue.** Make one purchase, reload the page, then press `Continue your game`. The turn card shows again; in Purchase its button reads `Start turn` (`Continue turn` appears only mid-turn). Press it. The tray shows the same purchase.
- **Import.** Press `Menu`, then `Main menu`, then run the Import snippet with `opening`. The game opens at once, with no replace prompt even when a save exists, and the turn card shows `Soviet Union` in `Purchase`. The imported game becomes the autosave on its next change.
- **Export.** Press `Menu`, then `Export save`. The browser starts a download named `aa1942-round1-Russians.json`. Downloads need the user's permission, so record this as unverified unless they allow it.

## Gotchas

- The setup screen does not remember choices. Every visit starts at `Player` for both sides, `Standard`, and both options unticked, so set each one explicitly.
- The `Player` and `Computer` toggles are per side and apply to every power on it. Confirm the controllers in `saved.controllers` after starting. The `--ai` scenario flag is per power.
- Reloading resumes nothing by itself. The player must press `Continue`.
