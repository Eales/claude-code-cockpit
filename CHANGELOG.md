# Changelog

Format wzorowany na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie zgodne z [SemVer](https://semver.org/lang/pl/).

## [0.2.0] - 2026-08-04

### Zmienione

- **Hook budzi sesję wyłącznie wtedy, gdy zna konkretny czas resetu.** Wcześniej przy braku
  `~/.claude/rate-limits.json` odczekiwał 15 minut i budził sesję „w ciemno", co przy
  niezainstalowanym statuslinie dawało nieskończoną pętlę przebudzeń (potwierdzone na żywym
  limicie: pięć przebudzeń między 18:54 a 21:58). Teraz brak pliku limitów oraz brak
  wyczerpanego okna kończą się natychmiastowym `exit 0` z wpisem w logu.
- Metadane pluginu: `displayName`, `homepage`, `repository`, `license`, `keywords`;
  marketplace dostał `description`. `claude plugin validate --strict` przechodzi.

### Usunięte

- Fallbackowe „ślepe próby" wraz z licznikiem prób i plikiem stanu
  `~/.claude/cockpit-resume-state.json` — niepotrzebne, skoro hook nie budzi bez znajomości
  czasu resetu. Parametry `FallbackSleepSeconds` i `MaxFallbackAttempts` zniknęły ze skryptu.

### Dodane

- Licencja MIT.
- `.gitignore` — wcześniej `.claude/settings.local.json` chronił tylko globalny gitignore autora.

## [0.1.0] - 2026-08-04

### Dodane

- **Statusline** (`scripts/statusline.js`): model, tryb fast, nazwa sesji, branch z ahead/behind
  i licznikiem zmian, marker worktree, okno kontekstu, koszt sesji, limity 5h/7d z czasem resetu.
  Zapisuje limity do `~/.claude/rate-limits.json` — to jedyne miejsce, w którym Claude Code
  udostępnia `resets_at`.
- **Auto-wznawianie po limicie**: hook `StopFailure` (matcher `rate_limit`) z `asyncRewake`
  czeka do resetu i budzi tę samą sesję kodem wyjścia 2.
- Komendy `/cockpit-statusline` i `/cockpit-worktree-setup`.

[0.2.0]: https://github.com/Eales/claude-code-cockpit/releases/tag/claude-code-cockpit--v0.2.0
