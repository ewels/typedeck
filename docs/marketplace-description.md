# Marketplace description

## Short description

Type Deck types preset text into the focused app when you press a key. Optional human-feel timing, randomised delays and occasional adjacent-key typos make the output look hand-typed. Three actions: a single string, a cycling list, or a random pick.

## Full description

Type Deck types preset text into the focused app when you press a key. Optional human-feel timing, randomised delays and occasional adjacent-key typos make the output look hand-typed. Three actions: a single string, a cycling list, or a random pick.

**Actions**

- **Type text** — types the configured text on every press. Optional long-press for a second, alternative string.
- **Cycle next** — each non-empty line of the text field is one entry; each press types the next line, looping back to the start.
- **Random pick** — same line-per-entry format as Cycle next, but each press picks one at random.

**Human-feel typing**

- Per-character, per-word and per-paragraph delays for natural pacing.
- Jitter randomises each delay by a configurable percent so the rhythm isn't robotic. On by default.
- Adjacent-key typo simulation: a wrong key, a brief pause, a backspace, then the correct key.

**Template variables**

Inline tokens are expanded at type-time:

- `{date}` — current date (YYYY-MM-DD)
- `{time}` — current time (HH:MM:SS)
- `{clipboard}` — current clipboard contents
- `{counter}` — press count, persisted per action

Use `{{` and `}}` for literal braces.

**Safety**

Press the key while it's already typing and your choice: abort the current run, or queue another run to start immediately after. Configurable per action.

Useful for boilerplate snippets, demo scripts, prepared answers, and replaying short sequences while screen-sharing.
