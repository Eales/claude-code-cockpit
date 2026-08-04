# claude-code-cockpit

Plugin do Claude Code: czytelny statusline z limitami 5h/7d i stanem gita oraz
auto-wznawianie sesji po odnowieniu limitu.

[![Licencja: MIT](https://img.shields.io/badge/Licencja-MIT-green.svg)](LICENSE)
![Wersja](https://img.shields.io/badge/wersja-0.2.0-blue.svg)
![Platforma](https://img.shields.io/badge/statusline-wieloplatformowy-lightgrey.svg)
![Hook](https://img.shields.io/badge/auto--wznawianie-Windows%20%2F%20pwsh-lightgrey.svg)

> **Zanim zainstalujesz:** statusline działa wszędzie, gdzie jest Node.js. Auto-wznawianie
> wymaga PowerShell 7 (`pwsh`), więc dziś działa na Windowsie — port na bash to przepisanie
> jednego skryptu, patrz [Wymagania i ograniczenia](#wymagania-i-ograniczenia).

```
Opus 5 (1M context) | ▸ Cache parsera | ⎇ feature/parser-cache (wt) ↑2 ↓1 🖉 3 +1 | ctx 5% z 1000k | $0.56 | 5h [###-------] 33% (reset 13:40) | 7d [##--------] 21% (reset 07.08)
```

## Co robi

**Statusline** — jeden skrypt Node (~0,25 s), wszystkie segmenty opcjonalne (brak danych = brak segmentu):

| Segment | Znaczenie |
|---|---|
| `Opus 5 (1M context)` | model |
| `fast` | włączony tryb fast |
| `▸ nazwa` | nazwa sesji, skracana do 30 znaków — ratuje przy kilku otwartych terminalach |
| `⎇ branch` | branch; `(wt)` gdy jesteś w worktree, `(wt: nazwa)` gdy nazwa drzewa mówi coś więcej |
| `↑2` / `↓1` | commity do wypchnięcia / do dociągnięcia |
| `🖉 3` / `+1` / `!1` | zmodyfikowane / nieśledzone / konflikty |
| `ctx 5% z 1000k` | zużycie okna kontekstu |
| `$0.56` | koszt sesji |
| `5h` / `7d` | limity z paskiem, procentem i godziną resetu |

Kolory progowe: zielony < 60%, żółty od 60%, czerwony od 85% — osobno dla każdego okna.
Stan gita to jedno wywołanie `git status --porcelain=v2 --branch`; gdy w wielkim repo nie
wyrobi się w 1,5 s, zostaje sam branch zamiast pustego paska.

**Auto-wznawianie po limicie** — gdy tura padnie z powodu wyczerpanego limitu, hook
`StopFailure` (matcher `rate_limit`) czeka do resetu i budzi **tę samą sesję** komunikatem
„kontynuuj przerwaną pracę". Sesja wraca z pełnym kontekstem, w tym samym worktree.

Mechanizm: flaga `asyncRewake` — hook działa w tle nie blokując sesji, a wyjście z **kodem 2**
budzi model i przekazuje mu stdout hooka jako system-reminder. Skrypt nie uruchamia żadnego
procesu i nie zmienia uprawnień: czekanie i budzenie robi sam Claude Code.

Czas resetu (`resets_at`) Claude Code podaje **tylko** statuslinowi — dlatego statusline
zapisuje limity do `~/.claude/rate-limits.json`, a hook je odczytuje. Nie ma skąd wziąć tej
informacji inaczej: payload hooka `StopFailure` zawiera wyłącznie `session_id`, `prompt_id`,
`transcript_path`, `cwd`, `permission_mode` i `hook_event_name`, CLI nie ma komendy zwracającej
limity, a `~/.claude.json` trzyma tylko poziom taryfowy (`userRateLimitTier`), bez `resets_at`.

Stąd trzy zachowania hooka:

| Stan | Reakcja |
|---|---|
| któreś okno ≥ 90% | czeka do `resets_at` + 60 s, budzi sesję |
| żadne okno nie wyczerpane | kończy od razu, **nie budzi** |
| brak pliku limitów | kończy od razu, **nie budzi** — i wpisuje do logu, żeby uruchomić `/cockpit-statusline` |

Hook nigdy nie budzi sesji, jeśli nie zna konkretnego czasu resetu. Powód: budzenie „w ciemno"
niczego nie sprawdza, a każde przebudzenie potrafi wywołać kolejne — czyli pętlę. Czekanie na
pojawienie się pliku też nie ma sensu: statusline zapisuje go przy **każdym** renderze, więc
jego brak nie oznacza „jeszcze nie zdążył", tylko „statusline nie jest zainstalowany" — i za
kwadrans będzie tak samo.

## Instalacja

```
/plugin marketplace add Eales/claude-code-cockpit
/plugin install claude-code-cockpit
```

Potem raz:

```
/cockpit-statusline
```

Pluginy nie mogą same ustawiać `statusLine`, więc ta komenda wpisuje go do
`~/.claude/settings.json` (pytając, jeśli masz już własny) i weryfikuje działanie.

Hook auto-wznawiania wczytuje się po **restarcie CLI**.

### Aktualizacja

```
/plugin marketplace update cockpit    # pobierz najnowszy stan marketplace'u
/plugin update claude-code-cockpit    # zaktualizuj sam plugin
```

Statusline aktualizuje się razem z pluginem tylko wtedy, gdy w `~/.claude/settings.json`
wskazuje na katalog instalacji pluginu. Jeśli podałeś ścieżkę do własnego klona repo
(wygodne przy rozwijaniu), zmiany widać od razu po `git pull`, bez aktualizacji pluginu.

### Wersje

Wersjonowanie zgodne z [SemVer](https://semver.org/lang/pl/), zmiany opisane w
[CHANGELOG.md](CHANGELOG.md). Wydania są tagowane w formacie oczekiwanym przez Claude Code:

```
claude plugin tag --push        # tworzy tag claude-code-cockpit--v<wersja>
```

Tag powstaje na podstawie pola `version` z `.claude-plugin/plugin.json`, a polecenie
sprawdza przy okazji, czy manifest pluginu i wpis w marketplace się zgadzają.

## Komendy

| Komenda | Co robi |
|---|---|
| `/cockpit-statusline` | instaluje statusline w ustawieniach użytkownika |
| `/cockpit-worktree-setup` | konfiguruje bieżące repo pod worktree: `baseRef`, `.worktreeinclude`, oszacowanie kosztu dysku |

## Praca na worktree

```
claude --worktree parser-cache       # worktree + branch + sesja
claude --worktree --tmux raport-csv  # to samo w osobnym oknie tmux
claude --from-pr 128                 # cudzy PR do review, bez ruszania swojej pracy
claude -r                            # powrót do wątku (wybór po nazwie sesji)
```

Worktree lądują w `.claude/worktrees/<nazwa>`, branch dostaje nazwę `worktree-<nazwa>` —
pod własną konwencję: `git branch -m feature/parser-cache`.

W dużym repozytorium nowe drzewo zajmuje mniej miejsca, niż wynikałoby z rozmiaru źródeł:
obiekty `.git` są współdzielone i nie duplikują się. `/cockpit-worktree-setup` szacuje ten
koszt dla Twojego repo, zanim cokolwiek utworzysz.

`/cockpit-worktree-setup` ustawia `"worktree": {"baseRef": "fresh"}` — nowe drzewo odbija się
od `origin/<default-branch>`, nie od Twojego HEAD-a — oraz `.worktreeinclude` z listą lokalnych
plików konfiguracyjnych kopiowanych do świeżego drzewa (`.claude/settings.local.json`
kopiuje się sam).

## Wymagania i ograniczenia

- **Windows + PowerShell 7 (`pwsh`)** — hook jest skryptem `.ps1`. Port na bash: przepisać
  `scripts/resume-after-rate-limit.ps1`, logika to „policz czas do resetu, poczekaj, `exit 2`".
- **Node.js w PATH** — dla statuslinu.
- **Terminal musi zostać otwarty** przy limicie: to ta sama sesja czeka na przebudzenie.
- **Limit 7-dniowy** — hook odczeka maksymalnie ~6 h (`timeout: 21600`), więc przy 7d
  obudzi sesję i, jeśli limit wciąż trzyma, cykl się powtórzy.
- **Uprawnienia zostają normalne** — po przebudzeniu narzędzie wymagające zgody nadal o nią
  poprosi. Nic nie jest akceptowane bez użytkownika.
- **Statusline jest wymagany** do auto-wznawiania — bez niego hook nie zna `resets_at` i kończy
  bez budzenia sesji. Nie jest to opcjonalny dodatek do drugiej funkcji, tylko jej źródło danych.
- Log hooka: `~/.claude/cockpit-resume.log`.

## Struktura repozytorium

```
.claude-plugin/
  plugin.json        # manifest pluginu (nazwa, wersja, metadane)
  marketplace.json   # wpis marketplace'u - pozwala instalowac wprost z tego repo
commands/            # komendy /cockpit-*
hooks/hooks.json     # rejestracja hooka StopFailure (matcher rate_limit, asyncRewake)
scripts/
  statusline.js      # statusline; zapisuje tez ~/.claude/rate-limits.json
  resume-after-rate-limit.ps1   # hook: czeka do resetu i budzi sesje
```

## Rozwój

Zmiany warto sprawdzić przed wysłaniem:

```
claude plugin validate . --strict     # manifesty
node scripts/statusline.js            # podaj na stdin przykladowy JSON sesji
```

Skrypt hooka da się przetestować bez czekania na prawdziwy limit — przyjmuje ścieżki
i progi jako parametry:

```
'{"session_id":"test"}' | pwsh -File scripts/resume-after-rate-limit.ps1 `
  -RateLimitsFile ./przyklad.json -MaxSleepSeconds 5
```

Uwagi i błędy: [Issues](https://github.com/Eales/claude-code-cockpit/issues).

## Licencja

MIT — patrz [LICENSE](LICENSE).

## Status weryfikacji

Sprawdzone realnie: wszystkie trzy ścieżki skryptu hooka (okno wyczerpane → czeka do resetu
i wychodzi z kodem 2; limity znane i niewyczerpane → wychodzi natychmiast bez budzenia; brak
pliku limitów → to samo, plus wskazówka w logu), statusline na prawdziwym repo i w worktree,
`baseRef: fresh` (nowy branch odbił się od domyślnej gałęzi zdalnej, nie od lokalnego HEAD-a),
kopiowanie plików z `.worktreeinclude`.

**Sprawdzone na prawdziwym limicie (4.08.2026).** Hook dostał sygnał `rate_limit`, odczekał
i obudził sesję — mechanizm `asyncRewake` + `exit 2` działa: model dostał stdout hooka jako
system-reminder i wrócił do przerwanej pracy z pełnym kontekstem.

Ten sam test ujawnił pętlę: statusline nie był wtedy zainstalowany, więc hook nie znał
`resets_at` i budził sesję co 15 min bez końca (`~/.claude/cockpit-resume.log`, 18:54 → 21:58,
pięć przebudzeń). Stąd zasada, że hook budzi sesję **wyłącznie** wtedy, gdy zna konkretny
czas resetu, a w każdym innym przypadku kończy się natychmiast.

Dwa zastrzeżenia, o których warto wiedzieć:

- Dokumentacja hooków opisuje `StopFailure` jako zdarzenie obserwacyjne („output and exit code
  are ignored"), a obserwowane zachowanie jest inne — `exit 2` faktycznie budzi sesję. Plugin
  opiera się więc na zachowaniu, które nie jest w tej formie udokumentowane i może się zmienić.
- Skrypt ma zabezpieczenie na pole `error` w payloadzie, ale udokumentowany payload `StopFailure`
  takiego pola nie zawiera — o tym, że chodzi o limit, decyduje wyłącznie `matcher` w `hooks.json`.
