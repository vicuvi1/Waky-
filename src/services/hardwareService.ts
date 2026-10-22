import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';

let activeSound: Audio.Sound | null = null;
let hapticInterval: ReturnType<typeof setInterval> | null = null;

// Sound assets
const SOUND_MAP = {
  chime: require('../../assets/sounds/chime.wav'),
  alarm: require('../../assets/sounds/alarm_pulse.wav'),
  relapse: require('../../assets/sounds/relapse_alert.wav'),
  gamma_40hz: require('../../assets/sounds/gamma_40hz.wav'),
  progressive_chime: require('../../assets/sounds/progressive_chime.wav'),
  emergency_klaxon: require('../../assets/sounds/emergency_klaxon.wav'),
};

/**
 * Configure audio mode for alarm playback (plays even in silent/ringer off mode on mobile)
 */
export async function setupAudioSession(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
  } catch (err) {
    console.warn('Audio session setup error:', err);
  }
}

/**
 * Stop any currently playing audio
 */
export async function stopSound(): Promise<void> {
  if (activeSound) {
    try {
      await activeSound.stopAsync();
      await activeSound.unloadAsync();
    } catch (e) {
      // Ignore unload errors
    } finally {
      activeSound = null;
    }
  }
}

/**
 * Play a specific alarm or chime sound with looping option
 */
export async function playSound(
  type: keyof typeof SOUND_MAP,
  loop: boolean = true,
  volume: number = 0.85
): Promise<void> {
  try {
    await stopSound();
    await setupAudioSession();

    const { sound } = await Audio.Sound.createAsync(
      SOUND_MAP[type],
      {
        isLooping: loop,
        volume: volume,
        shouldPlay: true,
      }
    );
    activeSound = sound;
  } catch (error) {
    console.warn('Failed to play sound:', error);
  }
}

/**
 * Start rhythmic haptic pulses
 */
export function startHaptics(pattern: 'GENTLE' | 'BALANCED' | 'RELAPSE_MAX'): void {
  stopHaptics();

  const intervalMs = pattern === 'RELAPSE_MAX' ? 600 : pattern === 'BALANCED' ? 1200 : 2000;

  hapticInterval = setInterval(() => {
    try {
      if (pattern === 'RELAPSE_MAX') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (pattern === 'BALANCED') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e) {
      // Fallback if haptics fail
    }
  }, intervalMs);
}

/**
 * Stop all ongoing haptic pulses
 */
export function stopHaptics(): void {
  if (hapticInterval) {
    clearInterval(hapticInterval);
    hapticInterval = null;
  }
}

/**
 * Screen brightness helpers (safe fallbacks)
 */
export async function maximizeBrightness(): Promise<void> {}
export async function restoreBrightness(): Promise<void> {}

/**
 * Prevent device from locking or turning off display
 */
export async function keepDeviceAwake(): Promise<void> {
  try {
    await activateKeepAwakeAsync('WAKY_ALARM_RUNNER');
  } catch (e) {
    // Ignore error
  }
}

/**
 * Allow device to sleep again
 */
export function releaseDeviceWake(): void {
  try {
    deactivateKeepAwake('WAKY_ALARM_RUNNER');
  } catch (e) {
    // Ignore error
  }
}

/**
 * Full stop of all hardware alerting
 */
export async function stopAllHardwareAlerts(): Promise<void> {
  await stopSound();
  stopHaptics();
  releaseDeviceWake();
  clearTorchUsage();
}

// ─── Torch / Flashlight Guard ──────────────────────────────────────────────
let torchTimeout: ReturnType<typeof setTimeout> | null = null;
const MAX_TORCH_CONTINUOUS_MS = 180000;

export function registerTorchUsage(onCutoff: () => void): void {
  if (torchTimeout) clearTimeout(torchTimeout);
  torchTimeout = setTimeout(() => {
    onCutoff();
  }, MAX_TORCH_CONTINUOUS_MS);
}

export function clearTorchUsage(): void {
  if (torchTimeout) {
    clearTimeout(torchTimeout);
    torchTimeout = null;
  }
}

/**
 * Play quick 3-second audio test
 */
export async function testAlarmAudio(soundKey: keyof typeof SOUND_MAP = 'progressive_chime'): Promise<void> {
  await playSound(soundKey, false, 1.0);
}
