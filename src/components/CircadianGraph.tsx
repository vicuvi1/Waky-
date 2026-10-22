import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WakeEntry } from '../services/historyService';

interface Props {
  data: (WakeEntry | null)[]; // exactly 7 items, oldest first
  targetTime: string;         // "HH:MM" baseline
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getDayLabel(index: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - index));
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

export const CircadianGraph: React.FC<Props> = ({ data, targetTime }) => {
  const deviations: (number | null)[] = data.map(entry => {
    if (!entry || !entry.completed) return null;
    return Math.max(-60, Math.min(60, entry.deltaMinutes));
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>7-DAY CIRCADIAN VARIANCE</Text>
      <Text style={styles.subtitle}>
        Deviation from {targetTime} target · +late / −early
      </Text>

      <View style={styles.chartContainer}>
        {/* Baseline zero line */}
        <View style={styles.baseline} />

        {/* 7 Columns */}
        <View style={styles.columnsRow}>
          {data.map((entry, i) => {
            const dev = deviations[i];
            const isToday = i === 6;
            const label = getDayLabel(i);

            // Height calculation: max 60 min -> 45px bar
            const barHeight = dev !== null ? Math.max(6, Math.min(45, Math.abs(dev) * 0.75)) : 6;
            const isLate = dev !== null && dev > 0;
            const isOnTime = dev !== null && dev === 0;

            const barColor = dev === null
              ? '#1F2937'
              : isOnTime
              ? '#10B981'
              : isLate
              ? '#EF4444'
              : '#3B82F6';

            return (
              <View key={i} style={styles.col}>
                {/* Upper bar area (for late wakeups) */}
                <View style={styles.upperArea}>
                  {isLate && (
                    <View style={[styles.bar, { height: barHeight, backgroundColor: barColor }]} />
                  )}
                </View>

                {/* Lower bar area (for early wakeups or ghost) */}
                <View style={styles.lowerArea}>
                  {!isLate && (
                    <View style={[styles.bar, { height: barHeight, backgroundColor: barColor }]} />
                  )}
                </View>

                {/* Day label */}
                <Text style={[styles.dayLabel, isToday && styles.todayLabel]}>
                  {label}
                </Text>
                <Text style={styles.devText}>
                  {dev === null ? '—' : dev === 0 ? '0m' : dev > 0 ? `+${dev}m` : `${dev}m`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>On Target</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Early</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Late</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  title: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 16,
  },
  chartContainer: {
    height: 120,
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 10,
  },
  baseline: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#374151',
    zIndex: 1,
  },
  columnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 100,
    zIndex: 2,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upperArea: {
    height: 48,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  lowerArea: {
    height: 48,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  bar: {
    width: 14,
    borderRadius: 4,
  },
  dayLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  todayLabel: {
    color: '#3B82F6',
    fontWeight: 'bold',
  },
  devText: {
    color: '#4B5563',
    fontSize: 9,
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    paddingTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
});
