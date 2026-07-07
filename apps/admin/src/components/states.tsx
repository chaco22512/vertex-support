import type { ReactNode } from 'react';
import { IconAlert, IconInbox } from './icons';

/** Loading skeleton rows for tables (§5.4). */
export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading">
      <table className="data">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                  <div className="skeleton" style={{ height: 14, width: `${40 + ((r + c) % 4) * 15}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Empty state with an invitation to act (§5.4). */
export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="state">
      <div className="state-icon">
        <IconInbox size={28} />
      </div>
      <div>{title}</div>
      {hint ? <div className="muted">{hint}</div> : null}
    </div>
  );
}

/** Error state: what happened + a retry button, no raw codes (§5.4). */
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="state error">
      <div className="state-icon">
        <IconAlert size={28} />
      </div>
      <div>{message ?? "Something went wrong. This isn't your fault."}</div>
      {onRetry ? (
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
