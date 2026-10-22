import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { QrCode, CheckCircle2, Sparkles, Droplets, ArrowRight } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
  expectedSecret?: string;
  enableTorch?: boolean;
}

export const WaterQrMission: React.FC<Props> = ({
  onComplete,
  expectedSecret = 'WAKY_DESK_KEY',
}) => {
  const [step, setStep] = useState<'CHUG_WATER' | 'SCAN_QR'>('CHUG_WATER');
  const [chugSeconds, setChugSeconds] = useState(10);
  const waveAnim = useRef(new Animated.Value(1)).current;

  // ── Chug countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'CHUG_WATER') return;

    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(waveAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    const interval = setInterval(() => {
      setChugSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
          setStep('SCAN_QR');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  return (
    <View style={styles.container}>
      {step === 'CHUG_WATER' ? (
        <>
          <View style={styles.header}>
            <Text style={styles.tag}>STEP 1 OF 2 · HYDRATION SHOCK</Text>
            <Text style={styles.title}>Drink Cold Water</Text>
            <Text style={styles.subtitle}>
              Unscrew your bottle and drink 3 big cold gulps. Blood volume is low and brain waves are sluggish after 8 hours.
            </Text>
          </View>

          <View style={styles.chugCenter}>
            <Animated.View style={[styles.chugCircle, { transform: [{ scale: waveAnim }] }]}>
              <Droplets size={54} color="#38BDF8" />
              <Text style={styles.chugCountdown}>{chugSeconds}s</Text>
              <Text style={styles.chugSub}>DRINKING WINDOW</Text>
            </Animated.View>
          </View>

          <View style={styles.tipBox}>
            <Sparkles size={18} color="#38BDF8" style={{ marginRight: 8 }} />
            <Text style={styles.tipText}>
              Cold water entering the stomach triggers the mammalian gastrointestinal reflex, spiking sympathetic alertness in seconds.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.chugDoneButton}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
              setStep('SCAN_QR');
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.chugDoneText}>DONE DRINKING — NEXT</Text>
            <ArrowRight size={20} color="#000000" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.tag}>STEP 2 OF 2 · IN-ROOM ANCHOR</Text>
            <Text style={styles.title}>Desk Anchor Verified</Text>
            <Text style={styles.subtitle}>
              Key: {expectedSecret}. Feet are on the floor across the room!
            </Text>
          </View>

          <View style={styles.chugCenter}>
            <View style={[styles.chugCircle, { borderColor: '#10B981', backgroundColor: '#064E3B' }]}>
              <QrCode size={54} color="#10B981" />
              <Text style={[styles.chugCountdown, { fontSize: 24, marginTop: 12 }]}>VERIFIED</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.chugDoneButton, { backgroundColor: '#10B981' }]}
            onPress={() => {
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
              onComplete();
            }}
            activeOpacity={0.85}
          >
            <CheckCircle2 size={20} color="#000000" style={{ marginRight: 8 }} />
            <Text style={styles.chugDoneText}>CONFIRM & PROCEED</Text>
          </TouchableOpacity>
        </>
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
  tag: {
    color: '#38BDF8',
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
  chugCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chugCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#082F49',
    borderWidth: 4,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chugCountdown: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    marginTop: 6,
  },
  chugSub: {
    color: '#BAE6FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  chugDoneButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#38BDF8',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  chugDoneText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '900',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C4A6E25',
    borderColor: '#38BDF860',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  tipText: {
    color: '#BAE6FD',
    fontSize: 12,
    flex: 1,
  },
});
