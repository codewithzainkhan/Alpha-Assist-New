"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as ImagePicker from "expo-image-picker"
import * as Haptics from "expo-haptics"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../../../services/supabase"
import { useAuth } from "../../../hooks/useAuth"
import { useTheme } from "../../../components/context/ThemeContext"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { MainStackParamList } from "../../../types/navigation"
import Header from "../../../components/common/Header"

type ProfileScreenNavigationProp = StackNavigationProp<MainStackParamList, "Profile">

const { width } = Dimensions.get("window")

// ─── Menu item config ─────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { key: "MyAccount",          label: "My Account",         icon: "person-outline",         color: "#4F46E5" },
  { key: "PersonalInformation",label: "Personal Information",icon: "id-card-outline",        color: "#7C3AED" },
  { key: "Subscription",       label: "Subscription",       icon: "diamond-outline",         color: "#F59E0B" },
  { key: "AppAppearance",      label: "App Appearance",     icon: "color-palette-outline",   color: "#10B981" },
] as const

// ─── Initials avatar ──────────────────────────────────────────────────────────

const InitialsAvatar = ({ name, size, colors }: { name: string; size: number; colors: any }) => {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"

  return (
    <LinearGradient
      colors={["#4F46E5", "#7C3AED"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: size * 0.35, fontWeight: "800", color: "#fff", letterSpacing: 1 }}>
        {initials}
      </Text>
    </LinearGradient>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const ProfileScreen = () => {
  const { user, signOut } = useAuth()
  const { colors, activeTheme } = useTheme()
  const navigation = useNavigation<ProfileScreenNavigationProp>()
  const isDark = activeTheme === "dark"

  const [profileImage, setProfileImage]     = useState<string | null>(null)
  const [userName, setUserName]             = useState<string>("")
  const [loading, setLoading]               = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [imageKey, setImageKey]             = useState(0)

  // Staggered entrance anims — hero + each menu row
  const heroAnim   = useRef(new Animated.Value(0)).current
  const itemAnims  = useRef(MENU_ITEMS.map(() => new Animated.Value(0))).current
  const logoutAnim = useRef(new Animated.Value(0)).current

  // Scale pulse on avatar press
  const avatarScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (user) loadUserProfile()
  }, [user])

  useEffect(() => {
    // Staggered entrance
    Animated.stagger(80, [
      Animated.spring(heroAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      ...itemAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 })),
      Animated.spring(logoutAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
    ]).start()
  }, [])

  const getGoogleProfilePicture = (): string | null => {
    if (!user) return null
    return user.user_metadata?.avatar_url || user.user_metadata?.picture || null
  }

  const loadUserProfile = async () => {
    if (!user?.id) return
    try {
      setInitialLoading(true)
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()

      if (error) {
        if ((error as any).code === "PGRST116") {
          await supabase.from("profiles").upsert({ id: user.id, full_name: user.email }, { onConflict: "id" })
          setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User")
          setProfileImage(getGoogleProfilePicture())
          return
        }
        setUserName(user.email || "User")
        setProfileImage(getGoogleProfilePicture())
      } else if (data) {
        setUserName(data.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User")
        if (data.avatar_url) {
          await refreshImageUrl()
        } else {
          setProfileImage(getGoogleProfilePicture())
        }
      } else {
        await supabase.from("profiles").upsert(
          { id: user.id, full_name: user.user_metadata?.full_name || user.email },
          { onConflict: "id" },
        )
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User")
        setProfileImage(getGoogleProfilePicture())
      }
    } catch (error) {
      setUserName(user?.email || "User")
      setProfileImage(getGoogleProfilePicture())
    } finally {
      setInitialLoading(false)
    }
  }

  const refreshImageUrl = async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(`${user.id}.jpg`, 60 * 60 * 24 * 365)
      if (!error && data) {
        setProfileImage(data.signedUrl)
        setImageKey((p) => p + 1)
      } else {
        setProfileImage(getGoogleProfilePicture())
      }
    } catch {
      setProfileImage(getGoogleProfilePicture())
    }
  }

  const showImagePickerOptions = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    // Pulse animation
    Animated.sequence([
      Animated.spring(avatarScale, { toValue: 0.93, useNativeDriver: true, speed: 30 }),
      Animated.spring(avatarScale, { toValue: 1,    useNativeDriver: true, speed: 20 }),
    ]).start()
    Alert.alert("Update Profile Picture", "Choose an option", [
      { text: "Camera",  onPress: openCamera  },
      { text: "Gallery", onPress: openGallery },
      { text: "Cancel",  style: "cancel"      },
    ])
  }, [])

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== "granted") { Alert.alert("Permission needed", "Camera permission is required"); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 })
    if (!result.canceled && result.assets[0]) uploadImage(result.assets[0].uri)
  }

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== "granted") { Alert.alert("Permission needed", "Gallery permission is required"); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 })
    if (!result.canceled && result.assets[0]) uploadImage(result.assets[0].uri)
  }

  const uploadImage = async (imageUri: string) => {
    setLoading(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const fileName = `${user?.id}.jpg`
      const response = await fetch(imageUri)
      if (!response.ok) throw new Error(`Failed to read image: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      if (uint8Array.length === 0) throw new Error("Image file is empty or corrupted")

      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, uint8Array, { contentType: "image/jpeg", upsert: true })
      if (uploadError) throw uploadError

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage.from("avatars").createSignedUrl(fileName, 60 * 60 * 24 * 365)
      if (signedUrlError) throw signedUrlError

      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: signedUrlData.signedUrl }).eq("id", user?.id)
      if (updateError) throw updateError

      setProfileImage(signedUrlData.signedUrl)
      setImageKey((p) => p + 1)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert("Success", "Profile picture updated!")
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const msg = (error as Error).message
      if (msg?.includes("row-level security") || msg?.includes("policy")) {
        Alert.alert("Access Error", "Cannot upload avatar due to security policies.")
      } else {
        Alert.alert("Error", `Failed to update picture: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try { await signOut() }
          catch { Alert.alert("Error", "Failed to sign out. Please try again.") }
        },
      },
    ])
  }, [signOut])

  const styles  = createStyles(colors, isDark)
  const ACCENT  = isDark ? "#818CF8" : "#4F46E5"

  // ── Loading state ──
  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Profile" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={isDark ? "#818CF8" : "#4F46E5"} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    )
  }


  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Profile" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Hero banner ── */}
        <Animated.View
          style={{
            opacity: heroAnim,
            transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }}
        >
          <LinearGradient
            colors={isDark ? ["#0f0c29", "#302b63", "#24243e"] : ["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            {/* Decorative bubbles */}
            <View style={styles.heroBubble1} />
            <View style={styles.heroBubble2} />
            <View style={styles.heroBubble3} />

            {/* Avatar */}
            <Animated.View style={[styles.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
              <TouchableOpacity onPress={showImagePickerOptions} disabled={loading} activeOpacity={1}>
                <View style={styles.avatarRing}>
                  {profileImage ? (
                    <Image
                      key={imageKey}
                      source={{ uri: profileImage }}
                      style={styles.avatarImg}
                      onError={refreshImageUrl}
                    />
                  ) : (
                    <InitialsAvatar name={userName} size={96} colors={colors} />
                  )}
                  {loading && (
                    <View style={styles.avatarOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                </View>
                {/* Camera badge */}
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={13} color="#fff" />
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Name + email */}
            <Text style={styles.heroName}>{userName}</Text>
            <Text style={styles.heroEmail}>{user?.email}</Text>

            {/* Member pill */}
            <View style={styles.tierPill}>
              <Ionicons name="diamond-outline" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.tierText}>AlphaAssist Member</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Menu list ── */}
        <View style={styles.menuSection}>
          {MENU_ITEMS.map((item, i) => (
            <Animated.View
              key={item.key}
              style={{
                opacity: itemAnims[i],
                transform: [{ translateY: itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigation.navigate(item.key as any)
                }}
                activeOpacity={0.75}
                style={[
                  styles.menuRow,
                  {
                    backgroundColor: isDark ? colors.backgroundSecondary : "#fff",
                    borderColor: colors.border,
                  },
                  i === 0 && styles.menuRowFirst,
                  i === MENU_ITEMS.length - 1 && styles.menuRowLast,
                ]}
              >
                {/* Icon badge */}
                <View style={[styles.menuIconBg, { backgroundColor: `${item.color}18` }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>

                <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>

                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {/* ── Sign out button ── */}
        <Animated.View
          style={{
            opacity: logoutAnim,
            transform: [{ translateY: logoutAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }}
        >
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            style={styles.logoutBtn}
          >
            <View style={[styles.logoutInner, { backgroundColor: isDark ? "#2d0e0e" : "#FEF2F2", borderColor: isDark ? "#7f1d1d" : "#FECACA" }]}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* App version footnote */}
        <Text style={[styles.version, { color: colors.textMuted }]}>AlphaAssist v1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container:    { flex: 1 },
    loadingWrap:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText:  { fontSize: 14, letterSpacing: 0.3 },
    scroll:       { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 16 },

    // Hero banner — same pattern as Dashboard + Personalization
    heroBanner: {
      borderRadius: 20, padding: 28, marginBottom: 4,
      overflow: "hidden", position: "relative",
      alignItems: "center",
    },
    heroBubble1: {
      position: "absolute", width: 180, height: 180, borderRadius: 90,
      backgroundColor: "rgba(255,255,255,0.06)", top: -60, right: -40,
    },
    heroBubble2: {
      position: "absolute", width: 110, height: 110, borderRadius: 55,
      backgroundColor: "rgba(255,255,255,0.06)", bottom: -35, left: 5,
    },
    heroBubble3: {
      position: "absolute", width: 70, height: 70, borderRadius: 35,
      backgroundColor: "rgba(255,255,255,0.05)", top: 20, left: -20,
    },
    avatarWrap:   { marginBottom: 14 },
    avatarRing: {
      width: 100, height: 100, borderRadius: 50,
      borderWidth: 3, borderColor: "rgba(255,255,255,0.6)",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 10,
    },
    avatarImg:    { width: "100%", height: "100%" },
    avatarOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center", justifyContent: "center",
    },
    cameraBadge: {
      position: "absolute", bottom: 2, right: 2,
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center", justifyContent: "center",
      borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)",
    },
    heroName:  { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
    heroEmail: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4, marginBottom: 14 },
    tierPill: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 14, paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.15)",
    },
    tierText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.9)", letterSpacing: 0.3 },

    // Menu
    menuSection: {
      borderRadius: 16, overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    menuRow: {
      flexDirection: "row", alignItems: "center", gap: 14,
      paddingHorizontal: 16, paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    menuRowFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    menuRowLast:  { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0 },
    menuIconBg:   { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    menuLabel:    { flex: 1, fontSize: 15, fontWeight: "500", letterSpacing: 0.2 },

    // Sign out
    logoutBtn:    { borderRadius: 16, overflow: "hidden" },
    logoutInner: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 15,
      borderRadius: 16, borderWidth: 1,
    },
    logoutText:   { color: "#EF4444", fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },

    version: { fontSize: 12, textAlign: "center", letterSpacing: 0.5, marginTop: 8 },
  })

export default ProfileScreen