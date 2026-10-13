import { differenceInMinutes, format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from "date-fns";

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Math.abs(differenceInMinutes(new Date(), d)) < 1) return "just now";
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a")}`;
  return format(d, isThisYear(d) ? "MMM d, h:mm a" : "MMM d, yyyy");
}

export function fullDate(iso: string | null | undefined) {
  return iso ? format(new Date(iso), "PPpp") : "—";
}

export function hours(h: number | null | undefined) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function dueIn(iso: string) {
  const mins = differenceInMinutes(new Date(iso), new Date());
  const abs = Math.abs(mins);
  const label = abs < 60 ? `${abs}m` : abs < 48 * 60 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  return mins >= 0 ? `due in ${label}` : `overdue by ${label}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const tzOffset = () => new Date().getTimezoneOffset();

export function pct(n: number | null | undefined) {
  return n == null ? "—" : `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}
