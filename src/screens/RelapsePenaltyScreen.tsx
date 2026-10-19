import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Siren, AlertOctagon, Zap } from 'lucide-react-native';
import * as hardwareService from '../services/hardwareService';
import * as Haptics from 'expo-haptics';

interface Props {
  onDisarmToMissions: () => void;
}

export const RelapsePenaltyScreen: React.FC<Props> = ({ onDisarmToMissions }) => {
  const [num1, setNum1] = useState(24);
  const [num2, setNum2] = useState(19);
  const [userAnswer, setUserAnswer] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Generate fresh numbers
    const n1 = Math.floor(Math.random() * 40) + 15;
    const n2 = Math.floor(Math.random() * 40) + 15;
    setNum1(n1);
    setNum2(n2);

    // Blast relapse siren & max haptics
    hardwareService.playSound('relapse', true, 1.0);
    hardwareService.startHaptics('RELAPSE_MAX');

    return () => {
      hardwareService.stopSound();
      hardwareService.stopHaptics();
    };
  }, []);

  const handleVerify = () => {
    const expected = num1 + num2;
    if (parseInt(userAnswer.trim(), 10) === expected) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      hardwareService.stopSound();
      hardwareService.stopHaptics();
      onDisarmToMissions();
    } else {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (e) {}
      setErrorMsg('Incorrect! Sleep inertia detected. Try again!');
      setUserAnswer('');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.sirenCircle}>
          <Siren size={56} color="#EF4444" />
        </View>
        <Text style={styles.title}>RELAPSE DETECTED!</Text>
        <Text style={styles.subtitle}>
          The 2-minute grace timer expired while you lingered in bed! Break the trance right now.
        </Text>
      </View>

      <View style={styles.puzzleBox}>
        <Text style={styles.puzzlePrompt}>SOLVE TO DISARM RELAPSE SIREN:</Text>
        <Text style={styles.equation}>
          {num1} + {num2} = ?
        </Text>

        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={userAnswer}
          onChangeText={text => {
            setUserAnswer(text);
            setErrorMsg('');
          }}
          placeholder="Answer"
          placeholderTextColor="#6B7280"
          autoFocus
        />

        {errorMsg !== '' && <Text style={styles.errorText}>{errorMsg}</Text>}

        <TouchableOpacity style={styles.disarmButton} onPress={handleVerify} activeOpacity={0.85}>
          <Zap size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.disarmText}>DISARM & RESUME MISSIONS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerNotice}>
        <AlertOctagon size={18} color="#EF4444" style={{ marginRight: 8 }} />
        <Text style={styles.footerText}>
          Remember: Your bed is your enemy right now. Get your feet on the bedroom floor!
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E0505',
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    marginTop: 30,
    alignItems: 'center',
  },
  sirenCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#450A0A',
    borderWidth: 3,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#EF4444',
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 10,
  },
  title: {
    color: '#EF4444',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    color: '#FCA5A5',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  puzzleBox: {
    width: '100%',
    backgroundColor: '#2D0B0B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  puzzlePrompt: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  equation: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    marginVertical: 14,
    letterSpacing: 2,
  },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: '#1A0606',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 14,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  disarmButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#DC2626',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disarmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  footerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450A0A50',
    padding: 14,
    borderRadius: 14,
  },
  footerText: {
    color: '#FCA5A5',
    fontSize: 12,
    flex: 1,
  },
});
