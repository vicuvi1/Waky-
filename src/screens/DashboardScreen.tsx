import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Modal,
  ScrollView, Pressable
} from 'react-native';
import {
  Sun, Moon, Flame, Smartphone, Brain, QrCode, Bed, Play,
  ShieldCheck, Clock, X, Volume2, BellRing, Info
} from 'lucide-react-native';
import { AlarmSettings, UserStats, MissionType } from '../types';
import * as Haptics from 'expo-haptics';
import * as notificationService from '../services/notificationService';
import { Switch } from 'react-native';

interface Props {
  settings: AlarmSettings;
  stats: UserStats;
  onUpdateSettings: (settings: AlarmSettings) => void;
  onTriggerTestAlarm: () => void;
}

// ── Lightweight Scroll Picker (hours or minutes) ──────────────────────────
interface ScrollPickerProps {
  values: string[];
  selected: string;
  onSelect: (val: string) => void;
}

const ScrollPickerColumn: React.FC<ScrollPickerProps> = ({ values, selected, onSelect }) => {
  return (
    <ScrollView
      style={styles.pickerColumn}
      showsVerticalScrollIndicator={false}
      snapToInterval={44}
      decelerationRate="fast"
    >
      {values.map(val => (
        <Pressable
          key={val}
          style={[styles.pickerItem, val === selected && styles.pickerItemSelected]}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch (e) {}
            onSelect(val);
          }}
        >
          <Text style={[styles.pickerItemText, val === selected && styles.pickerItemTextSelected]}>
            {val}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

// ── Time Picker Modal ─────────────────────────────────────────────────────
interface TimePickerModalProps {
  visible: boolean;
  title: string;
  initialTime: string; // "HH:MM"
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible, title, initialTime, onConfirm, onCancel
}) => {
  const [hh, setHh] = useState(initialTime.split(':')[0]);
  const [mm, setMm] = useState(initialTime.split(':')[1]);

  useEffect(() => {
    if (visible) {
      setHh(initialTime.split(':')[0]);
      // Snap minutes to nearest 5
      const rawMin = parseInt(initialTime.split(':')[1], 10);
      const snapped = String(Math.round(rawMin / 5) * 5 % 60).padStart(2, '0');
      setMm(MINUTES.includes(snapped) ? snapped : '00');
    }
  }, [visible, initialTime]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onCancel}>
              <X size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.pickerRow}>
            <View style={styles.pickerWrap}>
              <Text style={styles.pickerLabel}>HOUR</Text>
              <ScrollPickerColumn values={HOURS} selected={hh} onSelect={setHh} />
            </View>
            <Text style={styles.pickerColon}>:</Text>
            <View style={styles.pickerWrap}>
              <Text style={styles.pickerLabel}>MIN</Text>
              <ScrollPickerColumn values={MINUTES} selected={mm} onSelect={setMm} />
            </View>
          </View>

          <View style={styles.pickerPreview}>
            <Text style={styles.pickerPreviewTime}>{hh}:{mm}</Text>
          </View>

          <View style={styles.pickerActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => onConfirm(`${hh}:${mm}`)}
            >
              <Text style={styles.confirmBtnText}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Dashboard Screen ──────────────────────────────────────────────────────
export const DashboardScreen: React.FC<Props> = ({
  settings, stats, onUpdateSettings, onTriggerTestAlarm,
}) => {
  const [showQrModal, setShowQrModal] = useState(false);
  const [showWakePicker, setShowWakePicker] = useState(false);
  const [showBedPicker, setShowBedPicker] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Setup notifications on mount
  useEffect(() => {
    notificationService.setupNotifications().then(granted => {
      setNotifGranted(granted);
      if (granted && settings.enabled) {
        notificationService.scheduleWakeAlarm(settings.targetWakeTime);
        notificationService.scheduleBedtimeWindDown(settings.targetBedtime);
      }
    });

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const toggleAlarmEnabled = (val: boolean) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    const updated = { ...settings, enabled: val };
    onUpdateSettings(updated);
    if (val) {
      notificationService.scheduleWakeAlarm(updated.targetWakeTime);
      notificationService.scheduleBedtimeWindDown(updated.targetBedtime);
    } else {
      notificationService.cancelWakeAlarm();
      notificationService.cancelWindDownAlert();
    }
  };

  const toggleMission = (missionId: MissionType) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    const exists = settings.activeMissions.includes(missionId);
    if (exists && settings.activeMissions.length === 1) return;
    const updated = exists
      ? settings.activeMissions.filter(m => m !== missionId)
      : [...settings.activeMissions, missionId];
    onUpdateSettings({ ...settings, activeMissions: updated });
  };

  const handleWakeTimeConfirm = (time: string) => {
    const updated = { ...settings, targetWakeTime: time };
    onUpdateSettings(updated);
    if (settings.enabled) notificationService.scheduleWakeAlarm(time);
    setShowWakePicker(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
  };

  const handleBedtimeConfirm = (time: string) => {
    const updated = { ...settings, targetBedtime: time };
    onUpdateSettings(updated);
    if (settings.enabled) notificationService.scheduleBedtimeWindDown(time);
    setShowBedPicker(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
  };

  const [hh, ampm] = (() => {
    const [h, m] = settings.targetWakeTime.split(':').map(Number);
    const isPM = h >= 12;
    const displayH = h % 12 || 12;
    return [`${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')}`, isPM ? 'PM' : 'AM'];
  })();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Brand Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>WAKY</Text>
            <Text style={styles.tagline}>In-Room Anti-Relapse System</Text>
          </View>
          <View style={styles.streakBadge}>
            <Flame size={16} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.streakText}>{stats.currentStreak} DAY STREAK</Text>
          </View>
        </View>

        {/* ── Notification Status Bar ── */}
        {!notifGranted && (
          <View style={styles.notifWarning}>
            <BellRing size={16} color="#F59E0B" style={{ marginRight: 8 }} />
            <Text style={styles.notifWarningText}>
              Notification permission required for background alarm to work! Tap to re-enable.
            </Text>
          </View>
        )}

        {/* ── Hero Alarm Card (Tappable Time Picker) ── */}
        <Animated.View style={[styles.heroCard, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.heroTop}>
            <View style={styles.iconCircle}>
              <Sun size={26} color="#F59E0B" />
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: settings.enabled ? '#10B981' : '#6B7280' }]} />
              <Text style={styles.statusPillText}>
                {settings.enabled ? 'ALARM ARMED' : 'ALARM OFF'}
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={() => setShowWakePicker(true)} activeOpacity={0.8}>
            <View style={styles.timeRow}>
              <Text style={styles.timeDisplay}>{hh}</Text>
              <Text style={styles.ampm}>{ampm}</Text>
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>TAP TO EDIT</Text>
              </View>
            </View>
          </TouchableOpacity>

          <Text style={styles.heroSub}>
            Sunrise light ramp begins 5 min early at {(() => {
              const [h, m] = settings.targetWakeTime.split(':').map(Number);
              const total = h * 60 + m - 5;
              const rh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
              const rm = ((total % 1440) + 1440) % 1440 % 60;
              return `${String(rh).padStart(2,'0')}:${String(rm).padStart(2,'0')}`;
            })()}
          </Text>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Wake Guard Active</Text>
              <Text style={styles.toggleSub}>2-min grace • T+15 relapse check</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={toggleAlarmEnabled}
              thumbColor={settings.enabled ? '#3B82F6' : '#9CA3AF'}
              trackColor={{ false: '#374151', true: '#1E3A8A' }}
            />
          </View>
        </Animated.View>

        {/* ── Circadian Bedtime Card (Tappable) ── */}
        <TouchableOpacity
          style={styles.circadianCard}
          onPress={() => setShowBedPicker(true)}
          activeOpacity={0.8}
        >
          <View style={styles.circadianHeader}>
            <Moon size={18} color="#818CF8" style={{ marginRight: 8 }} />
            <Text style={styles.circadianTitle}>CIRCADIAN BEDTIME — TAP TO EDIT</Text>
          </View>
          <View style={styles.circadianRow}>
            <Text style={styles.bedtimeText}>{settings.targetBedtime}</Text>
            <View style={styles.windDownBadge}>
              <Clock size={13} color="#818CF8" style={{ marginRight: 4 }} />
              <Text style={styles.windDownText}>Wind-down 45m before</Text>
            </View>
          </View>
          <Text style={styles.circadianSub}>
            Fixed bedtime locks your sleep cycle. A push reminder fires at wind-down time.
          </Text>
        </TouchableOpacity>

        {/* ── T+15 Relapse Check Info ── */}
        <View style={styles.relapseCheckCard}>
          <View style={styles.relapseCheckHeader}>
            <BellRing size={18} color="#F87171" style={{ marginRight: 8 }} />
            <Text style={styles.relapseCheckTitle}>T+15 RELAPSE CHECK</Text>
          </View>
          <Text style={styles.relapseCheckDesc}>
            15 minutes after you finish all morning missions, Waky vibrates and sends a silent push check: <Text style={{ color: '#FCA5A5', fontWeight: '700' }}>"Are you still up?"</Text> — If you don't tap confirm within 60s, the relapse siren fires again.
          </Text>
        </View>

        {/* ── In-Bedroom Missions ── */}
        <View style={styles.missionsHeader}>
          <Text style={styles.sectionTitle}>IN-BEDROOM MISSIONS (0 dB)</Text>
          <TouchableOpacity onPress={() => setShowQrModal(true)}>
            <Text style={styles.qrLink}>View Desk QR</Text>
          </TouchableOpacity>
        </View>

        {([
          { id: 'POSTURE_HOLD' as MissionType, icon: <Smartphone size={20} color="#10B981" />, name: 'Vertical Posture Hold', desc: 'S23 Ultra Gyro: 45s standing upright at eye level', color: '#10B981', track: '#064E3B' },
          { id: 'STROOP_TEST' as MissionType, icon: <Brain size={20} color="#8B5CF6" />, name: 'Stroop Cognitive Duel', desc: 'Reboot prefrontal cortex with 7 color clashes', color: '#8B5CF6', track: '#3B1F6E' },
          { id: 'WATER_QR' as MissionType, icon: <QrCode size={20} color="#3B82F6" />, name: 'Desk / Bottle QR Scan', desc: 'Forces standing and walking to the bedroom anchor', color: '#3B82F6', track: '#1E3A8A' },
          { id: 'BED_PHOTO' as MissionType, icon: <Bed size={20} color="#F59E0B" />, name: '"Made Bed" Photo Proof', desc: 'Photographs straight sheets to lock you out', color: '#F59E0B', track: '#78350F' },
        ]).map(m => (
          <View key={m.id} style={styles.missionCard}>
            <View style={[styles.missionIcon, { backgroundColor: `${m.color}18` }]}>
              {m.icon}
            </View>
            <View style={styles.missionInfo}>
              <Text style={styles.missionName}>{m.name}</Text>
              <Text style={styles.missionDesc}>{m.desc}</Text>
            </View>
            <Switch
              value={settings.activeMissions.includes(m.id)}
              onValueChange={() => toggleMission(m.id)}
              thumbColor={settings.activeMissions.includes(m.id) ? m.color : '#9CA3AF'}
              trackColor={{ false: '#374151', true: m.track }}
            />
          </View>
        ))}

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          {[
            { label: 'STREAK', value: `${stats.currentStreak}d`, color: '#EF4444' },
            { label: 'BEST', value: `${stats.bestStreak}d`, color: '#FBBF24' },
            { label: 'RELAPSES\nAVOIDED', value: `${stats.relapsesAvoided}`, color: '#10B981' },
            { label: 'TOTAL\nWAKEUPS', value: `${stats.totalWakeups}`, color: '#3B82F6' },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Demo Button ── */}
        <TouchableOpacity
          style={styles.demoButton}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (e) {}
            onTriggerTestAlarm();
          }}
          activeOpacity={0.85}
        >
          <Play size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
          <Text style={styles.demoButtonText}>TEST FULL PROTOCOL ON S23 ULTRA</Text>
        </TouchableOpacity>
        <Text style={styles.demoHelpText}>
          Sunrise Ramp → Bed-Down Detector → 2-Min Grace → All Missions → T+15 Relapse Check
        </Text>
      </ScrollView>

      {/* ── Wake Time Picker Modal ── */}
      <TimePickerModal
        visible={showWakePicker}
        title="Set Wake-Up Time"
        initialTime={settings.targetWakeTime}
        onConfirm={handleWakeTimeConfirm}
        onCancel={() => setShowWakePicker(false)}
      />

      {/* ── Bedtime Picker Modal ── */}
      <TimePickerModal
        visible={showBedPicker}
        title="Set Bedtime Target"
        initialTime={settings.targetBedtime}
        onConfirm={handleBedtimeConfirm}
        onCancel={() => setShowBedPicker(false)}
      />

      {/* ── Desk QR Modal ── */}
      <Modal visible={showQrModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Bedroom QR Anchor</Text>
              <TouchableOpacity onPress={() => setShowQrModal(false)}>
                <X size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.qrDesc}>
              Stick this on your desk, wardrobe, or water bottle across the room.
            </Text>
            <View style={styles.qrCodeBox}>
              <QrCode size={160} color="#000000" />
            </View>
            <Text style={styles.qrCodeText}>KEY: {settings.qrCodeSecret}</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => setShowQrModal(false)}>
              <Text style={styles.confirmBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090A0F' },
  scrollContent: { padding: 20, paddingTop: 52, paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  brand: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  tagline: { color: '#9CA3AF', fontSize: 12, marginTop: 1 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#374151' },
  streakText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  notifWarning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#78350F30', borderColor: '#F59E0B60', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  notifWarningText: { color: '#FDE68A', fontSize: 12, flex: 1, lineHeight: 16 },

  heroCard: { backgroundColor: '#111827', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#1F2937', marginBottom: 16 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 16 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  statusPillText: { color: '#E5E7EB', fontSize: 10, fontWeight: '800' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  timeDisplay: { color: '#FFFFFF', fontSize: 52, fontWeight: '900', letterSpacing: 1 },
  ampm: { color: '#9CA3AF', fontSize: 18, fontWeight: '700' },
  editBadge: { backgroundColor: '#1E3A8A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4, alignSelf: 'center' },
  editBadgeText: { color: '#93C5FD', fontSize: 9, fontWeight: '800' },
  heroSub: { color: '#6B7280', fontSize: 12, marginTop: 4 },
  divider: { height: 1, backgroundColor: '#1F2937', marginVertical: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  toggleSub: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  circadianCard: { backgroundColor: '#131826', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 14 },
  circadianHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  circadianTitle: { color: '#818CF8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  circadianRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  bedtimeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  windDownBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#312E8140', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  windDownText: { color: '#A5B4FC', fontSize: 11, fontWeight: '600' },
  circadianSub: { color: '#94A3B8', fontSize: 11, lineHeight: 15 },

  relapseCheckCard: { backgroundColor: '#1C0A0A', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#7F1D1D60', marginBottom: 20 },
  relapseCheckHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  relapseCheckTitle: { color: '#F87171', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  relapseCheckDesc: { color: '#FCA5A5', fontSize: 12, lineHeight: 18 },

  missionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#9CA3AF', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  qrLink: { color: '#3B82F6', fontSize: 12, fontWeight: '700' },

  missionCard: { backgroundColor: '#111827', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#1F2937' },
  missionIcon: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  missionInfo: { flex: 1 },
  missionName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  missionDesc: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 10 },
  statCard: { flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1F2937' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#6B7280', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center', marginTop: 3 },

  demoButton: { width: '100%', height: 58, backgroundColor: '#2563EB', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 14, elevation: 6 },
  demoButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  demoHelpText: { color: '#6B7280', fontSize: 11, marginTop: 7, textAlign: 'center' },

  // Picker Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerModal: { width: '100%', backgroundColor: '#111827', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#374151' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 },
  pickerWrap: { alignItems: 'center' },
  pickerLabel: { color: '#6B7280', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  pickerColumn: { height: 180, width: 72 },
  pickerItem: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  pickerItemSelected: { backgroundColor: '#1E3A8A' },
  pickerItemText: { color: '#9CA3AF', fontSize: 24, fontWeight: '600' },
  pickerItemTextSelected: { color: '#FFFFFF', fontWeight: '900' },
  pickerColon: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 12 },
  pickerPreview: { alignItems: 'center', marginBottom: 16 },
  pickerPreviewTime: { color: '#3B82F6', fontSize: 40, fontWeight: '900', letterSpacing: 2 },
  pickerActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, height: 48, backgroundColor: '#374151', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#D1D5DB', fontSize: 14, fontWeight: '700' },
  confirmBtn: { flex: 2, height: 48, backgroundColor: '#3B82F6', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  qrDesc: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  qrCodeBox: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, marginBottom: 12, alignSelf: 'center' },
  qrCodeText: { color: '#6B7280', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', marginBottom: 16 },
});
