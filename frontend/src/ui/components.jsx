import { formatDateTime, formatRs, reasonKind, relativeTime, riskLevel } from "./utils.js";

// ---------- icons (inline SVG, no library) ----------
const PATHS = {
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  coin: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  takeover: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM17 8l5 5M22 8l-5 5",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  device: "M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zM12 18h.01",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6l3.5-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  sort: "M7 15l5 5 5-5M7 9l5-5 5 5",
  clock: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
};

export function Icon({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.alert} />
    </svg>
  );
}

// ---------- small building blocks ----------

export function ScoreBadge({ score, large }) {
  const level = riskLevel(score);
  return (
    <span className={`score score-${level} ${large ? "score-lg" : ""}`}>
      <strong>{score}</strong>
      {level === "high" && <span className="score-label">HIGH RISK</span>}
    </span>
  );
}

export function StatusPill({ status }) {
  return <span className={`pill pill-${status}`}>{status}</span>;
}

const KIND_ICON = { velocity: "bolt", amount: "coin", location: "pin", takeover: "takeover", generic: "alert" };

export function ReasonTag({ text, full }) {
  const kind = reasonKind(text);
  return (
    <span className={`reason reason-${kind} ${full ? "reason-full" : ""}`} title={text}>
      <Icon name={KIND_ICON[kind]} size={13} />
      <span className="reason-text">{text}</span>
    </span>
  );
}

export function TimeCell({ ts }) {
  const rel = relativeTime(ts);
  return (
    <div className="time" title={new Date(ts).toLocaleString()}>
      <div>{formatDateTime(ts)}</div>
      {rel && <div className="muted small">{rel}</div>}
    </div>
  );
}

export function StatCard({ label, value, tone, icon, active, onClick, hint }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`stat stat-${tone} ${active ? "stat-active" : ""} ${onClick ? "stat-click" : ""}`} onClick={onClick}>
      <span className="stat-icon"><Icon name={icon} size={18} /></span>
      <span className="stat-body">
        <span className="stat-value">{value ?? "-"}</span>
        <span className="stat-label">{label}</span>
      </span>
      {hint && <span className="stat-hint">{hint}</span>}
    </Tag>
  );
}

export function SkeletonRows({ rows = 6, cols = 10 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r} className="skeleton-row">
      {Array.from({ length: cols }).map((__, c) => (
        <td key={c}><span className="skeleton" style={{ width: `${50 + ((r * 7 + c * 13) % 45)}%` }} /></td>
      ))}
    </tr>
  ));
}

export function EmptyState({ filtered, onClear }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name="inbox" size={32} /></div>
      <h3>{filtered ? "No transactions match your filters" : "No flagged transactions yet"}</h3>
      <p className="muted">
        {filtered
          ? "Try a different search or clear the filters."
          : "New flags appear here automatically as the engine scores incoming transactions."}
      </p>
      {filtered && <button className="btn btn-ghost" onClick={onClear}>Clear filters</button>}
    </div>
  );
}

export function ActionButtons({ txn, busy, onAction, compact }) {
  return (
    <div className={`actions ${compact ? "" : "actions-lg"}`}>
      <button
        className="btn btn-review"
        disabled={busy || txn.status === "reviewed"}
        onClick={(e) => { e.stopPropagation(); onAction(txn.id, "reviewed"); }}
      >
        <Icon name="check" size={14} /> {compact ? "Review" : "Mark reviewed"}
      </button>
      <button
        className="btn btn-clear"
        disabled={busy || txn.status === "cleared"}
        onClick={(e) => { e.stopPropagation(); onAction(txn.id, "cleared"); }}
      >
        <Icon name="shield" size={14} /> {compact ? "Clear" : "Clear as safe"}
      </button>
    </div>
  );
}

// ---------- detail drawer ----------

export function Drawer({ txn, busy, onClose, onAction }) {
  if (!txn) return null;
  const level = riskLevel(txn.risk_score);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Transaction ${txn.id} details`}>
        <header className="drawer-head">
          <div>
            <div className="muted small">Transaction</div>
            <h2>#{txn.id}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close details"><Icon name="x" size={18} /></button>
        </header>

        <div className="drawer-body">
          <section className={`risk-card risk-${level}`}>
            <div className="risk-top">
              <ScoreBadge score={txn.risk_score} large />
              <StatusPill status={txn.status} />
            </div>
            <div className="meter"><span style={{ width: `${Math.min(100, txn.risk_score / 1.5)}%` }} /></div>
          </section>

          <section>
            <h3>Why it was flagged</h3>
            <div className="reason-list">
              {txn.reasons.length === 0 && <span className="muted">No reasons recorded.</span>}
              {txn.reasons.map((r, i) => <ReasonTag key={i} text={r} full />)}
            </div>
          </section>

          <section>
            <h3>Details</h3>
            <dl className="details">
              <dt>User</dt><dd>{txn.user_id}</dd>
              <dt>Amount</dt><dd>{formatRs(txn.amount)}</dd>
              <dt>City</dt><dd>{txn.city}</dd>
              <dt>Coordinates</dt><dd>{txn.lat}, {txn.lon}</dd>
              <dt>Device</dt><dd>{txn.device_id || "-"}</dd>
              <dt>Time</dt><dd>{new Date(txn.timestamp).toLocaleString()}</dd>
            </dl>
          </section>
        </div>

        <footer className="drawer-foot">
          <ActionButtons txn={txn} busy={busy} onAction={onAction} />
        </footer>
      </aside>
    </>
  );
}

// ---------- toasts ----------

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <Icon name={t.tone === "error" ? "alert" : t.tone === "rule" ? "list" : "check"} size={16} />
          <span>{t.text}</span>
          <button className="icon-btn" onClick={() => onDismiss(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}
