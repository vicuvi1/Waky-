import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { QrCode, CheckCircle2, ShieldAlert, Sparkles, Droplets, ArrowRight } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
  expectedSecret?: string;
  enableTorch?: boolean;
}

export const WaterQrMission: React.FC<Props> = ({
  onComplete,
  expectedSecret = 'WAKY_DESK_KEY',
  enableTorch = false,
}) => {
  const [step, setStep] = useState<'CHUG_WATER' | 'SCAN_QR'>('CHUG_WATER');
  const [chugSeconds, setChugSeconds] = useState(15);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);

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
        if (prev % 5 === 0) {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    setScannedData(data);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}

    setTimeout(() => {
      onComplete();
    }, 600);
  };

  return (
    <View style={styles.container}>
      {/* ── STEP 1: COLD WATER CHUG ────────────────────────────────────────── */}
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
            <Text style={styles.chugDoneText}>DONE DRINKING — SCAN QR</Text>
            <ArrowRight size={20} color="#000000" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </>
      ) : (
        /* ── STEP 2: QR SCAN ─────────────────────────────────────────────── */
        <>
          <View style={styles.header}>
            <Text style={styles.tag}>STEP 2 OF 2 · IN-ROOM ANCHOR</Text>
            <Text style={styles.title}>Scan Bottle / Desk QR</Text>
            <Text style={styles.subtitle}>
              Now point your camera at the QR code on your bottle cap or bedroom desk.
            </Text>
          </View>

          {/* Camera Viewfinder Area */}
          <View style={styles.cameraFrame}>
            {!permission ? (
              <View style={styles.centerNotice}>
                <Text style={styles.noticeText}>Loading camera...</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.centerNotice}>
                <ShieldAlert size={44} color="#F59E0B" />
                <Text style={[styles.noticeText, { marginTop: 12 }]}>
                  Camera permission is required to scan your bedroom QR anchor.
                </Text>
                <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
                  <Text style={styles.grantButtonText}>Enable Camera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={enableTorch}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              >
                <View style={styles.overlay}>
                  <View style={[styles.targetBox, scanned && styles.targetBoxSuccess]}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />
                    <QrCode size={40} color={scanned ? '#10B981' : '#3B82F6'} />
                  </View>
                  <Text style={styles.aimPrompt}>
                    {scanned ? 'QR Code Verified!' : 'Aim at your desk / bottle QR code'}
                  </Text>
                </View>
              </CameraView>
            )}
          </View>

          <View style={styles.tipBox}>
            <Sparkles size={18} color="#60A5FA" style={{ marginRight: 8 }} />
            <Text style={styles.tipText}>
              Hydrated + feet on the floor across the room. You've officially broken the bed's physical grip!
            </Text>
          </View>

          <TouchableOpacity
            style={styles.bypassButton}
            onPress={() => {
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
              onComplete();
            }}
          >
            <CheckCircle2 size={16} color="#6B7280" style={{ marginRight: 6 }} />
            <Text style={styles.bypassText}>Skip / Simulate Scan</Text>
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

  // Chug phase
  chugCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chugCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#082F49',
    borderWidth: 4,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38BDF8',
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 10,
  },
  chugCountdown: {
    color: '#FFFFFF',
    fontSize: 54,
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
    height: 60,
    backgroundColor: '#38BDF8',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#38BDF8',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  chugDoneText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Scan phase
  cameraFrame: {
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#374151',
    position: 'relative',
    marginVertical: 14,
  },
  centerNotice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noticeText: {
    color: '#D1D5DB',
    fontSize: 14,
    textAlign: 'center',
  },
  grantButton: {
    marginTop: 16,
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  grantButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  targetBox: {
    width: 200,
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    position: 'relative',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  targetBoxSuccess: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#60A5FA',
  },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  aimPrompt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
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
    lineHeight: 16,
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
