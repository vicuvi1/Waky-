import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Timer, AlertTriangle, ArrowRight, ShieldCheck, Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  initialSeconds?: number;
  onStartMissions: () => void;
  onExpireRelapse: () => void;
}

export const GraceCountdownScreen: React.FC<Props> = ({
  initialSeconds = 120,
  onStartMissions,
  onExpireRelapse,
}) => {
  const [remaining, setRemaining] = useState(initialSeconds);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpireRelapse();
          return 0;
        }
        // Periodic warning pulse every 30 seconds
        if (prev % 30 === 0 && prev < initialSeconds) {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch (e) {}
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [initialSeconds, onExpireRelapse]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isUrgent = remaining <= 30;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Flame size={16} color="#EF4444" style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>ANTI-RELAPSE PROTOCOL ACTIVE</Text>
        </View>
        <Text style={styles.title}>2-Minute Grace Window</Text>
        <Text style={styles.subtitle}>
          Do NOT stay under the covers! You have 2 minutes to complete your in-bedroom missions before the penalty siren sounds.
        </Text>
      </View>

      {/* Countdown Ring */}
      <View style={styles.timerSection}>
        <Animated.View
          style={[
            styles.timerRing,
            isUrgent && styles.timerRingUrgent,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Timer size={44} color={isUrgent ? '#EF4444' : '#F59E0B'} />
          <Text style={[styles.timeDisplay, isUrgent && styles.timeDisplayUrgent]}>
            {timeFormatted}
          </Text>
          <Text style={styles.timerSub}>TIME UNTIL RELAPSE ALARM</Text>
        </Animated.View>
      </View>

      {/* In-Room Mission Roadmap */}
      <View style={styles.roadmapCard}>
        <Text style={styles.roadmapTitle}>YOUR IN-ROOM SEQUENCE (0 dB):</Text>
        <View style={styles.missionItem}>
          <ShieldCheck size={18} color="#10B981" style={{ marginRight: 10 }} />
          <Text style={styles.missionItemText}>1. Vertical Posture Hold (Gyroscope standing 45s)</Text>
        </View>
        <View style={styles.missionItem}>
          <ShieldCheck size={18} color="#10B981" style={{ marginRight: 10 }} />
          <Text style={styles.missionItemText}>2. Stroop Cognitive Duel (Reboot prefrontal cortex)</Text>
        </View>
        <View style={styles.missionItem}>
          <ShieldCheck size={18} color="#10B981" style={{ marginRight: 10 }} />
          <Text style={styles.missionItemText}>3. Desk / Door QR Scan (Physical bed exit proof)</Text>
        </View>
        <View style={styles.missionItem}>
          <ShieldCheck size={18} color="#10B981" style={{ marginRight: 10 }} />
          <Text style={styles.missionItemText}>4. "Made Bed" Photo Check (Lock out mattress)</Text>
        </View>
      </View>

      <View style={styles.alertBanner}>
        <AlertTriangle size={18} color="#EF4444" style={{ marginRight: 8 }} />
        <Text style={styles.alertText}>
          If this timer reaches 00:00, maximum volume relapse alarms will detonate.
        </Text>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={onStartMissions} activeOpacity={0.85}>
        <Text style={styles.startText}>START IN-ROOM MISSIONS</Text>
        <ArrowRight size={22} color="#000000" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 20,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F1D1D40',
    borderColor: '#EF444480',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  timerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  timerRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 5,
    borderColor: '#F59E0B',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  timerRingUrgent: {
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    backgroundColor: '#1C1318',
  },
  timeDisplay: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 6,
  },
  timeDisplayUrgent: {
    color: '#EF4444',
  },
  timerSub: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  roadmapCard: {
    backgroundColor: '#131824',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  roadmapTitle: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  missionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  missionItemText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450A0A30',
    borderColor: '#EF444460',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertText: {
    color: '#FCA5A5',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  startButton: {
    width: '100%',
    height: 60,
    backgroundColor: '#3B82F6',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 6,
  },
  startText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
