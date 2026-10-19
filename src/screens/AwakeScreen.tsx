import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Trophy, CheckCircle, Flame, ArrowRight, ShieldCheck, Sun, Mic, MicOff, Send, Sparkles, CheckCircle2 } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as hardwareService from '../services/hardwareService';
import * as storageService from '../services/storageService';
import * as telegramService from '../services/telegramService';
import * as Haptics from 'expo-haptics';
import { UserStats } from '../types';

interface Props {
  onFinish: () => void;
  stats: UserStats;
}

export const AwakeScreen: React.FC<Props> = ({ onFinish, stats }) => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [secondsRecorded, setSecondsRecorded] = useState(0);
  const [voiceSent, setVoiceSent] = useState(false);

  const waveAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // End all alerts and restore brightness
    hardwareService.stopAllHardwareAlerts();

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
  }, []);

  // Voice recording pulse animation
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1.25, duration: 400, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      ).start();

      timerRef.current = setInterval(() => {
        setSecondsRecorded(prev => {
          if (prev >= 15) {
            stopAndSendVoiceJournal();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      waveAnim.setValue(1);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startVoiceJournal = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
      setSecondsRecorded(0);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    } catch (err) {
      console.warn('Voice recording start error:', err);
    }
  };

  const stopAndSendVoiceJournal = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}

      if (uri) {
        setVoiceSent(true);
        await telegramService.sendVoiceNote(uri, "Victor's live morning intention log 🌅");
      }
    } catch (err) {
      console.warn('Voice recording stop error:', err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.trophyCircle}>
          <Trophy size={54} color="#FBBF24" />
        </View>

        <Text style={styles.title}>AWAKE CONFIRMED!</Text>
        <Text style={styles.subtitle}>
          You defeated the 2-minute sleep inertia trap entirely from within your bedroom!
        </Text>

        {/* Streak & Stats Showcase */}
        <View style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <Flame size={20} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.streakTitle}>CIRCADIAN CONSISTENCY</Text>
          </View>
          <Text style={styles.streakNumber}>{stats.currentStreak} DAYS</Text>
          <Text style={styles.streakSub}>Best: {stats.bestStreak} Days • Total: {stats.totalWakeups} Wakeups</Text>
        </View>

        {/* ── 15-Second Morning Voice Journal (Auto-Sync to Telegram Bot) ── */}
        <View style={styles.voiceCard}>
          <View style={styles.voiceHeader}>
            <Sparkles size={16} color="#60A5FA" style={{ marginRight: 6 }} />
            <Text style={styles.voiceTitle}>MORNING INTENTION (TELEGRAM BOT SYNC)</Text>
          </View>
          <Text style={styles.voiceSub}>
            Speak a 10s voice note of your #1 goal today. Waky delivers it straight into @wakyyyy_bot!
          </Text>

          {voiceSent ? (
            <View style={styles.voiceSentBadge}>
              <CheckCircle2 size={18} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.voiceSentText}>Voice note uploaded to @wakyyyy_bot! 🚀</Text>
            </View>
          ) : (
            <View style={styles.voiceControls}>
              <TouchableOpacity
                style={[styles.voiceRecordBtn, isRecording && styles.voiceRecordBtnActive]}
                onPress={isRecording ? stopAndSendVoiceJournal : startVoiceJournal}
                activeOpacity={0.85}
              >
                <Animated.View style={{ transform: [{ scale: waveAnim }] }}>
                  {isRecording ? <Mic size={22} color="#EF4444" /> : <Mic size={22} color="#3B82F6" />}
                </Animated.View>
                <Text style={[styles.voiceBtnText, isRecording && { color: '#EF4444' }]}>
                  {isRecording ? `STOP & SEND (${15 - secondsRecorded}s)` : 'RECORD 10S MORNING NOTE'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* In-Room Mission Recap */}
        <View style={styles.recapCard}>
          <Text style={styles.recapTitle}>IN-BEDROOM MISSIONS CLEARED:</Text>
          <View style={styles.recapRow}>
            <ShieldCheck size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Vertical posture hold (feet on floor)</Text>
          </View>
          <View style={styles.recapRow}>
            <ShieldCheck size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Hydration chug & Desk QR scan</Text>
          </View>
          <View style={styles.recapRow}>
            <ShieldCheck size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Broca's vocal affirmation whisper</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.finishButton} onPress={onFinish} activeOpacity={0.85}>
        <Text style={styles.finishText}>CONQUER TODAY</Text>
        <ArrowRight size={20} color="#000000" style={{ marginLeft: 8 }} />
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
  content: {
    alignItems: 'center',
    marginTop: 40,
  },
  trophyCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1E2433',
    borderWidth: 3,
    borderColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FBBF24',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 12,
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  streakCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#374151',
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  streakTitle: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  streakNumber: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 1,
  },
  streakSub: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
  },
  // Voice Journal Card
  voiceCard: {
    width: '100%',
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#4F46E5',
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  voiceTitle: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  voiceSub: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 12,
  },
  voiceSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B40',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    justifyContent: 'center',
  },
  voiceSentText: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '800',
  },
  voiceControls: {
    alignItems: 'center',
  },
  voiceRecordBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#312E81',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  voiceRecordBtnActive: {
    backgroundColor: '#450A0A',
    borderColor: '#EF4444',
  },
  voiceBtnText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  recapCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 20,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  recapTitle: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  recapText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '500',
  },
  finishButton: {
    width: '100%',
    height: 60,
    backgroundColor: '#10B981',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#10B981',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  finishText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
