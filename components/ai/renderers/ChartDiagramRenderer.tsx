'use client';

import React from 'react';
import type { BarChartDiagramData, PieChartDiagramData } from '@/lib/ai/contracts';
import { trackAIRenderFallback } from '@/lib/ai/telemetry';

import UnsupportedAIContent from './UnsupportedAIContent';

type ChartDiagramData = PieChartDiagramData | BarChartDiagramData;

const CHART_COLORS = ['#111827', '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function PieChartVisual({ data }: { data: PieChartDiagramData }) {
  const total = data.dataPoints.reduce((sum, point) => sum + Math.max(point.value, 0), 0);

  if (!Number.isFinite(total) || total <= 0) {
    trackAIRenderFallback({ renderer: 'pie_chart', subtype: 'pie_chart', reason: 'non_positive_values' });
    return <UnsupportedAIContent message="Pie chart data must contain positive values." />;
  }

  let runningAngle = 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[280px]">
        <svg viewBox="0 0 220 220" className="w-full">
          {data.dataPoints.map((point, index) => {
            const sliceAngle = (Math.max(point.value, 0) / total) * 360;
            const path = describeArc(110, 110, 88, runningAngle, runningAngle + sliceAngle);
            const fill = CHART_COLORS[index % CHART_COLORS.length];
            runningAngle += sliceAngle;

            return <path key={`${point.label}-${index}`} d={path} fill={fill} stroke="#ffffff" strokeWidth="2" />;
          })}
        </svg>
      </div>
      <div className="space-y-3">
        {data.dataPoints.map((point, index) => {
          const value = Math.max(point.value, 0);
          const percentage = total > 0 ? (value / total) * 100 : 0;

          return (
            <div key={`${point.label}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="text-sm text-gray-800">{point.label}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">{point.value}</div>
                <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarChartVisual({ data }: { data: BarChartDiagramData }) {
  const maxValue = Math.max(...data.dataPoints.map((point) => point.value), 0);

  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    trackAIRenderFallback({ renderer: 'bar_chart', subtype: 'bar_chart', reason: 'non_positive_values' });
    return <UnsupportedAIContent message="Bar chart data must contain positive values." />;
  }

  const chartHeight = 220;
  const chartWidth = 520;
  const barWidth = Math.max(36, Math.floor((chartWidth - 80) / Math.max(data.dataPoints.length, 1)) - 12);
  const gap = 12;

  return (
    <div className="space-y-4">
      {(data.xLabel || data.yLabel) && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          {data.xLabel && <div>X: {data.xLabel}</div>}
          {data.yLabel && <div>Y: {data.yLabel}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="min-w-[420px] w-full">
          <line x1="48" y1="12" x2="48" y2={chartHeight} stroke="#d1d5db" strokeWidth="1.5" />
          <line x1="48" y1={chartHeight} x2={chartWidth - 12} y2={chartHeight} stroke="#d1d5db" strokeWidth="1.5" />
          {data.dataPoints.map((point, index) => {
            const barHeight = (Math.max(point.value, 0) / maxValue) * (chartHeight - 30);
            const x = 60 + index * (barWidth + gap);
            const y = chartHeight - barHeight;
            const fill = CHART_COLORS[index % CHART_COLORS.length];

            return (
              <g key={`${point.label}-${index}`}>
                <rect x={x} y={y} width={barWidth} height={barHeight} rx="8" fill={fill} />
                <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" className="fill-gray-700 text-[11px] font-medium">
                  {point.value}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 18}
                  textAnchor="middle"
                  className="fill-gray-600 text-[10px]"
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ChartDiagramRenderer({ data }: { data: ChartDiagramData }) {
  const subtype = data.subtype;

  if (!data.dataPoints.length) {
    trackAIRenderFallback({ renderer: 'chart_diagram', subtype, reason: 'empty_data_points' });
    return <UnsupportedAIContent message="This chart does not include any data points." />;
  }

  const isKnownSubtype = subtype === 'pie_chart' || subtype === 'bar_chart';
  if (!isKnownSubtype) {
    trackAIRenderFallback({ renderer: 'chart_diagram', subtype, reason: 'unsupported_subtype' });
  }

  return (
    <div className="h-full w-full overflow-auto rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            {data.subtype.replace('_', ' ')}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{data.title}</h2>
        </div>
        {data.subtype === 'pie_chart' ? (
          <PieChartVisual data={data} />
        ) : data.subtype === 'bar_chart' ? (
          <BarChartVisual data={data} />
        ) : (
          <UnsupportedAIContent message="This chart subtype is not supported yet." />
        )}
      </div>
    </div>
  );
}

export default React.memo(ChartDiagramRenderer);
