export type AlarmState =
  | 'IDLE'
  | 'SUNRISE'
  | 'ALARMING'
  | 'GRACE_COUNTDOWN'
  | 'MISSION'
  | 'AWAKE_CONFIRMED'
  | 'RELAPSE_PENALTY';

export type MissionType = 'WATER_QR' | 'POSTURE_HOLD' | 'STROOP_TEST' | 'BED_PHOTO';

export interface MissionConfig {
  id: MissionType;
  title: string;
  subtitle: string;
  description: string;
  iconName: string;
  durationSeconds?: number;
  enabled: boolean;
}

export interface AlarmSettings {
  targetWakeTime: string; // "HH:MM" 24h
  targetBedtime: string; // "HH:MM" 24h
  enabled: boolean;
  graceDurationSeconds: number; // default 120 (2 mins)
  sunriseDurationMinutes: number; // default 5 mins
  qrCodeSecret: string; // QR code text to match (default "WAKY_BEDSIDE_KEY")
  activeMissions: MissionType[];
  volumeLevel: number; // 0.0 to 1.0
  vibrationIntensity: 'GENTLE' | 'BALANCED' | 'RELAPSE_MAX';
}

export interface UserStats {
  currentStreak: number;
  bestStreak: number;
  relapsesAvoided: number;
  totalWakeups: number;
  lastWakeDate: string | null;
}
