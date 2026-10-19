import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { Activity, CheckCircle2, Zap, ShieldCheck } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
  targetSquats?: number;
}

type SquatPhase = 'TOP' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING';

export const SquatCounterMission: React.FC<Props> = ({ onComplete, targetSquats = 10 }) => {
  const [reps, setReps] = useState(0);
  const [currentG, setCurrentG] = useState(1.0);
  const [phase, setPhase] = useState<SquatPhase>('TOP');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const phaseRef = useRef<SquatPhase>('TOP');
  const lastRepTimeRef = useRef<number>(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // Total magnitude of acceleration in Gs
      const mag = Math.sqrt(x * x + y * y + z * z);
      setCurrentG(mag);

      const now = Date.now();
      const currentPhase = phaseRef.current;

      // ── Squat state machine ──────────────────────────────────────────────
      // Phase 1: Downward acceleration dip (weightlessness phase: < 0.82 G)
      if (currentPhase === 'TOP' && mag < 0.82) {
        phaseRef.current = 'DESCENDING';
        setPhase('DESCENDING');
      }
      // Phase 2: Deceleration / turnaround at bottom of squat (> 1.22 G)
      else if (currentPhase === 'DESCENDING' && mag > 1.22) {
        phaseRef.current = 'BOTTOM';
        setPhase('BOTTOM');
      }
      // Phase 3: Pushing back up to standing
      else if (currentPhase === 'BOTTOM' && mag < 1.05 && mag > 0.90) {
        phaseRef.current = 'TOP';
        setPhase('TOP');

        // Debounce: must be at least 800ms between reps to prevent false double-counts
        if (now - lastRepTimeRef.current > 800) {
          lastRepTimeRef.current = now;
          setReps(prev => {
            const next = prev + 1;
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            } catch (e) {}

            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
              Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
            ]).start();

            if (next >= targetSquats) {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {}
              setTimeout(() => {
                onComplete();
              }, 400);
            }
            return next;
          });
        }
      }
    });

    return () => subscription.remove();
  }, [targetSquats, onComplete]);

  const progressPercent = Math.min(100, Math.round((reps / targetSquats) * 100));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>PHYSICAL ACTIVATION (0 dB)</Text>
        <Text style={styles.title}>10 Bedroom Squats</Text>
        <Text style={styles.subtitle}>
          Hold phone against your chest. Perform smooth standing squats to pump blood to your brain!
        </Text>
      </View>

      {/* Main Rep Counter Circle */}
      <View style={styles.centerSection}>
        <Animated.View style={[styles.repCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Activity size={36} color="#3B82F6" />
          <Text style={styles.repCount}>{reps}</Text>
          <Text style={styles.repTarget}>OF {targetSquats} REPS</Text>
          <View style={styles.phasePill}>
            <Text style={styles.phaseText}>
              {phase === 'TOP' ? 'STAND TALL' : phase === 'DESCENDING' ? 'SQUAT DOWN' : 'STAND UP!'}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Live Acceleration Meter */}
      <View style={styles.telemetryCard}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Blood Flow Activation:</Text>
          <Text style={styles.telemetryValue}>{progressPercent}%</Text>
        </View>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>S23 Ultra Motion Force:</Text>
          <Text style={styles.telemetryValue}>{currentG.toFixed(2)} G</Text>
        </View>
      </View>

      <View style={styles.tipBox}>
        <Zap size={18} color="#F59E0B" style={{ marginRight: 8 }} />
        <Text style={styles.tipText}>
          10 squats raises your heart rate from 55 to 90 bpm, destroying sleep inertia at 0 dB noise.
        </Text>
      </View>

      {/* Bypass / Test Button */}
      <TouchableOpacity
        style={styles.bypassButton}
        onPress={() => {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
          onComplete();
        }}
      >
        <CheckCircle2 size={16} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={styles.bypassText}>Skip / Simulate Pass</Text>
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
  tag: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
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
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  repCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#111827',
    borderWidth: 5,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  repCount: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
    marginTop: 2,
  },
  repTarget: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  phasePill: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  phaseText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  telemetryCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  progressBg: {
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  telemetryLabel: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#78350F25',
    borderColor: '#F59E0B60',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  tipText: {
    color: '#FDE68A',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  bypassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  bypassText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
});
