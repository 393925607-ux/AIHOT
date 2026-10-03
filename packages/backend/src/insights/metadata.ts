export type RadarLifecycle = "reported" | "active" | "fixed" | "regressed" | "corrected" | "withdrawn" | "superseded";

export type RadarAttribution = {
  sourcePlatform: string;
  sourceOwner: string;
  affectedVendor: string;
  affectedProduct: string;
  modelProvider: string;
  accessChannel: string;
  claimant: string;
};

export const unknownAttribution = (): RadarAttribution => ({
  sourcePlatform: "unknown",
  sourceOwner: "unknown",
  affectedVendor: "unknown",
  affectedProduct: "unknown",
  modelProvider: "unknown",
  accessChannel: "unknown",
  claimant: "unknown",
});

export function readAttribution(value: unknown): RadarAttribution {
  const base = unknownAttribution();
  if (!value || typeof value !== "object") return base;
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof RadarAttribution>) {
    const candidate = input[key] ?? input[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)];
    if (typeof candidate === "string" && candidate.trim()) base[key] = candidate.trim();
  }
  return base;
}

export function readLifecycle(value: unknown, fallback: RadarLifecycle = "reported"): RadarLifecycle {
  const status = value && typeof value === "object" ? (value as Record<string, unknown>).lifecycleStatus : null;
  return typeof status === "string" && ["reported", "active", "fixed", "regressed", "corrected", "withdrawn", "superseded"].includes(status)
    ? status as RadarLifecycle
    : fallback;
}
