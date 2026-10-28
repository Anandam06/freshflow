/** Display formatting only. No business calculations live here. */

const DASH = "—";
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const sign = (v: number, signed?: boolean) => (v < 0 ? "−" : signed && v > 0 ? "+" : "");

/** ₹ amount. compact → ₹1.23 Cr / ₹4.56 L (Indian units). */
export function formatINR(v: number | null | undefined, o: { compact?: boolean; signed?: boolean } = {}): string {
  if (!ok(v)) return DASH;
  const a = Math.abs(v);
  if (o.compact && a >= 1e7) return `${sign(v, o.signed)}₹${(a / 1e7).toFixed(2)} Cr`;
  if (o.compact && a >= 1e5) return `${sign(v, o.signed)}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign(v, o.signed)}₹${inr0.format(a)}`;
}

export function formatINRPerKg(v: number | null | undefined, o: { signed?: boolean } = {}): string {
  if (!ok(v)) return DASH;
  return `${sign(v, o.signed)}₹${inr2.format(Math.abs(v))}/kg`;
}

/** A 0–1 fraction shown as a percentage. */
export function formatFraction(v: number | null | undefined, digits = 1, o: { signed?: boolean } = {}): string {
  if (!ok(v)) return DASH;
  return `${sign(v, o.signed)}${Math.abs(v * 100).toFixed(digits)}%`;
}

/** A value already in percentage points. */
export function formatPP(v: number | null | undefined, digits = 1, o: { signed?: boolean } = { signed: true }): string {
  if (!ok(v)) return DASH;
  return `${sign(v, o.signed)}${Math.abs(v).toFixed(digits)} pp`;
}

export function formatKg(v: number | null | undefined, o: { compact?: boolean } = {}): string {
  if (!ok(v)) return DASH;
  const a = Math.abs(v);
  if (o.compact && a >= 1e6) return `${sign(v)}${(a / 1e6).toFixed(2)} M kg`;
  if (o.compact && a >= 1e3) return `${sign(v)}${(a / 1e3).toFixed(1)} t`;
  return `${sign(v)}${int.format(a)} kg`;
}

export function formatHours(v: number | null | undefined, digits = 1): string {
  if (!ok(v)) return DASH;
  return `${v.toFixed(digits)} h`;
}

export function formatCount(v: number | null | undefined): string {
  return ok(v) ? int.format(v) : DASH;
}

export function formatRatio(v: number | null | undefined, digits = 1): string {
  return ok(v) ? `${v.toFixed(digits)}×` : DASH;
}

export function formatDays(v: number | null | undefined): string {
  if (!ok(v)) return DASH;
  return v < 1 ? `${(v * 24).toFixed(1)} h` : `${v.toFixed(1)} days`;
}

/** Axis tick for ₹ values. */
export function formatINRAxis(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(0)}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(0)}k`;
  return `${s}₹${a.toFixed(0)}`;
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
