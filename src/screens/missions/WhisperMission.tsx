import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Mic, MicOff, CheckCircle2, Sparkles, Volume2, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  onComplete: () => void;
  whisperPhrase?: string;
}

export const WhisperMission: React.FC<Props> = ({
  onComplete,
  whisperPhrase = 'I am standing and ready for today',
}) => {
  const [isWhispering, setIsWhispering] = useState(false);
  const [whisperProgress, setWhisperProgress] = useState(0); // 0 to 100
  const waveAnim = useRef(new Animated.Value(1)).current;
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate mic ring
  useEffect(() => {
    if (isWhispering) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1.25, duration: 300, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 1.0, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    } else {
      waveAnim.setValue(1);
    }
  }, [isWhispering]);

  const startWhispering = () => {
    setIsWhispering(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}

    progressTimerRef.current = setInterval(() => {
      setWhisperProgress(prev => {
        const next = prev + 5; // Takes ~3 seconds
        if (next % 20 === 0) {
          try { Haptics.selectionAsync(); } catch (e) {}
        }
        if (next >= 100) {
          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
          setTimeout(() => {
            onComplete();
          }, 300);
          return 100;
        }
        return next;
      });
    }, 150);
  };

  const stopWhispering = () => {
    setIsWhispering(false);
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>BROCA'S VOCAL ACTIVATION (0 dB)</Text>
        <Text style={styles.title}>Whisper Password</Text>
        <Text style={styles.subtitle}>
          Vocal cords are paralyzed during sleep. Whispering this phrase stimulates the left frontal lobe!
        </Text>
      </View>

      {/* Target Phrase Box */}
      <View style={styles.phraseCard}>
        <Text style={styles.phraseLabel}>HOLD MIC AND WHISPER THIS:</Text>
        <Text style={styles.phraseText}>"{whisperPhrase}"</Text>
      </View>

      {/* Mic Animation Center */}
      <View style={styles.centerSection}>
        <Animated.View
          style={[
            styles.micCircle,
            isWhispering && styles.micCircleActive,
            { transform: [{ scale: waveAnim }] },
          ]}
        >
          {isWhispering ? (
            <Mic size={54} color="#10B981" />
          ) : (
            <MicOff size={54} color="#6B7280" />
          )}
          <Text style={[styles.statusText, isWhispering && { color: '#10B981' }]}>
            {isWhispering ? 'HEARING WHISPER...' : 'PRESS & HOLD'}
          </Text>
        </Animated.View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${whisperProgress}%` }]} />
        </View>
        <Text style={styles.progressSub}>Vocal Cord Boot: {whisperProgress}%</Text>
      </View>

      {/* Hold Button */}
      <TouchableOpacity
        style={[styles.holdButton, isWhispering && styles.holdButtonActive]}
        onPressIn={startWhispering}
        onPressOut={stopWhispering}
        activeOpacity={0.85}
      >
        <Text style={styles.holdButtonText}>
          {isWhispering ? 'KEEP WHISPERING...' : 'HOLD DOWN & WHISPER'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bypassButton}
        onPress={() => {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
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
    color: '#8B5CF6',
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
  phraseCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    alignItems: 'center',
    marginVertical: 10,
  },
  phraseLabel: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  phraseText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#111827',
    borderWidth: 4,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowRadius: 20,
  },
  micCircleActive: {
    borderColor: '#10B981',
    shadowOpacity: 0.6,
    elevation: 10,
    backgroundColor: '#06281E',
  },
  statusText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 8,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressSub: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 6,
  },
  holdButton: {
    width: '100%',
    height: 60,
    backgroundColor: '#8B5CF6',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  holdButtonActive: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  holdButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
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
