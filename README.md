**English** | [Polski](README.pl.md)

# claude-code-cockpit

A Claude Code plugin: a readable statusline with 5h/7d rate limits and git state,
plus automatic session resume once your limit renews.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)
![Platform](https://img.shields.io/badge/statusline-cross--platform-lightgrey.svg)
![Hook](https://img.shields.io/badge/auto--resume-Windows%20%2F%20pwsh-lightgrey.svg)

> **Before you install:** the statusline runs anywhere Node.js is available. Auto-resume
> requires PowerShell 7 (`pwsh`), so today it works on Windows — porting it to bash means
> rewriting a single script, see [Requirements and limitations](#requirements-and-limitations).

```
Opus 5 (1M context) | ▸ Parser cache | ⎇ feature/parser-cache (wt) ↑2 ↓1 🖉 3 +1 | ctx 5% of 1000k | $0.56 | 5h [###-------] 33% (reset 13:40) | 7d [##--------] 21% (reset 07.08)
```

## What it does

**Statusline** — a single Node script (~0.25 s). Every segment is optional: no data, no segment.

| Segment | Meaning |
|---|---|
| `Opus 5 (1M context)` | model |
| `fast` | fast mode enabled |
| `▸ name` | session name, truncated to 30 characters — a lifesaver with several terminals open |
| `⎇ branch` | branch; `(wt)` when you are in a worktree, `(wt: name)` when the tree name adds information |
| `↑2` / `↓1` | commits to push / to pull |
| `🖉 3` / `+1` / `!1` | modified / untracked / conflicts |
| `ctx 5% of 1000k` | context window usage |
| `$0.56` | session cost |
| `5h` / `7d` | rate limits with a bar, percentage and reset time |

Threshold colours: green below 60%, yellow from 60%, red from 85% — evaluated per window.
Git state comes from a single `git status --porcelain=v2 --branch` call; if a huge repository
cannot answer within 1.5 s, you get the branch name alone rather than an empty bar.

**Auto-resume after a rate limit** — when a turn fails because your limit is exhausted, a
`StopFailure` hook (matcher `rate_limit`) waits for the reset and wakes **the same session**
with a "carry on with the interrupted work" message. The session returns with its full
context, in the same worktree.

How it works: the `asyncRewake` flag lets the hook run in the background without blocking the
session, and exiting with **code 2** wakes the model, passing the hook's stdout to it as a
system reminder. The script starts no processes and changes no permissions — the waiting and
the waking are done by Claude Code itself.

Claude Code exposes the reset time (`resets_at`) **only** to the statusline, which is why the
statusline persists limits to `~/.claude/rate-limits.json` for the hook to read. There is no
other source: the `StopFailure` payload carries only `session_id`, `prompt_id`,
`transcript_path`, `cwd`, `permission_mode` and `hook_event_name`; the CLI has no command that
returns limits; and `~/.claude.json` holds just the rate limit tier (`userRateLimitTier`),
without `resets_at`.

Hence three behaviours:

| State | Reaction |
|---|---|
| any window ≥ 90% | waits until `resets_at` + 60 s, wakes the session |
| no window exhausted | exits immediately, **no wake-up** |
| limits file missing | exits immediately, **no wake-up** — and logs a hint to run `/cockpit-statusline` |

The hook never wakes a session without knowing a specific reset time. Waking blindly verifies
nothing, and every wake-up can trigger another one — that is a loop. Waiting for the file to
appear makes no sense either: the statusline writes it on **every** render, so its absence does
not mean "not yet", it means "the statusline is not installed" — and fifteen minutes later the
situation is identical.

## Installation

```
/plugin marketplace add Eales/claude-code-cockpit
/plugin install claude-code-cockpit
```

Then once:

```
/cockpit-statusline
```

Plugins cannot set `statusLine` themselves, so this command writes it into
`~/.claude/settings.json` (asking first if you already have one) and verifies that it works.

The auto-resume hook is loaded **after a CLI restart**.

### Updating

```
/plugin marketplace update cockpit    # refresh the marketplace
/plugin update claude-code-cockpit    # update the plugin itself
```

The statusline updates together with the plugin only if `~/.claude/settings.json` points at the
plugin's installation directory. If you pointed it at your own clone of this repository —
convenient while developing — changes take effect straight after `git pull`, with no plugin
update needed.

### Versioning

Versioning follows [SemVer](https://semver.org/); changes are documented in
[CHANGELOG.md](CHANGELOG.md). Releases are tagged in the format Claude Code expects:

```
claude plugin tag --push        # creates the tag claude-code-cockpit--v<version>
```

The tag is derived from the `version` field in `.claude-plugin/plugin.json`, and the command
also checks that the plugin manifest and the marketplace entry agree.

## Commands

| Command | What it does |
|---|---|
| `/cockpit-statusline` | installs the statusline into your user settings |
| `/cockpit-worktree-setup` | configures the current repository for worktrees: `baseRef`, `.worktreeinclude`, disk cost estimate |

## Working with worktrees

```
claude --worktree parser-cache       # worktree + branch + session
claude --worktree --tmux csv-report  # the same in a separate tmux window
claude --from-pr 128                 # review someone's PR without touching your own work
claude -r                            # back to a thread (pick it by session name)
```

Worktrees land in `.claude/worktrees/<name>` and the branch is named `worktree-<name>` — rename
it to your own convention with `git branch -m feature/parser-cache`.

In a large repository a new tree takes less space than the size of the sources suggests: `.git`
objects are shared rather than duplicated. `/cockpit-worktree-setup` estimates that cost for
your repository before you create anything.

`/cockpit-worktree-setup` sets `"worktree": {"baseRef": "fresh"}` — a new tree branches off
`origin/<default-branch>` instead of your HEAD — and writes `.worktreeinclude` listing the local
configuration files to copy into a fresh tree (`.claude/settings.local.json` is copied anyway).

## Requirements and limitations

- **Windows + PowerShell 7 (`pwsh`)** — the hook is a `.ps1` script. To port it to bash, rewrite
  `scripts/resume-after-rate-limit.ps1`; the logic is "work out the time until reset, wait,
  `exit 2`".
- **Node.js on PATH** — for the statusline.
- **The terminal must stay open** during a limit: it is that very session waiting to be woken.
- **The 7-day limit** — the hook waits at most ~6 h (`timeout: 21600`), so with a 7-day window it
  will wake the session and, if the limit still holds, the cycle repeats.
- **Permissions stay normal** — after waking, a tool that needs approval will still ask for it.
  Nothing is auto-approved on your behalf.
- **The statusline is required** for auto-resume — without it the hook has no `resets_at` and
  exits without waking anything. It is not an optional companion to the second feature; it is
  that feature's data source.
- Hook log: `~/.claude/cockpit-resume.log`.

## Repository layout

```
.claude-plugin/
  plugin.json        # plugin manifest (name, version, metadata)
  marketplace.json   # marketplace entry - allows installing straight from this repo
commands/            # the /cockpit-* commands
hooks/hooks.json     # StopFailure hook registration (matcher rate_limit, asyncRewake)
scripts/
  statusline.js      # the statusline; also writes ~/.claude/rate-limits.json
  resume-after-rate-limit.ps1   # the hook: waits for the reset and wakes the session
```

## Development

Worth checking before you submit a change:

```
claude plugin validate . --strict     # manifests
node scripts/statusline.js            # feed it a sample session JSON on stdin
```

The hook script can be exercised without waiting for a real limit — paths and thresholds are
parameters:

```
'{"session_id":"test"}' | pwsh -File scripts/resume-after-rate-limit.ps1 `
  -RateLimitsFile ./sample.json -MaxSleepSeconds 5
```

Feedback and bugs: [Issues](https://github.com/Eales/claude-code-cockpit/issues).

## License

MIT — see [LICENSE](LICENSE).

## Verification status

Verified in practice: all three paths of the hook script (window exhausted → waits for the reset
and exits with code 2; limits known and not exhausted → exits immediately without waking; limits
file missing → the same, plus a hint in the log), the statusline on a real repository and inside
a worktree, `baseRef: fresh` (the new branch started from the default remote branch rather than
the local HEAD), and copying files listed in `.worktreeinclude`.

**Verified against a real rate limit (2026-08-04).** The hook received the `rate_limit` signal,
waited, and woke the session — `asyncRewake` plus `exit 2` does work: the model received the
hook's stdout as a system reminder and returned to the interrupted work with full context.

That same test exposed a loop: the statusline was not installed at the time, so the hook did not
know `resets_at` and kept waking the session every 15 minutes indefinitely (five wake-ups over
three hours in `~/.claude/cockpit-resume.log`). Hence the rule that the hook wakes a session
**only** when it knows a specific reset time, and exits immediately in every other case.

Two caveats worth knowing:

- The hooks documentation describes `StopFailure` as an observational event ("output and exit
  code are ignored"), yet the observed behaviour differs — `exit 2` does wake the session. The
  plugin therefore relies on behaviour that is not documented in this form and may change.
- The script guards against an `error` field in the payload, but the documented `StopFailure`
  payload contains no such field — whether this is a rate limit is decided solely by the
  `matcher` in `hooks.json`.
