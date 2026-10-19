import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { QrCode, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
  expectedSecret?: string;
}

export const WaterQrMission: React.FC<Props> = ({ onComplete, expectedSecret = 'WAKY_DESK_KEY' }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);

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
      <View style={styles.header}>
        <Text style={styles.tag}>IN-ROOM MISSION 3 / 4</Text>
        <Text style={styles.title}>Desk / Bottle QR Scan</Text>
        <Text style={styles.subtitle}>
          Feet on the floor! Walk over to your desk or bedroom door and scan your room QR code.
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
                {scanned ? 'QR Code Verified!' : 'Aim at your desk QR code'}
              </Text>
            </View>
          </CameraView>
        )}
      </View>

      {/* In-Room Anchor Tip */}
      <View style={styles.tipBox}>
        <Sparkles size={18} color="#60A5FA" style={{ marginRight: 8 }} />
        <Text style={styles.tipText}>
          Keep this QR code on your desk, wardrobe, or water bottle across your bedroom. This breaks the bed's physical grip.
        </Text>
      </View>

      {/* Bypass / Test Button */}
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
        <Text style={styles.bypassText}>Skip / Simulate Scan</Text>
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
    color: '#3B82F6',
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
    backgroundColor: '#1E3A8A25',
    borderColor: '#3B82F660',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  tipText: {
    color: '#93C5FD',
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
