---
description: Instaluje statusline Cockpit w ustawieniach uzytkownika (~/.claude/settings.json)
allowed-tools: Read, Edit, Write, Bash(node *)
---

Zainstaluj statusline z tego pluginu w ustawieniach uzytkownika.

Kontekst: pluginy Claude Code nie moga same ustawic `statusLine` — ten wpis musi
znalezc sie w `~/.claude/settings.json`. Twoim zadaniem jest zrobic to bezpiecznie.

Wykonaj kolejno:

1. Odczytaj `~/.claude/settings.json` (jesli nie istnieje, przyjmij `{}`).
2. Jesli klucz `statusLine` juz istnieje i wskazuje na inny skrypt — **nie nadpisuj go
   po cichu**. Pokaz uzytkownikowi obecna wartosc i zapytaj, czy podmienic.
3. Ustaw:
   ```json
   "statusLine": {
     "type": "command",
     "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/statusline.js\""
   }
   ```
   Podstaw realna, absolutna sciezke do katalogu tego pluginu — zmienna
   `${CLAUDE_PLUGIN_ROOT}` nie jest rozwijana w `settings.json`, wiec wpisz sciezke wprost.
   Sciezke znajdziesz w zmiennej srodowiskowej `CLAUDE_PLUGIN_ROOT` (`echo $env:CLAUDE_PLUGIN_ROOT`)
   albo w katalogu `~/.claude/plugins/`.
4. Zachowaj pozostale klucze w pliku bez zmian i sprawdz, ze wynik jest poprawnym JSON-em.
5. Zweryfikuj dzialanie: uruchom skrypt z przykladowym wejsciem, np.
   `echo '{"model":{"display_name":"Test"},"rate_limits":{"five_hour":{"used_percentage":50,"resets_at":0}}}' | node <sciezka>/scripts/statusline.js`
   i pokaz uzytkownikowi wynik.
6. Powiedz uzytkownikowi, ze zmiana widoczna jest od razu (statusline nie wymaga restartu CLI),
   a wymaganie to Node.js w PATH.
