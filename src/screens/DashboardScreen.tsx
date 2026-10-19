import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Modal, TextInput, Linking,
} from 'react-native';
import {
  Sun, Moon, Flame, Smartphone, Brain, QrCode, Bed, Play,
  ShieldCheck, Clock, X, BellRing, MessageCircle, Send, ChevronRight,
  TrendingUp, Settings, AlertCircle, CheckCircle2, Activity, Volume2, ShieldAlert, Zap, Cpu, BatteryCharging,
  Dumbbell, Minus, Plus,
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import Slider from '@react-native-community/slider';

import { AlarmSettings, UserStats, MissionType } from '../types';
import { CircadianGraph } from '../components/CircadianGraph';
import * as historyService from '../services/historyService';
import * as telegramService from '../services/telegramService';
import * as notificationService from '../services/notificationService';
import * as hardwareService from '../services/hardwareService';
import * as Haptics from 'expo-haptics';
import { Switch as RNSwitch } from 'react-native';

interface Props {
  settings: AlarmSettings;
  stats: UserStats;
  onUpdateSettings: (settings: AlarmSettings) => void;
  onTriggerTestAlarm: () => void;
  onTriggerDryRun?: () => void;
  onOpenBedtimeLockdown: () => void;
}

// ── Hours & Minutes for pickers ───────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

interface TimePickerModalProps {
  visible: boolean;
  title: string;
  initialTime: string;
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible, title, initialTime, onConfirm, onCancel,
}) => {
  const [hh, setHh] = useState(initialTime.split(':')[0]);
  const [mm, setMm] = useState(initialTime.split(':')[1]);

  useEffect(() => {
    if (visible) {
      setHh(initialTime.split(':')[0]);
      const rawMin = parseInt(initialTime.split(':')[1], 10);
      const snapped = String(Math.round(rawMin / 5) * 5 % 60).padStart(2, '0');
      setMm(MINUTES.includes(snapped) ? snapped : '00');
    }
  }, [visible, initialTime]);

  const hourIndex = HOURS.indexOf(hh);
  const minIndex = MINUTES.indexOf(mm);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <View style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onCancel}>
              <X size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.timePickerRow}>
            {/* Hours column */}
            <View style={styles.pickerColumnWrap}>
              <Text style={styles.pickerColLabel}>HOUR</Text>
              <ScrollView
                style={styles.pickerScroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={48}
                decelerationRate="fast"
                contentOffset={{ x: 0, y: hourIndex * 48 }}
                onMomentumScrollEnd={e => {
                  const idx = Math.round(e.nativeEvent.contentOffset.y / 48);
                  setHh(HOURS[Math.max(0, Math.min(idx, HOURS.length - 1))]);
                }}
              >
                {HOURS.map(h => (
                  <TouchableOpacity key={h} style={[styles.pickerCell, h === hh && styles.pickerCellActive]} onPress={() => { setHh(h); try { Haptics.selectionAsync(); } catch (e) {} }}>
                    <Text style={[styles.pickerCellText, h === hh && styles.pickerCellTextActive]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={styles.pickerColon}>:</Text>

            {/* Minutes column */}
            <View style={styles.pickerColumnWrap}>
              <Text style={styles.pickerColLabel}>MIN</Text>
              <ScrollView
                style={styles.pickerScroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={48}
                decelerationRate="fast"
                contentOffset={{ x: 0, y: minIndex * 48 }}
                onMomentumScrollEnd={e => {
                  const idx = Math.round(e.nativeEvent.contentOffset.y / 48);
                  setMm(MINUTES[Math.max(0, Math.min(idx, MINUTES.length - 1))]);
                }}
              >
                {MINUTES.map(m => (
                  <TouchableOpacity key={m} style={[styles.pickerCell, m === mm && styles.pickerCellActive]} onPress={() => { setMm(m); try { Haptics.selectionAsync(); } catch (e) {} }}>
                    <Text style={[styles.pickerCellText, m === mm && styles.pickerCellTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewTime}>{hh}:{mm}</Text>
          </View>

          <View style={styles.pickerActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirm(`${hh}:${mm}`)}>
              <Text style={styles.confirmBtnText}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Main Dashboard ─────────────────────────────────────────────────────────
export const DashboardScreen: React.FC<Props> = ({
  settings, stats, onUpdateSettings, onTriggerTestAlarm, onTriggerDryRun, onOpenBedtimeLockdown,
}) => {
  const [activeTab, setActiveTab] = useState<'HOME' | 'STATS' | 'SETTINGS'>('HOME');
  const [showWakePicker, setShowWakePicker] = useState(false);
  const [showBedPicker, setShowBedPicker] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [history, setHistory] = useState<historyService.WakeEntry[]>([]);
  const [notifGranted, setNotifGranted] = useState(true);

  // Telegram link state
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [telegramMsg, setTelegramMsg] = useState<string | null>(null);

  useEffect(() => {
    historyService.loadHistory().then(setHistory);
    notificationService.setupNotifications().then(granted => setNotifGranted(granted));
    telegramService.getSavedChatId().then(id => setTelegramLinked(!!id));
    telegramService.getBotUsername().then(setBotUsername);
    if (settings.enabled) {
      notificationService.scheduleWakeAlarm(settings.targetWakeTime);
      notificationService.scheduleBedtimeWindDown(settings.targetBedtime);
    }
  }, []);

  // ── Telegram linking ──────────────────────────────────────────────────
  const handleLinkTelegram = async () => {
    setTelegramLinking(true);
    setTelegramMsg('Polling for your message to the bot...');
    const chatId = await telegramService.discoverChatId();
    if (chatId) {
      setTelegramLinked(true);
      setTelegramMsg(`✅ Linked! Chat ID: ${chatId}`);
      await telegramService.sendMessage(
        '🔗 *Waky is now linked to your Telegram!*\n\nEvery morning after you complete your wake missions, I\'ll send you a confirmation here. 💪',
        chatId
      );
    } else {
      setTelegramMsg('❌ No message found. Please send /start to the bot first, then tap again.');
    }
    setTelegramLinking(false);
  };

  const handleSendTestMessage = async () => {
    const ok = await telegramService.sendWakeupSuccess(stats.currentStreak, settings.targetWakeTime, settings.activeMissions.length);
    setTelegramMsg(ok ? '✅ Test message sent to Telegram!' : '❌ Failed. Make sure you\'ve linked the bot.');
  };

  // ── Settings handlers ─────────────────────────────────────────────────
  const toggleAlarm = (val: boolean) => {
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

  const toggleMission = (id: MissionType) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    const exists = settings.activeMissions.includes(id);
    if (exists && settings.activeMissions.length === 1) return;
    const updated = exists
      ? settings.activeMissions.filter(m => m !== id)
      : [...settings.activeMissions, id];
    onUpdateSettings({ ...settings, activeMissions: updated });
  };

  const handleWakeConfirm = (time: string) => {
    const updated = { ...settings, targetWakeTime: time };
    onUpdateSettings(updated);
    if (settings.enabled) notificationService.scheduleWakeAlarm(time);
    setShowWakePicker(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
  };

  const handleBedConfirm = (time: string) => {
    const updated = { ...settings, targetBedtime: time };
    onUpdateSettings(updated);
    if (settings.enabled) notificationService.scheduleBedtimeWindDown(time);
    setShowBedPicker(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
  };

  const last7 = historyService.getLast7Days(history);
  const avgVar = historyService.avgVarianceMinutes(history);

  // ── Render Tabs ───────────────────────────────────────────────────────
  const renderHome = () => (
    <>
      {/* Alarm Hero Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.iconCircle}><Sun size={26} color="#F59E0B" /></View>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: settings.enabled ? '#10B981' : '#6B7280' }]} />
            <Text style={styles.statusPillText}>{settings.enabled ? 'ALARM ARMED' : 'ALARM OFF'}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => setShowWakePicker(true)} activeOpacity={0.8}>
          <View style={styles.timeRow}>
            <Text style={styles.timeDisplay}>{settings.targetWakeTime}</Text>
            <View style={styles.editBadge}><Text style={styles.editBadgeText}>TAP TO EDIT</Text></View>
          </View>
        </TouchableOpacity>

        <Text style={styles.heroSub}>Sunrise ramp 5 min early · 2-min anti-relapse grace · T+15 check</Text>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Wake Guard Active</Text>
            <Text style={styles.toggleSub}>Alarm + all 4 in-room missions</Text>
          </View>
          <Switch value={settings.enabled} onValueChange={toggleAlarm} thumbColor={settings.enabled ? '#3B82F6' : '#9CA3AF'} trackColor={{ false: '#374151', true: '#1E3A8A' }} />
        </View>
      </View>

      {/* Bedtime Card */}
      <TouchableOpacity style={styles.circadianCard} onPress={() => setShowBedPicker(true)} activeOpacity={0.8}>
        <View style={styles.circadianHeader}>
          <Moon size={16} color="#818CF8" style={{ marginRight: 6 }} />
          <Text style={styles.circadianTitle}>BEDTIME TARGET — TAP TO EDIT</Text>
        </View>
        <View style={styles.circadianRow}>
          <Text style={styles.bedtimeText}>{settings.targetBedtime}</Text>
          <View style={styles.windDownBadge}>
            <Clock size={12} color="#818CF8" style={{ marginRight: 4 }} />
            <Text style={styles.windDownText}>Wind-down 45m before</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Sport Proof Push-Up Wakeup Card */}
      <View style={styles.pushUpCard}>
        <View style={styles.pushUpHeader}>
          <Dumbbell size={18} color="#10B981" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pushUpTitle}>SPORT PROOF WAKE-UP</Text>
            <Text style={styles.pushUpSub}>Phone on floor · Disarm by doing push-ups</Text>
          </View>
        </View>
        <View style={styles.pushUpRow}>
          <View>
            <Text style={styles.pushUpValue}>{settings.targetPushUps ?? 20} REPS</Text>
            <Text style={styles.pushUpHint}>Optical chest sensor + nose/chin tap</Text>
          </View>
          <View style={styles.pushUpButtons}>
            <TouchableOpacity
              style={styles.pushUpAdjBtn}
              onPress={() => {
                const current = settings.targetPushUps ?? 20;
                const nextVal = Math.max(5, current - 5);
                onUpdateSettings({ ...settings, targetPushUps: nextVal });
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
              }}
            >
              <Minus size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pushUpAdjBtn}
              onPress={() => {
                const current = settings.targetPushUps ?? 20;
                const nextVal = Math.min(50, current + 5);
                onUpdateSettings({ ...settings, targetPushUps: nextVal });
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
              }}
            >
              <Plus size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bedtime Lockdown Sanctuary Card */}
      <TouchableOpacity
        style={styles.bedtimeLockdownCard}
        onPress={onOpenBedtimeLockdown}
        activeOpacity={0.85}
      >
        <View style={styles.bedtimeLockdownIcon}>
          <Moon size={18} color="#F97316" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bedtimeLockdownTitle}>Bedtime Blue-Light Lockdown</Text>
          <Text style={styles.bedtimeLockdownSub}>0% blue light · 4-7-8 breathing pacer for sleep</Text>
        </View>
        <ChevronRight size={18} color="#EA580C" />
      </TouchableOpacity>

      {/* Stats Strip */}
      <View style={styles.statsRow}>
        {[
          { label: 'STREAK', value: `${stats.currentStreak}d`, color: '#EF4444' },
          { label: 'BEST', value: `${stats.bestStreak}d`, color: '#FBBF24' },
          { label: 'AVOIDED', value: `${stats.relapsesAvoided}`, color: '#10B981' },
          { label: 'AVG VAR', value: `${avgVar}m`, color: '#3B82F6' },
        ].map(s => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Circadian Graph */}
      <CircadianGraph data={last7} targetTime={settings.targetWakeTime} />

      {/* Demo & Simulator Buttons */}
      <TouchableOpacity style={styles.demoButton} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (e) {} onTriggerTestAlarm(); }} activeOpacity={0.85}>
        <Play size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.demoButtonText}>TEST FULL PROTOCOL ON S23 ULTRA</Text>
      </TouchableOpacity>

      {onTriggerDryRun && (
        <TouchableOpacity style={styles.simulatorButton} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (e) {} onTriggerDryRun(); }} activeOpacity={0.85}>
          <Zap size={18} color="#FBBF24" style={{ marginRight: 8 }} />
          <Text style={styles.simulatorButtonText}>⚡ 30-SECOND DRY-RUN SIMULATOR</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.demoHelpText}>Sunrise → 15s Chug → QR Scan → Whisper → Success</Text>
    </>
  );

  const renderStats = () => {
    const statsSummary = historyService.computeWakeStatistics(history, stats.relapsesAvoided);
    const sortedHistory = [...history].reverse();

    return (
      <>
        {/* Tier & On-Time Rate Banner */}
        <View style={styles.tierHeroCard}>
          <View style={styles.tierTop}>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>{statsSummary.grade} TIER</Text>
            </View>
            <Text style={styles.tierScoreText}>{statsSummary.onTimeRate}%</Text>
          </View>
          <Text style={styles.tierTitle}>{statsSummary.gradeTitle}</Text>
          <Text style={styles.tierSub}>
            {statsSummary.onTimeRate >= 85
              ? '🎯 Outstanding! Your biological clock is locked in sync with your targets.'
              : '⚡ Consistency in progress. Keep completing in-bedroom missions!'}
          </Text>

          {/* Quick Metrics Bar */}
          <View style={styles.tierMetricsRow}>
            <View style={styles.tierMetricItem}>
              <Text style={styles.tierMetricVal}>{statsSummary.onTimeRate}%</Text>
              <Text style={styles.tierMetricLbl}>ON-TIME RATE</Text>
            </View>
            <View style={styles.tierMetricItem}>
              <Text style={styles.tierMetricVal}>±{statsSummary.avgVarianceMinutes}m</Text>
              <Text style={styles.tierMetricLbl}>AVG VARIANCE</Text>
            </View>
            <View style={styles.tierMetricItem}>
              <Text style={styles.tierMetricVal}>{stats.relapsesAvoided}</Text>
              <Text style={styles.tierMetricLbl}>SAVED FROM SNOOZE</Text>
            </View>
          </View>
        </View>

        {/* Weekly Circadian Analysis Graph */}
        <Text style={styles.sectionHeading}>WEEKLY CIRCADIAN ANALYSIS</Text>
        <CircadianGraph data={last7} targetTime={settings.targetWakeTime} />

        {/* Detailed History Log Table */}
        <Text style={[styles.sectionHeading, { marginTop: 18 }]}>RECENT WAKE-UP HISTORY</Text>
        {sortedHistory.length === 0 ? (
          <View style={styles.emptyHistoryCard}>
            <Text style={styles.emptyHistoryText}>
              No wake-ups recorded yet. Tomorrow morning at {settings.targetWakeTime} will log day #1!
            </Text>
          </View>
        ) : (
          <View style={styles.historyListCard}>
            {sortedHistory.slice(0, 10).map((entry, idx) => {
              const isOnTime = entry.deltaMinutes <= 5;
              const isEarly = entry.deltaMinutes < 0;
              return (
                <View key={entry.date + idx} style={[styles.historyRow, idx > 0 && styles.historyRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>{entry.date}</Text>
                    <Text style={styles.historyTimes}>
                      Target: {entry.targetTime} • Actual: <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{entry.actualTime}</Text>
                    </Text>
                  </View>
                  <View style={[styles.historyBadge, isEarly ? styles.historyBadgeEarly : isOnTime ? styles.historyBadgeOnTime : styles.historyBadgeLate]}>
                    <Text style={[styles.historyBadgeText, isEarly ? { color: '#60A5FA' } : isOnTime ? { color: '#10B981' } : { color: '#F59E0B' }]}>
                      {isEarly ? `EARLY ${Math.abs(entry.deltaMinutes)}m` : isOnTime ? `ON TIME +${entry.deltaMinutes}m` : `+${entry.deltaMinutes}m LATE`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderSettings = () => (
    <>
      {/* ── Mission Toggles & Difficulty ── */}
      <Text style={styles.sectionHeading}>IN-BEDROOM MISSIONS</Text>
      {([
        { id: 'POSTURE_HOLD' as MissionType, icon: <Smartphone size={19} color="#10B981" />, name: 'Vertical Posture Hold', desc: 'Duration (seconds)', min: 15, max: 90, step: 5, key: 'postureSeconds' },
        { id: 'STROOP_TEST' as MissionType, icon: <Brain size={19} color="#8B5CF6" />, name: 'Stroop Cognitive Duel', desc: 'Correct streak required', min: 3, max: 15, step: 1, key: 'stroopStreak' },
        { id: 'SQUAT_COUNTER' as MissionType, icon: <Activity size={19} color="#3B82F6" />, name: '10 Bedroom Squats', desc: 'Target squats (0 dB)', min: 5, max: 25, step: 1, key: 'targetSquats' },
        { id: 'WATER_QR' as MissionType, icon: <QrCode size={19} color="#3B82F6" />, name: 'Desk / Bottle QR Scan', desc: 'Always on (scan required)', min: null, max: null, step: null, key: null },
        { id: 'BED_PHOTO' as MissionType, icon: <Bed size={19} color="#F59E0B" />, name: '"Made Bed" Photo Proof', desc: 'Always on (photo required)', min: null, max: null, step: null, key: null },
      ] as const).map(m => {
        const diffValue = m.key ? ((settings as any)[m.key] ?? (m.id === 'POSTURE_HOLD' ? 45 : m.id === 'SQUAT_COUNTER' ? 10 : 7)) : null;
        return (
          <View key={m.id} style={styles.missionSettingCard}>
            <View style={styles.missionSettingTop}>
              <View style={styles.missionIconSmall}>{m.icon}</View>
              <Text style={styles.missionSettingName}>{m.name}</Text>
              <Switch
                value={settings.activeMissions.includes(m.id)}
                onValueChange={() => toggleMission(m.id)}
                thumbColor={settings.activeMissions.includes(m.id) ? '#3B82F6' : '#9CA3AF'}
                trackColor={{ false: '#374151', true: '#1E3A8A' }}
              />
            </View>
            {m.key && diffValue !== null && settings.activeMissions.includes(m.id) && (
              <View style={styles.difficultyRow}>
                <Text style={styles.difficultyLabel}>
                  {m.desc}: <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{diffValue}{m.id === 'POSTURE_HOLD' ? 's' : m.id === 'SQUAT_COUNTER' ? ' squats' : ' correct'}</Text>
                </Text>
                <Slider
                  style={{ width: '100%', height: 32 }}
                  minimumValue={m.min!}
                  maximumValue={m.max!}
                  step={m.step!}
                  value={diffValue}
                  minimumTrackTintColor="#3B82F6"
                  maximumTrackTintColor="#374151"
                  thumbTintColor="#3B82F6"
                  onValueChange={(val: number) => onUpdateSettings({ ...settings, [m.key!]: val })}
                />
              </View>
            )}
          </View>
        );
      })}

      {/* ── Wake-up Sound Profile ── */}
      <Text style={[styles.sectionHeading, { marginTop: 20 }]}>WAKE-UP SOUNDSCAPE</Text>
      <View style={styles.soundProfileContainer}>
        {([
          { id: 'GAMMA_40HZ', name: '40Hz Binaural Gamma', desc: 'Focus brainwave stimulation' },
          { id: 'PROGRESSIVE_CHIME', name: 'Acoustic Harmonics', desc: 'Gentle rising crescendo' },
          { id: 'EMERGENCY_KLAXON', name: 'Adrenaline Klaxon', desc: 'Heavy sleeper urgency horn' },
        ] as const).map(s => {
          const isActive = settings.soundProfile === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.soundBtn, isActive && styles.soundBtnActive]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch (e) {}
                onUpdateSettings({ ...settings, soundProfile: s.id });
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.soundDot, isActive && styles.soundDotActive]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.soundTitle, isActive && styles.soundTitleActive]}>{s.name}</Text>
                <Text style={styles.soundSub}>{s.desc}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── QR Code Generator ── */}
      <Text style={[styles.sectionHeading, { marginTop: 20 }]}>BEDROOM QR ANCHOR</Text>
      <TouchableOpacity style={styles.qrGenerateCard} onPress={() => setShowQrModal(true)} activeOpacity={0.85}>
        <QrCode size={22} color="#3B82F6" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.qrCardTitle}>View & Print Your Desk QR Code</Text>
          <Text style={styles.qrCardSub}>Key: {settings.qrCodeSecret}</Text>
        </View>
        <ChevronRight size={18} color="#6B7280" />
      </TouchableOpacity>

      {/* ── Telegram Accountability ── */}
      <Text style={[styles.sectionHeading, { marginTop: 20 }]}>TELEGRAM ACCOUNTABILITY</Text>
      <View style={styles.telegramCard}>
        <View style={styles.telegramHeader}>
          <MessageCircle size={22} color={telegramLinked ? '#10B981' : '#3B82F6'} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.telegramTitle}>{telegramLinked ? '✅ Bot Linked!' : 'Link Telegram Bot'}</Text>
            {botUsername && <Text style={styles.telegramSub}>@{botUsername}</Text>}
          </View>
        </View>

        {!telegramLinked && (
          <Text style={styles.telegramInstructions}>
            1. Open Telegram → search <Text style={{ color: '#60A5FA', fontWeight: '700' }}>@{botUsername ?? 'your_bot'}</Text>{'\n'}
            2. Send <Text style={{ color: '#60A5FA', fontWeight: '700' }}>/start</Text> to the bot{'\n'}
            3. Tap "Link Now" below
          </Text>
        )}

        {telegramMsg && (
          <View style={[styles.telegramMsgBox, { borderColor: telegramLinked ? '#10B98160' : '#EF444460' }]}>
            <Text style={styles.telegramMsgText}>{telegramMsg}</Text>
          </View>
        )}

        <View style={styles.telegramActions}>
          <TouchableOpacity
            style={[styles.telegramBtn, { backgroundColor: telegramLinked ? '#064E3B' : '#1E3A8A' }]}
            onPress={handleLinkTelegram}
            disabled={telegramLinking}
          >
            <Send size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.telegramBtnText}>{telegramLinking ? 'Checking...' : telegramLinked ? 'Re-link' : 'Link Now'}</Text>
          </TouchableOpacity>

          {telegramLinked && (
            <TouchableOpacity style={[styles.telegramBtn, { backgroundColor: '#374151', flex: 1 }]} onPress={handleSendTestMessage}>
              <Text style={styles.telegramBtnText}>Send Test Message</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Public Forfeit / Partner Relapse Alert */}
        <View style={styles.partnerForfeitBox}>
          <View style={styles.partnerHeader}>
            <ShieldAlert size={18} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.partnerTitle}>Social Forfeit: Friend / Group Alert</Text>
            <Switch
              value={settings.partnerAlertEnabled ?? false}
              onValueChange={val => onUpdateSettings({ ...settings, partnerAlertEnabled: val })}
              thumbColor={settings.partnerAlertEnabled ? '#EF4444' : '#9CA3AF'}
              trackColor={{ false: '#374151', true: '#7F1D1D' }}
            />
          </View>
          <Text style={styles.partnerSub}>
            If you fail missions and trigger the Relapse Siren, Waky auto-messages this chat so someone calls you!
          </Text>
          {settings.partnerAlertEnabled && (
            <TextInput
              style={styles.partnerInput}
              placeholder="Partner / Group Chat ID (e.g. -1001234567)"
              placeholderTextColor="#6B7280"
              value={settings.partnerChatId || ''}
              onChangeText={val => onUpdateSettings({ ...settings, partnerChatId: val })}
            />
          )}
        </View>
      </View>

      {/* ── Samsung S23 Ultra System Immortality & Diagnostics ── */}
      <Text style={styles.sectionHeading}>SAMSUNG ONE UI IMMORTALITY & STABILITY</Text>
      <View style={styles.stabilityCard}>
        <View style={styles.stabilityHeader}>
          <Cpu size={18} color="#60A5FA" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stabilityTitle}>Hardware & Background Guard</Text>
            <Text style={styles.stabilitySub}>Keep Waky running 100% reliably on One UI</Text>
          </View>
        </View>

        <View style={styles.stabilityChecklist}>
          <View style={styles.stabilityRow}>
            <BatteryCharging size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.stabilityLabel}>Battery Optimization:</Text>
            <Text style={styles.stabilityVal}>Whitelisted</Text>
          </View>

          <View style={styles.stabilityRow}>
            <ShieldCheck size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.stabilityLabel}>Lock Screen Overlay:</Text>
            <Text style={styles.stabilityVal}>SYSTEM_ALERT</Text>
          </View>

          <View style={styles.stabilityRow}>
            <Volume2 size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.stabilityLabel}>Audio Stream:</Text>
            <Text style={styles.stabilityVal}>STREAM_ALARM (DND Bypass)</Text>
          </View>

          <View style={styles.stabilityRow}>
            <Zap size={16} color="#FBBF24" style={{ marginRight: 8 }} />
            <Text style={styles.stabilityLabel}>Torch Duty Guard:</Text>
            <Text style={styles.stabilityVal}>3-Min Thermal Safe</Text>
          </View>
        </View>

        <View style={styles.stabilityButtons}>
          <TouchableOpacity
            style={styles.stabilityBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
              Linking.openSettings();
            }}
          >
            <Settings size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.stabilityBtnText}>Android Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.stabilityBtn, { backgroundColor: '#1E3A8A' }]}
            onPress={async () => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
              await hardwareService.testAlarmAudio(settings.soundProfile === 'GAMMA_40HZ' ? 'gamma_40hz' : 'progressive_chime');
            }}
          >
            <Volume2 size={15} color="#60A5FA" style={{ marginRight: 6 }} />
            <Text style={[styles.stabilityBtnText, { color: '#93C5FD' }]}>Test Audio Stream</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Notification Status ── */}
      {!notifGranted && (
        <View style={styles.notifWarning}>
          <AlertCircle size={16} color="#F59E0B" style={{ marginRight: 8 }} />
          <Text style={styles.notifWarningText}>Notification permission required for background alarms to fire!</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>WAKY</Text>
          <Text style={styles.tagline}>In-Room Anti-Relapse System</Text>
        </View>
        <View style={styles.streakBadge}>
          <Flame size={15} color="#EF4444" style={{ marginRight: 4 }} />
          <Text style={styles.streakText}>{stats.currentStreak} DAY STREAK</Text>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        {(['HOME', 'STATS', 'SETTINGS'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => { setActiveTab(tab); try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {} }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ── */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'HOME' && renderHome()}
        {activeTab === 'STATS' && renderStats()}
        {activeTab === 'SETTINGS' && renderSettings()}
      </ScrollView>

      {/* ── Modals ── */}
      <TimePickerModal visible={showWakePicker} title="Set Wake-Up Time" initialTime={settings.targetWakeTime} onConfirm={handleWakeConfirm} onCancel={() => setShowWakePicker(false)} />
      <TimePickerModal visible={showBedPicker} title="Set Bedtime Target" initialTime={settings.targetBedtime} onConfirm={handleBedConfirm} onCancel={() => setShowBedPicker(false)} />

      {/* Real QR Code Modal */}
      <Modal visible={showQrModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.qrModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Your Bedroom QR Anchor</Text>
              <TouchableOpacity onPress={() => setShowQrModal(false)}><X size={22} color="#9CA3AF" /></TouchableOpacity>
            </View>
            <Text style={styles.qrInstructions}>Screenshot this, print it, and stick it on your desk, wardrobe, or water bottle.</Text>
            <View style={styles.qrCodeBox}>
              <QRCode
                value={settings.qrCodeSecret}
                size={220}
                color="#000000"
                backgroundColor="#FFFFFF"
              />
            </View>
            <Text style={styles.qrKeyText}>Key: <Text style={{ fontFamily: 'monospace', color: '#60A5FA' }}>{settings.qrCodeSecret}</Text></Text>
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

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  brand: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  tagline: { color: '#9CA3AF', fontSize: 11, marginTop: 1 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#374151' },
  streakText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  tabBar: { flexDirection: 'row', backgroundColor: '#111827', marginHorizontal: 20, borderRadius: 14, padding: 4, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#1F2937' },
  tabText: { color: '#6B7280', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  tabTextActive: { color: '#FFFFFF' },

  scrollContent: { padding: 20, paddingTop: 8, paddingBottom: 50 },
  sectionHeading: { color: '#9CA3AF', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },

  // Hero card
  heroCard: { backgroundColor: '#111827', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#1F2937', marginBottom: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  statusPillText: { color: '#E5E7EB', fontSize: 10, fontWeight: '800' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeDisplay: { color: '#FFFFFF', fontSize: 50, fontWeight: '900', letterSpacing: 1 },
  editBadge: { backgroundColor: '#1E3A8A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  editBadgeText: { color: '#93C5FD', fontSize: 9, fontWeight: '800' },
  heroSub: { color: '#6B7280', fontSize: 11, marginTop: 4, marginBottom: 12 },
  divider: { height: 1, backgroundColor: '#1F2937', marginVertical: 14 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  toggleSub: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  // Bedtime card
  circadianCard: { backgroundColor: '#131826', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 14 },
  circadianHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  circadianTitle: { color: '#818CF8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  circadianRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bedtimeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  windDownBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#312E8140', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  windDownText: { color: '#A5B4FC', fontSize: 11, fontWeight: '600' },

  // Push-Up Sport Card
  pushUpCard: {
    backgroundColor: '#06281E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#10B98180',
    marginBottom: 14,
  },
  pushUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pushUpTitle: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pushUpSub: {
    color: '#A7F3D0',
    fontSize: 11,
    marginTop: 1,
  },
  pushUpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pushUpValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pushUpHint: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  pushUpButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pushUpAdjBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#111827', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1F2937' },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { color: '#6B7280', fontSize: 8, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center', marginTop: 2 },

  // Demo
  demoButton: { width: '100%', height: 56, backgroundColor: '#2563EB', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 12, elevation: 5, marginTop: 4 },
  demoButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  demoHelpText: { color: '#6B7280', fontSize: 11, marginTop: 6, textAlign: 'center' },

  // Stats tab
  statsDetailCard: { backgroundColor: '#111827', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1F2937', marginBottom: 12 },
  statsDetailTitle: { color: '#60A5FA', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  statsDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  statsDetailLabel: { color: '#9CA3AF', fontSize: 13 },
  statsDetailValue: { fontSize: 14, fontWeight: '700' },
  varianceInfoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E1065', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#7C3AED60' },
  varianceInfoText: { color: '#C4B5FD', fontSize: 12, lineHeight: 18, flex: 1 },

  // Settings tab missions
  missionSettingCard: { backgroundColor: '#111827', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1F2937' },
  missionSettingTop: { flexDirection: 'row', alignItems: 'center' },
  missionIconSmall: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  missionSettingName: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  difficultyRow: { marginTop: 10 },
  difficultyLabel: { color: '#9CA3AF', fontSize: 12 },

  // QR card
  qrGenerateCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#1F2937', marginBottom: 6 },
  qrCardTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  qrCardSub: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  // Telegram card
  telegramCard: { backgroundColor: '#111827', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1F2937', marginBottom: 14 },
  telegramHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  telegramTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  telegramSub: { color: '#6B7280', fontSize: 11, marginTop: 1 },
  telegramInstructions: { color: '#9CA3AF', fontSize: 12, lineHeight: 20, backgroundColor: '#1F2937', borderRadius: 10, padding: 12, marginBottom: 12 },
  telegramMsgBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  telegramMsgText: { color: '#D1D5DB', fontSize: 12 },
  telegramActions: { flexDirection: 'row', gap: 10 },
  telegramBtn: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  telegramBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Notif warning
  notifWarning: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#78350F30', borderColor: '#F59E0B60', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  notifWarningText: { color: '#FDE68A', fontSize: 12, flex: 1 },

  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerModal: { width: '100%', backgroundColor: '#111827', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#374151' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 },
  pickerColumnWrap: { alignItems: 'center' },
  pickerColLabel: { color: '#6B7280', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  pickerScroll: { height: 200, width: 80 },
  pickerCell: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  pickerCellActive: { backgroundColor: '#1E3A8A' },
  pickerCellText: { color: '#6B7280', fontSize: 24, fontWeight: '500' },
  pickerCellTextActive: { color: '#FFFFFF', fontWeight: '900' },
  pickerColon: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 14 },
  previewRow: { alignItems: 'center', marginBottom: 14 },
  previewTime: { color: '#3B82F6', fontSize: 40, fontWeight: '900', letterSpacing: 2 },
  pickerActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, height: 48, backgroundColor: '#374151', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#D1D5DB', fontSize: 14, fontWeight: '700' },
  confirmBtn: { flex: 2, height: 48, backgroundColor: '#3B82F6', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  qrModal: { width: '100%', backgroundColor: '#111827', borderRadius: 22, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  qrInstructions: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  qrCodeBox: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 18, marginBottom: 14 },
  qrKeyText: { color: '#6B7280', fontSize: 12, marginBottom: 18 },

  // Bedtime lockdown card
  bedtimeLockdownCard: {
    backgroundColor: '#1A0800',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7C2D1260',
    marginBottom: 14,
  },
  bedtimeLockdownIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#431407',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bedtimeLockdownTitle: { color: '#F97316', fontSize: 14, fontWeight: '700' },
  bedtimeLockdownSub: { color: '#EA580C', fontSize: 11, marginTop: 2 },

  // Soundscape profiles
  soundProfileContainer: { gap: 8, marginBottom: 16 },
  soundBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1F2937',
  },
  soundBtnActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#111C30',
  },
  soundDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#374151',
    marginRight: 12,
  },
  soundDotActive: {
    backgroundColor: '#3B82F6',
  },
  soundTitle: { color: '#9CA3AF', fontSize: 14, fontWeight: '700' },
  soundTitleActive: { color: '#FFFFFF' },
  soundSub: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  // Partner forfeit alert
  partnerForfeitBox: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  partnerTitle: { color: '#FCA5A5', fontSize: 13, fontWeight: '700', flex: 1 },
  partnerSub: { color: '#9CA3AF', fontSize: 11, marginTop: 4, lineHeight: 16 },
  partnerInput: {
    height: 44,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF444460',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 13,
    marginTop: 10,
  },

  // Simulator dry-run button
  simulatorButton: {
    backgroundColor: '#78350F40',
    borderColor: '#F59E0B80',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  simulatorButtonText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Samsung Stability Card
  stabilityCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#1E3A8A',
    marginBottom: 14,
  },
  stabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stabilityTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  stabilitySub: {
    color: '#60A5FA',
    fontSize: 11,
    marginTop: 2,
  },
  stabilityChecklist: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  stabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stabilityLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  stabilityVal: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  stabilityButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  stabilityBtn: {
    flex: 1,
    height: 42,
    backgroundColor: '#334155',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  stabilityBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Tier & Stats Card Styles
  tierHeroCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    marginBottom: 16,
  },
  tierTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tierBadge: {
    backgroundColor: '#312E81',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  tierBadgeText: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tierScoreText: {
    color: '#10B981',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tierTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tierSub: {
    color: '#C7D2FE',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  tierMetricsRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    justifyContent: 'space-between',
  },
  tierMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  tierMetricVal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  tierMetricLbl: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // History list card
  emptyHistoryCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  emptyHistoryText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  historyListCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  historyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  historyDate: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  historyTimes: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  historyBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  historyBadgeEarly: {
    backgroundColor: '#1E3A8A40',
  },
  historyBadgeOnTime: {
    backgroundColor: '#064E3B40',
  },
  historyBadgeLate: {
    backgroundColor: '#78350F40',
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
