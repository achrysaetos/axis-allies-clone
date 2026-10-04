# Paused state (2026-10-04)

Main is clean and green at `ace77a7`: 119 tests pass, typecheck and build pass, and 22 of 22 mutants are caught.

## In flight

The Allied AI hill-climb ran in worktree `.claude/worktrees/agent-a49b3a81003bcb9e3` on branch `worktree-agent-a49b3a81003bcb9e3`. It was stopped during iteration 6.

- **Metric.** Over seeds 1 to 40, 15 rounds, all-AI, the Allied score is Allied wins plus undecided games the Allies lead. The baseline is 13. One 40-seed run is noisy, so the harness averages across odds salts 17 to 24.
- **Committed on the branch.** `c9837fd`: the Allies buy fighters instead of troops their transports can't lift, and land them in threatened victory cities. Its log in `docs/ai-hillclimb.tsv` shows a mean of 9.13 rising to 12.88 across salts.
- **Uncommitted on the branch.** The H6 experiment, which prices the counterattack on troops sent out when the capital is in danger. Its edits are in `src/ai/combatMove.ts`, `src/ai/purchase.ts`, `test/ai.test.ts` and the TSV. It was never measured.

## To resume

1. Either finish measuring H6 in that worktree, or discard it.
2. Check that the branch typechecks under main's new `noUnusedLocals` and `noUnusedParameters` settings.
3. Merge into main only after the full 40-seed measurement and the AI-vs-random check, which must stay at 100% wins on both sides.
