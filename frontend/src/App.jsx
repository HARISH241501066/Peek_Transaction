import { useCallback, useEffect, useState } from "react";
import { getFlagged, getRules, getStats, updateStatus } from "./api.js";

const TABS = ["all", "pending", "reviewed", "cleared"];
const REFRESH_MS = 5000;

const formatRs = (n) =>
  "Rs." + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 0-49 yellow, 50-80 orange, above 80 red + HIGH RISK label
function ScoreBadge({ score }) {
  const level = score > 80 ? "high" : score >= 50 ? "medium" : "low";
  return (
    <span className={`badge badge-${level}`}>
      {score}
      {level === "high" && <span className="badge-label">HIGH RISK</span>}
    </span>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-value">{value ?? "-"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("all");
  const [txns, setTxns] = useState([]);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch everything the page shows; used on load, on tab change, and every 5s
  const refresh = useCallback(async () => {
    try {
      const [t, s, r] = await Promise.all([getFlagged(tab), getStats(), getRules()]);
      setTxns(t);
      setStats(s);
      setRules(r);
      setError(null);
    } catch {
      setError("Backend not reachable. Is it running on http://localhost:8000?");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const timer = setInterval(refresh, REFRESH_MS); // live updates for the demo
    return () => clearInterval(timer);
  }, [refresh]);

  const changeStatus = async (id, status) => {
    try {
      await updateStatus(id, status);
      await refresh();
    } catch {
      setError("Could not update the transaction. Is the backend running?");
    }
  };

  return (
    <div className="page">
      <header className="header">
        <h1>Peek-Transaction</h1>
        <span className="live">Auto-refreshing every 5s</span>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="stats">
        <StatCard label="Total" value={stats?.total} />
        <StatCard label="Flagged" value={stats?.flagged} tone="warn" />
        <StatCard label="Pending" value={stats?.by_status.pending} tone="pending" />
        <StatCard label="Reviewed" value={stats?.by_status.reviewed} tone="reviewed" />
        <StatCard label="Cleared" value={stats?.by_status.cleared} tone="cleared" />
      </section>

      <div className="layout">
        <main className="main">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={`tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>City</th>
                  <th>Device</th>
                  <th>Time</th>
                  <th>Risk Score</th>
                  <th>Reasons</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan="10" className="empty">Loading...</td></tr>
                )}
                {!loading && txns.length === 0 && (
                  <tr>
                    <td colSpan="10" className="empty">
                      No flagged transactions{tab !== "all" ? ` with status "${tab}"` : ""}.
                    </td>
                  </tr>
                )}
                {!loading &&
                  txns.map((t) => (
                    <tr key={t.id}>
                      <td>#{t.id}</td>
                      <td>{t.user_id}</td>
                      <td>{formatRs(t.amount)}</td>
                      <td>{t.city}</td>
                      <td>{t.device_id || "-"}</td>
                      <td>{new Date(t.timestamp).toLocaleString()}</td>
                      <td><ScoreBadge score={t.risk_score} /></td>
                      <td>
                        <div className="tags">
                          {t.reasons.map((r, i) => (
                            <span key={i} className="tag">{r}</span>
                          ))}
                        </div>
                      </td>
                      <td><span className={`status status-${t.status}`}>{t.status}</span></td>
                      <td className="actions">
                        <button
                          className="btn btn-review"
                          disabled={t.status === "reviewed"}
                          onClick={() => changeStatus(t.id, "reviewed")}
                        >
                          Mark Reviewed
                        </button>
                        <button
                          className="btn btn-clear"
                          disabled={t.status === "cleared"}
                          onClick={() => changeStatus(t.id, "cleared")}
                        >
                          Clear
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </main>

        <aside className="rules-panel">
          <h2>Active Rules</h2>
          {rules.length === 0 ? (
            <p className="muted">No rules loaded.</p>
          ) : (
            <ul>
              {rules.map((r) => (
                <li key={r}>{r.replace(/_/g, " ")}</li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
