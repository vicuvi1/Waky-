import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Brain, CheckCircle2, Zap } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
  requiredStreak?: number;
}

interface ColorItem {
  name: string;
  hex: string;
}

const COLORS: ColorItem[] = [
  { name: 'RED', hex: '#EF4444' },
  { name: 'BLUE', hex: '#3B82F6' },
  { name: 'GREEN', hex: '#10B981' },
  { name: 'YELLOW', hex: '#FBBF24' },
];

export const StroopMission: React.FC<Props> = ({ onComplete, requiredStreak = 7 }) => {
  const [score, setScore] = useState(0);
  const [wordText, setWordText] = useState('BLUE');
  const [textColor, setTextColor] = useState<ColorItem>(COLORS[0]);
  const [feedback, setFeedback] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');

  const generateTrial = () => {
    // Pick a random word
    const wordIdx = Math.floor(Math.random() * COLORS.length);
    // Pick a color that is different from the word (clash)
    let colorIdx = Math.floor(Math.random() * COLORS.length);
    while (colorIdx === wordIdx) {
      colorIdx = Math.floor(Math.random() * COLORS.length);
    }
    setWordText(COLORS[wordIdx].name);
    setTextColor(COLORS[colorIdx]);
    setFeedback('IDLE');
  };

  useEffect(() => {
    generateTrial();
  }, []);

  const handleSelect = (selectedColor: ColorItem) => {
    // Correct if chosen color matches the visual ink color
    const isCorrect = selectedColor.name === textColor.name;

    if (isCorrect) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {}

      const newScore = score + 1;
      setScore(newScore);
      setFeedback('CORRECT');

      if (newScore >= requiredStreak) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}
        setTimeout(() => {
          onComplete();
        }, 300);
      } else {
        setTimeout(generateTrial, 200);
      }
    } else {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (e) {}
      setFeedback('WRONG');
      setScore(Math.max(0, score - 1)); // penalty
      setTimeout(generateTrial, 400);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>IN-ROOM MISSION 2 / 4</Text>
        <Text style={styles.title}>Stroop Cognitive Duel</Text>
        <Text style={styles.subtitle}>
          Tap the <Text style={{ fontWeight: 'bold', color: '#FFFFFF' }}>INK COLOR</Text>, not what the word reads!
        </Text>
      </View>

      {/* Score Tracker */}
      <View style={styles.scoreRow}>
        <Brain size={20} color="#8B5CF6" style={{ marginRight: 8 }} />
        <Text style={styles.scoreText}>
          Prefrontal Boot: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{score}</Text> / {requiredStreak}
        </Text>
      </View>

      {/* Word Arena */}
      <View style={[styles.wordArena, feedback === 'WRONG' && styles.arenaWrong, feedback === 'CORRECT' && styles.arenaCorrect]}>
        <Text style={[styles.clashWord, { color: textColor.hex }]}>
          {wordText}
        </Text>
        {feedback === 'WRONG' && (
          <Text style={styles.feedbackError}>Careful! Match the ink color!</Text>
        )}
      </View>

      {/* Color Choice Buttons */}
      <View style={styles.buttonGrid}>
        {COLORS.map(c => (
          <TouchableOpacity
            key={c.name}
            style={[styles.colorButton, { borderColor: c.hex }]}
            onPress={() => handleSelect(c)}
            activeOpacity={0.7}
          >
            <View style={[styles.colorDot, { backgroundColor: c.hex }]} />
            <Text style={[styles.buttonLabel, { color: c.hex }]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bypass for quick testing */}
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
    color: '#8B5CF6',
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
  },
  scoreText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  wordArena: {
    backgroundColor: '#111827',
    height: 180,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#374151',
  },
  arenaCorrect: {
    borderColor: '#10B981',
  },
  arenaWrong: {
    borderColor: '#EF4444',
  },
  clashWord: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 3,
  },
  feedbackError: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorButton: {
    width: '48%',
    height: 70,
    backgroundColor: '#181C26',
    borderWidth: 2,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 10,
  },
  buttonLabel: {
    fontSize: 18,
    fontWeight: '800',
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
