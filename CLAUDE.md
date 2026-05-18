# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Stream Deck plugin ("Type Deck") that simulates a human typing preset text into the focused application when a Stream Deck key is pressed. Plugin UUID: `com.ewels.type-deck`. Single action: `com.ewels.type-deck.type` ("Fake Type").

## Commands

```sh
npm run build         # one-off rollup build → com.ewels.type-deck.sdPlugin/bin/plugin.js
npm run watch         # rebuild on save, then restart the plugin in Stream Deck via @elgato/cli
npm run lint          # biome lint
npm run lint:fix      # biome lint --write
npm run check         # biome check (lint + format)
npm run format        # prettier --write + biome format --write
npm run format:check  # prettier --check + biome format (no write)
```

A code change does not appear in Stream Deck until the plugin process is restarted (`npm run watch` handles this automatically, or run `streamdeck restart com.ewels.type-deck`). Property-inspector HTML edits are picked up by reopening the action's settings panel.

## Git hooks: prek, not pre-commit

Hooks live in `prek.toml` (TOML) and are run by [prek](https://github.com/j178/prek), a Rust-based replacement for `pre-commit`. **Do not invoke `pre-commit` or write `.pre-commit-config.yaml`.** TOML config requires `prek >= 0.4.0` (`brew upgrade prek`).

```sh
prek install              # install git hook
prek run --all-files      # run hooks across the repo
prek auto-update          # bump pinned hook revs
```

Hooks: standard pre-commit-hooks (whitespace/EOL/yaml/json/merge-conflict), Prettier (JSON/YAML/MD/HTML/CSS), Biome (lint + format for JS/TS).

## Architecture

```
src/
  plugin.ts                  bootstrap: registerAction(new FakeType()) + connect()
  actions/fake-type.ts       the entire action lives here
com.ewels.type-deck.sdPlugin/
  manifest.json              plugin manifest (validated by Elgato JSON schema)
  ui/fake-type.html          property inspector (sdpi-components v4 over CDN)
  bin/plugin.js              rollup output, gitignored
  imgs/, logs/               icons and runtime logs (logs gitignored)
rollup.config.mjs            bundles src/ to bin/plugin.js
                             `@nut-tree-fork/nut-js` is marked external — loaded
                             from node_modules at runtime, not bundled
```

The Stream Deck app spawns `node bin/plugin.js`, which connects to Stream Deck over a websocket. `@elgato/streamdeck` translates websocket events into per-action handlers via `SingletonAction`.

`FakeType` extends `SingletonAction<TypeSettings>` and overrides `onWillAppear` / `onDidReceiveSettings` (preview title) and `onKeyDown` / `onKeyUp` (typing). All typing state (settings, cycle index, counter) is persisted on the action instance via `ev.action.setSettings(...)` — there is no global plugin state.

### Key press lifecycle

`onKeyDown` decides one of three paths based on settings:
1. **Already typing** — set `abortRequested` (cancel) or `queuedRun` (queue another run) and return.
2. **Long press enabled** — start a timer for `longPressThresholdMs`. If `onKeyUp` fires first → short-press text. If timer fires first → `longPressText`.
3. **Short press, no long-press config** — type immediately from `onKeyDown`.

Cycle/random selection runs before typing begins. Cycle index is **persisted before typing starts**, so an aborted run still advances the cycle. Variables (`{date}`, `{time}`, `{clipboard}`, `{counter}`) are always expanded; `{counter}` only writes to settings when actually referenced in the text.

### Two critical native-blocking workarounds

Both live at the top of `src/actions/fake-type.ts` and must not be removed:

1. `keyboard.config.autoDelayMs = 0` disables nut-js's wrapper sleep between chars.
2. `providerRegistry.getKeyboard().setKeyboardDelay(0)` overrides **libnut's internal** keyboardDelay, which nut-js's constructor sets to 300 ms by default. That delay is honored inside the synchronous native `typeString` call and blocks the JS thread per keystroke — long enough that websocket messages (including a second keyDown press) cannot be dispatched until typing finishes, breaking abort/queue.

Related: the local `sleep()` helper uses `setTimeout` for *every* value including 0 ms. A `Promise.resolve()` for 0 ms only flushes the microtask queue and does not yield to macrotasks (where websocket messages dispatch), so a 100%-jitter roll of 0 ms would otherwise also block event delivery.

### Property inspector quirks

- Plain HTML elements (`<small>`, `<div>`, plain text) inherit the Stream Deck PI webview's default font, which on macOS WebKit is **Times serif**. The `<style>` block sets `body { font-family: <system stack> }` to fix this. sdpi-components style their own shadow DOMs and are unaffected.
- `sdpi-checkbox` value is a real boolean; `default="true"` is the initial display value when the setting is undefined — it doesn't necessarily auto-persist until the user touches the form.
- Cycle and Random mode checkboxes are mutually exclusive — an inline script in the PI unchecks the counterpart when one is toggled on.

### Settings schema

`TypeSettings` in `src/actions/fake-type.ts` is the source of truth for the runtime contract. Number fields are stored as strings by sdpi-textfield, so the runtime always re-parses through `toNumber(value, fallback)`. The `DEFAULTS` object holds the fallback used when a field is missing or unparseable — keep this in sync with the `placeholder=` / `default=` attributes in `ui/fake-type.html`.

### Manifest

`com.ewels.type-deck.sdPlugin/manifest.json` declares `Software.MinimumVersion: "7.1"` and `SDKVersion: 3`. The manifest's `$schema` URL points at Elgato's JSON schema; VS Code also has a schema mapping in `.vscode/settings.json`. The 7.1 branch of the schema marks `Software`, `Actions`, `Author`, `CodePath`, `Description`, `Icon`, `Name`, `OS`, `SDKVersion`, `UUID`, `Version` as required.
