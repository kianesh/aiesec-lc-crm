import { CheckCircle2, CircleAlert } from "lucide-react";

export function StatusPill({ status }: { status: "connected" | "disconnected" | "error" }) {
  if (status === "error") return <span className="status-pill error"><CircleAlert size={13} /> Error</span>;
  if (status === "connected") return <span className="status-pill success"><CheckCircle2 size={13} /> Connected</span>;
  return <span className="status-pill">Disconnected</span>;
}
