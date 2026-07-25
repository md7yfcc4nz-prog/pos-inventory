"use client";

type Slice = {
  label: string;
  value: number;
  color: string;
};

const COLORS = ["#0b1f3a", "#1f9d55", "#a15c00", "#3b82f6", "#b42318", "#7c3aed", "#0f766e"];

export function SalesPieChart({
  slices,
  emptyLabel,
}: {
  slices: Array<{ label: string; value: number }>;
  emptyLabel: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return <div className="empty">{emptyLabel}</div>;
  }

  const radius = 70;
  const center = 90;
  let angle = -Math.PI / 2;
  const colored: Slice[] = slices.map((slice, index) => ({
    ...slice,
    color: COLORS[index % COLORS.length],
  }));

  const paths = colored.map((slice) => {
    const portion = slice.value / total;
    const sweep = portion * Math.PI * 2;
    const startX = center + radius * Math.cos(angle);
    const startY = center + radius * Math.sin(angle);
    angle += sweep;
    const endX = center + radius * Math.cos(angle);
    const endY = center + radius * Math.sin(angle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    return {
      ...slice,
      d: `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`,
      percent: Math.round(portion * 100),
    };
  });

  return (
    <div className="chart-layout">
      <svg viewBox="0 0 180 180" className="pie-chart" role="img" aria-label="Sales by category">
        {paths.map((path) => (
          <path key={path.label} d={path.d} fill={path.color} />
        ))}
        <circle cx={center} cy={center} r={34} fill="white" />
      </svg>
      <ul className="chart-legend">
        {paths.map((path) => (
          <li key={path.label}>
            <span className="chart-swatch" style={{ background: path.color }} />
            <span>
              {path.label} · {path.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SalesBarChart({
  bars,
  emptyLabel,
  formatValue,
}: {
  bars: Array<{ label: string; value: number }>;
  emptyLabel: string;
  formatValue: (value: number) => string;
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  if (max <= 0) {
    return <div className="empty">{emptyLabel}</div>;
  }

  return (
    <div className="bar-chart">
      {bars.map((bar, index) => (
        <div className="bar-row" key={bar.label}>
          <div className="bar-label">{bar.label}</div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${Math.max(8, (bar.value / max) * 100)}%`,
                background: COLORS[index % COLORS.length],
              }}
            />
          </div>
          <div className="bar-value">{formatValue(bar.value)}</div>
        </div>
      ))}
    </div>
  );
}
