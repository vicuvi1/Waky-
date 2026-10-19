import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as hardwareService from '../services/hardwareService';
import { BellRing, ShieldCheck, Timer, CheckCircle2, AlertTriangle } from 'lucide-react-native';

interface Props {
  /** Called when the user successfully confirms they are still up */
  onConfirmed: () => void;
  /** Called when the 60-second window expires with no response */
  onExpired: () => void;
  /** Countdown duration in seconds, default 60 */
  countdownSeconds?: number;
}

export const RelapseCheckScreen: React.FC<Props> = ({
  onConfirmed,
  onExpired,
  countdownSeconds = 60,
}) => {
  const [remaining, setRemaining] = useState(countdownSeconds);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Immediate haptic wake when screen appears
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {}

    // Fire haptics and a flash every 15s
    hardwareService.startHaptics('BALANCED');

    // Pulsing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    // Flash border animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ])
    ).start();

    // Countdown
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          hardwareService.stopHaptics();
          onExpired();
          return 0;
        }
        // Extra haptic pulse every 10s
        if (prev % 10 === 0) {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (e) {}
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      hardwareService.stopHaptics();
    };
  }, []);

  const handleConfirm = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    hardwareService.stopHaptics();
    onConfirmed();
  };

  const progressPercent = Math.round(((countdownSeconds - remaining) / countdownSeconds) * 100);
  const isUrgent = remaining <= 15;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Animated.View
          style={[
            styles.iconRing,
            {
              transform: [{ scale: pulseAnim }],
              borderColor: flashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#F59E0B', '#EF4444'] }),
            },
          ]}
        >
          <BellRing size={52} color={isUrgent ? '#EF4444' : '#F59E0B'} />
        </Animated.View>

        <Text style={styles.title}>T+15 RELAPSE CHECK</Text>
        <Text style={styles.subtitle}>
          15 minutes have passed since your last mission. Confirm you are still out of bed!
        </Text>
      </View>

      {/* Countdown */}
      <View style={styles.timerSection}>
        <Text style={styles.timerLabel}>CONFIRM IN</Text>
        <Text style={[styles.timerDisplay, isUrgent && styles.timerUrgent]}>
          {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
        </Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercent}%`, backgroundColor: isUrgent ? '#EF4444' : '#F59E0B' },
            ]}
          />
        </View>
        <Text style={styles.timerSub}>OR THE RELAPSE SIREN FIRES</Text>
      </View>

      {/* Status Card */}
      <View style={styles.checklistCard}>
        <Text style={styles.checklistTitle}>RIGHT NOW VERIFY YOU ARE:</Text>
        {[
          'Standing up (not in bed)',
          'Phone held vertically in your hand',
          'In a lighted room (not under covers)',
        ].map((item, i) => (
          <View key={i} style={styles.checklistRow}>
            <ShieldCheck size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.checklistText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.warningBox}>
        <AlertTriangle size={16} color="#F59E0B" style={{ marginRight: 8 }} />
        <Text style={styles.warningText}>
          No response in {remaining}s = relapse siren triggers. You have been warned!
        </Text>
      </View>

      {/* Confirm Button */}
      <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm} activeOpacity={0.85}>
        <CheckCircle2 size={24} color="#000000" style={{ marginRight: 10 }} />
        <Text style={styles.confirmText}>YES, I'M STILL UP!</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0900',
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: { alignItems: 'center', marginTop: 30 },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    backgroundColor: '#1C1400',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 10,
    marginBottom: 18,
  },
  title: {
    color: '#FBBF24',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  subtitle: {
    color: '#D97706',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  timerSection: { alignItems: 'center', width: '100%' },
  timerLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  timerDisplay: { color: '#FBBF24', fontSize: 64, fontWeight: '900', letterSpacing: 2 },
  timerUrgent: { color: '#EF4444' },
  progressBarBg: { width: '80%', height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  timerSub: { color: '#EF4444', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 8 },

  checklistCard: {
    width: '100%',
    backgroundColor: '#141008',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#78350F60',
  },
  checklistTitle: { color: '#FBBF24', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  checklistText: { color: '#D1D5DB', fontSize: 13 },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#78350F25',
    borderColor: '#F59E0B60',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  warningText: { color: '#FDE68A', fontSize: 12, flex: 1 },

  confirmButton: {
    width: '100%',
    height: 62,
    backgroundColor: '#F59E0B',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 8,
  },
  confirmText: { color: '#000000', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
});
