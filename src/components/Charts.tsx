'use client';

/**
 * Dashboard charts (Recharts). Client component because Recharts measures the
 * DOM; the page itself stays a Server Component so auth runs on the server.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { Analysis } from '@/lib/types';

const GRID = '#e3e6ea';
const AXIS = '#6b7280';
const SERIES = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];

const axisProps = {
  stroke: AXIS,
  tick: { fill: AXIS, fontSize: 12 },
  tickLine: false,
};

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 13,
        color: 'var(--ink)',
        boxShadow: '0 4px 12px rgba(16,24,40,.12)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: 'var(--muted)' }}>
          {p.name}：<strong style={{ color: 'var(--ink)' }}>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Chart 1 — average engagement by tier. */
export function TierChart({ analysis }: { analysis: Analysis }) {
  const data = analysis.tier_analysis.tiers.map((t) => ({
    name: t.tier,
    平均總互動: t.aggregate.avg_total_engagement,
    平均回覆: t.aggregate.avg_replies,
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(37,99,235,.06)' }} />
          <Bar dataKey="平均總互動" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES[i % SERIES.length]} />
            ))}
            <LabelList dataKey="平均總互動" position="top" fontSize={12} fill={AXIS} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Chart 2 — posting hour vs average engagement. */
export function HourChart({ analysis }: { analysis: Analysis }) {
  const data = analysis.timing.by_hour.map((h) => ({
    name: `${String(h.hour).padStart(2, '0')}:00`,
    平均互動: h.avg_engagement,
    貼文數: h.post_count,
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-40} textAnchor="end" height={54} />
          <YAxis {...axisProps} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(37,99,235,.06)' }} />
          <Bar dataKey="平均互動" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Chart 3 — character-count bucket vs engagement. */
export function LengthChart({ analysis }: { analysis: Analysis }) {
  const data = analysis.length_vs_engagement.buckets.map((b) => ({
    name: b.bucket,
    平均互動: b.avg_engagement,
    平均回覆: b.avg_replies,
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(37,99,235,.06)' }} />
          <Bar dataKey="平均互動" fill={SERIES[2]} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="平均互動" position="top" fontSize={12} fill={AXIS} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Chart 4 — per-post scatter: length vs engagement. */
export function ScatterLength({
  points,
}: {
  points: { char_count: number; total_engagement: number; post_id: string }[];
}) {
  const data = points.map((p) => ({
    x: p.char_count,
    y: p.total_engagement,
    z: 60,
    post_id: p.post_id,
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 20, left: 0, bottom: 16 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis
            type="number"
            dataKey="x"
            name="字數"
            {...axisProps}
            label={{ value: '字數', position: 'insideBottom', offset: -8, fill: AXIS, fontSize: 12 }}
          />
          <YAxis type="number" dataKey="y" name="總互動" {...axisProps} />
          <ZAxis type="number" dataKey="z" range={[50, 70]} />
          <Tooltip content={<TooltipBox />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="貼文" data={data} fill={SERIES[1]} fillOpacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
