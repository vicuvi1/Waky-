import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CheckCircle2, Bed, Sparkles } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
}

export const BedPhotoMission: React.FC<Props> = ({ onComplete }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>BED RESET MISSION</Text>
        <Text style={styles.title}>Make Your Bed</Text>
        <Text style={styles.subtitle}>
          Smooth the sheets, fluff the pillows. Making your bed prevents daytime relapse back under the covers.
        </Text>
      </View>

      <View style={styles.centerArea}>
        <View style={styles.bedCircle}>
          <Bed size={64} color="#60A5FA" />
          <Text style={styles.bedCircleText}>READY</Text>
        </View>
      </View>

      <View style={styles.tipBox}>
        <Sparkles size={18} color="#60A5FA" style={{ marginRight: 8 }} />
        <Text style={styles.tipText}>
          Completing the first task of the morning establishes self-discipline and sets the tone for the entire day.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.doneButton}
        onPress={() => {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
          onComplete();
        }}
        activeOpacity={0.85}
      >
        <CheckCircle2 size={20} color="#000000" style={{ marginRight: 8 }} />
        <Text style={styles.doneText}>BED IS MADE — FINISH</Text>
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
    color: '#60A5FA',
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
  centerArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bedCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1E293B',
    borderWidth: 4,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bedCircleText: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  doneButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  doneText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '900',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B50',
    borderColor: '#3B82F660',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  tipText: {
    color: '#93C5FD',
    fontSize: 12,
    flex: 1,
  },
});
