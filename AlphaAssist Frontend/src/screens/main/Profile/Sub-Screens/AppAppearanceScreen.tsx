"use client"

import { useState, useRef } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
 ScrollView, Animated,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useTheme, type ThemeMode } from "../../../../components/context/ThemeContext"
import Header from "../../../../components/common/Header"

// ─── Theme option config ───────────────────────────────────────────────────────

const THEME_OPTIONS: {
  mode: ThemeMode
  title: string
  subtitle: string
  icon: string
  iconColor: string
  iconBg: string
  iconBgDark: string
  preview: { bg: string; card: string; text: string; sub: string }
}[] = [
  {
    mode: "light",
    title: "Light",
    subtitle: "Clean & bright interface",
    icon: "sunny-outline",
    iconColor: "#F59E0B",
    iconBg: "#FEF3C7",
    iconBgDark: "#3b2500",
    preview: { bg: "#F8FAFC", card: "#FFFFFF", text: "#0F172A", sub: "#64748B" },
  },
  {
    mode: "dark",
    title: "Dark",
    subtitle: "Easy on the eyes at night",
    icon: "moon-outline",
    iconColor: "#818CF8",
    iconBg: "#EEF2FF",
    iconBgDark: "#1e1b4b",
    preview: { bg: "#0F0C29", card: "#1E1B3A", text: "#F1F5F9", sub: "#94A3B8" },
  },
  {
    mode: "system",
    title: "System",
    subtitle: "Follows your device setting",
    icon: "phone-portrait-outline",
    iconColor: "#10B981",
    iconBg: "#ECFDF5",
    iconBgDark: "#064e3b",
    preview: { bg: "#F0FDF4", card: "#FFFFFF", text: "#0F172A", sub: "#64748B" },
  },
]

// ─── Mini phone preview ────────────────────────────────────────────────────────

const PhonePreview = ({
  preview, isSelected, accent,
}: {
  preview: (typeof THEME_OPTIONS)[0]["preview"]
  isSelected: boolean
  accent: string
}) => (
  <View style={[ppS.phone, { backgroundColor: preview.bg, borderColor: isSelected ? accent : "#ccc" }]}>
    {/* Status bar dots */}
    <View style={ppS.statusBar}>
      <View style={[ppS.dot, { backgroundColor: preview.sub }]} />
      <View style={[ppS.dot, { backgroundColor: preview.sub, width: 24 }]} />
    </View>
    {/* Card */}
    <View style={[ppS.card, { backgroundColor: preview.card }]}>
      <View style={[ppS.cardLine, { backgroundColor: preview.text, width: "70%" }]} />
      <View style={[ppS.cardLine, { backgroundColor: preview.sub, width: "50%", marginTop: 4 }]} />
    </View>
    {/* Button */}
    <View style={[ppS.btn, { backgroundColor: accent }]} />
  </View>
)

const ppS = StyleSheet.create({
  phone: {
    width: 60, height: 88, borderRadius: 10,
    borderWidth: 2, padding: 6, overflow: "hidden",
  },
  statusBar:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  dot:        { width: 5, height: 5, borderRadius: 3 },
  card:       { borderRadius: 5, padding: 5, marginBottom: 5 },
  cardLine:   { height: 4, borderRadius: 2 },
  btn:        { height: 10, borderRadius: 4, marginTop: 2 },
})

// ─── Main screen ───────────────────────────────────────────────────────────────

const AppAppearanceScreen = () => {
  const { themeMode, setThemeMode, colors, activeTheme } = useTheme()
  const isDark  = activeTheme === "dark"
  const ACCENT  = isDark ? "#818CF8" : "#4F46E5"
  const [loading, setLoading] = useState(false)

  // Entrance anims
  const heroAnim  = useRef(new Animated.Value(0)).current
  const cardAnims = useRef(THEME_OPTIONS.map(() => new Animated.Value(0))).current
  const prvAnim   = useRef(new Animated.Value(0)).current
  const hasRun    = useRef(false)

  const runEntrance = () => {
    if (hasRun.current) return
    hasRun.current = true
    Animated.stagger(80, [
      Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      ...cardAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 })),
      Animated.spring(prvAnim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
    ]).start()
  }

  const handleThemeChange = async (mode: ThemeMode) => {
    if (mode === themeMode) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLoading(true)
    try { await setThemeMode(mode) }
    catch (e) { console.error("Theme change failed:", e) }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={[s.container, { backgroundColor: colors.background }]}>
      <Header title="App Appearance" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onLayout={runEntrance}
      >
        {/* ── Hero banner ── */}
        <Animated.View style={{
          opacity:   heroAnim,
          transform: [{ translateY: heroAnim.interpolate({ inputRange: [0,1], outputRange: [24,0] }) }],
        }}>
          <LinearGradient
            colors={isDark ? ["#0f0c29","#302b63","#24243e"] : ["#667eea","#764ba2"]}
            start={{ x:0, y:0 }} end={{ x:1, y:1 }}
            style={s.heroBanner}
          >
            <View style={s.bubble1} /><View style={s.bubble2} /><View style={s.bubble3} />

            <View style={s.heroIconBg}>
              <Ionicons name="color-palette-outline" size={28} color="rgba(255,255,255,0.9)" />
            </View>
            <Text style={s.heroTitle}>App Appearance</Text>
            <Text style={s.heroSub}>Choose how AlphaAssist looks on your device</Text>

            {/* Current mode badge */}
            <View style={s.heroBadge}>
              <Ionicons
                name={THEME_OPTIONS.find(t => t.mode === themeMode)?.icon as any ?? "sunny-outline"}
                size={13} color="#fff"
              />
              <Text style={s.heroBadgeText}>
                {THEME_OPTIONS.find(t => t.mode === themeMode)?.title ?? "System"} mode active
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Theme options ── */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>SELECT THEME</Text>

        {THEME_OPTIONS.map((opt, i) => {
          const isSelected = themeMode === opt.mode
          const bgColor    = isDark ? opt.iconBgDark : opt.iconBg

          return (
            <Animated.View key={opt.mode} style={{
              opacity:   cardAnims[i],
              transform: [{ translateY: cardAnims[i].interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
            }}>
              <TouchableOpacity
                onPress={() => handleThemeChange(opt.mode)}
                disabled={loading}
                activeOpacity={0.8}
              >
                <View style={[
                  s.optionCard,
                  {
                    backgroundColor: isDark ? colors.backgroundSecondary : "#fff",
                    borderColor: isSelected ? ACCENT : colors.border,
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}>
                  {/* Left: icon + text */}
                  <View style={[s.optionIconBg, { backgroundColor: bgColor }]}>
                    <Ionicons name={opt.icon as any} size={20} color={opt.iconColor} />
                  </View>

                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={[s.optionTitle, { color: colors.text }]}>{opt.title}</Text>
                    <Text style={[s.optionSub, { color: colors.textSecondary }]}>{opt.subtitle}</Text>
                  </View>

                  {/* Centre: mini phone preview */}
                  <PhonePreview preview={opt.preview} isSelected={isSelected} accent={opt.iconColor} />

                  {/* Right: radio */}
                  <View style={[
                    s.radio,
                    {
                      borderColor: isSelected ? ACCENT : colors.border,
                      backgroundColor: isSelected ? ACCENT : "transparent",
                    },
                  ]}>
                    {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )
        })}

        {/* ── Live preview card ── */}
        <Animated.View style={{
          opacity:   prvAnim,
          transform: [{ translateY: prvAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
        }}>
          <Text style={[s.sectionLabel, { color: colors.textSecondary, marginTop: 8 }]}>LIVE PREVIEW</Text>

          <View style={[s.previewCard, { backgroundColor: isDark ? colors.backgroundSecondary : "#fff", borderColor: colors.border }]}>
            {/* Mini header */}
            <LinearGradient
              colors={isDark ? ["#0f0c29","#302b63"] : ["#667eea","#764ba2"]}
              start={{ x:0, y:0 }} end={{ x:1, y:0 }}
              style={s.previewHeader}
            >
              <View style={s.previewHeaderDot} />
              <Text style={s.previewHeaderText}>AlphaAssist</Text>
            </LinearGradient>

            <View style={s.previewBody}>
              {/* Stat pills */}
              <View style={s.previewPills}>
                {[
                  { label: "Tasks",   val: "12", color: ACCENT      },
                  { label: "Goals",   val: "4",  color: "#10B981"   },
                  { label: "Streak",  val: "7d", color: "#F59E0B"   },
                ].map((p) => (
                  <View key={p.label} style={[s.previewPill, { backgroundColor: p.color + "18", borderColor: p.color + "33" }]}>
                    <Text style={[s.previewPillVal, { color: p.color }]}>{p.val}</Text>
                    <Text style={[s.previewPillLabel, { color: colors.textSecondary }]}>{p.label}</Text>
                  </View>
                ))}
              </View>

              {/* Sample rows */}
              {["Today's tasks", "Active goals"].map((row, ri) => (
                <View key={row} style={[s.previewRow, { borderColor: colors.border }, ri === 0 && { marginBottom: 8 }]}>
                  <View style={[s.previewRowDot, { backgroundColor: ri === 0 ? ACCENT : "#10B981" }]} />
                  <Text style={[s.previewRowText, { color: colors.text }]}>{row}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </View>
              ))}

              {/* Sample button */}
              <LinearGradient
                colors={isDark ? ["#1d4ed8","#4f46e5"] : ["#4F46E5","#7C3AED"]}
                start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                style={s.previewBtn}
              >
                <Text style={s.previewBtnText}>Sample Action</Text>
              </LinearGradient>
            </View>

            {/* Badge */}
            <View style={[s.previewBadge, { backgroundColor: isDark ? "#1e1b4b" : "#EEF2FF" }]}>
              <View style={[s.previewBadgeDot, { backgroundColor: ACCENT }]} />
              <Text style={[s.previewBadgeText, { color: ACCENT }]}>
                {activeTheme === "light" ? "Light" : "Dark"} mode active
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Tips banner */}
        <View style={[s.tipBanner, { backgroundColor: isDark ? "#3b2500" : "#FFF7ED", borderColor: isDark ? "#78350f" : "#FED7AA" }]}>
          <Ionicons name="bulb-outline" size={16} color="#F59E0B" />
          <Text style={[s.tipText, { color: isDark ? "#FCD34D" : "#92400E" }]}>
            System mode automatically switches between light and dark based on your device's display settings.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { padding: 20, paddingBottom: 44, gap: 12 },

  // Hero
  heroBanner: {
    borderRadius: 20, padding: 28, alignItems: "center",
    overflow: "hidden", position: "relative",
  },
  bubble1: { position: "absolute", width: 180, height: 180, borderRadius: 90,  backgroundColor: "rgba(255,255,255,0.06)", top: -60,  right: -40 },
  bubble2: { position: "absolute", width: 110, height: 110, borderRadius: 55,  backgroundColor: "rgba(255,255,255,0.06)", bottom: -35, left: 5   },
  bubble3: { position: "absolute", width: 70,  height: 70,  borderRadius: 35,  backgroundColor: "rgba(255,255,255,0.05)", top: 20,   left: -20  },
  heroIconBg: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  heroTitle:    { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
  heroSub:      { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4, marginBottom: 16, textAlign: "center" },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  heroBadgeText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // Section label
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 2 },

  // Option cards
  optionCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  optionIconBg: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionTitle:  { fontSize: 15, fontWeight: "700", letterSpacing: 0.1 },
  optionSub:    { fontSize: 12, marginTop: 2 },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: "center", justifyContent: "center", marginLeft: 12,
  },

  // Preview card
  previewCard: {
    borderRadius: 18, borderWidth: 1, overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  previewHeaderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.6)" },
  previewHeaderText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  previewBody: { padding: 16, gap: 0 },
  previewPills: { flexDirection: "row", gap: 8, marginBottom: 14 },
  previewPill: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  previewPillVal:   { fontSize: 16, fontWeight: "800" },
  previewPillLabel: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  previewRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 12,
  },
  previewRowDot:  { width: 8, height: 8, borderRadius: 4 },
  previewRowText: { flex: 1, fontSize: 13, fontWeight: "500" },
  previewBtn: {
    borderRadius: 10, paddingVertical: 12, alignItems: "center",
    marginTop: 12,
  },
  previewBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  previewBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginBottom: 14, marginTop: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: "flex-start",
  },
  previewBadgeDot:  { width: 6, height: 6, borderRadius: 3 },
  previewBadgeText: { fontSize: 12, fontWeight: "600" },

  // Tips
  tipBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
})

export default AppAppearanceScreen