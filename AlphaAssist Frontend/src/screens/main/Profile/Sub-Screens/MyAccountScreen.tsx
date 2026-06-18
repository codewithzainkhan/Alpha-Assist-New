"use client"

import { useState, useCallback, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Image,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { LinearGradient } from "expo-linear-gradient"
import { supabase } from "../../../../services/supabase"
import { useAuth } from "../../../../hooks/useAuth"
import { useTheme } from "../../../../components/context/ThemeContext"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { MainStackParamList } from "../../../../types/navigation"
import Header from "../../../../components/common/Header"
import { Ionicons } from "@expo/vector-icons"
import { deleteAllUserGoals } from "../../../../services/goals"
import { apiDelete } from "../../../../services/api"

type SubscriptionTier = "basic" | "standard" | "premium"
type MyAccountScreenNavigationProp = StackNavigationProp<MainStackParamList, "MyAccount">

const TIER_CONFIG: Record<SubscriptionTier, { label: string; color: string; bg: string; icon: string; gradient: [string, string] }> = {
  basic:    { label: "Basic",    color: "#6B7280", bg: "#6B728018", icon: "person-outline",  gradient: ["#4B5563", "#6B7280"] },
  standard: { label: "Standard", color: "#3B82F6", bg: "#3B82F618", icon: "star-outline",    gradient: ["#1d4ed8", "#3B82F6"] },
  premium:  { label: "Premium",  color: "#F59E0B", bg: "#F59E0B18", icon: "diamond-outline", gradient: ["#b45309", "#F59E0B"] },
}

const MyAccountScreen = () => {
  const { user, signOut }   = useAuth()
  const { colors, activeTheme } = useTheme()
  const navigation          = useNavigation<MyAccountScreenNavigationProp>()
  const isDark              = activeTheme === "dark"

  const [loading, setLoading]           = useState(true)
  const [deleting, setDeleting]         = useState(false)
  const [name, setName]                 = useState("")
  const [phone, setPhone]               = useState("")
  const [email, setEmail]               = useState("")
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("basic")
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [imageKey, setImageKey]         = useState(0)

  // Staggered entrance anims: hero + 4 info rows + 2 action buttons
  const heroAnim    = useRef(new Animated.Value(0)).current
  const rowAnims    = useRef([0,1,2,3].map(() => new Animated.Value(0))).current
  const actionAnims = useRef([0,1].map(() => new Animated.Value(0))).current

  const runEntrance = () => {
    Animated.stagger(70, [
      Animated.spring(heroAnim,       { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      ...rowAnims.map((a)    => Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 })),
      ...actionAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 })),
    ]).start()
  }

  useFocusEffect(
    useCallback(() => {
      if (user) loadAccountData()
    }, [user])
  )

  const getGooglePicture = (): string | null =>
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null

  const loadAvatarUrl = async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(`${user.id}.jpg`, 60 * 60 * 24 * 365)
      if (!error && data) {
        setProfileImage(data.signedUrl)
        setImageKey((p) => p + 1)
      } else {
        // Signed URL failed (no custom avatar) — fall back to Google picture
        setProfileImage(getGooglePicture())
      }
    } catch {
      setProfileImage(getGooglePicture())
    }
  }

  const loadAccountData = async () => {
    if (!user?.id) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, subscription_tier, avatar_url")
        .eq("id", user.id)
        .maybeSingle()

      const upsert = async () => {
        await supabase.from("profiles").upsert({ id: user.id, full_name: user.email }, { onConflict: "id" })
        setName(user.email || "User"); setPhone("Not provided")
        setEmail(user.email || "Not provided"); setSubscriptionTier("basic")
        setProfileImage(getGooglePicture())
      }

      if (error) {
        if ((error as any).code === "PGRST116") { await upsert(); return }
        console.error("Error loading account:", error); return
      }
      if (data) {
        setName(data.full_name || user.email || "User")
        setPhone(data.phone || "Not provided")
        setEmail(user.email || "Not provided")
        setSubscriptionTier((data.subscription_tier as SubscriptionTier) || "basic")
        // Priority: custom uploaded avatar → Google picture
        if (data.avatar_url) {
          await loadAvatarUrl()
        } else {
          setProfileImage(getGooglePicture())
        }
      } else {
        await upsert()
      }
    } catch (err) {
      console.error("Error loading account:", err)
    } finally {
      setLoading(false)
      runEntrance()
    }
  }

  // ── Delete account helpers ─────────────────────────────────────────────────

  const deleteAllUserFiles = async (userId: string) => {
    const buckets = ["avatars", "chat-images", "chat-audio"]
    for (const bucket of buckets) {
      try {
        if (bucket === "avatars") await supabase.storage.from(bucket).remove([`${userId}.jpg`])
        const { data: files } = await supabase.storage.from(bucket).list(userId, { limit: 1000 })
        if (files?.length) {
          const folders = files.filter((f) => f.id)
          for (const folder of folders) {
            const fp = `${userId}/${folder.name}`
            const { data: sub } = await supabase.storage.from(bucket).list(fp, { limit: 1000 })
            if (sub?.length) await supabase.storage.from(bucket).remove(sub.map((f) => `${fp}/${f.name}`))
          }
          await supabase.storage.from(bucket).remove(files.filter((f) => !f.id).map((f) => `${userId}/${f.name}`))
        }
      } catch (e) { console.error(`Error deleting ${bucket}:`, e) }
    }
  }

  const deleteAllUserData = async () => {
    if (!user?.id) return
    try {
      setDeleting(true)
      await supabase.from("conversations").delete().eq("user_id", user.id)
      await supabase.from("messages").delete().eq("user_id", user.id)
      await deleteAllUserFiles(user.id)
      await supabase.from("user_preferences").delete().eq("user_id", user.id)
      try { await deleteAllUserGoals(user.id) } catch {}
      await supabase.from("profiles").delete().eq("id", user.id)
      // Delete from Supabase Auth — must happen before signOut so the JWT is still valid
      try { await apiDelete("/api/account") } catch (e) { console.warn("[delete] Auth removal failed:", e) }
      await signOut()
      Alert.alert("Account Deleted", "All your data has been permanently deleted.")
    } catch (err) {
      console.error("Error deleting account:", err)
      Alert.alert("Error", "Failed to delete account. Please try again or contact support.")
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    Alert.alert(
      "Delete Account",
      "This will permanently remove all your data, conversations, and files. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Final Confirmation",
              "Are you absolutely sure?",
              [
                { text: "No, Keep My Account", style: "cancel" },
                { text: "Yes, Delete Forever", style: "destructive", onPress: deleteAllUserData },
              ],
            ),
        },
      ],
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView 
      edges={["left", "right", "bottom"]}
      style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="My Account" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={isDark ? "#818CF8" : "#4F46E5"} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading account…</Text>
        </View>
      </SafeAreaView>
    )
  }

  const tier    = TIER_CONFIG[subscriptionTier]
  const ACCENT  = isDark ? "#818CF8" : "#4F46E5"

  const animRow = (i: number) => ({
    opacity:   rowAnims[i],
    transform: [{ translateY: rowAnims[i].interpolate({ inputRange: [0,1], outputRange: [16, 0] }) }],
  })

  const animAction = (i: number) => ({
    opacity:   actionAnims[i],
    transform: [{ translateY: actionAnims[i].interpolate({ inputRange: [0,1], outputRange: [16, 0] }) }],
  })

  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="My Account" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Hero banner ── */}
        <Animated.View
          style={{
            opacity:   heroAnim,
            transform: [{ translateY: heroAnim.interpolate({ inputRange: [0,1], outputRange: [24, 0] }) }],
          }}
        >
          <LinearGradient
            colors={isDark ? ["#0f0c29", "#302b63", "#24243e"] : ["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.bubble1} />
            <View style={styles.bubble2} />
            <View style={styles.bubble3} />

            {/* Avatar */}
            <View style={styles.heroAvatarRing}>
              {profileImage ? (
                <Image
                  key={imageKey}
                  source={{ uri: profileImage }}
                  style={styles.heroAvatarImg}
                  onError={() => setProfileImage(getGooglePicture())}
                />
              ) : (
                <View style={styles.heroAvatarFallback}>
                  <Text style={styles.heroAvatarInitial}>
                    {name.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.heroTitle}>{name}</Text>
            <Text style={styles.heroSub}>{email}</Text>

            {/* Tier badge inside hero */}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("Subscription") }}
              activeOpacity={0.8}
              style={styles.heroBadgeBtn}
            >
              <LinearGradient
                colors={tier.gradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.heroBadge}
              >
                <Ionicons name={tier.icon as any} size={13} color="#fff" />
                <Text style={styles.heroBadgeText}>{tier.label} Plan</Text>
                <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* ── Info rows ── */}
        <View style={[styles.card, { backgroundColor: isDark ? colors.backgroundSecondary : "#fff", borderColor: colors.border }]}>

          {[
            { i: 0, icon: "person-outline",  label: "Full Name",    value: name,  color: ACCENT          },
            { i: 1, icon: "call-outline",     label: "Phone",        value: phone, color: "#10B981"        },
            { i: 2, icon: "mail-outline",     label: "Email",        value: email, color: "#F59E0B"        },
            { i: 3, icon: tier.icon,          label: "Subscription", value: null,  color: tier.color       },
          ].map(({ i, icon, label, value, color }) => (
            <Animated.View key={label} style={animRow(i)}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <View style={styles.infoRow}>
                {/* Icon badge */}
                <View style={[styles.iconBadge, { backgroundColor: color + "18" }]}>
                  <Ionicons name={icon as any} size={18} color={color} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
                  {value !== null ? (
                    <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
                  ) : (
                    /* Tier row with inline badge */
                    <View style={styles.tierRow}>
                      <View style={[styles.tierBadge, { backgroundColor: tier.bg, borderColor: tier.color + "55" }]}>
                        <Text style={[styles.tierBadgeText, { color: tier.color }]}>{tier.label}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Change button only on Subscription row */}
                {value === null && (
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("Subscription") }}
                    style={[styles.changeBtn, { backgroundColor: ACCENT }]}
                  >
                    <Text style={styles.changeBtnText}>Upgrade</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          ))}
        </View>

        {/* ── Change Password ── */}
        <Animated.View style={animAction(0)}>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("ChangePassword") }}
            activeOpacity={0.85}
            style={styles.actionBtnWrap}
          >
            <LinearGradient
              colors={isDark ? ["#1d4ed8", "#4f46e5"] : ["#4F46E5", "#7C3AED"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.actionBtn}
            >
              <View style={styles.actionBtnIconBg}>
                <Ionicons name="lock-closed-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.actionBtnText}>Change Password</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Delete Account ── */}
        <Animated.View style={animAction(1)}>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={deleting}
            activeOpacity={0.85}
            style={[styles.deleteBtnWrap, deleting && { opacity: 0.55 }]}
          >
            <View style={[styles.deleteBtn, { backgroundColor: isDark ? "#2d0e0e" : "#FEF2F2", borderColor: isDark ? "#7f1d1d" : "#FECACA" }]}>
              {deleting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <View style={styles.deleteIconBg}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </View>
                  <Text style={styles.deleteBtnText}>Delete Account</Text>
                  <Ionicons name="chevron-forward" size={16} color="#EF444466" />
                </>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Warning footnote */}
        <Text style={[styles.warning, { color: colors.textMuted }]}>
          Deleting your account permanently removes all data, conversations and files. This cannot be undone.
        </Text>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, letterSpacing: 0.3 },
  scroll:      { padding: 20, paddingBottom: 44, gap: 14 },

  // Hero
  heroBanner: {
    borderRadius: 20, padding: 28,
    alignItems: "center", overflow: "hidden", position: "relative",
  },
  bubble1: {
    position: "absolute", width: 180, height: 180, borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.06)", top: -60, right: -40,
  },
  bubble2: {
    position: "absolute", width: 110, height: 110, borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.06)", bottom: -35, left: 5,
  },
  bubble3: {
    position: "absolute", width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.05)", top: 20, left: -20,
  },
  heroAvatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.55)",
    overflow: "hidden", marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  heroAvatarImg: { width: "100%", height: "100%" },
  heroAvatarFallback: {
    width: "100%", height: "100%",
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  heroAvatarInitial: { fontSize: 32, fontWeight: "800", color: "#fff" },
  heroTitle:  { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
  heroSub:    { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4, marginBottom: 16 },
  heroBadgeBtn: { },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
  },
  heroBadgeText: { fontSize: 13, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },

  // Info card
  card: {
    borderRadius: 18, borderWidth: 1,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  infoRow: {
    flexDirection: "row", alignItems: "center",
    gap: 14, paddingHorizontal: 16, paddingVertical: 15,
  },
  iconBadge:    { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel:     { fontSize: 12, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 3 },
  rowValue:     { fontSize: 15, fontWeight: "500" },
  tierRow:      { flexDirection: "row" },
  tierBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  tierBadgeText:{ fontSize: 13, fontWeight: "700" },
  divider:      { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  changeBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  changeBtnText:{ color: "#fff", fontSize: 13, fontWeight: "700" },

  // Action buttons
  actionBtnWrap: { borderRadius: 16, overflow: "hidden" },
  actionBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  actionBtnIconBg: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  actionBtnText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },

  // Delete
  deleteBtnWrap: { borderRadius: 16, overflow: "hidden" },
  deleteBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
    borderRadius: 16, borderWidth: 1,
  },
  deleteIconBg: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: "#EF444420",
    alignItems: "center", justifyContent: "center",
  },
  deleteBtnText: { flex: 1, color: "#EF4444", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },

  // Footer
  warning: { fontSize: 12, textAlign: "center", lineHeight: 18, fontStyle: "italic", marginTop: 4 },
})

export default MyAccountScreen