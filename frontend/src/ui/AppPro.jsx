import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFlagged, getRules, getStats, updateStatus } from "../api.js";
import {
  ActionButtons, Drawer, EmptyState, Icon, ReasonTag, ScoreBadge, SkeletonRows,
  StatCard, StatusPill, TimeCell, ToastStack,
} from "./components.jsx";
import { formatRs, prettyRule, riskLevel, RULE_INFO } from "./utils.js";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "reviewed", label: "Reviewed" },
  { key: "cleared", label: "Cleared" },
];
const LEVELS = [
  { key: "all", label: "Any risk" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];
const REFRESH_MS = 5000;
const PAGE_SIZE = 10;

// theme is remembered per browser; falls back to the OS setting
function initialTheme() {
  try {
    const saved = localStorage.getItem("fraud-theme");
    if (saved) return saved;
  } catch { /* storage blocked: ignore */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Sortable column header (defined outside AppPro so it isn't re-created on every render)
function SortHead({ k, sort, onSort, children }) {
  return (
    <th aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className={`th-btn ${sort.key === k ? "th-active" : ""}`} onClick={() => onSort(k)}>
        {children}
        <span className="sort-mark">{sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : <Icon name="sort" size={12} />}</span>
      </button>
    </th>
  );
}

export default function AppPro() {
  // data
  const [txns, setTxns] = useState([]);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // view controls
  const [tab, setTab] = useState("all");
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "time", dir: "desc" });
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(true);
  const [theme, setTheme] = useState(initialTheme);

  // ui state
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [newIds, setNewIds] = useState(new Set());
  const [newRules, setNewRules] = useState(new Set());

  // refs used to detect what changed between refreshes
  const seenIds = useRef(null);
  const lastTab = useRef(tab);
  const prevRules = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("fraud-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const toast = useCallback((text, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Fetch everything the page shows; runs on load, tab change, every 5s, and after actions
  const refresh = useCallback(async () => {
    try {
      const [t, s, r] = await Promise.all([getFlagged(tab), getStats(), getRules()]);

      // highlight rows that appeared since the last refresh (same tab only)
      const ids = new Set(t.map((x) => x.id));
      if (seenIds.current && lastTab.current === tab) {
        const fresh = t.filter((x) => !seenIds.current.has(x.id)).map((x) => x.id);
        if (fresh.length) {
          setNewIds(new Set(fresh));
          setTimeout(() => setNewIds(new Set()), 6000);
          toast(`${fresh.length} new flagged transaction${fresh.length > 1 ? "s" : ""}`, "alert");
        }
      }
      seenIds.current = ids;
      lastTab.current = tab;

      // announce rules that were added while the console was open (great for live demos)
      if (prevRules.current) {
        const added = r.filter((n) => !prevRules.current.includes(n));
        if (added.length) {
          setNewRules(new Set(added));
          setTimeout(() => setNewRules(new Set()), 10000);
          toast(`New rule loaded: ${added.map(prettyRule).join(", ")}`, "rule");
        }
      }
      prevRules.current = r;

      setTxns(t);
      setStats(s);
      setRules(r);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      setError("Backend not reachable. Check that the API is running on http://localhost:8000.");
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, refresh]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeStatus = async (id, status) => {
    setBusyId(id);
    try {
      await updateStatus(id, status);
      toast(`Transaction #${id} marked as ${status}`);
      await refresh();
    } catch {
      toast(`Could not update transaction #${id}. Is the backend running?`, "error");
    } finally {
      setBusyId(null);
    }
  };

  // client-side search, risk filter and sorting
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = txns.filter((t) => {
      if (level !== "all" && riskLevel(t.risk_score) !== level) return false;
      if (!q) return true;
      const haystack = [t.id, t.user_id, t.city, t.device_id, ...t.reasons].join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const value = {
      time: (t) => new Date(t.timestamp).getTime(),
      score: (t) => t.risk_score,
      amount: (t) => t.amount,
    }[sort.key];
    rows = [...rows].sort((a, b) => (sort.dir === "asc" ? value(a) - value(b) : value(b) - value(a)));
    return rows;
  }, [txns, level, query, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filtered = tab !== "all" || level !== "all" || query.trim() !== "";
  const selected = txns.find((t) => t.id === selectedId) || null;

  useEffect(() => { setPage(1); }, [tab, level, query, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const clearFilters = () => { setTab("all"); setLevel("all"); setQuery(""); };

  const flagged = stats?.flagged ?? 0;
  const done = (stats?.by_status.reviewed ?? 0) + (stats?.by_status.cleared ?? 0);
  const progress = flagged ? Math.round((done / flagged) * 100) : 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon"><Icon name="shield" size={20} /></span>
          <div>
            <h1>Peek-Transaction</h1>
            <span className="muted small">Real-time transaction risk monitoring</span>
          </div>
        </div>
        <div className="topbar-right">
          <button className={`live-chip ${live && !error ? "is-live" : ""}`} onClick={() => setLive((v) => !v)}
                  title="Toggle auto-refresh" aria-pressed={live}>
            <span className="dot" />
            {error ? "Offline" : live ? "Live" : "Paused"}
            {lastUpdated && !error && <span className="muted small"> · {lastUpdated.toLocaleTimeString()}</span>}
          </button>
          <button className="icon-btn" onClick={refresh} aria-label="Refresh now" title="Refresh now">
            <Icon name="refresh" size={17} />
          </button>
          <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label="Toggle dark mode" title="Toggle dark mode">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          </button>
        </div>
      </header>

      <main className="content">
        {error && (
          <div className="banner banner-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
            <button className="btn btn-ghost" onClick={refresh}>Retry</button>
          </div>
        )}

        <section className="stats" aria-label="Summary">
          <StatCard label="Total transactions" value={stats?.total} tone="neutral" icon="list" />
          <StatCard label="Flagged" value={stats?.flagged} tone="danger" icon="alert"
                    active={tab === "all"} onClick={() => setTab("all")} />
          <StatCard label="Pending review" value={stats?.by_status.pending} tone="warn" icon="clock"
                    active={tab === "pending"} onClick={() => setTab("pending")} />
          <StatCard label="Reviewed" value={stats?.by_status.reviewed} tone="info" icon="check"
                    active={tab === "reviewed"} onClick={() => setTab("reviewed")} />
          <StatCard label="Cleared" value={stats?.by_status.cleared} tone="ok" icon="shield"
                    active={tab === "cleared"} onClick={() => setTab("cleared")} />
        </section>

        <section className="progress-card" aria-label="Review progress">
          <div className="progress-text">
            <strong>Review progress</strong>
            <span className="muted">{done} of {flagged} flagged transactions handled</span>
          </div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <strong className="progress-pct">{progress}%</strong>
        </section>

        <div className="layout">
          <section className="panel">
            <div className="toolbar">
              <div className="tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key}
                          className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="filters">
                <label className="search">
                  <Icon name="search" size={15} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)}
                         placeholder="Search user, city, device, reason..." aria-label="Search transactions" />
                  {query && (
                    <button className="icon-btn" onClick={() => setQuery("")} aria-label="Clear search">
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </label>
                <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by risk level">
                  {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <SortHead k="amount" sort={sort} onSort={toggleSort}>Amount</SortHead>
                    <th>City</th>
                    <th>Device</th>
                    <SortHead k="time" sort={sort} onSort={toggleSort}>Time</SortHead>
                    <SortHead k="score" sort={sort} onSort={toggleSort}>Risk</SortHead>
                    <th>Reasons</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <SkeletonRows />}
                  {!loading && pageRows.map((t) => (
                    <tr key={t.id} className={`row ${newIds.has(t.id) ? "row-new" : ""} ${selectedId === t.id ? "row-selected" : ""}`}
                        onClick={() => setSelectedId(t.id)}>
                      <td className="mono">#{t.id}</td>
                      <td><strong>{t.user_id}</strong></td>
                      <td className="num">{formatRs(t.amount)}</td>
                      <td>{t.city}</td>
                      <td className="mono muted">{t.device_id || "-"}</td>
                      <td><TimeCell ts={t.timestamp} /></td>
                      <td><ScoreBadge score={t.risk_score} /></td>
                      <td>
                        <div className="reasons">
                          {t.reasons.map((r, i) => <ReasonTag key={i} text={r} />)}
                        </div>
                      </td>
                      <td><StatusPill status={t.status} /></td>
                      <td><ActionButtons txn={t} busy={busyId === t.id} onAction={changeStatus} compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && visible.length === 0 && <EmptyState filtered={filtered} onClear={clearFilters} />}
            </div>

            {!loading && visible.length > 0 && (
              <footer className="pager">
                <span className="muted">
                  {pageCount === 1
                    ? `Showing all ${visible.length} transaction${visible.length > 1 ? "s" : ""}`
                    : `Showing transactions ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, visible.length)} of ${visible.length}`}
                </span>
                {pageCount > 1 && (
                  <div className="pager-btns">
                    <button className="btn btn-ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
                    <span className="muted">Page {currentPage} of {pageCount}</span>
                    <button className="btn btn-ghost" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
                  </div>
                )}
              </footer>
            )}
          </section>

          <aside className="panel rules">
            <h2><Icon name="list" size={16} /> Active rules <span className="count">{rules.length}</span></h2>
            {rules.length === 0 && <p className="muted small">No rules loaded.</p>}
            <ul>
              {rules.map((r) => (
                <li key={r} className={newRules.has(r) ? "rule-new" : ""}>
                  <div className="rule-name">
                    {prettyRule(r)}
                    {newRules.has(r) && <span className="new-badge">NEW</span>}
                  </div>
                  {RULE_INFO[r] && <div className="muted small">{RULE_INFO[r]}</div>}
                </li>
              ))}
            </ul>
            <p className="muted small rules-note">
              Rules are loaded from the <code>rules/</code> folder. Add a file and it appears here without a restart.
            </p>
          </aside>
        </div>
      </main>

      <Drawer txn={selected} busy={busyId === selectedId} onClose={() => setSelectedId(null)} onAction={changeStatus} />
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
