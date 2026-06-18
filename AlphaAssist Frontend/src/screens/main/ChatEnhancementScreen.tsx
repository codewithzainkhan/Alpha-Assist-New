"use client"

import { useState, useRef, useEffect } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import * as Haptics from "expo-haptics"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Header from "../../components/common/Header"
import { useTheme } from "../../components/context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import { apiPostForm, apiGet, apiDelete } from "../../services/api"
import { supabase } from "../../services/supabase"
import type { MainStackParamList } from "../../types/navigation"

interface ToneProfile {
  tone_summary:    string
  style_prompt:    string
  has_chat_content: boolean
  updated_at:      string | null
}

const ChatEnhancementScreen = () => {
  const { colors, activeTheme } = useTheme()
  const isDark = activeTheme === "dark"
  const { user } = useAuth()
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>()

  const [userTier,       setUserTier]       = useState<string>("basic")
  const [uploadedFiles,  setUploadedFiles]  = useState<any[]>([])
  const [isUploading,    setIsUploading]    = useState(false)
  const [toneProfile,    setToneProfile]    = useState<ToneProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // ── Animations ────────────────────────────────────────────────────────────
  const fadeAnims  = useRef([0, 1, 2].map(() => new Animated.Value(0))).current
  const slideAnims = useRef([0, 1, 2].map(() => new Animated.Value(24))).current

  useEffect(() => {
    fadeAnims.forEach((anim, i) => {
      Animated.parallel([
        Animated.timing(anim,        { toValue: 1, duration: 500, delay: i * 110, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 500, delay: i * 110, useNativeDriver: true }),
      ]).start()
    })
  }, [])

  // ── Load tier + existing tone profile ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.subscription_tier) setUserTier(data.subscription_tier) })
      .catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    apiGet<ToneProfile | { profile: null }>("/api/tone/profile")
      .then(data => {
        if ("tone_summary" in data) setToneProfile(data as ToneProfile)
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false))
  }, [user])

  const animStyle = (i: number) => ({
    opacity:   fadeAnims[i],
    transform: [{ translateY: slideAnims[i] }],
  })

  // ── Upload handlers ───────────────────────────────────────────────────────
  const handleUploadPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert("Select Upload Source", "Choose how you want to upload your chat patterns", [
      { text: "From Files",  onPress: handleFileUpload  },
      { text: "From Photos", onPress: handlePhotoUpload },
      { text: "Cancel", style: "cancel" },
    ])
  }

  const handleFileUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true })
      if (!result.canceled && result.assets[0]) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setUploadedFiles(prev => [...prev, result.assets[0]])
      }
    } catch (error) {
      console.log("Error picking document:", error)
    }
  }

  const handlePhotoUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      })
      if (!result.canceled && result.assets.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setUploadedFiles(prev => [...prev, ...result.assets])
      }
    } catch (error) {
      console.log("Error picking image:", error)
    }
  }

  // ── Enhance experience — upload to backend ────────────────────────────────
  const handleEnhanceExperience = async () => {
    if (userTier === "basic") {
      Alert.alert(
        "Upgrade Required",
        "Chat personalization is not available on the Basic plan. Upgrade to Standard or Premium to use this feature.",
        [
          { text: "Upgrade Now", onPress: () => navigation.navigate("Subscription") },
          { text: "Cancel", style: "cancel" },
        ]
      )
      return
    }
    if (uploadedFiles.length === 0) return
    if (!user) { Alert.alert("Not logged in", "Please sign in first."); return }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setIsUploading(true)

    try {
      const imageFiles = uploadedFiles.filter(f => {
        const uri = f.uri || f
        return /\.(jpg|jpeg|png|webp|gif)$/i.test(uri)
      })

      if (imageFiles.length === 0) {
        Alert.alert("Image required", "Please upload at least one chat screenshot (JPG, PNG, or WebP).")
        return
      }

      const chunks: any[][] = []
      for (let i = 0; i < imageFiles.length; i += 5) {
        chunks.push(imageFiles.slice(i, i + 5))
      }

      let lastProfile: any = null
      for (const chunk of chunks) {
        const fd = new FormData()
        chunk.forEach((file, idx) => {
          const uri  = file.uri || file
          const name = file.name || file.fileName || `screenshot_${idx + 1}.jpg`
          const type = file.mimeType || "image/jpeg"
          fd.append(`file${idx + 1}`, { uri, name, type } as any)
        })

        const endpoint = chunk.length === 1
          ? "/api/tone/upload-screenshots"
          : "/api/tone/upload-screenshots-batch"

        if (chunk.length === 1) {
          const fd2 = new FormData()
          const uri  = chunk[0].uri || chunk[0]
          const name = chunk[0].name || chunk[0].fileName || "screenshot.jpg"
          const type = chunk[0].mimeType || "image/jpeg"
          fd2.append("file", { uri, name, type } as any)
          lastProfile = await apiPostForm(endpoint, fd2)
        } else {
          lastProfile = await apiPostForm(endpoint, fd)
        }
      }

      if (lastProfile) {
        setToneProfile({
          tone_summary:     lastProfile.tone_summary,
          style_prompt:     lastProfile.style_prompt_preview,
          has_chat_content: !!lastProfile.chat_content_preview,
          updated_at:       new Date().toISOString(),
        })
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(
        "✅ Experience Enhanced!",
        `AlphaAssist has learned your communication style.\n\n${lastProfile?.tone_summary || "Your style profile has been saved."}`,
      )
      setUploadedFiles([])

    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert("Upload Failed", error.message || "Something went wrong. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  // ── Delete profile ────────────────────────────────────────────────────────
  const handleDeleteProfile = () => {
    Alert.alert(
      "Delete Tone Profile",
      "This will remove your communication style profile. AlphaAssist will revert to its default style.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await apiDelete("/api/tone/profile")
              setToneProfile(null)
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete profile.")
            }
          },
        },
      ]
    )
  }

  const styles = createStyles(colors, activeTheme)

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.container}>
      <LinearGradient
        colors={isDark ? ["#0a0a1a", "#0f0f23"] : ["#F8F8FF", "#FFFFFF"]}
        style={styles.content}
      >
        <Header title="Chat Enhancement" />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

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
                    Chat personalization is not available on the Basic plan. Upgrade to teach AlphaAssist your style.
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

          {/* ── Hero banner ── */}
          <Animated.View style={animStyle(0)}>
            <LinearGradient
              colors={isDark ? ["#4c1d95", "#2e1065"] : ["#7C3AED", "#5B21B6"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroBanner}
            >
              <View style={styles.heroBubble1} />
              <View style={styles.heroBubble2} />
              <View style={styles.heroIconBg}>
                <Ionicons name="sparkles" size={28} color="#fff" />
              </View>
              <Text style={styles.heroTitle}>Personalise Your AI</Text>
              <Text style={styles.heroSubtitle}>
                Upload chat screenshots to teach AlphaAssist your unique communication style.
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* ── Existing profile card ── */}
          {!loadingProfile && toneProfile && (
            <Animated.View style={animStyle(0)}>
              <View style={[styles.card, {
                backgroundColor: isDark ? colors.backgroundSecondary : "#fff",
                borderColor:     isDark ? "#14532d" : "#bbf7d0",
                marginBottom: 14,
              }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#14532d" : "#dcfce7" }]}>
                    <Ionicons name="checkmark-circle" size={22} color={isDark ? "#4ade80" : "#16a34a"} />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Profile Active</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      {toneProfile.updated_at
                        ? `Updated ${new Date(toneProfile.updated_at).toLocaleDateString()}`
                        : "Style profile saved"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleDeleteProfile} activeOpacity={0.75}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      backgroundColor: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2",
                      alignItems: "center", justifyContent: "center",
                    }}>
                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                  {toneProfile.tone_summary}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Upload card ── */}
          <Animated.View style={animStyle(1)}>
            <View style={[styles.card, {
              backgroundColor: isDark ? colors.backgroundSecondary : "#fff",
              borderColor:     isDark ? "#4c1d95" : "#DDD6FE",
            }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#2e1065" : "#EDE9FE" }]}>
                  <Ionicons name="cloud-upload" size={22} color={isDark ? "#A78BFA" : "#7C3AED"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Upload Chat Screenshots</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    JPEG, PNG, WebP
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Share screenshots of your WhatsApp, iMessage, or any chat. AlphaAssist will learn
                your texting style and mirror it in all future responses.
              </Text>

              {/* Upload zone */}
              <TouchableOpacity onPress={handleUploadPress} activeOpacity={0.85}
                style={[styles.uploadZone, {
                  borderColor: isDark ? "#4c1d95" : "#C4B5FD",
                  backgroundColor: isDark ? "rgba(124,58,237,0.05)" : "rgba(124,58,237,0.02)",
                }]}>
                <View style={[styles.uploadZoneIconBg, { backgroundColor: isDark ? "#1e3a5f" : "#EEF2FF" }]}>
                  <Ionicons name="add" size={26} color={isDark ? "#60A5FA" : "#4F46E5"} />
                </View>
                <Text style={[styles.uploadZoneText, { color: isDark ? "#60A5FA" : "#4F46E5" }]}>
                  Tap to upload files or photos
                </Text>
                <Text style={[styles.uploadZoneHint, { color: colors.textSecondary }]}>
                  Up to 5 screenshots per upload · multiple batches supported
                </Text>
              </TouchableOpacity>

              {/* Uploaded files list */}
              {uploadedFiles.length > 0 && (
                <View style={styles.filesList}>
                  <View style={styles.filesListHeader}>
                    <Text style={[styles.filesListTitle, { color: colors.text }]}>
                      Uploaded ({uploadedFiles.length})
                    </Text>
                    <TouchableOpacity onPress={() => setUploadedFiles([])}>
                      <Text style={{ fontSize: 13, color: isDark ? "#A78BFA" : "#7C3AED", fontWeight: "600" }}>
                        Clear all
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {uploadedFiles.map((file, index) => (
                    <View key={index} style={[styles.fileRow, {
                      backgroundColor: isDark ? "rgba(124,58,237,0.08)" : "#F5F3FF",
                      borderColor:     isDark ? "#4c1d95" : "#DDD6FE",
                    }]}>
                      <View style={[styles.fileIconBg, { backgroundColor: isDark ? "#2e1065" : "#EDE9FE" }]}>
                        <Ionicons name="image" size={16} color={isDark ? "#A78BFA" : "#7C3AED"} />
                      </View>
                      <View style={styles.fileInfoText}>
                        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                          {file.name || file.fileName || `Screenshot ${index + 1}`}
                        </Text>
                        <Text style={[styles.fileSubText, { color: colors.textSecondary }]}>
                          {file.size ? `${(file.size / 1024).toFixed(1)} KB` : "Image"}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}
                        style={[styles.removeBtn, { backgroundColor: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2" }]}>
                        <Ionicons name="close" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>

          {/* ── Enhance button ── */}
          <Animated.View style={animStyle(2)}>
            <TouchableOpacity
              onPress={handleEnhanceExperience}
              disabled={uploadedFiles.length === 0 || isUploading}
              activeOpacity={0.85}
              style={[styles.enhanceBtnWrap, (uploadedFiles.length === 0 || isUploading) && { opacity: 0.45 }]}
            >
              <LinearGradient
                colors={isDark ? ["#059669", "#047857"] : ["#10B981", "#059669"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.enhanceBtn}
              >
                {isUploading
                  ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="sparkles" size={20} color="#fff" />
                }
                <Text style={styles.enhanceBtnText}>
                  {isUploading ? "Analysing…" : "Enhance My Experience"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {uploadedFiles.length === 0 && !isUploading && (
              <Text style={[styles.enhanceHint, { color: colors.textSecondary }]}>
                Upload at least one screenshot to continue
              </Text>
            )}

            <View style={[styles.tipsBanner, {
              backgroundColor: isDark ? "rgba(245,158,11,0.08)" : "#FFFBEB",
              borderColor:     isDark ? "rgba(245,158,11,0.2)"  : "#FDE68A",
            }]}>
              <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
              <Text style={[styles.tipsText, { color: isDark ? "#FCD34D" : "#92400E" }]}>
                <Text style={{ fontWeight: "700" }}>Tip: </Text>
                Upload 10+ chat screenshots for the most accurate style matching.
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
    container:    { flex: 1, backgroundColor: colors.background },
    content:      { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },

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
      fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: 0.5, marginBottom: 8,
    },
    heroSubtitle: {
      fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center", lineHeight: 20,
    },

    card: {
      borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: activeTheme === "dark" ? 0.3 : 0.06,
      shadowRadius: 8, elevation: 3,
    },
    cardHeader:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    cardIconBg:     { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    cardHeaderText: { flex: 1 },
    cardTitle:      { fontSize: 17, fontWeight: "700", letterSpacing: 0.2 },
    cardSubtitle:   { fontSize: 12, marginTop: 2 },
    cardDescription:{ fontSize: 14, lineHeight: 20, marginBottom: 16 },

    uploadZone: {
      borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14,
      paddingVertical: 28, alignItems: "center", gap: 8,
    },
    uploadZoneIconBg: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    uploadZoneText:   { fontSize: 15, fontWeight: "600" },
    uploadZoneHint:   { fontSize: 12 },

    filesList:       { marginTop: 4 },
    filesListHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    filesListTitle:  { fontSize: 14, fontWeight: "600" },
    fileRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8,
    },
    fileIconBg:   { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    fileInfoText: { flex: 1 },
    fileName:     { fontSize: 13, fontWeight: "600" },
    fileSubText:  { fontSize: 11, marginTop: 1 },
    removeBtn:    { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },

    enhanceBtnWrap: { borderRadius: 14, overflow: "hidden", marginBottom: 10 },
    enhanceBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 16,
    },
    enhanceBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
    enhanceHint:    { fontSize: 12, textAlign: "center", marginBottom: 14 },

    tipsBanner: {
      flexDirection: "row", alignItems: "flex-start", gap: 10,
      padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 6,
    },
    tipsText: { flex: 1, fontSize: 13, lineHeight: 18 },
  })

export default ChatEnhancementScreen
