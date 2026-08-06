import { STATUS_CLASSES, STATUS_DOT, statusLabel, type AgentRuntimeStatus } from "./types";

interface Props {
  status: AgentRuntimeStatus;
  detail?: string;
}

/**
 * Status pill. Always renders the text label — the coloured dot is supplementary, never the sole
 * signal (V-022: "each status must contain text in addition to color").
 */
export function AgentStatusBadge({ status, detail }: Props) {
  const label = statusLabel(status);
  return (
    <span
      data-testid="agent-status"
      data-status={status}
      role="status"
      aria-label={detail ? `${label}: ${detail}` : label}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      <span data-testid="agent-status-label">{label}</span>
    </span>
  );
}
