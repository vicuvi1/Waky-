import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';

let originalBrightness: number | null = null;
let activeSound: Audio.Sound | null = null;
let hapticInterval: ReturnType<typeof setInterval> | null = null;

// Sound assets
const SOUND_MAP = {
  chime: require('../../assets/sounds/chime.wav'),
  alarm: require('../../assets/sounds/alarm_pulse.wav'),
  relapse: require('../../assets/sounds/relapse_alert.wav'),
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
  type: 'chime' | 'alarm' | 'relapse',
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
 * Ramp up screen brightness to 100% for light therapy
 */
export async function maximizeBrightness(): Promise<void> {
  try {
    const { status } = await Brightness.requestPermissionsAsync();
    if (status === 'granted') {
      if (originalBrightness === null) {
        originalBrightness = await Brightness.getBrightnessAsync();
      }
      await Brightness.setBrightnessAsync(1.0);
    }
  } catch (e) {
    console.warn('Brightness control not supported or denied:', e);
  }
}

/**
 * Restore screen brightness to original setting
 */
export async function restoreBrightness(): Promise<void> {
  try {
    if (originalBrightness !== null) {
      await Brightness.setBrightnessAsync(originalBrightness);
      originalBrightness = null;
    }
  } catch (e) {
    // Ignore error
  }
}

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
 * Full stop of all hardware alerting (audio, haptics, restore screen, release sleep lock)
 */
export async function stopAllHardwareAlerts(): Promise<void> {
  await stopSound();
  stopHaptics();
  await restoreBrightness();
  releaseDeviceWake();
}
