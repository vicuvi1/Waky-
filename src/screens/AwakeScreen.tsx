import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Trophy, CheckCircle, Flame, ArrowRight, ShieldCheck, Sun } from 'lucide-react-native';
import * as hardwareService from '../services/hardwareService';
import * as storageService from '../services/storageService';
import * as Haptics from 'expo-haptics';
import { UserStats } from '../types';

interface Props {
  onFinish: () => void;
  stats: UserStats;
}

export const AwakeScreen: React.FC<Props> = ({ onFinish, stats }) => {
  useEffect(() => {
    // End all alerts and restore brightness
    hardwareService.stopAllHardwareAlerts();

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.trophyCircle}>
          <Trophy size={60} color="#FBBF24" />
        </View>

        <Text style={styles.title}>AWAKE CONFIRMED!</Text>
        <Text style={styles.subtitle}>
          You defeated the 2-minute sleep inertia trap entirely from within your bedroom!
        </Text>

        {/* Streak & Stats Showcase */}
        <View style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <Flame size={24} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.streakTitle}>CIRCADIAN CONSISTENCY</Text>
          </View>
          <Text style={styles.streakNumber}>{stats.currentStreak} DAYS</Text>
          <Text style={styles.streakSub}>Best: {stats.bestStreak} Days • Total: {stats.totalWakeups} Wakeups</Text>
        </View>

        {/* In-Room Mission Recap */}
        <View style={styles.recapCard}>
          <Text style={styles.recapTitle}>ACCOMPLISHED THIS MORNING:</Text>
          <View style={styles.recapRow}>
            <ShieldCheck size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Vertical posture held (45s on feet)</Text>
          </View>
          <View style={styles.recapRow}>
            <ShieldCheck size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Prefrontal cortex booted (Stroop duel)</Text>
          </View>
          <View style={styles.recapRow}>
            <ShieldCheck size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Out of bed anchor verified (Desk QR)</Text>
          </View>
          <View style={styles.recapRow}>
            <ShieldCheck size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.recapText}>Bed locked & made (Sheets tight)</Text>
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
