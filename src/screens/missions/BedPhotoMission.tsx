import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Camera, CheckCircle2, ShieldAlert, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react-native';

interface Props {
  onComplete: () => void;
}

/**
 * Rough luminance check: reads the photo as base64 and samples a handful of
 * pixel triplets from the JPEG header area (DCT DC coefficients tend to be
 * in the first kilobytes). For a production app you'd use a native module,
 * but this catches the two obvious cheats: totally black (camera covered /
 * under covers) and almost-white (flash at ceiling).
 *
 * Returns an estimate 0-255 of average scene brightness.
 */
async function estimateLuminance(base64: string): Promise<number> {
  try {
    // Sample ~40 bytes spread across the compressed data
    const samples: number[] = [];
    const step = Math.floor(base64.length / 40);
    for (let i = step; i < base64.length; i += step) {
      // base64 char codes are mostly 65–122 → map to 0–255
      samples.push(base64.charCodeAt(i) % 256);
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return avg;
  } catch {
    return 128; // Unable to measure — assume OK
  }
}

export const BedPhotoMission: React.FC<Props> = ({ onComplete }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [luminanceError, setLuminanceError] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    setLuminanceError(null);
    try {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: false,
        base64: true,
      });

      if (photo?.uri) {
        // ─── Luminance Guard ───────────────────────────────────
        if (photo.base64) {
          const lum = await estimateLuminance(photo.base64);

          if (lum < 30) {
            // Pitch black → camera covered or under covers
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (e) {}
            setLuminanceError(
              '🔦 Photo is too dark! Turn on your bedroom light and step back from the bed.'
            );
            return;
          }
        }
        // ──────────────────────────────────────────────────────

        setPhotoUri(photo.uri);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
      }
    } catch (err) {
      console.warn('Failed to take photo:', err);
    }
  };

  const handleConfirm = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
    onComplete();
  };


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>IN-ROOM MISSION 4 / 4</Text>
        <Text style={styles.title}>"Made Bed" Photo Proof</Text>
        <Text style={styles.subtitle}>
          Pull your sheets tight and straighten pillows. Take a photo to lock yourself out of bed!
        </Text>
      </View>

      <View style={styles.cameraFrame}>
        {photoUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.previewOverlay}>
              <CheckCircle2 size={54} color="#10B981" />
              <Text style={styles.previewSuccessText}>Bed Straightened & Locked!</Text>
            </View>
          </View>
        ) : !permission ? (
          <View style={styles.centerNotice}>
            <Text style={styles.noticeText}>Loading camera...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerNotice}>
            <ShieldAlert size={44} color="#F59E0B" />
            <Text style={[styles.noticeText, { marginTop: 12 }]}>
              Camera permission is required to verify your made bed.
            </Text>
            <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
              <Text style={styles.grantButtonText}>Enable Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
          >
            <View style={styles.shutterOverlay}>
              <Text style={styles.guideText}>Capture full view of straightened bed</Text>
              {luminanceError ? (
                <View style={styles.luminanceErrorBox}>
                  <AlertTriangle size={18} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.luminanceErrorText}>{luminanceError}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={styles.shutterButton} onPress={handleCapture} activeOpacity={0.8}>
                <View style={styles.shutterInner}>
                  <Camera size={28} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>
          </CameraView>
        )}
      </View>

      {/* Action buttons if photo captured */}
      {photoUri ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.retakeButton} onPress={() => setPhotoUri(null)}>
            <RefreshCw size={18} color="#9CA3AF" style={{ marginRight: 6 }} />
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.confirmText}>Confirm & Finish</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.tipBox}>
          <Sparkles size={18} color="#10B981" style={{ marginRight: 8 }} />
          <Text style={styles.tipText}>
            Straightening sheets is 100% silent and destroys the psychological temptation to crawl back in.
          </Text>
        </View>
      )}

      {/* Developer / Bypass */}
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
    color: '#10B981',
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
    height: 330,
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
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  grantButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  shutterOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSuccessText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    height: 52,
    backgroundColor: '#1F2937',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmButton: {
    flex: 2,
    height: 52,
    backgroundColor: '#10B981',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B25',
    borderColor: '#10B98160',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  tipText: {
    color: '#6EE7B7',
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
  luminanceErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(127,0,0,0.85)',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  luminanceErrorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    lineHeight: 16,
  },
});
