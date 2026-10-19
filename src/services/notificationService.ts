import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure foreground handler immediately at module load time
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and configure Android channels safely.
 * Must be called at app startup.
 */
export async function setupNotifications(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowSound: true,
          allowBadge: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    // Android notification channels for alarm-priority alerts
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('waky_alarm', {
          name: 'Waky Alarms',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500],
          lightColor: '#3B82F6',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          enableLights: true,
        });

        await Notifications.setNotificationChannelAsync('waky_winddown', {
          name: 'Waky Wind-Down',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 200],
          lightColor: '#818CF8',
        });

        await Notifications.setNotificationChannelAsync('waky_relapse_check', {
          name: 'Waky Relapse Check',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 400, 200, 400, 200, 400],
          lightColor: '#EF4444',
        });
      } catch (channelErr) {
        console.warn('[Waky] Failed to configure Android notification channels:', channelErr);
      }
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.warn('[Waky] setupNotifications error:', err);
    return false;
  }
}

/**
 * Schedule the daily wake-up alarm.
 * Uses an exact trigger to break through Doze Mode.
 * Returns the notification identifier.
 */
export async function scheduleWakeAlarm(wakeTimeHHMM: string): Promise<string | null> {
  try {
    await cancelWakeAlarm();

    const [hours, minutes] = wakeTimeHHMM.split(':').map(Number);

    // Trigger at exact wake time daily
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ WAKY — Time to Rise!',
        body: 'Open Waky now. Your 2-minute anti-relapse grace timer starts immediately.',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 500, 200, 500, 200, 500],
        data: { type: 'WAKE_ALARM' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
        channelId: 'waky_alarm',
      },
    });

    console.log(`[Waky] Wake alarm scheduled at ${wakeTimeHHMM} daily. ID: ${id}`);
    return id;
  } catch (err) {
    console.warn('[Waky] Failed to schedule wake alarm:', err);
    return null;
  }
}

/**
 * Cancel any existing wake alarm.
 */
export async function cancelWakeAlarm(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as Record<string, unknown>;
      if (data?.type === 'WAKE_ALARM') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (err) {
    console.warn('[Waky] Failed to cancel wake alarm:', err);
  }
}

/**
 * Schedule bedtime wind-down alert 45 minutes before target bedtime.
 */
export async function scheduleBedtimeWindDown(bedtimeHHMM: string): Promise<string | null> {
  try {
    await cancelWindDownAlert();

    const [hours, minutes] = bedtimeHHMM.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes - 45;
    const windDownHour = Math.floor(((totalMinutes % 1440) + 1440) % 1440 / 60);
    const windDownMinute = ((totalMinutes % 1440) + 1440) % 1440 % 60;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🌙 Waky Wind-Down',
        body: `Bedtime in 45 minutes (${bedtimeHHMM}). Start winding down to protect your circadian rhythm.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: 'WIND_DOWN' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: windDownHour,
        minute: windDownMinute,
        channelId: 'waky_winddown',
      },
    });

    console.log(`[Waky] Wind-down alert scheduled at ${windDownHour}:${String(windDownMinute).padStart(2, '0')}. ID: ${id}`);
    return id;
  } catch (err) {
    console.warn('[Waky] Failed to schedule wind-down alert:', err);
    return null;
  }
}

/**
 * Cancel existing bedtime wind-down alerts.
 */
export async function cancelWindDownAlert(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as Record<string, unknown>;
      if (data?.type === 'WIND_DOWN') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (err) {
    console.warn('[Waky] Failed to cancel wind-down alert:', err);
  }
}

/**
 * Schedule the "T+15 Minute Relapse Check" — fires 15 minutes
 * after missions are completed to verify user didn't crawl back to bed.
 */
export async function scheduleRelapseCheck(delaySeconds: number = 900): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚨 WAKY — Are You Still Up?',
        body: 'Open the app NOW and confirm you\'re still on your feet. You have 60 seconds!',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 400, 200, 400, 200, 400],
        data: { type: 'RELAPSE_CHECK' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delaySeconds,
        channelId: 'waky_relapse_check',
      },
    });

    console.log(`[Waky] T+15 Relapse check scheduled in ${delaySeconds}s. ID: ${id}`);
    return id;
  } catch (err) {
    console.warn('[Waky] Failed to schedule relapse check:', err);
    return null;
  }
}

/**
 * Cancel any pending relapse check notifications.
 */
export async function cancelRelapseCheck(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as Record<string, unknown>;
      if (data?.type === 'RELAPSE_CHECK') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (err) {
    console.warn('[Waky] Failed to cancel relapse check:', err);
  }
}
