import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, TextInput } from 'react-native';
import { Moon, Wind, CheckCircle2, ShieldCheck, Heart, Target } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  onExit: () => void;
  targetWakeTime: string;
  dopamineAnchor?: string;
  onSaveDopamineAnchor?: (val: string) => void;
}

type BreathPhase = 'INHALE' | 'HOLD' | 'EXHALE';

export const BedtimeLockdownScreen: React.FC<Props> = ({
  onExit,
  targetWakeTime,
  dopamineAnchor = '',
  onSaveDopamineAnchor,
}) => {
  const [phase, setPhase] = useState<BreathPhase>('INHALE');
  const [secondsInPhase, setSecondsInPhase] = useState(4);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [anchorText, setAnchorText] = useState(dopamineAnchor);

  const breathScale = useRef(new Animated.Value(1)).current;
  const isRunningRef = useRef(true);

  // 4-7-8 breathing loop
  useEffect(() => {
    isRunningRef.current = true;

    const runBreathingCycle = () => {
      if (!isRunningRef.current) return;

      // 1. INHALE (4s)
      setPhase('INHALE');
      setSecondsInPhase(4);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}

      Animated.timing(breathScale, {
        toValue: 1.35,
        duration: 4000,
        useNativeDriver: true,
      }).start(() => {
        if (!isRunningRef.current) return;

        // 2. HOLD (7s)
        setPhase('HOLD');
        setSecondsInPhase(7);
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}

        setTimeout(() => {
          if (!isRunningRef.current) return;

          // 3. EXHALE (8s)
          setPhase('EXHALE');
          setSecondsInPhase(8);
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}

          Animated.timing(breathScale, {
            toValue: 1.0,
            duration: 8000,
            useNativeDriver: true,
          }).start(() => {
            if (!isRunningRef.current) return;
            setCyclesCompleted(prev => prev + 1);
            runBreathingCycle();
          });
        }, 7000);
      });
    };

    runBreathingCycle();

    return () => {
      isRunningRef.current = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Top Banner */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Moon size={16} color="#F97316" style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>CIRCADIAN BEDTIME LOCKDOWN</Text>
        </View>
        <Text style={styles.title}>Blue-Light Sanctuary</Text>
        <Text style={styles.subtitle}>
          Monochromatic amber protects melatonin. Perform 4 cycles of 4-7-8 breathing to fall asleep in under 15 minutes.
        </Text>
      </View>

      {/* 4-7-8 Breathing Circle */}
      <View style={styles.breathingContainer}>
        <Animated.View
          style={[
            styles.breathingCircle,
            { transform: [{ scale: breathScale }] },
            phase === 'HOLD' ? styles.circleHold : phase === 'EXHALE' ? styles.circleExhale : styles.circleInhale,
          ]}
        >
          <Wind size={40} color="#F97316" />
          <Text style={styles.phaseLabel}>{phase}</Text>
          <Text style={styles.phaseSub}>
            {phase === 'INHALE' ? 'Inhale through nose (4s)' : phase === 'HOLD' ? 'Hold breath gently (7s)' : 'Slow exhale mouth (8s)'}
          </Text>
        </Animated.View>
      </View>

      {/* Sleep Telemetry */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Breathing Cycles Completed:</Text>
          <Text style={styles.infoValue}>{cyclesCompleted} / 4</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Morning Alarm Armed At:</Text>
          <Text style={styles.infoValue}>{targetWakeTime} AM</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Target Sleep Duration:</Text>
          <Text style={styles.infoValue}>8h 00m</Text>
        </View>
      </View>

      {/* Night-Before Dopamine Anchor */}
      <View style={styles.dopamineCard}>
        <View style={styles.dopamineHeader}>
          <Target size={16} color="#FB923C" style={{ marginRight: 6 }} />
          <Text style={styles.dopamineTitle}>YOUR #1 PRIORITY TOMORROW MORNING:</Text>
        </View>
        <TextInput
          style={styles.dopamineInput}
          placeholder="e.g. Finish the launch, hit morning gym, crush my goals..."
          placeholderTextColor="#7C2D12"
          value={anchorText}
          onChangeText={setAnchorText}
        />
        <Text style={styles.dopamineSub}>Waky will remind your sleepy self of this promise at 06:30.</Text>
      </View>

      <View style={styles.affirmationBox}>
        <Heart size={16} color="#F97316" style={{ marginRight: 8 }} />
        <Text style={styles.affirmationText}>
          Put your phone face down across the room near your water bottle. Sleep well Victor.
        </Text>
      </View>

      {/* Lock Screen & Exit Button */}
      <TouchableOpacity
        style={styles.lockButton}
        onPress={() => {
          if (onSaveDopamineAnchor && anchorText.trim()) {
            onSaveDopamineAnchor(anchorText.trim());
          }
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
          onExit();
        }}
        activeOpacity={0.85}
      >
        <CheckCircle2 size={20} color="#000000" style={{ marginRight: 8 }} />
        <Text style={styles.lockButtonText}>LOCK SCREEN & SLEEP</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0600', // Deep monochromatic warm black
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#431407',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F9731660',
    marginBottom: 10,
  },
  badgeText: {
    color: '#FB923C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#F97316',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#C2410C',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  breathingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  breathingCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#1C0B02',
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 10,
  },
  circleInhale: {
    borderColor: '#F97316',
    shadowColor: '#F97316',
  },
  circleHold: {
    borderColor: '#FB923C',
    shadowColor: '#FB923C',
  },
  circleExhale: {
    borderColor: '#9A3412',
    shadowColor: '#9A3412',
  },
  phaseLabel: {
    color: '#F97316',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 8,
  },
  phaseSub: {
    color: '#EA580C',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#1C0B02',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#7C2D12',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  infoLabel: {
    color: '#C2410C',
    fontSize: 13,
  },
  infoValue: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  affirmationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A0E03',
    padding: 12,
    borderRadius: 12,
    width: '100%',
  },
  affirmationText: {
    color: '#EA580C',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  lockButton: {
    width: '100%',
    height: 58,
    backgroundColor: '#F97316',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#F97316',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  lockButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dopamineCard: {
    width: '100%',
    backgroundColor: '#1C0B02',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#EA580C',
    marginVertical: 4,
  },
  dopamineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dopamineTitle: {
    color: '#FB923C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dopamineInput: {
    height: 44,
    backgroundColor: '#2A0E03',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7C2D12',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  dopamineSub: {
    color: '#9A3412',
    fontSize: 10,
    marginTop: 4,
  },
});
