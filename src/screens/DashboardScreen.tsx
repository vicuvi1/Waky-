import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
} from 'react-native';
import {
  Sun,
  Moon,
  Flame,
  Smartphone,
  Brain,
  QrCode,
  Bed,
  Play,
  ShieldCheck,
  Clock,
  Sparkles,
  X,
  Volume2,
} from 'lucide-react-native';
import { AlarmSettings, UserStats, MissionType } from '../types';
import * as Haptics from 'expo-haptics';

interface Props {
  settings: AlarmSettings;
  stats: UserStats;
  onUpdateSettings: (settings: AlarmSettings) => void;
  onTriggerTestAlarm: () => void;
}

export const DashboardScreen: React.FC<Props> = ({
  settings,
  stats,
  onUpdateSettings,
  onTriggerTestAlarm,
}) => {
  const [showQrModal, setShowQrModal] = useState(false);

  const toggleAlarmEnabled = (val: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onUpdateSettings({ ...settings, enabled: val });
  };

  const toggleMission = (missionId: MissionType) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    const exists = settings.activeMissions.includes(missionId);
    let updated: MissionType[];
    if (exists) {
      if (settings.activeMissions.length === 1) return; // Keep at least 1 mission
      updated = settings.activeMissions.filter(m => m !== missionId);
    } else {
      updated = [...settings.activeMissions, missionId];
    }
    onUpdateSettings({ ...settings, activeMissions: updated });
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>WAKY</Text>
            <Text style={styles.tagline}>In-Room Anti-Relapse System</Text>
          </View>
          <View style={styles.streakBadge}>
            <Flame size={18} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.streakText}>{stats.currentStreak} DAYS</Text>
          </View>
        </View>

        {/* Hero Alarm Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.iconCircle}>
              <Sun size={28} color="#F59E0B" />
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: settings.enabled ? '#10B981' : '#6B7280' }]} />
              <Text style={styles.statusPillText}>
                {settings.enabled ? 'ALARM ARMED' : 'MUTED'}
              </Text>
            </View>
          </View>

          <View style={styles.timeRow}>
            <Text style={styles.timeDisplay}>{settings.targetWakeTime}</Text>
            <Text style={styles.ampm}>AM</Text>
          </View>

          <Text style={styles.heroSub}>
            Melanopsin sunrise ramp begins at 06:25 AM
          </Text>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Wake Guard Active</Text>
              <Text style={styles.toggleSub}>2-Minute anti-relapse grace timer</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={toggleAlarmEnabled}
              thumbColor={settings.enabled ? '#3B82F6' : '#9CA3AF'}
              trackColor={{ false: '#374151', true: '#1E3A8A' }}
            />
          </View>
        </View>

        {/* Circadian Wind-down Card */}
        <View style={styles.circadianCard}>
          <View style={styles.circadianHeader}>
            <Moon size={20} color="#818CF8" style={{ marginRight: 8 }} />
            <Text style={styles.circadianTitle}>CIRCADIAN BEDTIME ANCHOR</Text>
          </View>
          <View style={styles.circadianRow}>
            <Text style={styles.bedtimeText}>{settings.targetBedtime} PM</Text>
            <View style={styles.windDownBadge}>
              <Clock size={14} color="#818CF8" style={{ marginRight: 4 }} />
              <Text style={styles.windDownText}>Wind-down at 21:45 PM</Text>
            </View>
          </View>
          <Text style={styles.circadianSub}>
            Fixed bedtime locks your sleep cycle and cuts morning sleep inertia by 80%.
          </Text>
        </View>

        {/* In-Bedroom Missions Selector */}
        <View style={styles.missionsHeader}>
          <Text style={styles.sectionTitle}>IN-BEDROOM MISSIONS (0 dB)</Text>
          <TouchableOpacity onPress={() => setShowQrModal(true)}>
            <Text style={styles.qrLink}>View Desk QR</Text>
          </TouchableOpacity>
        </View>

        {/* Mission 1: Posture Hold */}
        <View style={styles.missionCard}>
          <View style={styles.missionIcon}>
            <Smartphone size={22} color="#10B981" />
          </View>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>Vertical Posture Hold</Text>
            <Text style={styles.missionDesc}>S23 Ultra Gyro: Hold phone upright 45s on feet</Text>
          </View>
          <Switch
            value={settings.activeMissions.includes('POSTURE_HOLD')}
            onValueChange={() => toggleMission('POSTURE_HOLD')}
            thumbColor={settings.activeMissions.includes('POSTURE_HOLD') ? '#10B981' : '#9CA3AF'}
            trackColor={{ false: '#374151', true: '#064E3B' }}
          />
        </View>

        {/* Mission 2: Stroop Test */}
        <View style={styles.missionCard}>
          <View style={styles.missionIcon}>
            <Brain size={22} color="#8B5CF6" />
          </View>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>Stroop Cognitive Duel</Text>
            <Text style={styles.missionDesc}>Reboot prefrontal cortex with color clashes</Text>
          </View>
          <Switch
            value={settings.activeMissions.includes('STROOP_TEST')}
            onValueChange={() => toggleMission('STROOP_TEST')}
            thumbColor={settings.activeMissions.includes('STROOP_TEST') ? '#8B5CF6' : '#9CA3AF'}
            trackColor={{ false: '#374151', true: '#3B1F6E' }}
          />
        </View>

        {/* Mission 3: Desk QR Scan */}
        <View style={styles.missionCard}>
          <View style={styles.missionIcon}>
            <QrCode size={22} color="#3B82F6" />
          </View>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>Desk / Bottle QR Scan</Text>
            <Text style={styles.missionDesc}>Forces standing & walking to your desk</Text>
          </View>
          <Switch
            value={settings.activeMissions.includes('WATER_QR')}
            onValueChange={() => toggleMission('WATER_QR')}
            thumbColor={settings.activeMissions.includes('WATER_QR') ? '#3B82F6' : '#9CA3AF'}
            trackColor={{ false: '#374151', true: '#1E3A8A' }}
          />
        </View>

        {/* Mission 4: Bed Photo */}
        <View style={styles.missionCard}>
          <View style={styles.missionIcon}>
            <Bed size={22} color="#F59E0B" />
          </View>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>"Made Bed" Photo Proof</Text>
            <Text style={styles.missionDesc}>Pull sheets tight so you can't crawl back in</Text>
          </View>
          <Switch
            value={settings.activeMissions.includes('BED_PHOTO')}
            onValueChange={() => toggleMission('BED_PHOTO')}
            thumbColor={settings.activeMissions.includes('BED_PHOTO') ? '#F59E0B' : '#9CA3AF'}
            trackColor={{ false: '#374151', true: '#78350F' }}
          />
        </View>

        {/* Instant Sandbox / Demo Wakeup Runner */}
        <View style={styles.demoSection}>
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              } catch (e) {}
              onTriggerTestAlarm();
            }}
            activeOpacity={0.85}
          >
            <Play size={22} color="#FFFFFF" style={{ marginRight: 10 }} />
            <Text style={styles.demoButtonText}>TEST PROTOCOL ON S23 ULTRA (DEMO)</Text>
          </TouchableOpacity>
          <Text style={styles.demoHelpText}>
            Simulates: Sunrise Ramp → 2-Min Grace Window → In-Room Missions
          </Text>
        </View>
      </ScrollView>

      {/* QR Code Anchor Modal */}
      <Modal visible={showQrModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your Bedroom QR Anchor</Text>
              <TouchableOpacity onPress={() => setShowQrModal(false)}>
                <X size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Stick this QR code on your bedroom desk, wardrobe, or water bottle. Point your phone at it during the scan mission:
            </Text>

            {/* Stylized high contrast QR display */}
            <View style={styles.qrCodeBox}>
              <QrCode size={180} color="#000000" />
            </View>

            <Text style={styles.qrCodeText}>KEY: {settings.qrCodeSecret}</Text>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowQrModal(false)}
            >
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  tagline: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  streakText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 18,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPillText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  timeDisplay: {
    color: '#FFFFFF',
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 1,
  },
  ampm: {
    color: '#9CA3AF',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  heroSub: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#1F2937',
    marginVertical: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  toggleSub: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  circadianCard: {
    backgroundColor: '#131826',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 22,
  },
  circadianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  circadianTitle: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  circadianRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bedtimeText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  windDownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#312E8140',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  windDownText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '600',
  },
  circadianSub: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  missionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  qrLink: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
  },
  missionCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  missionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  missionInfo: {
    flex: 1,
  },
  missionName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  missionDesc: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  demoSection: {
    marginTop: 18,
    alignItems: 'center',
  },
  demoButton: {
    width: '100%',
    height: 60,
    backgroundColor: '#2563EB',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  demoButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  demoHelpText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalDesc: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  qrCodeBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  qrCodeText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginBottom: 20,
  },
  modalCloseButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#374151',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
