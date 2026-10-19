import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { ShieldAlert, CheckCircle2, Smartphone, AlertTriangle } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
  targetSeconds?: number;
}

export const PostureHoldMission: React.FC<Props> = ({ onComplete, targetSeconds = 45 }) => {
  const [remainingSeconds, setRemainingSeconds] = useState(targetSeconds);
  const [isUpright, setIsUpright] = useState(false);
  const [tiltAngle, setTiltAngle] = useState({ y: 0, z: 0 });
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastHapticRef = useRef<number>(0);

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subscribe to Accelerometer
    Accelerometer.setUpdateInterval(150);
    const subscription = Accelerometer.addListener(data => {
      // In upright portrait hold, |y| is dominant (~0.75 - 1.0) and |z| (bed flat) is low (<0.55)
      const upright = Math.abs(data.y) >= 0.68 && Math.abs(data.z) <= 0.65;
      setIsUpright(upright);
      setTiltAngle({ y: data.y, z: data.z });

      if (!upright) {
        const now = Date.now();
        if (now - lastHapticRef.current > 1500) {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          } catch (e) {}
          lastHapticRef.current = now;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Timer countdown only when upright
  useEffect(() => {
    if (!isUpright) return;

    const timer = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isUpright, onComplete]);

  const progressPercent = Math.round(((targetSeconds - remainingSeconds) / targetSeconds) * 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>IN-ROOM MISSION 1 / 4</Text>
        <Text style={styles.title}>Vertical Posture Hold</Text>
        <Text style={styles.subtitle}>
          Stand up or sit straight. Hold your phone completely vertical at eye level.
        </Text>
      </View>

      {/* Main Status Indicator */}
      <View style={styles.indicatorContainer}>
        <Animated.View
          style={[
            styles.circleOutline,
            isUpright ? styles.circleUpright : styles.circleTilted,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          {isUpright ? (
            <Smartphone color="#10B981" size={54} />
          ) : (
            <AlertTriangle color="#EF4444" size={54} />
          )}
          <Text style={styles.timerText}>{remainingSeconds}s</Text>
          <Text style={[styles.statusText, { color: isUpright ? '#10B981' : '#EF4444' }]}>
            {isUpright ? 'COUNTING DOWN...' : 'TILTED! HOLD VERTICAL'}
          </Text>
        </Animated.View>
      </View>

      {/* Progress & Sensor Telemetry */}
      <View style={styles.telemetryCard}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Posture Progress:</Text>
          <Text style={styles.telemetryValue}>{progressPercent}%</Text>
        </View>
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>S23 Ultra Gyro/Tilt Y:</Text>
          <Text style={styles.telemetryValue}>{tiltAngle.y.toFixed(2)} G</Text>
        </View>
      </View>

      <View style={styles.tipBox}>
        <ShieldAlert size={18} color="#F59E0B" style={{ marginRight: 8 }} />
        <Text style={styles.tipText}>
          If you tilt horizontal (lie down) or put the phone on the bed, the timer pauses immediately!
        </Text>
      </View>

      {/* Developer / Simulation shortcut */}
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  indicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  circleOutline: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  circleUpright: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  circleTilted: {
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    marginTop: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  telemetryCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  telemetryLabel: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  telemetryValue: {
    color: '#E5E7EB',
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
    color: '#FCD34D',
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
