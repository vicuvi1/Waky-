import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Sun, Bell, Volume2, ShieldAlert } from 'lucide-react-native';
import * as hardwareService from '../services/hardwareService';

import { SoundProfile } from '../types';

interface Props {
  onDismissToGrace: () => void;
  targetWakeTime: string;
  soundProfile?: SoundProfile;
}

export const SunriseAlarmScreen: React.FC<Props> = ({
  onDismissToGrace,
  targetWakeTime,
  soundProfile = 'PROGRESSIVE_CHIME',
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Map sound profile to asset key
    const soundKey =
      soundProfile === 'GAMMA_40HZ'
        ? 'gamma_40hz'
        : soundProfile === 'EMERGENCY_KLAXON'
        ? 'emergency_klaxon'
        : 'progressive_chime';

    // Maximize brightness and hardware alarms
    hardwareService.keepDeviceAwake();
    hardwareService.maximizeBrightness();
    hardwareService.playSound(soundKey, true, 0.9);
    hardwareService.startHaptics('BALANCED');

    // Pulsing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.9,
          duration: 1400,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1400,
          useNativeDriver: false,
        }),
      ])
    ).start();

    return () => {
      // Do not release wake yet since Grace Timer follows immediately
    };
  }, []);

  const handleDismiss = async () => {
    await hardwareService.stopSound();
    hardwareService.stopHaptics();
    onDismissToGrace();
  };

  const now = new Date();
  const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      {/* Light Therapy Background Aura */}
      <Animated.View style={[styles.sunriseAura, { opacity: glowAnim }]} />

      <View style={styles.topBar}>
        <View style={styles.badge}>
          <Sun size={18} color="#F59E0B" style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>COOL DAYLIGHT SUNRISE ACTIVE</Text>
        </View>
      </View>

      <View style={styles.clockSection}>
        <Text style={styles.timeLabel}>ALARM TIME</Text>
        <Text style={styles.currentTime}>{timeString}</Text>
        <Text style={styles.targetSub}>Target: {targetWakeTime} AM</Text>
      </View>

      <Animated.View style={[styles.centerRing, { transform: [{ scale: pulseAnim }] }]}>
        <Sun size={76} color="#FBBF24" />
        <Text style={styles.wakeHeading}>Time to Rise</Text>
        <Text style={styles.wakeSub}>Melanopsin light therapy at 100% brightness</Text>
      </Animated.View>

      <View style={styles.warningBox}>
        <ShieldAlert size={18} color="#F59E0B" style={{ marginRight: 8 }} />
        <Text style={styles.warningText}>
          Dismissing starts the 2-minute Anti-Relapse Grace Timer. Don't linger in bed!
        </Text>
      </View>

      <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss} activeOpacity={0.85}>
        <Bell size={22} color="#000000" style={{ marginRight: 10 }} />
        <Text style={styles.dismissText}>I'M UP — START 2-MIN GRACE</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0C14',
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  sunriseAura: {
    position: 'absolute',
    top: -100,
    width: 450,
    height: 450,
    borderRadius: 225,
    backgroundColor: '#FEF3C7',
    transform: [{ scale: 1.4 }],
  },
  topBar: {
    marginTop: 30,
    zIndex: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  badgeText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  clockSection: {
    alignItems: 'center',
    zIndex: 10,
  },
  timeLabel: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  currentTime: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 2,
  },
  targetSub: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  centerRing: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#1E2433',
    borderWidth: 4,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
    zIndex: 10,
  },
  wakeHeading: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 10,
  },
  wakeSub: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#78350F30',
    borderColor: '#F59E0B60',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    zIndex: 10,
  },
  warningText: {
    color: '#FDE68A',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  dismissButton: {
    width: '100%',
    height: 64,
    backgroundColor: '#F59E0B',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 10,
  },
  dismissText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
