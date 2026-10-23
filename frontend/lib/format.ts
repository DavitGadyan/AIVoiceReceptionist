export function initials(name: string, fallback = "?") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function duration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ago(iso: string) {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} day${diff < 172800 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".");
}

export function when(iso: string) {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return d.toLocaleString("en-GB", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

export function phone(p: string) {
  return p.replace(/^(\+\d{2})(\d{3,4})(\d{3})(\d{3,4})$/, "$1 $2 $3 $4");
}

export const OUTCOME_LABEL: Record<string, string> = {
  BOOKED: "Booked", RESCHEDULED: "Rescheduled", CANCELLED: "Cancelled", FAQ_RESOLVED: "Answered", MESSAGE_TAKEN: "Message taken",
  TRANSFERRED: "Transferred", CALLBACK_REQUIRED: "Callback", EMERGENCY: "Emergency", PATIENT_RUNNING_LATE: "Running late",
  UNCONVERTED: "Unconverted", SALES_CALL: "Sales call", SPAM: "Spam", BLOCKED: "Blocked", ABANDONED: "Missed", TECHNICAL_FAILURE: "Failure",
};

export function outcomeTone(o: string): "success" | "warn" | "danger" | "neutral" | "accent" {
  if (["BOOKED", "RESCHEDULED", "FAQ_RESOLVED"].includes(o)) return "success";
  if (["EMERGENCY", "TECHNICAL_FAILURE"].includes(o)) return "danger";
  if (["CALLBACK_REQUIRED", "UNCONVERTED", "PATIENT_RUNNING_LATE", "ABANDONED"].includes(o)) return "warn";
  if (["TRANSFERRED", "MESSAGE_TAKEN"].includes(o)) return "accent";
  return "neutral";
}
