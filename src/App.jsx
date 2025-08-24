import React, { useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

// --- Utility helpers ---
const format = (n) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Normalize RPC result (Supabase can return a single object or an array)
const takeRow = (data) => (Array.isArray(data) ? data[0] : data) || {};

// ---------- History logger (RPC) ----------
async function logEvent({ game, action, amount, balanceAfter, meta = {} }) {
  try {
    await supabase.rpc("log_wallet_event", {
      p_game: game,
      p_action: action,
      p_amount: amount,
      p_balance_after: balanceAfter,
      p_meta: meta
    });
  } catch (e) {
    console.warn("log_wallet_event failed:", e.message);
  }
}

// ---------- RPC wrappers with logging ----------
async function debit(amount, meta = {}, game = "system") {
  const { data, error } = await supabase.rpc("place_bet", { amount });
  if (error) {
    console.error("[place_bet]", error);
    throw new Error(error.message || "place_bet failed");
  }
  const row = takeRow(data);
  return row;
}

async function credit(amount, meta = {}, game = "system") {
  const { data, error } = await supabase.rpc("payout", { amount });
  if (error) throw error;
  const row = takeRow(data);
  if (row.ok) {
    await logEvent({ game, action: "payout", amount, balanceAfter: Number(row.balance), meta });
  }
  return row; // { balance, ok }
}

// Basic multipliers for Mines (approx)
function minesMultiplier(safeReveals, totalTiles, mines) {
  const edge = 0.99;
  if (safeReveals === 0) return 1;
  const base = totalTiles / (totalTiles - mines);
  return Math.pow(base, safeReveals) * edge;
}

// Plinko multipliers presets (simplified)
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
  const [bet, setBet] = useState(200);

  // --- Supabase auth/session
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [loadingGrant, setLoadingGrant] = useState(true);

  // On load, fetch session and subscribe to changes
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });
    return () => sub.subscription?.unsubscribe?.();
  }, []);

  // When authenticated, call the daily grant RPC to ensure 1000/day
  React.useEffect(() => {
    const run = async () => {
      if (!user) {
        setBalance(0);
        setLoadingGrant(false);
        return;
      }
      setLoadingGrant(true);
      const { data, error } = await supabase.rpc("grant_daily_credits");
      if (error) {
        console.error("grant_daily_credits error:", error);
        setBalance(0);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        const bal = Number(row?.balance || 0);
        setBalance(bal);
        // Log grant if it happened today
        if (row?.granted) {
          await logEvent({ game: "system", action: "grant", amount: 1000, balanceAfter: bal });
        }
      }
      setLoadingGrant(false);
    };
    run();
  }, [user]);

  const canBet = bet > 0 && bet <= balance;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setBalance(0);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 grid place-items-center p-4">
        <LoginCard />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <TopBar
        balance={balance}
        userLabel={user.email || user.id}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6 p-4">
        <Controls
          bet={bet}
          setBet={(v) => setBet(Math.min(Math.max(Number(v) || 0, 200), 1_000_000))}
          canBet={canBet}
        />

        <div className="bg-slate-800/60 rounded-2xl p-4 shadow-xl border border-slate-700/50">
          <div className="flex gap-2 mb-4">
            <TabButton active={tab === "mines"} onClick={() => setTab("mines")}>
              Mines
            </TabButton>
            <TabButton active={tab === "plinko"} onClick={() => setTab("plinko")}>
              Plinko
            </TabButton>
          </div>

          {loadingGrant ? (
            <div className="p-6 text-slate-300">Loading your daily credits…</div>
          ) : tab === "mines" ? (
            <Mines bet={bet} canBet={canBet} balance={balance} setBalance={setBalance} />
          ) : (
            <Plinko bet={bet} canBet={canBet} balance={balance} setBalance={setBalance} />
          )}
        </div>

        {/* Full-width history panel */}
        <div className="lg:col-span-2">
          <HistoryPanel />
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ---------------- UI bits ---------------- */

function TopBar({ balance, userLabel, onLogout }) {
  return (
    <div className="border-b border-slate-800/80 bg-slate-900/60 sticky top-0 backdrop-blur z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500 grid place-items-center font-black text-slate-900">GC</div>
          <span className="font-semibold tracking-wide">AarizGC Casino</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-sm">
            User: <b>{userLabel}</b> • Balance: <b>{format(balance)}</b> GC
          </div>
          <button
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

// Email/password auth
function LoginCard() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e) {
      setErr(e.message || "Auth error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm bg-slate-800/60 border border-slate-700 rounded-2xl p-6 shadow-xl"
    >
      <h1 className="text-xl font-semibold mb-4">
        {mode === "signup" ? "Create account" : "Sign in"}
      </h1>
      <label className="block text-sm mb-1">Email</label>
      <input
        type="email"
        required
        className="w-full rounded-xl bg-slate-900/60 border border-slate-700 p-2 outline-none mb-3"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="block text-sm mb-1">Password</label>
      <input
        type="password"
        required
        className="w-full rounded-xl bg-slate-900/60 border border-slate-700 p-2 outline-none mb-3"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-2.5 rounded-xl font-semibold ${
          loading ? "bg-slate-700" : "bg-emerald-500 text-slate-900"
        }`}
      >
        {loading ? "Please wait…" : mode === "signup" ? "Sign up" : "Sign in"}
      </button>

      <div className="text-xs text-slate-400 mt-3">
        {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="underline"
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </div>
    </form>
  );
}

function Controls({ bet, setBet, canBet }) {
  const MIN_BET = 200;
  const MAX_BET = 1_000_000;

  const half = () => setBet((v) => Math.max(MIN_BET, Math.floor((v / 2) * 100) / 100));
  const dbl = () => setBet((v) => Math.min(MAX_BET, Math.floor(v * 2 * 100) / 100));

  const handleChange = (e) => {
    const raw = Number(e.target.value) || 0;
    const clamped = Math.min(Math.max(raw, MIN_BET), MAX_BET);
    setBet(clamped);
  };

  return (
    <aside className="bg-slate-800/60 rounded-2xl shadow-xl border border-slate-700/50 p-4 h-fit">
      <div className="flex rounded-xl bg-slate-900/40 p-1 w-full mb-4">
        <span className="flex-1 text-center py-1 rounded-lg bg-slate-900/60 font-medium">Manual</span>
        <span className="flex-1 text-center py-1 opacity-60">Auto (coming soon)</span>
      </div>

      <label className="block text-sm mb-1">Bet amount</label>
      <div className="flex gap-2 mb-1">
        <input
          type="number"
          step="10"
          min={MIN_BET}
          className="flex-1 rounded-xl bg-slate-900/60 border border-slate-700 p-2 outline-none"
          value={bet}
          onChange={handleChange}
        />
        <button onClick={half} className="px-3 rounded-xl bg-slate-700/80">½</button>
        <button onClick={dbl} className="px-3 rounded-xl bg-slate-700/80">2×</button>
      </div>
      <div className="text-[11px] text-slate-400 mb-2">Minimum bet: {MIN_BET} GC</div>

      {!canBet && (
        <div className="mt-1 text-amber-300 text-sm">
          Bet must be at least {MIN_BET} GC and not exceed your balance.
        </div>
      )}
    </aside>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl border ${
        active ? "bg-slate-900 border-slate-600" : "bg-slate-800/50 border-slate-700 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Games ---------------- */

// --- MINES (8–24) with server debit/cashout + history
function Mines({ bet, canBet, balance, setBalance }) {
  const size = 5;
  const totalTiles = size * size;
  const [mines, setMines] = useState(8);
  const [round, setRound] = useState(null); // { bombs:Set, revealed:Set, state, safe }
  const [pendingCashout, setPendingCashout] = useState(0);
  const [busy, setBusy] = useState(false);

  const startRound = async () => {
    if (!canBet || busy) return;
    setBusy(true);
    try {
      const res = await debit(bet, { mines }, "mines");
      if (!res.ok) {
        alert("Insufficient funds.");
        return;
      }
      setBalance(Number(res.balance));

      const bombs = new Set();
      while (bombs.size < mines) bombs.add(Math.floor(Math.random() * totalTiles));
      setRound({ bombs, revealed: new Set(), state: "live", safe: 0 });
      setPendingCashout(0);
    } catch (e) {
  console.error(e);
  alert(e.message || "Could not start round. Please try again.");
} finally {
  setBusy(false);
}

  };

  const clickTile = (idx) => {
    if (!round || round.state !== "live") return;
    if (round.revealed.has(idx)) return;

    const revealed = new Set(round.revealed);
    revealed.add(idx);

    if (round.bombs.has(idx)) {
      setRound({ ...round, revealed, state: "lost" });
      setPendingCashout(0);
      return;
    }

    const safe = round.safe + 1;
    const mult = minesMultiplier(safe, totalTiles, mines);
    const potential = bet * mult;
    setRound({ ...round, revealed, safe });
    setPendingCashout(potential);
  };

  const cashout = async () => {
    if (busy || !pendingCashout || round?.state === "lost") return;
    setBusy(true);
    try {
      const mult = minesMultiplier(round.safe, totalTiles, mines);
      const res = await credit(pendingCashout, { mines, safe: round.safe, mult }, "mines");
      if (!res.ok) {
        alert("Cashout failed.");
        return;
      }
      setBalance(Number(res.balance));
      setRound((r) => r && { ...r, state: "won" });
      setPendingCashout(0);
    } catch (e) {
      console.error(e);
      alert("Cashout failed. Please try again.");
    } finally {
      setBusy(false);
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
          disabled={round?.state === "live" || busy}
        >
          {[8, 10, 12, 15, 18, 20, 22, 24].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <button
          className={`w-full py-3 rounded-xl font-semibold ${
            round?.state === "live" ? "bg-amber-500 text-slate-900" : "bg-emerald-500 text-slate-900"
          } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
          onClick={round?.state === "live" ? cashout : startRound}
          disabled={busy}
        >
          {round?.state === "live" ? `Cashout ${format(pendingCashout)} GC` : `Bet ${format(bet)} GC`}
        </button>

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
              disabled={!round || round.state !== "live" || busy}
              className={`h-20 w-20 rounded-xl grid place-items-center text-2xl select-none border transition ${
                show ? (isBomb ? "bg-red-600/30 border-red-500" : "bg-emerald-600/30 border-emerald-400")
                     : "bg-slate-900/60 border-slate-700 hover:border-slate-500"
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

// --- PLINKO (SVG with animated ball) + server debit/payout + history
function Plinko({ bet, canBet, balance, setBalance }) {
  const [rows, setRows] = useState(16);
  const [risk, setRisk] = useState("medium");
  const multipliers = useMemo(
    () => PLINKO_PRESETS[risk][rows] || PLINKO_PRESETS.medium[16],
    [risk, rows]
  );
  const [lastWin, setLastWin] = useState(null);
  const [ball, setBall] = useState(null);
  const [busy, setBusy] = useState(false);

  const VB_W = 1000;
  const VB_H = 750;
  const PAD_TOP = 60;
  const PAD_BOTTOM = 220;
  const pegYGap = (VB_H - PAD_TOP - PAD_BOTTOM) / (rows - 1);
  const pegXGap = 46;
  const pegR = 7;
  const ballR = 10;

  const xFor = (row, col) => {
    const count = row + 1;
    const rowWidth = (count - 1) * pegXGap;
    const left = VB_W / 2 - rowWidth / 2;
    return left + col * pegXGap;
  };
  const yFor = (row) => PAD_TOP + row * pegYGap;

  const drop = async () => {
    if (!canBet || busy) return;
    setBusy(true);
    try {
      // debit
      const res = await debit(bet, { rows, risk }, "plinko");
      if (!res.ok) {
        alert("Insufficient funds.");
        setBusy(false);
        return;
      }
      setBalance(Number(res.balance));

      // animate
      let r = -1, c = 0;
      setBall({ row: r, col: c, x: VB_W / 2, y: PAD_TOP - 40, running: true });

      const step = async () => {
        r += 1;
        if (r >= rows) {
          const slot = Math.max(0, Math.min(multipliers.length - 1, c));
          const mult = multipliers[slot] ?? 0;
          const win = bet * mult;

          if (win > 0) {
            const res2 = await credit(win, { rows, risk, slot, mult }, "plinko");
            setBalance(Number(res2.balance));
            await logEvent({
              game: "plinko",
              action: "drop_end",
              amount: 0,
              balanceAfter: Number(res2.balance),
              meta: { rows, risk, slot, mult }
            });
          } else {
            await logEvent({
              game: "plinko",
              action: "drop_end",
              amount: 0,
              balanceAfter: Number(res.balance),
              meta: { rows, risk, slot, mult }
            });
          }
          setLastWin({ mult, win, slot });
          setBall((b) => b && { ...b, running: false });
          setBusy(false);
          return;
        }
        c += Math.random() < 0.5 ? 0 : 1;
        setBall({ row: r, col: c, x: xFor(r, c), y: yFor(r), running: true });
        setTimeout(step, 160);
      };

      setTimeout(step, 160);
    } catch (e) {
      console.error(e);
      alert("Drop failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[320px,1fr] gap-6">
      <div>
        <label className="block text-sm mb-1">Risk</label>
        <select
          className="w-full rounded-xl bg-slate-900/60 border border-slate-700 p-2 mb-3"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          disabled={ball?.running || busy}
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
          disabled={ball?.running || busy}
        >
          {[8, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <button
          onClick={drop}
          disabled={!canBet || ball?.running || busy}
          className={`w-full py-3 rounded-xl font-semibold ${
            !canBet || ball?.running || busy
              ? "bg-slate-700 text-slate-400 cursor-not-allowed"
              : "bg-emerald-500 text-slate-900"
          }`}
        >
          {busy ? "Processing…" : ball?.running ? "Dropping…" : `Drop Ball (Bet ${format(bet)} GC)`}
        </button>

        {lastWin && (
          <div className="mt-3 text-sm">
            Last drop → Mult: <b>{lastWin.mult}x</b> • Won: <b>{format(lastWin.win)} GC</b> • Slot #{lastWin.slot}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900/40 p-6">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full block rounded-xl" style={{ display: "block" }}>
            <rect x="8" y="8" width={VB_W - 16} height={VB_H - 16} rx="24" ry="24" fill="transparent" stroke="rgba(100,116,139,0.4)" />
            {Array.from({ length: rows }).map((_, r) => {
              const count = r + 1;
              return Array.from({ length: count }).map((_, c) => (
                <circle key={`${r}-${c}`} cx={xFor(r, c)} cy={yFor(r)} r={7} fill="rgba(148,163,184,0.85)" />
              ));
            })}
            {ball && (
              <circle
                cx={ball.x}
                cy={ball.y}
                r={10}
                fill="#34d399"
                style={{ transition: "cx 150ms linear, cy 150ms linear" }}
              />
            )}
          </svg>

          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${multipliers.length}, minmax(48px, 1fr))` }}>
            {multipliers.map((m, i) => (
              <div key={i} className="text-xs text-center px-2 py-1 rounded-lg bg-slate-800 border border-slate-700">
                {m}x
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- History Panel ---
function HistoryPanel() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wallet_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    if (!error) setRows(data || []);
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4 shadow-xl border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Recent activity</h3>
        <button onClick={load} className="text-xs px-2 py-1 rounded-lg border border-slate-700 bg-slate-900/40">Refresh</button>
      </div>
      {loading ? (
        <div className="text-sm text-slate-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-slate-400">No recent activity.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="text-left py-2 pr-4">Time</th>
                <th className="text-left py-2 pr-4">Game</th>
                <th className="text-left py-2 pr-4">Action</th>
                <th className="text-right py-2 pr-4">Amount</th>
                <th className="text-right py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-700/50">
                  <td className="py-2 pr-4">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4 capitalize">{r.game}</td>
                  <td className="py-2 pr-4 capitalize">{r.action}</td>
                  <td className="py-2 pr-4 text-right">{format(Number(r.amount))}</td>
                  <td className="py-2 text-right">{format(Number(r.balance_after))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-10 pb-10 text-center text-xs text-slate-400">
      <div>Soon real money betting will be available on this. Only for Private Users. sattamax© {new Date().getFullYear()}</div>
      <div className="mt-2">Design created by UciferAariz </div>
    </div>
  );
}
