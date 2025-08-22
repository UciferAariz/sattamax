import React, { useMemo, useState } from "react";

// --- Utility helpers ---
const format = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Basic multipliers for Mines (approx, not exact Stake odds)
function minesMultiplier(safeReveals, totalTiles, mines) {
  // Simple fair-ish formula: payout = bet * ( (totalTiles) / (totalTiles - mines) )^(safeReveals) * 0.97 (house edge simulation)
  // Since we are using game credits only, we keep a tiny edge for realism; set to 1.00 if you want zero edge.
  const edge = 0.99; // softer edge for fun
  if (safeReveals === 0) return 1;
  const base = totalTiles / (totalTiles - mines);
  return Math.pow(base, safeReveals) * edge;
}

// Plinko multipliers presets (very simplified)
const PLINKO_PRESETS = {
  low: {
    8: [0.5, 0.75, 0.9, 1, 3, 1, 0.9, 0.75, 0.5],
    12: [0.5, 0.75, 0.9, 1, 2, 3, 2, 1, 0.9, 0.75, 0.5, 0.3, 0.3],
    16: [0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 2, 1.5, 1, 0.75, 0.5, 0.3, 0.2, 0.2, 0.2],
  },
  medium: {
    8: [0.3, 0.6, 0.9, 1, 3, 1, 0.9, 0.6, 0.3],
    12: [0.2, 0.35, 0.6, 0.9, 1.3, 3.5, 1.3, 0.9, 0.6, 0.35, 0.2, 0.2, 0.2],
    16: [0.1, 0.2, 0.35, 0.6, 0.9, 1.3, 2, 5, 2, 1.3, 0.9, 0.6, 0.35, 0.2, 0.1, 0.1, 0.1],
  },
  high: {
    8: [0.2, 0.4, 0.7, 1, 9, 1, 0.7, 0.4, 0.2],
    12: [0.1, 0.2, 0.35, 0.6, 1, 9, 9, 1, 0.6, 0.35, 0.2, 0.1, 0.1],
    16: [0.05, 0.1, 0.2, 0.35, 0.6, 1, 2, 26, 26, 2, 1, 0.6, 0.35, 0.2, 0.1, 0.05, 0.05],
  },
};

export default function App() {
  const [tab, setTab] = useState("mines");
  const [balance, setBalance] = useState(() => {
    const v = localStorage.getItem("balance");
    return v ? Number(v) : 1000;
  });
  const [bet, setBet] = useState(10);

  React.useEffect(() => {
    localStorage.setItem("balance", balance);
  }, [balance]);

  const canBet = bet > 0 && bet <= balance;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <TopBar balance={balance} setBalance={setBalance} />

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6 p-4">
        <Controls
          bet={bet}
          setBet={(v) => setBet(Math.min(Math.max(Number(v) || 0, 0), 1_000_000))}
          canBet={canBet}
        />

        <div className="bg-slate-800/60 rounded-2xl p-4 shadow-xl border border-slate-700/50">
          <div className="flex gap-2 mb-4">
            <TabButton active={tab === "mines"} onClick={() => setTab("mines")}>Mines</TabButton>
            <TabButton active={tab === "plinko"} onClick={() => setTab("plinko")}>Plinko</TabButton>
          </div>

          {tab === "mines" ? (
            <Mines bet={bet} canBet={canBet} balance={balance} setBalance={setBalance} />
          ) : (
            <Plinko bet={bet} canBet={canBet} balance={balance} setBalance={setBalance} />
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

function TopBar({ balance, setBalance }) {
  return (
    <div className="border-b border-slate-800/80 bg-slate-900/60 sticky top-0 backdrop-blur z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500 grid place-items-center font-black text-slate-900">GC</div>
          <span className="font-semibold tracking-wide">GameCredits Casino</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs"
            onClick={() => setBalance((b) => b + 100)}
            title="Get daily faucet"
          >+100 Faucet</button>
          <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-sm">Balance: <b>{format(balance)}</b> GC</div>
        </div>
      </div>
    </div>
  );
}

function Controls({ bet, setBet, canBet }) {
  const half = () => setBet((v) => Math.max(0.01, Math.floor((v / 2) * 100) / 100));
  const dbl = () => setBet((v) => Math.floor((v * 2) * 100) / 100);

  return (
    <aside className="bg-slate-800/60 rounded-2xl shadow-xl border border-slate-700/50 p-4 h-fit">
      <div className="flex rounded-xl bg-slate-900/40 p-1 w-full mb-4">
        <span className="flex-1 text-center py-1 rounded-lg bg-slate-900/60 font-medium">Manual</span>
        <span className="flex-1 text-center py-1 opacity-60">Auto (coming soon)</span>
      </div>

      <label className="block text-sm mb-1">Bet amount</label>
      <div className="flex gap-2 mb-4">
        <input
          type="number"
          step="0.01"
          min="0"
          className="flex-1 rounded-xl bg-slate-900/60 border border-slate-700 p-2 outline-none"
          value={bet}
          onChange={(e) => setBet(e.target.value)}
        />
        <button onClick={half} className="px-3 rounded-xl bg-slate-700/80">½</button>
        <button onClick={dbl} className="px-3 rounded-xl bg-slate-700/80">2×</button>
      </div>

      <div className="text-xs text-slate-400">Credits only • No real money • For fun</div>

      {!canBet && (
        <div className="mt-3 text-amber-300 text-sm">Bet must be greater than 0 and not exceed your balance.</div>
      )}
    </aside>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl border ${active ? "bg-slate-900 border-slate-600" : "bg-slate-800/50 border-slate-700 hover:bg-slate-800"}`}
    >{children}</button>
  );
}

// --- MINES ---
function Mines({ bet, canBet, balance, setBalance }) {
  const size = 5; // 5x5
  const totalTiles = size * size;
  const [mines, setMines] = useState(6);
  const [round, setRound] = useState(null); // { bombs:Set<number>, revealed:Set<number>, state:"idle|live|lost|won", safe:number }
  const [pendingCashout, setPendingCashout] = useState(0);

  const startRound = () => {
    if (!canBet) return;
    if (round?.state === "live") return;
    // take bet
    setBalance((b) => b - bet);
    const bombs = new Set();
    while (bombs.size < mines) {
      bombs.add(Math.floor(Math.random() * totalTiles));
    }
    setRound({ bombs, revealed: new Set(), state: "live", safe: 0 });
    setPendingCashout(0);
  };

  const clickTile = (idx) => {
    if (!round || round.state !== "live") return;
    if (round.revealed.has(idx)) return;
    const newRevealed = new Set(round.revealed);
    newRevealed.add(idx);
    if (round.bombs.has(idx)) {
      setRound({ ...round, revealed: newRevealed, state: "lost" });
      setPendingCashout(0);
      return;
    }
    const safe = round.safe + 1;
    const mult = minesMultiplier(safe, totalTiles, mines);
    const potential = bet * mult;
    setRound({ ...round, revealed: newRevealed, safe });
    setPendingCashout(potential);
  };

  const cashout = () => {
    if (pendingCashout > 0 && round?.state !== "lost") {
      setBalance((b) => b + pendingCashout);
      setRound({ ...round, state: "won" });
      setPendingCashout(0);
    }
  };

  const reset = () => setRound(null);

  return (
    <div className="grid lg:grid-cols-[280px,1fr] gap-6">
      <div>
        <label className="block text-sm mb-1">Mines</label>
        <select
          className="w-full rounded-xl bg-slate-900/60 border border-slate-700 p-2 mb-3"
          value={mines}
          onChange={(e) => setMines(Number(e.target.value))}
          disabled={round?.state === "live"}
        >
          {[2,3,4,5,6,8,10,12,15,18,20,22,24].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <button
          className={`w-full py-3 rounded-xl font-semibold ${round?.state === "live" ? "bg-amber-500 text-slate-900" : "bg-emerald-500 text-slate-900"}`}
          onClick={round?.state === "live" ? cashout : startRound}
        >{round?.state === "live" ? `Cashout ${format(pendingCashout)} GC` : `Bet ${format(bet)} GC`}</button>

        <div className="mt-3 text-sm text-slate-300">
          {round ? (
            <>
              <div>State: <b className="capitalize">{round.state}</b></div>
              <div>Safe reveals: <b>{round.safe}</b></div>
              <div>Mines: <b>{mines}</b> • Tiles: <b>{totalTiles}</b></div>
              {(round.state === "lost" || round.state === "won") && (
                <button onClick={reset} className="mt-3 px-3 py-1.5 rounded-lg bg-slate-700">New round</button>
              )}
            </>
          ) : (
            <div>Press <b>Bet</b> to begin a round.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 place-items-center">
        {Array.from({ length: totalTiles }).map((_, idx) => {
          const isRevealed = round?.revealed?.has(idx);
          const isBomb = round?.bombs?.has(idx);
          const show = isRevealed || (round && round.state !== "live");
          return (
            <button
              key={idx}
              onClick={() => clickTile(idx)}
              disabled={!round || round.state !== "live"}
              className={`h-20 w-20 rounded-xl grid place-items-center text-2xl select-none border transition ${
                show ? (isBomb ? "bg-red-600/30 border-red-500" : "bg-emerald-600/30 border-emerald-400") : "bg-slate-900/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              {show ? (isBomb ? "💣" : "💎") : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- PLINKO ---
function Plinko({ bet, canBet, balance, setBalance }) {
  const [rows, setRows] = useState(16);
  const [risk, setRisk] = useState("medium");
  const multipliers = useMemo(
    () => PLINKO_PRESETS[risk][rows] || PLINKO_PRESETS.medium[16],
    [risk, rows]
  );
  const [lastWin, setLastWin] = useState(null);
  const [ball, setBall] = useState(null); // {row,col,x,y,running}

  // --- Layout: use normalized units inside SVG (0..1000) and scale with viewBox
  const VB_W = 1000;
  const VB_H = 750;         // overall height of the SVG area
  const PAD_X = 120;        // roomy left/right padding
  const PAD_TOP = 60;       // roomy top padding
  const PAD_BOTTOM = 220;   // reserve space for labels beneath the pegs

  const pegYGap = (VB_H - PAD_TOP - PAD_BOTTOM) / (rows - 1);
  const pegXGap = 46;       // horizontal distance between pegs on same row
  const pegR = 7;           // peg radius
  const ballR = 10;

  // compute X of col on row (row has row+1 pegs)
  const xFor = (row, col) => {
    const count = row + 1;
    const rowWidth = (count - 1) * pegXGap;
    const left = VB_W / 2 - rowWidth / 2;
    return left + col * pegXGap;
  };
  const yFor = (row) => PAD_TOP + row * pegYGap;

  const drop = () => {
    if (!canBet || ball?.running) return;
    setBalance((b) => b - bet);

    let r = -1;
    let c = 0;
    setBall({ row: r, col: c, x: VB_W / 2, y: PAD_TOP - 40, running: true });

    const step = () => {
      r += 1;
      if (r >= rows) {
        const slot = Math.max(0, Math.min(multipliers.length - 1, c));
        const mult = multipliers[slot] ?? 0;
        const win = bet * mult;
        setBalance((b) => b + win);
        setLastWin({ mult, win, slot });
        setBall((b) => b && { ...b, running: false });
        return;
      }
      c += Math.random() < 0.5 ? 0 : 1;
      setBall({ row: r, col: c, x: xFor(r, c), y: yFor(r), running: true });
      setTimeout(step, 160);
    };
    setTimeout(step, 160);
  };

  return (
    <div className="grid lg:grid-cols-[320px,1fr] gap-6">
      {/* Controls */}
      <div>
        <label className="block text-sm mb-1">Risk</label>
        <select
          className="w-full rounded-xl bg-slate-900/60 border border-slate-700 p-2 mb-3"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          disabled={ball?.running}
        >
          {["low", "medium", "high"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <label className="block text-sm mb-1">Rows</label>
        <select
          className="w-full rounded-xl bg-slate-900/60 border border-slate-700 p-2 mb-4"
          value={rows}
          onChange={(e) => setRows(Number(e.target.value))}
          disabled={ball?.running}
        >
          {[8, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <button
          onClick={drop}
          disabled={!canBet || ball?.running}
          className={`w-full py-3 rounded-xl font-semibold ${
            !canBet || ball?.running
              ? "bg-slate-700 text-slate-400 cursor-not-allowed"
              : "bg-emerald-500 text-slate-900"
          }`}
        >
          {ball?.running ? "Dropping…" : `Drop Ball (Bet ${format(bet)} GC)`}
        </button>

        {lastWin && (
          <div className="mt-3 text-sm">
            Last drop → Mult: <b>{lastWin.mult}x</b> • Won: <b>{format(lastWin.win)} GC</b> • Slot #{lastWin.slot}
          </div>
        )}
      </div>

      {/* Board + labels */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
          {/* SVG board keeps big airy spacing like Stake */}
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full block rounded-xl"
            style={{ display: "block" }}
          >
            {/* inner rounded panel */}
            <rect x="8" y="8" width={VB_W - 16} height={VB_H - 16} rx="24" ry="24" fill="transparent" stroke="rgba(100,116,139,0.4)" />

            {/* PEGS */}
            {Array.from({ length: rows }).map((_, r) => {
              const count = r + 1;
              return Array.from({ length: count }).map((_, c) => (
                <circle
                  key={`${r}-${c}`}
                  cx={xFor(r, c)}
                  cy={yFor(r)}
                  r={pegR}
                  fill="rgba(148,163,184,0.85)"
                />
              ));
            })}

            {/* BALL */}
            {ball && (
              <circle
                cx={ball.x}
                cy={ball.y}
                r={ballR}
                fill="#34d399"
                style={{ transition: "cx 150ms linear, cy 150ms linear" }}
              />
            )}
          </svg>

          {/* Payout chips — centered, roomy, never overlap */}
          <div
            className="mt-4 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${multipliers.length}, minmax(48px, 1fr))` }}
          >
            {multipliers.map((m, i) => (
              <div
                key={i}
                className="text-xs text-center px-2 py-1 rounded-lg bg-slate-800 border border-slate-700"
              >
                {m}x
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function Footer() {
  return (
    <div className="mt-10 pb-10 text-center text-xs text-slate-400">
      <div>Built for fun with virtual credits. No real-money wagering. © {new Date().getFullYear()}</div>
      <div className="mt-2">Design inspired by modern crypto casinos — recreated for educational/demo use.</div>
    </div>
  );
}
