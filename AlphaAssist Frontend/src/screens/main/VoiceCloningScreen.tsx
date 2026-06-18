"use client"

import { useState, useRef, useEffect } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  PanResponder,
  ActivityIndicator,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import * as DocumentPicker from "expo-document-picker"
import { Audio } from "expo-av"
import * as Haptics from "expo-haptics"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Header from "../../components/common/Header"
import { useTheme } from "../../components/context/ThemeContext"
import { apiPostForm } from "../../services/api"
import { useAuth } from "../../hooks/useAuth"
import { supabase } from "../../services/supabase"
import type { MainStackParamList } from "../../types/navigation"

interface UploadedFile {
  uri: string
  name: string
  type: string
}

interface Recording {
  uri: string
  duration: number
}

const VoiceCloningScreen = () => {
  const { colors, activeTheme } = useTheme()
  const isDark = activeTheme === "dark"
  const { user } = useAuth()
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>()

  const [userTier, setUserTier] = useState<string>("basic")
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [isPlayingUpload, setIsPlayingUpload] = useState(false)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [recordedAudio, setRecordedAudio] = useState<Recording | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isPlayingRecord, setIsPlayingRecord] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [uploadingClone, setUploadingClone] = useState(false)

  // ── Upload audio to backend for voice-clone training ───────────────────
  const uploadClone = async (uri: string, name: string, type: string) => {
    if (!user) { Alert.alert("Not logged in", "Please sign in first."); return }
    try {
      setUploadingClone(true)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const fd = new FormData()
      fd.append("file", { uri, name, type } as any)
      await apiPostForm("/api/voice-clone/upload", fd)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(
        "✅ Voice Cloned",
        "Your voice profile is saved. AlphaAssist will now reply in your voice.",
      )
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert("Upload Failed", e.message || "Could not upload voice sample.")
    } finally {
      setUploadingClone(false)
    }
  }

  const _showUpgradeAlert = () => {
    Alert.alert(
      "Upgrade Required",
      "Voice cloning is not available on the Basic plan. Upgrade to Standard or Premium to use this feature.",
      [
        { text: "Upgrade Now", onPress: () => navigation.navigate("Subscription") },
        { text: "Cancel", style: "cancel" },
      ]
    )
  }

  const cloneUploadedFile = () => {
    if (userTier === "basic") { _showUpgradeAlert(); return }
    if (!uploadedFile) return
    uploadClone(uploadedFile.uri, uploadedFile.name, uploadedFile.type)
  }

  const cloneRecordedAudio = () => {
    if (userTier === "basic") { _showUpgradeAlert(); return }
    if (!recordedAudio) return
    const name = `recording_${Date.now()}.m4a`
    const type = recordedAudio.uri.endsWith(".wav") ? "audio/wav" : "audio/m4a"
    uploadClone(recordedAudio.uri, name, type)
  }

  const scaleAnim = useRef(new Animated.Value(1)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const glowAnim = useRef(new Animated.Value(0)).current
  const recordingTimer = useRef<NodeJS.Timeout | null>(null)

  // Staggered entrance animations
  const fadeAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current
  const slideAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(24))).current

  useEffect(() => {
    fadeAnims.forEach((anim, i) => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 500, delay: i * 110, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 500, delay: i * 110, useNativeDriver: true }),
      ]).start()
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return
    supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.subscription_tier) setUserTier(data.subscription_tier) })
      .catch(() => {})
  }, [user?.id])

  const animStyle = (i: number) => ({
    opacity: fadeAnims[i],
    transform: [{ translateY: slideAnims[i] }],
  })

  const startGlow = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 650, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 650, useNativeDriver: false }),
      ])
    ).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    ).start()
  }

  const stopGlow = () => {
    glowAnim.stopAnimation()
    pulseAnim.stopAnimation()
    glowAnim.setValue(0)
    pulseAnim.setValue(1)
  }

  const handleFileUpload = async () => {
    Alert.alert("Select Audio Source", "Choose how you want to upload your voice recording", [
      {
        text: "Select from Files",
        onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: "audio/*",
              copyToCacheDirectory: true,
            })
            if (!result.canceled && result.assets[0]) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              setUploadedFile({
                uri: result.assets[0].uri,
                name: result.assets[0].name,
                type: result.assets[0].mimeType || "audio/mp3",
              })
            }
          } catch (error) {
            console.log("Error picking document:", error)
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ])
  }

  const playUploadedFile = async () => {
    if (!uploadedFile) return
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setIsPlayingUpload(true)
      const { sound } = await Audio.Sound.createAsync({ uri: uploadedFile.uri })
      await sound.playAsync()
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingUpload(false)
          sound.unloadAsync()
        }
      })
    } catch {
      setIsPlayingUpload(false)
    }
  }

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync()
      if (permission.status !== "granted") return
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      setRecording(recording)
      setIsRecording(true)
      setRecordingDuration(0)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      startGlow()
      recordingTimer.current = setInterval(() => setRecordingDuration((prev) => prev + 1), 1000)
    } catch (error) {
      console.log("Failed to start recording:", error)
    }
  }

  const stopRecording = async () => {
    if (!recording) return
    try {
      setIsRecording(false)
      stopGlow()
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current)
        recordingTimer.current = null
      }
      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      if (uri) setRecordedAudio({ uri, duration: recordingDuration })
      setRecording(null)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      console.log("Failed to stop recording:", error)
    }
  }

  const playRecordedAudio = async () => {
    if (!recordedAudio) return
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setIsPlayingRecord(true)
      const { sound } = await Audio.Sound.createAsync({ uri: recordedAudio.uri })
      await sound.playAsync()
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingRecord(false)
          sound.unloadAsync()
        }
      })
    } catch {
      setIsPlayingRecord(false)
    }
  }

  const deleteRecordedAudio = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert("Delete Recording", "Are you sure you want to delete this recording?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setRecordedAudio(null)
          setRecordingDuration(0)
        },
      },
    ])
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true }).start()
      startRecording()
    },
    onPanResponderRelease: () => {
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()
      stopRecording()
    },
  })

  const micGlowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(239,68,68,0.15)", "rgba(239,68,68,0.50)"],
  })

  const styles = createStyles(colors, activeTheme)

  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={styles.container}>
      <Header title="Voice Cloning" />

      <LinearGradient colors={colors.gradient as [string, string, ...string[]]} style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── Upgrade gate for Basic users ── */}
          {userTier === "basic" && (
            <View style={{
              borderRadius: 16, overflow: "hidden", marginBottom: 14,
              borderWidth: 1, borderColor: isDark ? "rgba(245,158,11,0.35)" : "rgba(245,158,11,0.4)",
            }}>
              <LinearGradient
                colors={isDark ? ["#1c1200", "#2d1f00"] : ["#FFFBEB", "#FEF3C7"]}
                style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }}
              >
                <View style={{
                  width: 46, height: 46, borderRadius: 23,
                  backgroundColor: isDark ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.15)",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name="lock-closed" size={22} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: isDark ? "#FCD34D" : "#92400E", marginBottom: 3 }}>
                    Standard or Premium Required
                  </Text>
                  <Text style={{ fontSize: 13, color: isDark ? "rgba(252,211,77,0.75)" : "#B45309", lineHeight: 18 }}>
                    Voice cloning is not available on the Basic plan. Upgrade to clone your voice.
                  </Text>
                </View>
              </LinearGradient>
              <TouchableOpacity
                onPress={() => navigation.navigate("Subscription")}
                activeOpacity={0.85}
                style={{ overflow: "hidden" }}
              >
                <LinearGradient colors={["#F59E0B", "#D97706"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                  <Ionicons name="star" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>Upgrade Your Plan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Hero Banner ── */}
          <Animated.View style={animStyle(0)}>
            <LinearGradient
              colors={isDark ? ["#0f0c29", "#302b63", "#24243e"] : ["#667eea", "#764ba2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroBanner}
            >
              <View style={styles.heroBubble1} />
              <View style={styles.heroBubble2} />
              <View style={styles.heroIconBg}>
                <Text style={{ fontSize: 30 }}>🎙️</Text>
              </View>
              <Text style={styles.heroTitle}>Clone Any Voice</Text>
              <Text style={styles.heroSubtitle}>
                Upload a recording or record live to create{"\n"}a perfect AI voice clone.
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* ── Upload Recording Card ── */}
          <Animated.View style={animStyle(1)}>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>

              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#1e3a5f" : "#EEF2FF" }]}>
                  <Ionicons name="cloud-upload" size={22} color={isDark ? "#60A5FA" : "#4F46E5"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Upload a Recording</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>MP3, WAV, M4A supported</Text>
                </View>
              </View>

              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Upload an existing voice recording to clone. Use at least 30 seconds of clear audio with minimal background noise for best results.
              </Text>

              {/* Uploaded file preview */}
              {uploadedFile && (
                <View style={[styles.filePreview, {
                  backgroundColor: isDark ? "rgba(30,58,95,0.25)" : "#EEF2FF",
                  borderColor: isDark ? "#1e3a5f" : "#C7D2FE",
                }]}>
                  <View style={[styles.fileIconBg, { backgroundColor: isDark ? "#1d4ed8" : "#4F46E5" }]}>
                    <Ionicons name="musical-note" size={16} color="#fff" />
                  </View>
                  <View style={styles.fileInfoText}>
                    <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                      {uploadedFile.name}
                    </Text>
                    <Text style={[styles.fileSubText, { color: colors.textSecondary }]}>{uploadedFile.type}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: isDark ? "#1d4ed8" : "#4F46E5" }]}
                    onPress={playUploadedFile}
                    disabled={isPlayingUpload}
                  >
                    <Ionicons name={isPlayingUpload ? "pause" : "play"} size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Dashed upload zone */}
              <TouchableOpacity onPress={handleFileUpload} activeOpacity={0.8} style={{ marginBottom: 14 }}>
                <View style={[styles.uploadZone, {
                  borderColor: isDark ? "#334155" : "#C7D2FE",
                  backgroundColor: isDark ? "rgba(30,58,95,0.15)" : "rgba(238,242,255,0.6)",
                }]}>
                  <Ionicons name="add-circle-outline" size={28} color={isDark ? "#60A5FA" : "#4F46E5"} />
                  <Text style={[styles.uploadZoneText, { color: isDark ? "#60A5FA" : "#4F46E5" }]}>
                    {uploadedFile ? "Replace file" : "Tap to upload audio"}
                  </Text>
                  <Text style={[styles.uploadZoneHint, { color: colors.textSecondary }]}>
                    30+ seconds recommended
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Clone button */}
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!uploadedFile || uploadingClone}
                style={[styles.cloneBtnWrap, (!uploadedFile || uploadingClone) && { opacity: 0.45 }]}
                onPress={cloneUploadedFile}
              >
                <LinearGradient
                  colors={isDark ? ["#1d4ed8", "#4f46e5"] : ["#4F46E5", "#7C3AED"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.cloneBtn}
                >
                  {uploadingClone
                    ? <ActivityIndicator color="#fff" />
                    : <Ionicons name="sparkles" size={18} color="#fff" />}
                  <Text style={styles.cloneBtnText}>
                    {uploadingClone ? "Uploading…" : "Clone This Voice"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Record Live Card ── */}
          <Animated.View style={animStyle(2)}>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>

              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#3b1f0f" : "#FFF7ED" }]}>
                  <Ionicons name="mic" size={22} color={isDark ? "#FB923C" : "#EA580C"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Record Your Voice</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Hold the button to record
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Speak clearly for at least 30 seconds in a quiet environment. Hold the mic button while speaking and release when finished.
              </Text>

              {/* Recorded audio preview */}
              {recordedAudio && (
                <View style={[styles.filePreview, {
                  backgroundColor: isDark ? "rgba(6,95,70,0.2)" : "#ECFDF5",
                  borderColor: isDark ? "#065f46" : "#6EE7B7",
                }]}>
                  <View style={[styles.fileIconBg, { backgroundColor: "#10B981" }]}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                  <View style={styles.fileInfoText}>
                    <Text style={[styles.fileName, { color: colors.text }]}>Recorded Audio</Text>
                    <Text style={[styles.fileSubText, { color: colors.textSecondary }]}>
                      {formatDuration(recordedAudio.duration)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: "#10B981" }]}
                      onPress={playRecordedAudio}
                      disabled={isPlayingRecord}
                    >
                      <Ionicons name={isPlayingRecord ? "pause" : "play"} size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: isDark ? "#3b0f0f" : "#FFF1F1" }]}
                      onPress={deleteRecordedAudio}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Mic button area */}
              <View style={styles.micArea}>
                {isRecording && (
                  <Text style={[styles.recordingTimer, { color: "#EF4444" }]}>
                    🔴  {formatDuration(recordingDuration)}
                  </Text>
                )}

                <Text style={[styles.micHint, { color: colors.textSecondary }]}>
                  {isRecording ? "Release to stop recording" : "Hold to start recording"}
                </Text>

                <Animated.View style={[styles.micGlowRing, {
                  backgroundColor: isRecording ? micGlowColor : "transparent",
                }]}>
                  <Animated.View
                    style={{ transform: [{ scale: scaleAnim }, { scale: isRecording ? pulseAnim : 1 }] }}
                    {...panResponder.panHandlers}
                  >
                    <LinearGradient
                      colors={isRecording
                        ? ["#EF4444", "#DC2626"]
                        : isDark ? ["#EA580C", "#C2410C"] : ["#F97316", "#EA580C"]}
                      style={styles.micButton}
                    >
                      <Ionicons name={isRecording ? "stop" : "mic"} size={36} color="#fff" />
                    </LinearGradient>
                  </Animated.View>
                </Animated.View>
              </View>

              {/* Clone button */}
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!recordedAudio || uploadingClone}
                style={[styles.cloneBtnWrap, (!recordedAudio || uploadingClone) && { opacity: 0.45 }]}
                onPress={cloneRecordedAudio}
              >
                <LinearGradient
                  colors={isDark ? ["#065f46", "#047857"] : ["#059669", "#10B981"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.cloneBtn}
                >
                  {uploadingClone
                    ? <ActivityIndicator color="#fff" />
                    : <Ionicons name="sparkles" size={18} color="#fff" />}
                  <Text style={styles.cloneBtnText}>
                    {uploadingClone ? "Uploading…" : "Clone This Voice"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Tips Banner ── */}
          <Animated.View style={animStyle(3)}>
            <View style={[styles.tipsBanner, {
              backgroundColor: isDark ? "rgba(245,158,11,0.08)" : "#FFFBEB",
              borderColor: isDark ? "rgba(245,158,11,0.2)" : "#FDE68A",
            }]}>
              <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
              <Text style={[styles.tipsText, { color: isDark ? "#FCD34D" : "#92400E" }]}>
                <Text style={{ fontWeight: "700" }}>Pro tip: </Text>
                Read a paragraph aloud in a quiet room for the most accurate voice clone.
              </Text>
            </View>
          </Animated.View>

        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  )
}

const createStyles = (colors: any, activeTheme: "light" | "dark") =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },

    // Hero
    heroBanner: {
      borderRadius: 20, padding: 28, marginBottom: 16,
      alignItems: "center", overflow: "hidden", position: "relative",
    },
    heroBubble1: {
      position: "absolute", width: 130, height: 130, borderRadius: 65,
      backgroundColor: "rgba(255,255,255,0.06)", top: -35, right: -20,
    },
    heroBubble2: {
      position: "absolute", width: 90, height: 90, borderRadius: 45,
      backgroundColor: "rgba(255,255,255,0.06)", bottom: -25, left: 10,
    },
    heroIconBg: {
      width: 62, height: 62, borderRadius: 31,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center", justifyContent: "center", marginBottom: 14,
    },
    heroTitle: {
      fontSize: 24, fontWeight: "800", color: "#fff",
      letterSpacing: 0.5, marginBottom: 8,
    },
    heroSubtitle: {
      fontSize: 14, color: "rgba(255,255,255,0.8)",
      textAlign: "center", lineHeight: 20,
    },

    // Cards
    card: {
      borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: activeTheme === "dark" ? 0.3 : 0.06,
      shadowRadius: 8, elevation: 3,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    cardIconBg: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    cardHeaderText: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: "700", letterSpacing: 0.2 },
    cardSubtitle: { fontSize: 12, marginTop: 2 },
    cardDescription: { fontSize: 14, lineHeight: 20, marginBottom: 16 },

    // File preview
    filePreview: {
      flexDirection: "row", alignItems: "center", gap: 10,
      padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12,
    },
    fileIconBg: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    fileInfoText: { flex: 1 },
    fileName: { fontSize: 14, fontWeight: "600" },
    fileSubText: { fontSize: 12, marginTop: 1 },
    iconBtn: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },

    // Upload zone
    uploadZone: {
      borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14,
      paddingVertical: 22, alignItems: "center", gap: 6,
    },
    uploadZoneText: { fontSize: 15, fontWeight: "600" },
    uploadZoneHint: { fontSize: 12 },

    // Clone button
    cloneBtnWrap: { borderRadius: 14, overflow: "hidden" },
    cloneBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 15,
    },
    cloneBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },

    // Mic area
    micArea: { alignItems: "center", paddingVertical: 16, gap: 8, marginBottom: 16 },
    recordingTimer: { fontSize: 22, fontWeight: "800", letterSpacing: 2 },
    micHint: { fontSize: 13, marginBottom: 10 },
    micGlowRing: {
      width: 114, height: 114, borderRadius: 57,
      alignItems: "center", justifyContent: "center",
    },
    micButton: {
      width: 90, height: 90, borderRadius: 45,
      alignItems: "center", justifyContent: "center",
      shadowColor: "#F97316",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
    },

    // Tips
    tipsBanner: {
      flexDirection: "row", alignItems: "flex-start", gap: 10,
      padding: 14, borderRadius: 12, borderWidth: 1,
    },
    tipsText: { flex: 1, fontSize: 13, lineHeight: 18 },
  })

export default VoiceCloningScreen