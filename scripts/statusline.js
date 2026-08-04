// Statusline dla Claude Code: model, branch, okno kontekstu, koszt sesji, limity 5h / 7d.
// Wejście: JSON na stdin (model.display_name, rate_limits.*, context_window.*, cost.*, workspace.*).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Plik z limitami czyta hook auto-wznawiania, wiec musi lezec w stalym miejscu
// niezaleznie od tego, gdzie zainstalowany jest ten skrypt.
const RATE_LIMITS_FILE = path.join(os.homedir(), '.claude', 'rate-limits.json');

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try {
    d = JSON.parse(raw);
  } catch {
    process.stdout.write('');
    return;
  }

  const C = {
    reset: '\x1b[0m',
    dim: '\x1b[90m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    white: '\x1b[37m',
  };

  const colorFor = pct => (pct >= 85 ? C.red : pct >= 60 ? C.yellow : C.green);

  const bar = (pct, width = 10) => {
    const filled = Math.min(width, Math.max(0, Math.round((pct / 100) * width)));
    return '#'.repeat(filled) + '-'.repeat(width - filled);
  };

  const pad = n => String(n).padStart(2, '0');

  // Reset w tym samym dniu -> godzina, później -> dzień.miesiąc
  const resetLabel = epochSec => {
    if (!epochSec) return null;
    const at = new Date(epochSec * 1000);
    const now = new Date();
    const sameDay =
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth() &&
      at.getDate() === now.getDate();
    return sameDay
      ? `${pad(at.getHours())}:${pad(at.getMinutes())}`
      : `${pad(at.getDate())}.${pad(at.getMonth() + 1)}`;
  };

  const limitSegment = (label, limit) => {
    if (!limit || typeof limit.used_percentage !== 'number') return null;
    const pct = Math.round(limit.used_percentage);
    const col = colorFor(pct);
    const when = resetLabel(limit.resets_at);
    const tail = when ? ` ${C.dim}(reset ${when})${C.reset}` : '';
    return `${col}${label}${C.reset} ${C.white}[${bar(pct)}]${C.reset} ${col}${pct}%${C.reset}${tail}`;
  };

  const git = (dir, args, timeout) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout,
      });
    } catch {
      return null;
    }
  };

  // Jedno wywołanie gita daje branch, ahead/behind i stan plików.
  // Gdy status nie wyrobi się w czasie (duże repo), zostaje sam branch.
  const gitInfo = () => {
    const dir = d.workspace?.current_dir || d.cwd;
    if (!dir) return null;

    const out = git(dir, ['status', '--porcelain=v2', '--branch'], 1500);
    if (out === null) {
      const head = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], 500);
      const branch = head && head.trim();
      return branch && branch !== 'HEAD' ? { branch } : null;
    }

    const info = { ahead: 0, behind: 0, changed: 0, untracked: 0, conflicts: 0 };
    for (const line of out.split('\n')) {
      if (line.startsWith('# branch.head ')) {
        const name = line.slice(14).trim();
        if (name && name !== '(detached)') info.branch = name;
      } else if (line.startsWith('# branch.ab ')) {
        const m = line.match(/\+(\d+)\s+-(\d+)/);
        if (m) {
          info.ahead = Number(m[1]);
          info.behind = Number(m[2]);
        }
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        info.changed++;
      } else if (line.startsWith('u ')) {
        info.conflicts++;
      } else if (line.startsWith('? ')) {
        info.untracked++;
      }
    }
    // Worktree utworzony przez Claude Code leży w .claude/worktrees/<nazwa>,
    // a jego .git to plik-wskaźnik -> git-dir różni się od git-common-dir.
    const dirs = git(dir, ['rev-parse', '--git-dir', '--git-common-dir', '--show-toplevel'], 500);
    if (dirs) {
      const [gitDir, commonDir, toplevel] = dirs.trim().split('\n');
      if (gitDir && commonDir && gitDir !== commonDir && toplevel) {
        info.worktree = toplevel.split('/').pop();
      }
    }

    return info.branch ? info : null;
  };

  const gitSegment = () => {
    const g = gitInfo();
    if (!g) return null;
    let s = `${C.magenta}⎇ ${g.branch}${C.reset}`;
    // Że siedzisz w worktree, chcesz widzieć zawsze; nazwę tylko gdy wnosi coś
    // ponad nazwę brancha (Claude tworzy branch `worktree-<nazwa>`).
    if (g.worktree) {
      const redundant = g.branch.toLowerCase().includes(g.worktree.toLowerCase());
      s += ` ${C.dim}(${redundant ? 'wt' : `wt: ${g.worktree}`})${C.reset}`;
    }
    if (g.ahead) s += ` ${C.green}↑${g.ahead}${C.reset}`;
    if (g.behind) s += ` ${C.cyan}↓${g.behind}${C.reset}`;
    // Spacja po ołówku: glif ✎ w części czcionek jest szerszy niż jego advance
    // width i bez odstępu nachodzi na cyfrę.
    if (g.changed) s += ` ${C.yellow}🖉 ${g.changed}${C.reset}`;
    if (g.untracked) s += ` ${C.dim}+${g.untracked}${C.reset}`;
    if (g.conflicts) s += ` ${C.red}!${g.conflicts}${C.reset}`;
    return s;
  };

  const contextSegment = () => {
    const cw = d.context_window;
    if (!cw || typeof cw.used_percentage !== 'number') return null;
    const pct = Math.round(cw.used_percentage);
    const size = cw.context_window_size;
    const cap = size ? `${Math.round(size / 1000)}k` : null;
    const col = colorFor(pct);
    return `${C.dim}ctx${C.reset} ${col}${pct}%${C.reset}${cap ? ` ${C.dim}z ${cap}${C.reset}` : ''}`;
  };

  const costSegment = () => {
    const usd = d.cost?.total_cost_usd;
    if (typeof usd !== 'number') return null;
    return `${C.dim}$${usd.toFixed(2)}${C.reset}`;
  };

  // Nazwa sesji: przy kilku równoległych terminalach to główny sposób
  // rozpoznania, który wątek jest który. Długie nazwy skracamy.
  const sessionSegment = () => {
    const name = d.session_name;
    if (!name) return null;
    const max = 30;
    const short = name.length > max ? name.slice(0, max - 1).trimEnd() + '…' : name;
    return `${C.white}▸ ${short}${C.reset}`;
  };

  const parts = [];

  const model = d.model?.display_name;
  if (model) parts.push(`${C.cyan}${model}${C.reset}`);

  if (d.fast_mode) parts.push(`${C.yellow}fast${C.reset}`);

  const session = sessionSegment();
  if (session) parts.push(session);

  const gitPart = gitSegment();
  if (gitPart) parts.push(gitPart);

  const ctx = contextSegment();
  if (ctx) parts.push(ctx);

  const cost = costSegment();
  if (cost) parts.push(cost);

  const rl = d.rate_limits || {};

  // Limity utrwalamy na dysku: statusline to jedyne miejsce, gdzie Claude Code
  // podaje resets_at, a auto-wznawianie po limicie musi znać czas resetu.
  if (rl.five_hour || rl.seven_day) {
    try {
      fs.writeFileSync(
        RATE_LIMITS_FILE,
        JSON.stringify({ written_at: Math.floor(Date.now() / 1000), ...rl })
      );
    } catch {}
  }

  const five = limitSegment('5h', rl.five_hour);
  const seven = limitSegment('7d', rl.seven_day);
  if (five) parts.push(five);
  if (seven) parts.push(seven);

  if (!five && !seven) parts.push(`${C.dim}limity: brak danych${C.reset}`);

  process.stdout.write(parts.join(`${C.dim} | ${C.reset}`));
});
