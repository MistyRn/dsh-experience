# dsh-experience

> A self-learning experience library for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agents: every error, failed command and validated workflow is distilled into a local, human-readable markdown file — searchable, switchable, and injected back into context automatically.

[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.19-339933.svg)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg)](#design)

## Why

Agents rarely fail because they cannot reason — they fail because they **forget**. The same error is debugged from scratch next session; a user preference is restated five turns later; a hard-won deploy sequence is rediscovered by trial and error.

Most memory plugins hide state inside a vector store or a prompt blob. dsh-experience takes the opposite stance: **your experience is plain markdown on your own disk**.

- **Visible** — one `.md` file per lesson, YAML frontmatter for metadata, body in symptom / cause / fix / caveat form.
- **Controllable** — two levels of switches (per category, per item); disabled items leave recall and injection immediately.
- **Auditable** — every mutation appends to `journal.jsonl` with a monotonic `seq`; any change can be reverted.
- **Portable** — uninstall the plugin and the data is still a pile of readable md / json / jsonl files.

## Features

- Zero runtime dependencies, fully offline.
- markdown as the source of truth; `index.json` is derived and rebuildable.
- Nine `exp_*` agent tools: record, list, search, stats, enable, disable, merge, categories, revert.
- Automatic context injection: an overview at session start, plus targeted recall when a tool fails.
- A dedicated sidebar tab: category tree, item list, stats, search, edit, merge, revert, zip export.
- Privacy first: secrets are redacted before writing; blocked kinds are rejected outright.
- Maturity model: new items start as candidates and are promoted as they keep proving useful.

## Install

1. Download `dsh-experience-0.1.0.tgz` from [Releases](../../releases).
2. In DSH's **Plugin Manager**, install it as a local plugin.
3. Restart DSH. A new **Experience** tab appears in the left sidebar.

## Usage

Tell the agent, in plain language:

> Remember: this project uses npm, not pnpm.
> Save that pip SSL error as a lesson.

Or call the tools directly — for example `exp_record(text="pip install fails with SSL certificate verify failed", kind="error", solution="update certifi or add --trusted-host")`.

## Data layout

```text
~/.dsh/experience/
├── README.md        auto-generated overview
├── settings.json    configuration
├── index.json       derived index (safe to delete)
├── journal.jsonl    append-only audit log
├── categories/      one folder per category
└── archive/         reserved for archived items
```

## Configuration

`settings.json` controls the operating mode (`off`, `readonly`, `assisted`, `autonomous`), injection budget (`hotMaxLines`, `recallTopK`, `minConfidence`), and privacy rules (`redactPatterns`, `blockedKinds`).

## Design notes

- Confidence: `confidence = (successes + 0.5) / (hits + 1)`, clamped to [0.1, 1.0]; three successes promote an item to `mature`; items unseen for 90 days are flagged stale.
- Deduplication: cosine similarity over weighted latin tokens and CJK bigrams; near-duplicates return `similar` instead of creating a new file.
- All writes are atomic (temp file + rename) and serialized.

## Development

```bash
node tests/storage.test.mjs     # 14 storage-engine tests
node tests/smoke-host.test.mjs  # host smoke test (9 tools, stubbed dsh-tools)
pnpm pack                       # build the tgz
```

## Contributors

- **MistyRn** — author / maintainer
- **DSH** — design and implementation collaboration
- **DeepSeek V4.1 Flash** — AI pair programmer

> The brain icon paths come from [Lucide](https://lucide.dev) (`brain`, ISC License).

## License

[MIT](LICENSE)
