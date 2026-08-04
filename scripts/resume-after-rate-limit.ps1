# Hook StopFailure (matcher: rate_limit), uruchamiany jako asyncRewake.
#
# Zasada dzialania: skrypt nie uruchamia zadnego procesu i nic nie zmienia na dysku
# poza wlasnym logiem. Czeka do momentu resetu limitu, wypisuje komunikat i konczy
# sie kodem 2 - to jest sygnal, po ktorym Claude Code budzi TE SAMA sesje
# i przekazuje modelowi tekst ze stdout jako system-reminder.
#
# Czas resetu pochodzi z ~/.claude/rate-limits.json, ktory zapisuje statusline
# (jedyne miejsce, gdzie Claude Code udostepnia resets_at). Gdy tego czasu nie znamy,
# skrypt konczy sie od razu i nie budzi sesji: budzenie "w ciemno" nie wnosi nic
# poza ryzykiem petli przebudzen.

[CmdletBinding()]
param(
  # Parametry sa wystawione glownie po to, zeby dzialanie dalo sie przetestowac
  # bez czekania na prawdziwy reset limitu.
  [string]$RateLimitsFile = (Join-Path $HOME '.claude/rate-limits.json'),
  [int]$MaxSleepSeconds = 21000,
  [int]$BufferSeconds = 60
)

$ErrorActionPreference = 'Stop'
# Log w stalym miejscu, niezaleznym od katalogu instalacji pluginu.
$logDir = Join-Path $HOME '.claude'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'cockpit-resume.log'

function Write-Log($msg) {
  try {
    Add-Content -Path $logFile -Encoding utf8 -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
  } catch { }
}

# Payload hooka czytamy tylko dla logu - decyzja "czy reagowac" nalezy do matchera.
$sessionId = ''
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw) {
    $payload = $raw | ConvertFrom-Json
    $sessionId = [string]$payload.session_id
    # Zabezpieczenie na wyrost: udokumentowany payload StopFailure nie zawiera pola
    # `error` (jest tylko session_id, prompt_id, transcript_path, cwd, permission_mode,
    # hook_event_name), wiec o tym, czy to limit, decyduje matcher w hooks.json.
    if ($payload.error -and $payload.error -ne 'rate_limit') {
      Write-Log "pomijam: error=$($payload.error) (nie limit)"
      exit 0
    }
  }
} catch {
  Write-Log "nie udalo sie odczytac payloadu: $($_.Exception.Message)"
}

# Bez pliku limitow nie mamy skad poznac czasu resetu: payload hooka go nie zawiera,
# CLI nie ma komendy zwracajacej limity, a ~/.claude.json trzyma tylko poziom taryfowy.
# Statusline zapisuje ten plik przy kazdym renderze, wiec jego brak oznacza, ze
# statusline nie jest zainstalowany - czekanie niczego nie zmieni.
if (-not (Test-Path $RateLimitsFile)) {
  Write-Log "brak $RateLimitsFile - nie znam czasu resetu, koncze bez budzenia (uruchom /cockpit-statusline)"
  exit 0
}

# Wybieramy najblizszy reset wsrod okien, ktore sa faktycznie wyczerpane.
$now = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$resetAt = 0
$window = ''
try {
  $rl = Get-Content $RateLimitsFile -Raw | ConvertFrom-Json
  foreach ($w in @(
      @{ name = '5h'; data = $rl.five_hour },
      @{ name = '7d'; data = $rl.seven_day })) {
    $d = $w.data
    if ($d -and [int]$d.used_percentage -ge 90 -and [int]$d.resets_at -gt $now) {
      if ($resetAt -eq 0 -or [int]$d.resets_at -lt $resetAt) {
        $resetAt = [int]$d.resets_at
        $window = $w.name
      }
    }
  }
} catch {
  Write-Log "blad odczytu limitow: $($_.Exception.Message) - koncze bez budzenia"
  exit 0
}

# Zadne okno nie jest wyczerpane - nie ma na co czekac. Bez tego wyjscia hook usypia
# i budzi sesje bez powodu, a kazde takie przebudzenie moze wywolac kolejne.
if ($resetAt -eq 0) {
  Write-Log 'zadne okno nie jest wyczerpane - koncze bez budzenia'
  exit 0
}

$sleep = $resetAt - $now + $BufferSeconds
$resetLocal = ([DateTimeOffset]::FromUnixTimeSeconds($resetAt).ToLocalTime()).ToString('HH:mm')

if ($sleep -lt 5) { $sleep = 5 }
if ($sleep -gt $MaxSleepSeconds) { $sleep = $MaxSleepSeconds }

Write-Log ("limit wyczerpany (okno={0}, reset={1}, sesja={2}) - czekam {3}s" -f `
  $window, $resetLocal, ($sessionId ? $sessionId : 'n/d'), $sleep)

Start-Sleep -Seconds $sleep

Write-Log 'czas resetu minal - budze sesje (exit 2)'

# Ten tekst trafia do modelu jako system-reminder po przebudzeniu sesji.
Write-Output "Limit zostal odnowiony (okno $window, reset $resetLocal). Kontynuuj przerwana prace tam, gdzie sie zatrzymala: sprawdz aktualny stan i dokoncz niedokonczony krok wedlug wczesniejszych ustalen. Nie zaczynaj zadania od nowa."
exit 2
