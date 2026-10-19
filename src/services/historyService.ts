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
