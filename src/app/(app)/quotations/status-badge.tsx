import type { QuotationStatus } from "@/lib/db/schema";

const styles: Record<QuotationStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-800",
  cancelled: "bg-slate-200 text-slate-500",
};

export function StatusBadge({ status }: { status: QuotationStatus }) {
  return (
    <span className={`badge capitalize ${styles[status]}`}>{status}</span>
  );
}
