import type { CheckMetrics } from './types.js'

export type MetricCarrier = {
  metrics?: CheckMetrics
}

export function findMetric<TKind extends CheckMetrics['kind']>(
  entries: MetricCarrier[],
  kind: TKind,
): Extract<CheckMetrics, { kind: TKind }> | undefined {
  const match = entries.find((entry) => entry.metrics?.kind === kind)
  return match?.metrics as Extract<CheckMetrics, { kind: TKind }> | undefined
}
