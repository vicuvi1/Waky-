import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, AppState, BackHandler } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { AlarmState, AlarmSettings, UserStats, MissionType } from './src/types';
import * as storageService from './src/services/storageService';
import * as hardwareService from './src/services/hardwareService';
import * as notificationService from './src/services/notificationService';
import * as historyService from './src/services/historyService';
import * as telegramService from './src/services/telegramService';

import { DashboardScreen } from './src/screens/DashboardScreen';
import { SunriseAlarmScreen } from './src/screens/SunriseAlarmScreen';
import { GraceCountdownScreen } from './src/screens/GraceCountdownScreen';
import { RelapsePenaltyScreen } from './src/screens/RelapsePenaltyScreen';
import { RelapseCheckScreen } from './src/screens/RelapseCheckScreen';
import { AwakeScreen } from './src/screens/AwakeScreen';

import { PostureHoldMission } from './src/screens/missions/PostureHoldMission';
import { StroopMission } from './src/screens/missions/StroopMission';
import { WaterQrMission } from './src/screens/missions/WaterQrMission';
import { BedPhotoMission } from './src/screens/missions/BedPhotoMission';
import { SquatCounterMission } from './src/screens/missions/SquatCounterMission';
import { WhisperMission } from './src/screens/missions/WhisperMission';
import { BedtimeLockdownScreen } from './src/screens/BedtimeLockdownScreen';
import { PushUpSportScreen } from './src/screens/PushUpSportScreen';

// ─── Extended alarm state machine ──────────────────────────────────────────
type FullAlarmState = AlarmState | 'RELAPSE_CHECK' | 'PUSH_UP_SPORT';

export default function App() {
  const [alarmState, setAlarmState] = useState<FullAlarmState>('IDLE');
  const [settings, setSettings] = useState<AlarmSettings>(storageService.DEFAULT_SETTINGS);
  const [stats, setStats] = useState<UserStats>(storageService.DEFAULT_STATS);
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [isDryRun, setIsDryRun] = useState(false);
  const appState = useRef(AppState.currentState);

  // ─── Load persisted data & setup hardware/notifications ───────────────────
  useEffect(() => {
    (async () => {
      const [loadedSettings, loadedStats] = await Promise.all([
        storageService.loadSettings(),
        storageService.loadStats(),
      ]);
      setSettings(loadedSettings);
      setStats(loadedStats);

      await hardwareService.setupAudioSession();
      await notificationService.setupNotifications();
      await telegramService.flushPendingMessages();

      // Re-schedule alarms in case of app restart
      if (loadedSettings.enabled) {
        notificationService.scheduleWakeAlarm(loadedSettings.targetWakeTime);
        notificationService.scheduleBedtimeWindDown(loadedSettings.targetBedtime);
      }
    })();
  }, []);

  // ─── Handle incoming notifications (app in foreground or background) ────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'WAKE_ALARM' && alarmState === 'IDLE') {
        setAlarmState('SUNRISE');
      }
      if (data?.type === 'RELAPSE_CHECK' && alarmState === 'IDLE') {
        setAlarmState('RELAPSE_CHECK');
      }
    });

    return () => sub.remove();
  }, [alarmState]);

  // ─── In-app alarm trigger check (when app is open in foreground) ─────────
  useEffect(() => {
    if (!settings.enabled || alarmState !== 'IDLE') return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (currentHHMM === settings.targetWakeTime && now.getSeconds() < 15) {
        setAlarmState('SUNRISE');
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [settings.enabled, settings.targetWakeTime, alarmState]);

  // ─── App lifecycle: watch for foreground resume from notification tap ────
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appState.current?.match(/inactive|background/) && nextState === 'active') {
        // Flush any queued offline telegram messages
        telegramService.flushPendingMessages();

        Notifications.getLastNotificationResponseAsync().then(response => {
          if (!response) return;
          const data = response.notification.request.content.data as Record<string, unknown>;
          if (data?.type === 'WAKE_ALARM' && alarmState === 'IDLE') {
            setAlarmState('SUNRISE');
          }
          if (data?.type === 'RELAPSE_CHECK' && alarmState === 'IDLE') {
            setAlarmState('RELAPSE_CHECK');
          }
        });
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, [alarmState]);

  // ─── Anti-Cheat: Hardware Back Button Trap ───────────────────────────────
  useEffect(() => {
    const onBackPress = () => {
      // Prevent user from backing out during active alarm, grace window, or missions
      if (alarmState !== 'IDLE' && alarmState !== 'AWAKE_CONFIRMED') {
        return true; // Trap back press
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSubscription.remove();
  }, [alarmState]);

  // ─── Settings Update ──────────────────────────────────────────────────────
  const handleUpdateSettings = async (newSettings: AlarmSettings) => {
    setSettings(newSettings);
    await storageService.saveSettings(newSettings);
  };

  // ─── Alarm Flow Handlers ─────────────────────────────────────────────────

  const handleTriggerTestAlarm = () => {
    setIsDryRun(false);
    setCurrentMissionIndex(0);
    setAlarmState('SUNRISE');
  };

  const handleTriggerDryRun = () => {
    setIsDryRun(true);
    setCurrentMissionIndex(0);
    setAlarmState('SUNRISE');
  };

  const handleDismissToGrace = () => {
    setAlarmState('GRACE_COUNTDOWN');
  };

  const handleStartPushUps = () => {
    setAlarmState('PUSH_UP_SPORT');
  };

  const handlePushUpsComplete = async () => {
    hardwareService.stopAllHardwareAlerts();

    const updatedStats = await storageService.recordSuccessfulWakeup();
    setStats(updatedStats);

    const now = new Date();
    const actualHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const [targetH, targetM] = settings.targetWakeTime.split(':').map(Number);
    const deltaMins = (now.getHours() * 60 + now.getMinutes()) - (targetH * 60 + targetM);

    await historyService.recordWakeEntry({
      date: now.toISOString().split('T')[0],
      targetTime: settings.targetWakeTime,
      actualTime: actualHHMM,
      deltaMinutes: deltaMins,
      completed: true,
      missionsCount: 1,
      streak: updatedStats.currentStreak,
    });

    await telegramService.sendMessage(
      `🏋️ *WAKY SPORT PROOF: Victor is AWAKE!*\n\n✅ *${settings.targetPushUps ?? 20} PUSH-UPS CRUSHED!*\n⏰ Time: \`${actualHHMM}\`\n🔥 Current streak: *${updatedStats.currentStreak} days*\n\nSleep inertia crushed on the floor. Moving forward with the day! 💪`
    );

    setIsDryRun(false);
    setAlarmState('IDLE');
  };

  const handleStartMissions = () => {
    setCurrentMissionIndex(0);
    setAlarmState('MISSION');
  };

  const handleExpireRelapse = async () => {
    // If user enabled partner forfeit alert, notify partner immediately
    if (settings.partnerAlertEnabled) {
      await telegramService.sendRelapseAlert(undefined, settings.partnerChatId || undefined);
    }
    setAlarmState('RELAPSE_PENALTY');
  };

  const handleMissionComplete = async () => {
    const nextIdx = currentMissionIndex + 1;

    if (nextIdx < settings.activeMissions.length) {
      setCurrentMissionIndex(nextIdx);
    } else {
      // All missions cleared → record streak + schedule T+15 relapse check
      const updatedStats = await storageService.recordSuccessfulWakeup();
      setStats(updatedStats);

      // Record daily wake entry for 7-day circadian graph
      const now = new Date();
      const actualHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const [targetH, targetM] = settings.targetWakeTime.split(':').map(Number);
      const deltaMins = (now.getHours() * 60 + now.getMinutes()) - (targetH * 60 + targetM);

      await historyService.recordWakeEntry({
        date: now.toISOString().split('T')[0],
        targetTime: settings.targetWakeTime,
        actualTime: actualHHMM,
        deltaMinutes: deltaMins,
        completed: true,
        missionsCount: settings.activeMissions.length,
        streak: updatedStats.currentStreak,
      });

      // Send Telegram accountability success message
      await telegramService.sendWakeupSuccess(
        updatedStats.currentStreak,
        actualHHMM,
        settings.activeMissions.length
      );

      // Schedule T+15 relapse check notification (15 min = 900s)
      await notificationService.scheduleRelapseCheck(900);

      setAlarmState('AWAKE_CONFIRMED');
    }
  };

  const handleFinishFromAwake = () => {
    hardwareService.stopAllHardwareAlerts();
    setIsDryRun(false);
    setAlarmState('IDLE');
  };

  // ─── Render Active Mission ────────────────────────────────────────────────
  const renderCurrentMission = () => {
    const activeMissionType: MissionType = settings.activeMissions[currentMissionIndex] || 'POSTURE_HOLD';

    switch (activeMissionType) {
      case 'POSTURE_HOLD':
        return (
          <PostureHoldMission
            onComplete={handleMissionComplete}
            targetSeconds={isDryRun ? 5 : (settings.postureSeconds ?? 45)}
          />
        );
      case 'STROOP_TEST':
        return (
          <StroopMission
            onComplete={handleMissionComplete}
            requiredStreak={isDryRun ? 3 : (settings.stroopStreak ?? 7)}
          />
        );
      case 'SQUAT_COUNTER':
        return (
          <SquatCounterMission
            onComplete={handleMissionComplete}
            targetSquats={isDryRun ? 3 : (settings.targetSquats ?? 10)}
          />
        );
      case 'WHISPER_AFFIRMATION':
        return (
          <WhisperMission
            onComplete={handleMissionComplete}
            whisperPhrase={settings.whisperPhrase}
          />
        );
      case 'WATER_QR':
        return (
          <WaterQrMission
            onComplete={handleMissionComplete}
            expectedSecret={settings.qrCodeSecret}
          />
        );
      case 'BED_PHOTO':
        return <BedPhotoMission onComplete={handleMissionComplete} />;
      default:
        return <PostureHoldMission onComplete={handleMissionComplete} />;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" />
      <View style={styles.container}>

        {alarmState === 'IDLE' && (
          <DashboardScreen
            settings={settings}
            stats={stats}
            onUpdateSettings={handleUpdateSettings}
            onTriggerTestAlarm={handleTriggerTestAlarm}
            onTriggerDryRun={handleTriggerDryRun}
            onOpenBedtimeLockdown={() => setAlarmState('BEDTIME_LOCKDOWN')}
          />
        )}

        {alarmState === 'SUNRISE' && (
          <SunriseAlarmScreen
            targetWakeTime={settings.targetWakeTime}
            soundProfile={settings.soundProfile}
            dopamineAnchor={settings.dopamineAnchor}
            onDismissToGrace={handleDismissToGrace}
            onStartPushUps={handleStartPushUps}
          />
        )}

        {alarmState === 'PUSH_UP_SPORT' && (
          <PushUpSportScreen
            targetPushUps={isDryRun ? 3 : (settings.targetPushUps ?? 20)}
            onComplete={handlePushUpsComplete}
            onUpdateTarget={val => handleUpdateSettings({ ...settings, targetPushUps: val })}
          />
        )}

        {alarmState === 'BEDTIME_LOCKDOWN' && (
          <BedtimeLockdownScreen
            targetWakeTime={settings.targetWakeTime}
            dopamineAnchor={settings.dopamineAnchor}
            onSaveDopamineAnchor={val => handleUpdateSettings({ ...settings, dopamineAnchor: val })}
            onExit={() => setAlarmState('IDLE')}
          />
        )}

        {alarmState === 'GRACE_COUNTDOWN' && (
          <GraceCountdownScreen
            initialSeconds={isDryRun ? 8 : settings.graceDurationSeconds}
            dopamineAnchor={settings.dopamineAnchor}
            onStartMissions={handleStartMissions}
            onExpireRelapse={handleExpireRelapse}
          />
        )}

        {alarmState === 'MISSION' && renderCurrentMission()}

        {alarmState === 'RELAPSE_PENALTY' && (
          <RelapsePenaltyScreen
            onDisarmToMissions={() => {
              setAlarmState('MISSION');
            }}
          />
        )}

        {alarmState === 'AWAKE_CONFIRMED' && (
          <AwakeScreen
            stats={stats}
            onFinish={handleFinishFromAwake}
          />
        )}

        {/* ── T+15 Relapse Check ── */}
        {alarmState === 'RELAPSE_CHECK' && (
          <RelapseCheckScreen
            countdownSeconds={60}
            onConfirmed={() => {
              // Cancel any pending relapse check notifications
              notificationService.cancelRelapseCheck();
              setAlarmState('IDLE');
            }}
            onExpired={() => {
              // Fire the full relapse penalty!
              notificationService.cancelRelapseCheck();
              setAlarmState('RELAPSE_PENALTY');
            }}
          />
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090A0F',
    paddingTop: StatusBar.currentHeight || 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
  },
});
