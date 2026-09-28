import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { colors, fonts } from '../theme';

interface RevenueChartProps {
  labels: string[];
  data: number[];
  /** Index of the bar to highlight (defaults to the last one). */
  highlight?: number;
  height?: number;
}

const compact = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

/** On-brand revenue bar chart (SVG), sized to its container. */
const RevenueLineChart: React.FC<RevenueChartProps> = ({ labels, data, highlight = data.length - 1, height = 200 }) => {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data);
  const top = 22;
  const bottom = 26;
  const plotH = height - top - bottom;
  const slot = width / Math.max(1, data.length);
  const barW = Math.min(34, slot * 0.56);

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessibilityRole="image" accessibilityLabel={`Revenue for ${labels.join(', ')}`}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0.5, 1].map(f => (
            <Line key={f} x1={0} x2={width} y1={top + plotH * (1 - f)} y2={top + plotH * (1 - f)} stroke={colors.line} strokeWidth={1} strokeDasharray="3 5" />
          ))}
          <Line x1={0} x2={width} y1={top + plotH} y2={top + plotH} stroke={colors.lineStrong} strokeWidth={1} />
          {data.map((v, i) => {
            const h = Math.max(v > 0 ? 4 : 2, (v / max) * plotH);
            const x = slot * i + (slot - barW) / 2;
            const y = top + plotH - h;
            const on = i === highlight;
            return (
              <React.Fragment key={labels[i] ?? i}>
                <Rect x={x} y={y} width={barW} height={h} rx={8} fill={on ? colors.brand : colors.brandTint} />
                {v > 0 ? (
                  <SvgText x={x + barW / 2} y={y - 6} fontSize={10} fontFamily={fonts.semibold} fill={on ? colors.brand : colors.inkMuted} textAnchor="middle">
                    {compact(v)}
                  </SvgText>
                ) : null}
                <SvgText x={x + barW / 2} y={height - 8} fontSize={11} fontFamily={on ? fonts.semibold : fonts.medium} fill={on ? colors.ink : colors.inkMuted} textAnchor="middle">
                  {labels[i]}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
};

export default RevenueLineChart;
