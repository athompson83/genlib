// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import { alignTimeSeries, type TimeSample } from './series.js';

export function TimeSeriesChart({ samples, series, title, height = 240 }: {
  samples: TimeSample[]; series: { key: string; label: string; color: string }[]; title: string; height?: number;
}) {
  const element = useRef<HTMLDivElement>(null), plot = useRef<uPlot | null>(null);
  const data = useMemo(() => alignTimeSeries(samples, series.map(item => item.key)), [samples, series]);
  const latest = useRef(data); latest.current = data;
  useEffect(() => {
    if (!element.current) return;
    const target = element.current;
    const instance = new uPlot({ title, height, width: Math.max(1, target.clientWidth),
      series: [{ label: 'Time' }, ...series.map(item => ({ label: item.label, stroke: item.color, spanGaps: false }))] }, latest.current, target);
    plot.current = instance;
    const observer = new ResizeObserver(([entry]) => { if (entry) instance.setSize({ width: Math.max(1, Math.floor(entry.contentRect.width)), height }); });
    observer.observe(target);
    return () => { observer.disconnect(); instance.destroy(); plot.current = null; };
  }, [series, title, height]);
  useEffect(() => { plot.current?.setData(data); }, [data]);
  return <figure><div ref={element} aria-label={title} role="img" /><figcaption>{title}</figcaption>
    <details><summary>Data table</summary><table><thead><tr><th scope="col">Time (UTC)</th>{series.map(item => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead>
      <tbody>{data[0].slice(0, 200).map((time, index) => <tr key={time}><th scope="row">{new Date(time * 1000).toISOString()}</th>{series.map((item, seriesIndex) => <td key={item.key}>{data[seriesIndex + 1]?.[index] ?? '—'}</td>)}</tr>)}</tbody></table>
      {data[0].length > 200 && <p>Showing the first 200 samples. Narrow the selected time window for further detail.</p>}</details>
  </figure>;
}
