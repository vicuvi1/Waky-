import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Circle, G } from 'react-native-svg';
import { WakeEntry } from '../services/historyService';

interface Props {
  data: (WakeEntry | null)[];  // exactly 7 items, oldest first
  targetTime: string;          // "HH:MM" baseline
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getDayLabel(index: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - index));
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const CircadianGraph: React.FC<Props> = ({ data, targetTime }) => {
  const WIDTH = 340;
  const HEIGHT = 160;
  const PADDING = { top: 20, bottom: 32, left: 36, right: 12 };
  const CHART_W = WIDTH - PADDING.left - PADDING.right;
  const CHART_H = HEIGHT - PADDING.top - PADDING.bottom;

  const targetMins = timeToMinutes(targetTime);

  // Compute deviation for each day (minutes from target, clamped ±60)
  const deviations: (number | null)[] = data.map(entry => {
    if (!entry || !entry.completed) return null;
    return Math.max(-60, Math.min(60, entry.deltaMinutes));
  });

  // Scale: ±60 minutes maps to chart height
  const scaleY = (devMins: number) =>
    PADDING.top + CHART_H / 2 - (devMins / 60) * (CHART_H / 2);

  const colWidth = CHART_W / 7;
  const barWidth = colWidth * 0.45;

  const centerY = PADDING.top + CHART_H / 2;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>7-DAY CIRCADIAN VARIANCE</Text>
      <Text style={styles.subtitle}>
        Deviation from {targetTime} target · +late / −early
      </Text>

      <Svg width={WIDTH} height={HEIGHT}>
        {/* ── Grid Lines ── */}
        {[-60, -30, 0, 30, 60].map(mins => {
          const y = scaleY(mins);
          const isZero = mins === 0;
          return (
            <G key={mins}>
              <Line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + CHART_W}
                y2={y}
                stroke={isZero ? '#3B82F6' : '#1F2937'}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? undefined : '4,4'}
              />
              <SvgText
                x={PADDING.left - 4}
                y={y + 4}
                fontSize={9}
                fill={isZero ? '#3B82F6' : '#4B5563'}
                textAnchor="end"
              >
                {mins > 0 ? `+${mins}` : mins}m
              </SvgText>
            </G>
          );
        })}

        {/* ── Bars & Day Labels ── */}
        {data.map((entry, i) => {
          const dev = deviations[i];
          const x = PADDING.left + i * colWidth + colWidth / 2;
          const label = getDayLabel(i);
          const isToday = i === 6;

          if (dev === null) {
            // No data — show ghost bar
            return (
              <G key={i}>
                <Rect
                  x={x - barWidth / 2}
                  y={centerY - 4}
                  width={barWidth}
                  height={8}
                  rx={3}
                  fill="#1F2937"
                />
                <SvgText
                  x={x}
                  y={HEIGHT - 6}
                  fontSize={10}
                  fill={isToday ? '#FFFFFF' : '#6B7280'}
                  textAnchor="middle"
                  fontWeight={isToday ? 'bold' : 'normal'}
                >
                  {label}
                </SvgText>
              </G>
            );
          }

          const barY = dev >= 0 ? scaleY(dev) : centerY;
          const barH = Math.abs(scaleY(dev) - centerY);
          const barColor = dev === 0 ? '#10B981' : dev > 0 ? '#EF4444' : '#3B82F6';

          return (
            <G key={i}>
              <Rect
                x={x - barWidth / 2}
                y={barY}
                width={barWidth}
                height={Math.max(barH, 4)}
                rx={3}
                fill={barColor}
                opacity={0.85}
              />
              {/* Target hit dot */}
              {dev === 0 && (
                <Circle cx={x} cy={centerY} r={5} fill="#10B981" />
              )}
              {/* Deviation label */}
              <SvgText
                x={x}
                y={dev >= 0 ? barY - 3 : barY + barH + 10}
                fontSize={8}
                fill={barColor}
                textAnchor="middle"
                fontWeight="bold"
              >
                {dev > 0 ? `+${dev}` : dev}
              </SvgText>
              <SvgText
                x={x}
                y={HEIGHT - 6}
                fontSize={10}
                fill={isToday ? '#FFFFFF' : '#6B7280'}
                textAnchor="middle"
                fontWeight={isToday ? 'bold' : 'normal'}
              >
                {label}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>On target</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Late</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Early</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#1F2937' }]} />
          <Text style={styles.legendText}>No data</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 14,
  },
  title: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 11,
    marginBottom: 10,
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#6B7280',
    fontSize: 10,
  },
});
