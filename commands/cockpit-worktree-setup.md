---
description: Konfiguruje biezace repozytorium pod prace na worktree (baseRef, .worktreeinclude)
allowed-tools: Read, Edit, Write, Bash(git *)
---

Skonfiguruj biezace repozytorium do sensownej pracy na wielu worktree naraz.

Najpierw zbadaj repo, nie zgaduj:

1. `git rev-parse --show-toplevel` — korzen repo. Jesli to nie repo, przerwij i powiedz o tym.
2. `git symbolic-ref refs/remotes/origin/HEAD` — domyslny branch (moze byc `develop`, nie `main`).
3. `git ls-files --others --ignored --exclude-standard --directory` — pliki lokalne
   (ignorowane), ktore w swiezym worktree nie beda istniec. Z tego wybierz **konfiguracje**,
   ktora warto skopiowac (np. `.env`, lokalne pliki ustawien narzedzi).
   **Nie proponuj** kopiowania wynikow buildu (`bin/`, `obj/`, `artifacts/`, `node_modules/`)
   ani cache — kazdy worktree musi miec wlasne, inaczej rownolegle buildy beda sie bic.
4. `du -sh` na korzeniu repo (bez `.git`) — oszacuj koszt dyskowy jednego worktree
   i powiedz uzytkownikowi, ile drzew zmiesci sie sensownie.

Nastepnie zaproponuj i — po akceptacji — zapisz:

- W `.claude/settings.local.json` repozytorium blok:
  ```json
  "worktree": { "baseRef": "fresh", "bgIsolation": "worktree" }
  ```
  `fresh` = nowe worktree odbija sie od `origin/<default-branch>`, a nie od lokalnego HEAD
  (czysty start dla nowego zadania). Uzyj `head`, jesli uzytkownik chce przenosic
  niewypchniete commity. `bgIsolation: worktree` blokuje sesjom w tle edycje glownego checkoutu.
- Plik `.worktreeinclude` w korzeniu repo z lista plikow z punktu 3 (po jednym w linii).
  Claude Code kopiuje je do nowego worktree; `.claude/settings.local.json` kopiuje sie sam.
- Jesli `.worktreeinclude` ma pozostac prywatny, dopisz go do `.git/info/exclude`.
  Jesli ma sluzyc calemu zespolowi — zaproponuj commit, ale **nie commituj bez zgody**.

Na koniec pokaz uzytkownikowi gotowe komendy z jego wlasna konwencja nazw branchy
(sprawdz `git branch -a`, jak nazywaja sie ich galezie) i wyjasnij, ze Claude tworzy
branch `worktree-<nazwa>`, wiec zmiana nazwy to `git branch -m <ich-konwencja>`.
