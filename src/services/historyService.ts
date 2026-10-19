import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@waky_wake_history_v1';
const MAX_HISTORY_DAYS = 30;

export interface WakeEntry {
  date: string;          // "YYYY-MM-DD"
  targetTime: string;    // "HH:MM"
  actualTime: string;    // "HH:MM"
  deltaMinutes: number;  // actualTime - targetTime (negative = early)
  completed: boolean;
  missionsCount: number;
  streak: number;
}

/**
 * Load the last N days of wake history.
 */
export async function loadHistory(): Promise<WakeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Append today's wake entry and trim to MAX_HISTORY_DAYS.
 */
export async function recordWakeEntry(entry: WakeEntry): Promise<void> {
  try {
    const existing = await loadHistory();
    // Replace if same date already exists
    const filtered = existing.filter(e => e.date !== entry.date);
    const updated = [...filtered, entry].slice(-MAX_HISTORY_DAYS);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to record wake entry:', err);
  }
}

/**
 * Returns the last 7 entries (padded with nulls for days with no data).
 */
export function getLast7Days(history: WakeEntry[]): (WakeEntry | null)[] {
  const result: (WakeEntry | null)[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push(history.find(e => e.date === dateStr) || null);
  }
  return result;
}

/**
 * Compute average variance (deviation from target wake time) in minutes.
 */
export function avgVarianceMinutes(history: WakeEntry[]): number {
  const completed = history.filter(e => e.completed);
  if (completed.length === 0) return 0;
  return Math.round(completed.reduce((sum, e) => sum + Math.abs(e.deltaMinutes), 0) / completed.length);
}

export interface WakeStatistics {
  onTimeRate: number;        // 0 - 100%
  avgVarianceMinutes: number;// average absolute deviation
  grade: 'S+' | 'A' | 'B' | 'C';
  gradeTitle: string;
  totalTracked: number;
  earlyCount: number;
  delayedCount: number;
  relapsesAvoided: number;
}

/**
 * Compute rich wake statistics & consistency grade.
 */
export function computeWakeStatistics(history: WakeEntry[], relapsesAvoided: number = 0): WakeStatistics {
  if (history.length === 0) {
    return {
      onTimeRate: 100,
      avgVarianceMinutes: 0,
      grade: 'S+',
      gradeTitle: 'Circadian Vanguard',
      totalTracked: 0,
      earlyCount: 0,
      delayedCount: 0,
      relapsesAvoided,
    };
  }

  const completed = history.filter(e => e.completed);
  const onTime = completed.filter(e => e.deltaMinutes <= 5);
  const onTimeRate = completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 100;
  const avgVar = avgVarianceMinutes(history);

  let grade: 'S+' | 'A' | 'B' | 'C' = 'B';
  let gradeTitle = 'Solid Consistency';
  if (onTimeRate >= 90 && avgVar <= 5) {
    grade = 'S+';
    gradeTitle = 'Circadian Titan';
  } else if (onTimeRate >= 80) {
    grade = 'A';
    gradeTitle = 'Optimal Sleep Hygiene';
  } else if (onTimeRate >= 65) {
    grade = 'B';
    gradeTitle = 'Consistent Improver';
  } else {
    grade = 'C';
    gradeTitle = 'Resetting Circadian Rhythm';
  }

  return {
    onTimeRate,
    avgVarianceMinutes: avgVar,
    grade,
    gradeTitle,
    totalTracked: history.length,
    earlyCount: completed.filter(e => e.deltaMinutes < 0).length,
    delayedCount: completed.filter(e => e.deltaMinutes > 5).length,
    relapsesAvoided,
  };
}
