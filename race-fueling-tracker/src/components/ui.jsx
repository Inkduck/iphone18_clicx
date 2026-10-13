import React from 'react';

export const fmt = (n, digits = 0) => {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Progress({ pct, size = 'md' }) {
  const p = pct == null ? 0 : Math.max(0, pct);
  const tone = pct == null ? 'none' : p > 110 ? 'over' : p >= 90 ? 'good' : 'mid';
  return (
    <div className={`progress progress-${size}`} role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill tone-${tone}`} style={{ width: `${Math.min(100, p)}%` }} />
    </div>
  );
}

export function Stat({ label, value, unit, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && value !== '—' && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ children, tone = 'muted' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Target / consumed / remaining / % block used across pages. */
export function TargetSummary({ target, consumed, remaining, pct, invalidReason }) {
  return (
    <div className="target-summary">
      <div className="stat-grid">
        <Stat label="Target" value={target == null ? '—' : fmt(target)} unit="g" />
        <Stat label="Consumed" value={fmt(consumed)} unit="g" />
        <Stat label="Remaining" value={remaining == null ? '—' : fmt(Math.max(0, remaining))} unit="g"
          sub={remaining != null && remaining < 0 ? `${fmt(-remaining)} g over target` : null} />
        <Stat label="Achieved" value={pct == null ? '—' : fmt(pct)} unit="%" />
      </div>
      <Progress pct={pct} />
      {invalidReason && <p className="warn">{invalidReason}</p>}
    </div>
  );
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
