import React, { useState, useEffect } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import { AlarmState, AlarmSettings, UserStats, MissionType } from './src/types';
import * as storageService from './src/services/storageService';
import * as hardwareService from './src/services/hardwareService';

import { DashboardScreen } from './src/screens/DashboardScreen';
import { SunriseAlarmScreen } from './src/screens/SunriseAlarmScreen';
import { GraceCountdownScreen } from './src/screens/GraceCountdownScreen';
import { RelapsePenaltyScreen } from './src/screens/RelapsePenaltyScreen';
import { AwakeScreen } from './src/screens/AwakeScreen';

import { PostureHoldMission } from './src/screens/missions/PostureHoldMission';
import { StroopMission } from './src/screens/missions/StroopMission';
import { WaterQrMission } from './src/screens/missions/WaterQrMission';
import { BedPhotoMission } from './src/screens/missions/BedPhotoMission';

export default function App() {
  const [alarmState, setAlarmState] = useState<AlarmState>('IDLE');
  const [settings, setSettings] = useState<AlarmSettings>(storageService.DEFAULT_SETTINGS);
  const [stats, setStats] = useState<UserStats>(storageService.DEFAULT_STATS);
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);

  // Load persisted settings and user stats on startup
  useEffect(() => {
    (async () => {
      const loadedSettings = await storageService.loadSettings();
      const loadedStats = await storageService.loadStats();
      setSettings(loadedSettings);
      setStats(loadedStats);
      await hardwareService.setupAudioSession();
    })();
  }, []);

  // Periodic alarm trigger check (runs in background of app)
  useEffect(() => {
    if (!settings.enabled || alarmState !== 'IDLE') return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (currentHHMM === settings.targetWakeTime && now.getSeconds() < 10) {
        setAlarmState('SUNRISE');
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [settings.enabled, settings.targetWakeTime, alarmState]);

  const handleUpdateSettings = async (newSettings: AlarmSettings) => {
    setSettings(newSettings);
    await storageService.saveSettings(newSettings);
  };

  // Launch the 30-second full protocol test
  const handleTriggerTestAlarm = () => {
    setCurrentMissionIndex(0);
    setAlarmState('SUNRISE');
  };

  // When user dismisses the initial sunrise alarm, enter the 2-Minute Grace Timer
  const handleDismissToGrace = () => {
    setAlarmState('GRACE_COUNTDOWN');
  };

  // When user presses "Start Missions" from the Grace countdown screen
  const handleStartMissions = () => {
    setCurrentMissionIndex(0);
    setAlarmState('MISSION');
  };

  // If user fails to complete missions within the 2-minute grace timer
  const handleExpireRelapse = () => {
    setAlarmState('RELAPSE_PENALTY');
  };

  // Advance to next in-bedroom mission or finish waking up
  const handleMissionComplete = async () => {
    const nextIdx = currentMissionIndex + 1;
    if (nextIdx < settings.activeMissions.length) {
      setCurrentMissionIndex(nextIdx);
    } else {
      // All in-room missions cleared!
      const updatedStats = await storageService.recordSuccessfulWakeup();
      setStats(updatedStats);
      setAlarmState('AWAKE_CONFIRMED');
    }
  };

  // Render active mission
  const renderCurrentMission = () => {
    const activeMissionType = settings.activeMissions[currentMissionIndex] || 'POSTURE_HOLD';

    switch (activeMissionType) {
      case 'POSTURE_HOLD':
        return <PostureHoldMission onComplete={handleMissionComplete} targetSeconds={45} />;
      case 'STROOP_TEST':
        return <StroopMission onComplete={handleMissionComplete} requiredStreak={7} />;
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
          />
        )}

        {alarmState === 'SUNRISE' && (
          <SunriseAlarmScreen
            targetWakeTime={settings.targetWakeTime}
            onDismissToGrace={handleDismissToGrace}
          />
        )}

        {alarmState === 'GRACE_COUNTDOWN' && (
          <GraceCountdownScreen
            initialSeconds={settings.graceDurationSeconds}
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
            onFinish={() => {
              setAlarmState('IDLE');
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
