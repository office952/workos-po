type Metric = { label: string; value: string | number };

/** Counts describe returned data, never calculated business readiness. */
export function PageMetrics({ items }: { items: readonly Metric[] }) {
  return <dl className="pilot-instrument page-metrics">
    {items.map((item) => <div key={item.label} className="pilot-instrument__metric page-metrics__item">
      <dt className="pilot-instrument__metric-label">{item.label}</dt>
      <dd className="pilot-instrument__metric-value">{item.value}</dd>
    </div>)}
  </dl>;
}
