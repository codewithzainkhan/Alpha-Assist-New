"use client"

import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Alert } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { MainStackParamList } from "../../types/navigation"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import { useEffect, useRef, useState, useCallback } from "react"
import Header from "../../components/common/Header"
import { useTheme } from "../../components/context/ThemeContext"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { apiGet, apiDelete } from "../../services/api"

type PersonalizationNavProp = StackNavigationProp<MainStackParamList, "Personalization">

interface VoiceProfile {
  has_voice_profile: boolean
  is_active: boolean
  original_filename?: string
  created_at?: string
}

const PersonalizationScreen = () => {
  const { colors, activeTheme } = useTheme()
  const navigation = useNavigation<PersonalizationNavProp>()

  // Staggered entrance animations
  const fadeAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current
  const slideAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(24))).current

  useEffect(() => {
    const animations = fadeAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 500, delay: i * 100, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 500, delay: i * 100, useNativeDriver: true }),
      ])
    )
    Animated.stagger(80, animations).start()
  }, [])

  const animatedStyle = (i: number) => ({
    opacity: fadeAnims[i],
    transform: [{ translateY: slideAnims[i] }],
  })

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null)

  useFocusEffect(useCallback(() => {
    apiGet<VoiceProfile>("/api/voice-clone/status")
      .then(setVoiceProfile)
      .catch(() => setVoiceProfile(null))
  }, []))

  const handleCloneNewVoice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    navigation.navigate("VoiceCloning")
  }

  const handleUploadChats = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    navigation.navigate("ChatEnhancement")
  }

  const handleDeleteVoice = () => {
    Alert.alert("Delete Voice Profile", "Remove your cloned voice?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await apiDelete("/api/voice-clone/")
          setVoiceProfile(null)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        } catch {
          Alert.alert("Error", "Failed to delete voice profile.")
        }
      }},
    ])
  }

  const isDark = activeTheme === "dark"
  const styles = createStyles(colors, activeTheme)

  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={styles.container}>
      <Header title="Personalization" />

      <LinearGradient
        colors={colors.gradient as [string, string, ...string[]]}
        style={styles.content}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >

          {/* Hero banner */}
          <Animated.View style={[animatedStyle(0)]}>
            <LinearGradient
              colors={isDark
                ? ["#0f0c29", "#302b63", "#24243e"]
                : ["#667eea", "#764ba2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroBanner}
            >
              {/* Decorative circles */}
              <View style={styles.heroBubble1} />
              <View style={styles.heroBubble2} />

              <View style={styles.heroIconWrapper}>
                <Text style={styles.heroEmoji}>✨</Text>
              </View>
              <Text style={styles.heroTitle}>Make It Yours</Text>
              <Text style={styles.heroSubtitle}>
                Clone voices of loved ones and train your AI{"\n"}with your own chat style.
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* ── Voice Cloning Card ── */}
          <Animated.View style={animatedStyle(1)}>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#1e3a5f" : "#EEF2FF" }]}>
                  <Ionicons name="mic" size={22} color={isDark ? "#60A5FA" : "#4F46E5"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Voice Cloning</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Recreate any voice with AI
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Clone the voice of your loved ones and let your AI assistant speak in their tone, bringing a whole new level of personal connection.
              </Text>

              <TouchableOpacity
                onPress={handleCloneNewVoice}
                activeOpacity={0.85}
                style={styles.primaryButtonWrapper}
              >
                <LinearGradient
                  colors={isDark ? ["#1d4ed8", "#4f46e5"] : ["#4F46E5", "#7C3AED"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Clone a New Voice</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Chat Enhancer Card ── */}
          <Animated.View style={animatedStyle(2)}>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#1a3a2a" : "#ECFDF5" }]}>
                  <Ionicons name="chatbubbles" size={22} color={isDark ? "#34D399" : "#059669"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Chat Enhancer</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Train AI with your chat style
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Upload screenshots of your conversations and let the AI learn how you communicate — making responses feel genuinely like you.
              </Text>

              <TouchableOpacity
                onPress={handleUploadChats}
                activeOpacity={0.85}
                style={styles.primaryButtonWrapper}
              >
                <LinearGradient
                  colors={isDark ? ["#065f46", "#047857"] : ["#059669", "#10B981"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Upload Your Chats</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Cloned Voices ── */}
          <Animated.View style={animatedStyle(3)}>
            <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconBg, { backgroundColor: isDark ? "#3b1f6e" : "#F5F3FF" }]}>
                  <Ionicons name="library" size={22} color={isDark ? "#A78BFA" : "#7C3AED"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Voice Library</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    {voiceProfile?.has_voice_profile ? "1 voice cloned" : "No voices cloned"}
                  </Text>
                </View>
              </View>

              {!voiceProfile?.has_voice_profile ? (
                <View style={styles.emptyVoices}>
                  <Ionicons name="mic-off-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No voices cloned yet</Text>
                </View>
              ) : (
                <View style={styles.voicesList}>
                  <View>
                      <View style={styles.voiceRow}>
                        <View style={[styles.waveformIcon, { backgroundColor: isDark ? "#1e3a5f22" : "#EEF2FF" }]}>
                          <Ionicons name="radio-outline" size={20} color={isDark ? "#60A5FA" : "#4F46E5"} />
                        </View>

                        <View style={styles.voiceInfo}>
                          <Text style={[styles.voiceName, { color: colors.text }]}>
                            {voiceProfile.original_filename?.replace(/\.[^.]+$/, "") || "My Voice"}
                          </Text>
                          <View style={styles.voiceMeta}>
                            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                            <Text style={[styles.voiceMetaText, { color: colors.textMuted }]}>
                              {voiceProfile.created_at
                                ? new Date(voiceProfile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : "—"}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.voiceActions}>
                          <TouchableOpacity
                            style={[styles.actionIconBtn, { backgroundColor: isDark ? "#3b0f0f" : "#FFF1F1" }]}
                            onPress={handleDeleteVoice}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                  </View>
                </View>
              )}
            </View>
          </Animated.View>

          {/* ── Tips banner ── */}
          <Animated.View style={animatedStyle(4)}>
            <View style={[styles.tipsBanner, { backgroundColor: isDark ? "rgba(245,158,11,0.08)" : "#FFFBEB", borderColor: isDark ? "rgba(245,158,11,0.2)" : "#FDE68A" }]}>
              <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
              <Text style={[styles.tipsText, { color: isDark ? "#FCD34D" : "#92400E" }]}>
                <Text style={{ fontWeight: "700" }}>Tip: </Text>
                Use at least 30 seconds of clear audio when cloning a voice for best results.
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
      position: "absolute", width: 120, height: 120, borderRadius: 60,
      backgroundColor: "rgba(255,255,255,0.06)", top: -30, right: -20,
    },
    heroBubble2: {
      position: "absolute", width: 80, height: 80, borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.06)", bottom: -20, left: 10,
    },
    heroIconWrapper: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    heroEmoji: { fontSize: 28 },
    heroTitle: {
      fontSize: 24, fontWeight: "800", color: "#FFFFFF",
      letterSpacing: 0.5, marginBottom: 8,
    },
    heroSubtitle: {
      fontSize: 14, color: "rgba(255,255,255,0.8)",
      textAlign: "center", lineHeight: 20,
    },

    // Cards
    card: {
      borderRadius: 18, padding: 20, marginBottom: 14,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: activeTheme === "dark" ? 0.3 : 0.06,
      shadowRadius: 8, elevation: 3,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 },
    cardIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    cardHeaderText: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: "700", letterSpacing: 0.2 },
    cardSubtitle: { fontSize: 12, marginTop: 2 },
    cardDescription: { fontSize: 14, lineHeight: 20, marginBottom: 16 },

    // Primary button
    primaryButtonWrapper: { borderRadius: 12, overflow: "hidden" },
    primaryButton: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 14,
    },
    primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },

    // Voice library
    voicesList: { marginTop: 4 },
    voiceDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
    voiceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    waveformIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    voiceInfo: { flex: 1 },
    voiceName: { fontSize: 15, fontWeight: "600" },
    voiceMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    voiceMetaText: { fontSize: 12 },
    voiceMetaDot: { fontSize: 12 },
    voiceActions: { flexDirection: "row", gap: 8 },
    actionIconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    emptyVoices: { alignItems: "center", paddingVertical: 24, gap: 8 },
    emptyText: { fontSize: 14 },

    // Tips
    tipsBanner: {
      flexDirection: "row", alignItems: "flex-start", gap: 10,
      padding: 14, borderRadius: 12, borderWidth: 1,
    },
    tipsText: { flex: 1, fontSize: 13, lineHeight: 18 },
  })

export default PersonalizationScreen