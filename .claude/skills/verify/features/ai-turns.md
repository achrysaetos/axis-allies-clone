# AI turns

Powers set to `Computer` play their own turns automatically, one visible step at a time. When an AI attacks a human power, the game stops and waits for the human defender's decisions.

## Sub-features

- `ai-turn` plays a whole AI power's turn from purchase to income without help.
- `ai-handoff` pauses for a human defender's casualty, submerge or landing decision.
- `ai-safe` never leaves the game stuck; a rejected AI action falls back to a legal default.

## How to get to it (user POV)

- Choose `Computer` for a side (Allies or Axis) on the setup screen, or generate a scenario with `--ai` for individual powers.
- The top bar shows the acting power with `(AI)`, the hint pill reads `<Power> (computer) is playing…`, the end button is disabled, and no tray or turn card appears while the AI acts.
- A battle decision that belongs to an AI power shows `Waiting for <Power> (computer)…` in the dialog.

## Driving it with the browser pane

Preconditions:

- Run `npx tsx scripts/verify/scenario.ts opening --ai Germans,Japanese,Americans` and load it. Russians and British stay human.
- Bring the tab to the front with `tabs_select`. Hidden panes throttle the AI's timers.

- **Hand over.** Press `Start turn`, then press the end button (or E) through every phase, answering the end-phase warnings with `End anyway`, until `End turn`. The top bar changes to `Germany (AI)`, the hint reads `Germany (computer) is playing…`, and the phases advance on their own.
- **Defender handoff.** When the state snippet shows `pending.power` of `Russians` or `British`, the battle dialog is open for that power, titled `<Power> (Allies player): N hits to take`. Answer it with `Remove casualties` or `Finish this battle automatically`. The handoff repeats each round. The AI turn then continues.
- **Turn completes.** Poll the state snippet every few seconds. The log gains `Germans collects N IPCs`, and `power` becomes `British` with the United Kingdom's turn card.

## Gotchas

- An AI turn takes a few seconds and longer late in the game. Poll in short scripts rather than one long wait.
- An apparent stall is usually a human defender's pending decision. Check `pending.power` before treating it as a bug.
- AI moves use the game's randomness, so outcomes differ between runs. Prove that the turn completes, not a particular result.
- If the AI cannot act at all, a toast reads `AI is stuck: <reason>` and it retries; a rejected move falls back to a default, and as a last resort the movement phase is replayed from its start.
