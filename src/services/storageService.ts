import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlarmSettings, UserStats } from '../types';

const SETTINGS_KEY = '@waky_alarm_settings_v1';
const STATS_KEY = '@waky_user_stats_v1';

export const DEFAULT_SETTINGS: AlarmSettings = {
  targetWakeTime: '06:30',
  targetBedtime: '22:30',
  enabled: true,
  graceDurationSeconds: 120, // 2-minute grace period
  sunriseDurationMinutes: 5,
  qrCodeSecret: 'WAKY_DESK_KEY',
  activeMissions: ['POSTURE_HOLD', 'STROOP_TEST', 'WATER_QR', 'SQUAT_COUNTER'],
  volumeLevel: 0.85,
  vibrationIntensity: 'BALANCED',
  postureSeconds: 45,
  stroopStreak: 7,
  targetSquats: 10,
  soundProfile: 'PROGRESSIVE_CHIME',
  partnerChatId: '',
  partnerAlertEnabled: false,
  dopamineAnchor: 'Crush my goals and make today count!',
  torchEnabled: true,
  whisperPhrase: 'I am standing and ready for today',
};

export const DEFAULT_STATS: UserStats = {
  currentStreak: 4,
  bestStreak: 12,
  relapsesAvoided: 9,
  totalWakeups: 14,
  lastWakeDate: null,
};

export async function loadSettings(): Promise<AlarmSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AlarmSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export async function loadStats(): Promise<UserStats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    if (!raw) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch (error) {
    console.error('Failed to load stats:', error);
    return DEFAULT_STATS;
  }
}

export async function saveStats(stats: UserStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    console.error('Failed to save stats:', error);
  }
}

export async function recordSuccessfulWakeup(): Promise<UserStats> {
  const current = await loadStats();
  const today = new Date().toISOString().split('T')[0];
  
  let newStreak = current.currentStreak;
  if (current.lastWakeDate !== today) {
    newStreak += 1;
  }

  const updated: UserStats = {
    ...current,
    currentStreak: newStreak,
    bestStreak: Math.max(newStreak, current.bestStreak),
    relapsesAvoided: current.relapsesAvoided + 1,
    totalWakeups: current.totalWakeups + 1,
    lastWakeDate: today,
  };

  await saveStats(updated);
  return updated;
}
