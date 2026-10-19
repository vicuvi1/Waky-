import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, HandMetal, Timer, Flame, ArrowRight, ShieldCheck, ShieldAlert, Target } from 'lucide-react-native';

interface Props {
  initialSeconds?: number;
  dopamineAnchor?: string;
  onStartMissions: () => void;
  onExpireRelapse: () => void;
}

// Detect if phone is flat (on a table/bed) — |z| dominant
const isPhoneFlat = (x: number, y: number, z: number): boolean => {
  return Math.abs(z) > 0.75 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5;
};

export const GraceCountdownScreen: React.FC<Props> = ({
  initialSeconds = 120,
  dopamineAnchor,
  onStartMissions,
  onExpireRelapse,
}) => {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [isFlat, setIsFlat] = useState(false);
  const [flatSeconds, setFlatSeconds] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flatWarningAnim = useRef(new Animated.Value(0)).current;
  const lastHapticRef = useRef<number>(0);
  const flatDurationRef = useRef<number>(0);
  const flatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Pulsing ring animation ──────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Table-Down / Bed Inertia Detector ──────────────────────────────────
  useEffect(() => {
    Accelerometer.setUpdateInterval(300);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const flat = isPhoneFlat(x, y, z);
      setIsFlat(flat);
    });
    return () => sub.remove();
  }, []);

  // Track how long the phone is flat
  useEffect(() => {
    if (isFlat) {
      flatIntervalRef.current = setInterval(() => {
        flatDurationRef.current += 1;
        setFlatSeconds(flatDurationRef.current);

        // After 10s flat → warning vibration pulse
        if (flatDurationRef.current >= 10) {
          const now = Date.now();
          if (now - lastHapticRef.current > 1500) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch (e) {}
            lastHapticRef.current = now;
          }
        }

        // Flash the flat-warning banner
        Animated.sequence([
          Animated.timing(flatWarningAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(flatWarningAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start();
      }, 1000);
    } else {
      if (flatIntervalRef.current) clearInterval(flatIntervalRef.current);
      flatDurationRef.current = 0;
      setFlatSeconds(0);
    }
    return () => {
      if (flatIntervalRef.current) clearInterval(flatIntervalRef.current);
    };
  }, [isFlat]);

  // ─── Main Countdown Timer ────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpireRelapse();
          return 0;
        }
        if (prev % 30 === 0 && prev < initialSeconds) {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
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
  const isFlatWarning = isFlat && flatSeconds >= 10;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Flame size={16} color="#EF4444" style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>ANTI-RELAPSE PROTOCOL ACTIVE</Text>
        </View>
        <Text style={styles.title}>2-Minute Grace Window</Text>
        <Text style={styles.subtitle}>
          Do NOT stay under the covers! You have 2 minutes to start your in-bedroom missions.
        </Text>
      </View>

      {/* ── Night-Before Dopamine Anchor ── */}
      {!!dopamineAnchor && (
        <View style={styles.anchorCard}>
          <Target size={18} color="#F59E0B" style={{ marginRight: 8, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.anchorLabel}>PROMISED LAST NIGHT:</Text>
            <Text style={styles.anchorText}>"{dopamineAnchor}"</Text>
          </View>
        </View>
      )}

      {/* ── Table-Down Inertia Warning Banner ── */}
      {isFlat && (
        <Animated.View
          style={[
            styles.flatWarning,
            isFlatWarning && styles.flatWarningCritical,
            { opacity: isFlatWarning ? 1 : Animated.add(0.7, flatWarningAnim) },
          ]}
        >
          <AlertTriangle size={20} color={isFlatWarning ? '#EF4444' : '#F59E0B'} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.flatWarnTitle, isFlatWarning && { color: '#EF4444' }]}>
              {isFlatWarning ? '🚨 PICK UP YOUR PHONE!' : '📱 Phone is flat — are you in bed?'}
            </Text>
            <Text style={styles.flatWarnSub}>
              {isFlatWarning
                ? `Phone on bed/desk for ${flatSeconds}s! STAND UP RIGHT NOW.`
                : 'Hold the phone vertically. Do not lay it on the nightstand.'}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── Countdown Ring ── */}
      <View style={styles.timerSection}>
        <Animated.View
          style={[
            styles.timerRing,
            isUrgent && styles.timerRingUrgent,
            isFlatWarning && styles.timerRingFlat,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Timer size={40} color={isUrgent ? '#EF4444' : isFlatWarning ? '#F59E0B' : '#3B82F6'} />
          <Text style={[styles.timeDisplay, isUrgent && styles.timeUrgent, isFlatWarning && styles.timeFlat]}>
            {timeFormatted}
          </Text>
          <Text style={styles.timerSub}>TIME UNTIL RELAPSE ALARM</Text>
        </Animated.View>
      </View>

      {/* ── In-Room Mission Roadmap ── */}
      <View style={styles.roadmapCard}>
        <Text style={styles.roadmapTitle}>YOUR IN-ROOM SEQUENCE:</Text>
        {['Vertical Posture Hold (45s on feet)', 'Stroop Cognitive Duel (7 correct)', 'Desk / Door QR Scan (out of bed)', '"Made Bed" Photo Proof (lock mattress)'].map((m, i) => (
          <View key={i} style={styles.missionItem}>
            <ShieldCheck size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.missionItemText}>{i + 1}. {m}</Text>
          </View>
        ))}
      </View>

      <View style={styles.alertBanner}>
        <ShieldAlert size={16} color="#EF4444" style={{ marginRight: 8 }} />
        <Text style={styles.alertText}>
          Timer hitting 00:00 = maximum relapse siren. Complete missions to stop it.
        </Text>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={onStartMissions} activeOpacity={0.85}>
        <Text style={styles.startText}>START IN-ROOM MISSIONS</Text>
        <ArrowRight size={20} color="#000" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
    padding: 22,
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
    marginBottom: 10,
  },
  badgeText: { color: '#F87171', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  // Night-Before Dopamine Anchor
  anchorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    borderColor: '#6366F1',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  anchorLabel: { color: '#A5B4FC', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  anchorText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginTop: 2 },

  // Flat warning banner
  flatWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#78350F40',
    borderColor: '#F59E0B80',
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
  },
  flatWarningCritical: {
    backgroundColor: '#450A0A50',
    borderColor: '#EF444490',
  },
  flatWarnTitle: { color: '#FDE68A', fontSize: 13, fontWeight: '800' },
  flatWarnSub: { color: '#FCA5A5', fontSize: 11, marginTop: 2 },

  // Timer ring
  timerSection: { alignItems: 'center', justifyContent: 'center' },
  timerRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 5,
    borderColor: '#3B82F6',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  timerRingUrgent: { borderColor: '#EF4444', shadowColor: '#EF4444', backgroundColor: '#1C1318' },
  timerRingFlat: { borderColor: '#F59E0B', shadowColor: '#F59E0B' },
  timeDisplay: { color: '#FFFFFF', fontSize: 44, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  timeUrgent: { color: '#EF4444' },
  timeFlat: { color: '#F59E0B' },
  timerSub: { color: '#9CA3AF', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 4 },

  // Mission roadmap
  roadmapCard: {
    backgroundColor: '#131824',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  roadmapTitle: { color: '#60A5FA', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  missionItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  missionItemText: { color: '#D1D5DB', fontSize: 12 },

  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450A0A30',
    borderColor: '#EF444460',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  alertText: { color: '#FCA5A5', fontSize: 12, flex: 1 },

  startButton: {
    width: '100%',
    height: 58,
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  startText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
