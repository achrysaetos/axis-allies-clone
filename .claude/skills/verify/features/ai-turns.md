# AI turns

Powers set to `AI` play their own turns automatically, one visible step at a time. When an AI attacks a human power, the game stops and waits for the human defender's decisions.

## Sub-features

- `ai-turn` plays a whole AI power's turn from purchase to income without help.
- `ai-handoff` pauses for a human defender's casualty, submerge or landing decision.
- `ai-safe` never leaves the game stuck; a rejected AI action falls back to a legal default.

## How to get to it (user POV)

- Choose `AI` for a power on the setup screen, or generate a scenario with `--ai`.
- The top bar shows the acting power with `(AI)`, and the end phase button is disabled while the AI acts.

## Driving it with the browser pane

Preconditions:

- Run `npx tsx scripts/verify/scenario.ts opening --ai Germans,Japanese,Americans` and load it. Russians and British stay human.
- Bring the tab to the front with `tabs_select`. Hidden panes throttle the AI's timers.

- **Hand over.** Finish the Russian turn by pressing `End phase` and `End turn`. The top bar changes to `Germans (AI)` and the phases advance on their own.
- **Defender handoff.** When the state snippet shows `pending.power` of `Russians` or `British`, the battle dialog is open for that power. Answer it with `Remove casualties` or `Press on`. The AI turn then continues.
- **Turn completes.** Poll the state snippet every few seconds. The log gains `Germans collects N IPCs`, and `power` becomes `British`.

## Gotchas

- An AI turn takes a few seconds and longer late in the game. Poll in short scripts rather than one long wait.
- An apparent stall is usually a human defender's pending decision. Check `pending.power` before treating it as a bug.
- AI moves use the game's randomness, so outcomes differ between runs. Prove that the turn completes, not a particular result.
