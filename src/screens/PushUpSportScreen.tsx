import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { LightSensor } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { Dumbbell, CheckCircle2, Flame, Droplets, ArrowRight, Minus, Plus, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import * as hardwareService from '../services/hardwareService';

const { width } = Dimensions.get('window');

interface Props {
  targetPushUps?: number;
  onComplete: () => void;
  onUpdateTarget?: (target: number) => void;
}

export const PushUpSportScreen: React.FC<Props> = ({
  targetPushUps = 20,
  onComplete,
  onUpdateTarget,
}) => {
  const [target, setTarget] = useState(targetPushUps);
  const [reps, setReps] = useState(0);
  const [isDown, setIsDown] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [isSlackingWarning, setIsSlackingWarning] = useState(false);

  const baselineLuxRef = useRef<number | null>(null);
  const lastRepTimeRef = useRef<number>(Date.now());
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Animation on rep change ──────────────────────────────────────────────
  const triggerRepAnimation = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.18, duration: 120, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  // ── Register +1 Rep with Haptic & Sound ──────────────────────────────────
  const registerRep = () => {
    if (isFinished) return;

    const now = Date.now();
    if (now - lastRepTimeRef.current < 550) return; // Debounce rapid spam
    lastRepTimeRef.current = now;

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}

    // Play crisp confirmation chime
    hardwareService.playSound('chime', false, 1.0);

    setIdleSeconds(0);
    setIsSlackingWarning(false);
    triggerRepAnimation();

    setReps(prev => {
      const next = prev + 1;
      if (next >= target) {
        setIsFinished(true);
        hardwareService.stopSound();
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}
      }
      return next;
    });
  };

  // ── Light Sensor Proximity Detection (Chest over phone on floor) ─────────
  useEffect(() => {
    let sub: any = null;
    try {
      LightSensor.setUpdateInterval(100);
      sub = LightSensor.addListener(({ illuminance }) => {
        if (isFinished) return;

        // Learn initial ambient light level
        if (baselineLuxRef.current === null) {
          baselineLuxRef.current = Math.max(illuminance, 25);
        }

        const baseline = baselineLuxRef.current;
        const isCovered = illuminance < 12 || illuminance < baseline * 0.35;

        if (isCovered && !isDown) {
          setIsDown(true);
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch (e) {}
        } else if (!isCovered && isDown) {
          setIsDown(false);
          registerRep();
        }
      });
    } catch (e) {
      console.warn('LightSensor not available, using touch pad fallback:', e);
    }

    return () => {
      if (sub) sub.remove();
    };
  }, [isDown, isFinished, target]);

  // ── Anti-Slacking "Wake Up" Voice & Siren Alert ──────────────────────────
  useEffect(() => {
    if (isFinished) return;

    const timer = setInterval(() => {
      setIdleSeconds(prev => {
        const next = prev + 1;
        // If idle for more than 6 seconds, warn user to wake up and push
        if (next >= 6 && next % 5 === 0) {
          setIsSlackingWarning(true);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e) {}
          // Sound the progressive reminder alert
          hardwareService.playSound('progressive_chime', false, 0.9);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isFinished]);

  // Adjust target up or down
  const adjustTarget = (delta: number) => {
    const newTarget = Math.max(5, Math.min(50, target + delta));
    setTarget(newTarget);
    if (onUpdateTarget) onUpdateTarget(newTarget);
  };

  const progressPercent = Math.min(100, Math.round((reps / target) * 100));

  return (
    <View style={styles.container}>
      {/* ── Top Bar: Mode Title & Target Editor ── */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Dumbbell size={16} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>SPORT PROOF WAKE PROTOCOL</Text>
        </View>

        <Text style={styles.title}>20 Push-Ups to Disarm</Text>
        <Text style={styles.subtitle}>
          Place your phone on the floor under your chest. Lower down until your chest/chin touches or covers the sensor!
        </Text>

        {/* Editable Target Controls */}
        <View style={styles.targetEditor}>
          <Text style={styles.targetLabel}>TARGET REPS:</Text>
          <View style={styles.targetButtons}>
            <TouchableOpacity style={styles.targetBtn} onPress={() => adjustTarget(-5)} activeOpacity={0.7}>
              <Minus size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.targetValue}>{target}</Text>
            <TouchableOpacity style={styles.targetBtn} onPress={() => adjustTarget(5)} activeOpacity={0.7}>
              <Plus size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Anti-Slacking Wake-Up Warning Banner ── */}
      {isSlackingWarning && !isFinished && (
        <View style={styles.warningBanner}>
          <AlertTriangle size={18} color="#EF4444" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>⚠️ WAKE UP VICTOR! KEEP PUSHING!</Text>
            <Text style={styles.warningSub}>
              {target - reps} push-ups left. Pumping your chest will destroy sleep fog!
            </Text>
          </View>
        </View>
      )}

      {/* ── Main Giant Counter & Chest Sensor Area ── */}
      <View style={styles.centerSection}>
        <TouchableOpacity
          style={[
            styles.touchZone,
            isDown && styles.touchZoneDown,
            isFinished && styles.touchZoneFinished,
          ]}
          activeOpacity={0.9}
          onPressIn={() => {
            if (!isFinished) {
              setIsDown(true);
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            }
          }}
          onPressOut={() => {
            if (!isFinished && isDown) {
              setIsDown(false);
              registerRep();
            }
          }}
        >
          <Animated.View style={{ alignItems: 'center', transform: [{ scale: pulseAnim }] }}>
            {isFinished ? (
              <CheckCircle2 size={80} color="#10B981" />
            ) : (
              <>
                <Text style={styles.repCount}>{reps}</Text>
                <Text style={styles.repTarget}>/ {target} REPS</Text>
                <Text style={[styles.sensorHint, isDown && { color: '#10B981' }]}>
                  {isDown ? 'DOWN! NOW PUSH UP ⬆️' : 'TAP CHIN / CHEST HERE'}
                </Text>
              </>
            )}
          </Animated.View>
        </TouchableOpacity>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressText}>{progressPercent}% COMPLETED</Text>
        </View>
      </View>

      {/* ── Bottom Section: Success or Manual Rep Action ── */}
      {isFinished ? (
        <View style={styles.successSection}>
          <View style={styles.waterTipCard}>
            <Droplets size={22} color="#38BDF8" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.waterTipTitle}>SPORT COMPLETED! 🚀</Text>
              <Text style={styles.waterTipText}>
                Your heart is pumping and sleep inertia is destroyed. Now go drink a cold glass of water!
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.finishBtn} onPress={onComplete} activeOpacity={0.85}>
            <Text style={styles.finishBtnText}>I'M AWAKE — CLOSE APP</Text>
            <ArrowRight size={20} color="#000000" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.bottomManualSection}>
          <TouchableOpacity style={styles.manualBtn} onPress={registerRep} activeOpacity={0.8}>
            <Text style={styles.manualBtnText}>+1 MANUAL REP</Text>
          </TouchableOpacity>
        </View>
      )}
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
    backgroundColor: '#064E3B40',
    borderColor: '#10B98180',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 10,
  },
  badgeText: {
    color: '#6EE7B7',
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
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  targetEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 14,
    gap: 12,
  },
  targetLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  targetButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  targetBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },

  // Warning Banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450A0A50',
    borderColor: '#EF444490',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
  },
  warningTitle: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '800',
  },
  warningSub: {
    color: '#FECACA',
    fontSize: 11,
    marginTop: 2,
  },

  // Center Touch Pad
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchZone: {
    width: width * 0.75,
    height: width * 0.75,
    borderRadius: (width * 0.75) / 2,
    backgroundColor: '#111827',
    borderWidth: 5,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 12,
  },
  touchZoneDown: {
    backgroundColor: '#064E3B',
    borderColor: '#34D399',
    transform: [{ scale: 0.95 }],
  },
  touchZoneFinished: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  repCount: {
    color: '#FFFFFF',
    fontSize: 84,
    fontWeight: '900',
    letterSpacing: -2,
  },
  repTarget: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: -8,
  },
  sensorHint: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 12,
  },

  // Progress Bar
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.5,
  },

  // Bottom Actions
  successSection: {
    width: '100%',
  },
  waterTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#082F4940',
    borderColor: '#0284C780',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  waterTipTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  waterTipText: {
    color: '#BAE6FD',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  finishBtn: {
    width: '100%',
    height: 58,
    backgroundColor: '#10B981',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
    marginBottom: 10,
  },
  finishBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  bottomManualSection: {
    alignItems: 'center',
    marginBottom: 10,
  },
  manualBtn: {
    backgroundColor: '#1F2937',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  manualBtnText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
