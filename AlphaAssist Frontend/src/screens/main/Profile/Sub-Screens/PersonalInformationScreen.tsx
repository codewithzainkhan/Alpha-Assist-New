"use client"

import { useState, useEffect, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { LinearGradient } from "expo-linear-gradient"
import { supabase } from "../../../../services/supabase"
import { useAuth } from "../../../../hooks/useAuth"
import { useTheme } from "../../../../components/context/ThemeContext"
import Header from "../../../../components/common/Header"
import { Ionicons } from "@expo/vector-icons"

// ─── Country codes ─────────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: "PK", dialCode: "+92",  name: "Pakistan",      flag: "🇵🇰" },
  { code: "US", dialCode: "+1",   name: "United States", flag: "🇺🇸" },
  { code: "GB", dialCode: "+44",  name: "United Kingdom",flag: "🇬🇧" },
  { code: "IN", dialCode: "+91",  name: "India",         flag: "🇮🇳" },
  { code: "AE", dialCode: "+971", name: "UAE",           flag: "🇦🇪" },
  { code: "SA", dialCode: "+966", name: "Saudi Arabia",  flag: "🇸🇦" },
  { code: "CA", dialCode: "+1",   name: "Canada",        flag: "🇨🇦" },
  { code: "AU", dialCode: "+61",  name: "Australia",     flag: "🇦🇺" },
  { code: "DE", dialCode: "+49",  name: "Germany",       flag: "🇩🇪" },
  { code: "FR", dialCode: "+33",  name: "France",        flag: "🇫🇷" },
  { code: "IT", dialCode: "+39",  name: "Italy",         flag: "🇮🇹" },
  { code: "ES", dialCode: "+34",  name: "Spain",         flag: "🇪🇸" },
  { code: "CN", dialCode: "+86",  name: "China",         flag: "🇨🇳" },
  { code: "JP", dialCode: "+81",  name: "Japan",         flag: "🇯🇵" },
  { code: "KR", dialCode: "+82",  name: "South Korea",   flag: "🇰🇷" },
  { code: "BR", dialCode: "+55",  name: "Brazil",        flag: "🇧🇷" },
  { code: "MX", dialCode: "+52",  name: "Mexico",        flag: "🇲🇽" },
  { code: "NG", dialCode: "+234", name: "Nigeria",       flag: "🇳🇬" },
  { code: "ZA", dialCode: "+27",  name: "South Africa",  flag: "🇿🇦" },
  { code: "EG", dialCode: "+20",  name: "Egypt",         flag: "🇪🇬" },
  { code: "TR", dialCode: "+90",  name: "Turkey",        flag: "🇹🇷" },
  { code: "RU", dialCode: "+7",   name: "Russia",        flag: "🇷🇺" },
  { code: "ID", dialCode: "+62",  name: "Indonesia",     flag: "🇮🇩" },
  { code: "MY", dialCode: "+60",  name: "Malaysia",      flag: "🇲🇾" },
  { code: "SG", dialCode: "+65",  name: "Singapore",     flag: "🇸🇬" },
  { code: "BD", dialCode: "+880", name: "Bangladesh",    flag: "🇧🇩" },
  { code: "NP", dialCode: "+977", name: "Nepal",         flag: "🇳🇵" },
  { code: "LK", dialCode: "+94",  name: "Sri Lanka",     flag: "🇱🇰" },
  { code: "AF", dialCode: "+93",  name: "Afghanistan",   flag: "🇦🇫" },
  { code: "IQ", dialCode: "+964", name: "Iraq",          flag: "🇮🇶" },
  { code: "IR", dialCode: "+98",  name: "Iran",          flag: "🇮🇷" },
  { code: "KW", dialCode: "+965", name: "Kuwait",        flag: "🇰🇼" },
  { code: "QA", dialCode: "+974", name: "Qatar",         flag: "🇶🇦" },
  { code: "OM", dialCode: "+968", name: "Oman",          flag: "🇴🇲" },
  { code: "BH", dialCode: "+973", name: "Bahrain",       flag: "🇧🇭" },
  { code: "JO", dialCode: "+962", name: "Jordan",        flag: "🇯🇴" },
  { code: "LB", dialCode: "+961", name: "Lebanon",       flag: "🇱🇧" },
  { code: "NL", dialCode: "+31",  name: "Netherlands",   flag: "🇳🇱" },
  { code: "BE", dialCode: "+32",  name: "Belgium",       flag: "🇧🇪" },
  { code: "SE", dialCode: "+46",  name: "Sweden",        flag: "🇸🇪" },
  { code: "NO", dialCode: "+47",  name: "Norway",        flag: "🇳🇴" },
  { code: "DK", dialCode: "+45",  name: "Denmark",       flag: "🇩🇰" },
  { code: "FI", dialCode: "+358", name: "Finland",       flag: "🇫🇮" },
  { code: "CH", dialCode: "+41",  name: "Switzerland",   flag: "🇨🇭" },
  { code: "AT", dialCode: "+43",  name: "Austria",       flag: "🇦🇹" },
  { code: "PL", dialCode: "+48",  name: "Poland",        flag: "🇵🇱" },
  { code: "PT", dialCode: "+351", name: "Portugal",      flag: "🇵🇹" },
  { code: "GR", dialCode: "+30",  name: "Greece",        flag: "🇬🇷" },
  { code: "NZ", dialCode: "+64",  name: "New Zealand",   flag: "🇳🇿" },
  { code: "AR", dialCode: "+54",  name: "Argentina",     flag: "🇦🇷" },
  { code: "CL", dialCode: "+56",  name: "Chile",         flag: "🇨🇱" },
  { code: "CO", dialCode: "+57",  name: "Colombia",      flag: "🇨🇴" },
  { code: "PE", dialCode: "+51",  name: "Peru",          flag: "🇵🇪" },
  { code: "VE", dialCode: "+58",  name: "Venezuela",     flag: "🇻🇪" },
  { code: "TH", dialCode: "+66",  name: "Thailand",      flag: "🇹🇭" },
  { code: "VN", dialCode: "+84",  name: "Vietnam",       flag: "🇻🇳" },
  { code: "PH", dialCode: "+63",  name: "Philippines",   flag: "🇵🇭" },
  { code: "UA", dialCode: "+380", name: "Ukraine",       flag: "🇺🇦" },
  { code: "IL", dialCode: "+972", name: "Israel",        flag: "🇮🇱" },
  { code: "KZ", dialCode: "+7",   name: "Kazakhstan",    flag: "🇰🇿" },
]

// ─── Section config ────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    key: "basic",
    title: "Basic Info",
    icon: "person-outline" as const,
    color: "#4F46E5",
    fields: ["full_name", "email", "phone"],
  },
  {
    key: "personal",
    title: "Personal Details",
    icon: "document-text-outline" as const,
    color: "#10B981",
    fields: ["date_of_birth", "address", "city_country", "bio"],
  },
]

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  full_name: string
  email: string
  phoneNumber: string
  countryDialCode: string
  countryFlag: string
  date_of_birth: string
  address: string
  city: string
  country: string
  bio: string
}

const MAX_BIO = 200

// ─── Sub-components ────────────────────────────────────────────────────────────

const SectionHeader = ({
  icon, title, color, isDark,
}: { icon: string; title: string; color: string; isDark: boolean }) => (
  <View style={shS.row}>
    <View style={[shS.iconBg, { backgroundColor: color + "18" }]}>
      <Ionicons name={icon as any} size={16} color={color} />
    </View>
    <Text style={[shS.title, { color: isDark ? "#fff" : "#111" }]}>{title}</Text>
  </View>
)
const shS = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  iconBg: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title:  { fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
})

// ─── Main screen ───────────────────────────────────────────────────────────────

const PersonalInformationScreen = () => {
  const { user }            = useAuth()
  const { colors, activeTheme } = useTheme()
  const isDark              = activeTheme === "dark"

  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [isEditing, setIsEditing]         = useState(false)
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const [countrySearch, setCountrySearch] = useState("")

  const [profile, setProfile] = useState<UserProfile>({
    full_name: "", email: "", phoneNumber: "",
    countryDialCode: "+92", countryFlag: "🇵🇰",
    date_of_birth: "", address: "", city: "", country: "", bio: "",
  })
  const [profileBackup, setProfileBackup] = useState<UserProfile>(profile)

  // Entrance anims
  const heroAnim    = useRef(new Animated.Value(0)).current
  const card1Anim   = useRef(new Animated.Value(0)).current
  const card2Anim   = useRef(new Animated.Value(0)).current
  const btnAnim     = useRef(new Animated.Value(0)).current

  // Edit mode slide anim for action buttons
  const editBtnAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (user) loadProfile()
  }, [user])

  const runEntrance = () => {
    Animated.stagger(90, [
      Animated.spring(heroAnim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      Animated.spring(btnAnim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      Animated.spring(card1Anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      Animated.spring(card2Anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
    ]).start()
  }

  useEffect(() => {
    Animated.spring(editBtnAnim, {
      toValue: isEditing ? 1 : 0,
      useNativeDriver: true, tension: 70, friction: 10,
    }).start()
  }, [isEditing])

  const parsePhone = (stored: string) => {
    if (!stored) return { dialCode: "+92", flag: "🇵🇰", number: "" }
    const match = COUNTRY_CODES.find((c) => stored.startsWith(c.dialCode))
    if (match) return { dialCode: match.dialCode, flag: match.flag, number: stored.replace(match.dialCode, "").trim() }
    return { dialCode: "+92", flag: "🇵🇰", number: stored }
  }

  const loadProfile = async () => {
    if (!user?.id) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, date_of_birth, address, city, country, bio")
        .eq("id", user.id)
        .maybeSingle()

      const applyData = (d: any) => {
        const parsed = parsePhone(d?.phone || "")
        const p: UserProfile = {
          full_name:       d?.full_name      || "",
          email:           user.email        || "",
          phoneNumber:     parsed.number,
          countryDialCode: parsed.dialCode,
          countryFlag:     parsed.flag,
          date_of_birth:   d?.date_of_birth  || "",
          address:         d?.address        || "",
          city:            d?.city           || "",
          country:         d?.country        || "",
          bio:             d?.bio            || "",
        }
        setProfile(p); setProfileBackup(p)
      }

      if (error) {
        if ((error as any).code === "PGRST116") {
          await supabase.from("profiles").upsert({ id: user.id, full_name: user.email }, { onConflict: "id" })
          applyData(null); return
        }
        Alert.alert("Error", "Failed to load profile")
      } else {
        applyData(data)
      }
    } catch {
      Alert.alert("Error", "Failed to load profile")
    } finally {
      setLoading(false)
      runEntrance()
    }
  }

  const validatePhone = (n: string) => { const c = n.replace(/\D/g, ""); return c.length >= 7 && c.length <= 15 }
  const validateDOB   = (d: string) => {
    if (!d) return true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
    const dt = new Date(d)
    return dt < new Date() && dt.getFullYear() > 1900
  }

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (profile.phoneNumber && !validatePhone(profile.phoneNumber)) {
      Alert.alert("Invalid Phone", "Please enter a valid phone number (7–15 digits)."); return
    }
    if (profile.date_of_birth && !validateDOB(profile.date_of_birth)) {
      Alert.alert("Invalid Date", "Please enter a valid date in YYYY-MM-DD format."); return
    }
    setSaving(true)
    try {
      const fullPhone = profile.phoneNumber
        ? `${profile.countryDialCode} ${profile.phoneNumber.replace(/\D/g, "")}`
        : ""
      const { error } = await supabase.from("profiles").update({
        full_name:     profile.full_name,
        phone:         fullPhone,
        date_of_birth: profile.date_of_birth || null,
        address:       profile.address,
        city:          profile.city,
        country:       profile.country,
        bio:           profile.bio,
      }).eq("id", user?.id)
      if (error) throw error
      setProfileBackup(profile)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert("Saved", "Profile updated successfully!")
      setIsEditing(false)
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert("Error", "Failed to update profile. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (JSON.stringify(profile) !== JSON.stringify(profileBackup)) {
      Alert.alert("Discard Changes?", "You have unsaved changes.", [
        { text: "Keep Editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => { setProfile(profileBackup); setIsEditing(false) } },
      ])
    } else {
      setIsEditing(false)
    }
  }

  const filteredCountries = COUNTRY_CODES.filter(
    (c) => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.dialCode.includes(countrySearch)
  )

  const up = (patch: Partial<UserProfile>) => setProfile((p) => ({ ...p, ...patch }))

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView 
      edges={["left", "right", "bottom"]}
      style={[s.container, { backgroundColor: colors.background }]}>
        <Header title="Personal Information" />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={isDark ? "#818CF8" : "#4F46E5"} />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    )
  }

  const ACCENT = isDark ? "#818CF8" : "#4F46E5"

  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={[s.container, { backgroundColor: colors.background }]}>
      <Header title="Personal Information" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.scroll}
        >
          {/* ── Hero banner ── */}
          <Animated.View style={{
            opacity:   heroAnim,
            transform: [{ translateY: heroAnim.interpolate({ inputRange: [0,1], outputRange: [24, 0] }) }],
          }}>
            <LinearGradient
              colors={isDark ? ["#0f0c29", "#302b63", "#24243e"] : ["#667eea", "#764ba2"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.heroBanner}
            >
              <View style={s.bubble1} /><View style={s.bubble2} /><View style={s.bubble3} />

              {/* <View style={s.heroIconBg}>
                <Ionicons name="person-outline" size={28} color="rgba(255,255,255,0.9)" />
              </View> */}
              <Text style={s.heroName}>{profile.full_name || "Your Name"}</Text>
              <Text style={s.heroEmail}>{profile.email}</Text>

              {/* Edit / Save toggle inside banner */}
              {!isEditing ? (
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsEditing(true) }}
                  style={s.heroCta}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={15} color="#fff" />
                  <Text style={s.heroCtaText}>Edit Profile</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.heroCtaRow}>
                  <TouchableOpacity onPress={handleCancel} style={[s.heroCta, s.heroCtaCancel]} activeOpacity={0.8}>
                    <Ionicons name="close-outline" size={15} color="rgba(255,255,255,0.8)" />
                    <Text style={[s.heroCtaText, { color: "rgba(255,255,255,0.85)" }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} disabled={saving} style={s.heroCta} activeOpacity={0.8}>
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="checkmark-outline" size={15} color="#fff" />
                          <Text style={s.heroCtaText}>Save</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </LinearGradient>
          </Animated.View>

          {/* ── Basic Info card ── */}
          <Animated.View style={{
            opacity:   card1Anim,
            transform: [{ translateY: card1Anim.interpolate({ inputRange: [0,1], outputRange: [20, 0] }) }],
          }}>
            <View style={[s.card, { backgroundColor: isDark ? colors.backgroundSecondary : "#fff", borderColor: colors.border }]}>
              <SectionHeader icon="person-outline" title="Basic Info" color="#4F46E5" isDark={isDark} />

              {/* Full Name */}
              <FieldRow
                label="Full Name" icon="person-outline" iconColor="#4F46E5"
                value={profile.full_name} placeholder="Enter your full name"
                isEditing={isEditing} colors={colors} isDark={isDark}
                onChangeText={(t) => up({ full_name: t })}
              />

              <Divider colors={colors} />

              {/* Email (read-only) */}
              <View style={s.fieldWrap}>
                <View style={[s.iconBadge, { backgroundColor: "#F59E0B18" }]}>
                  <Ionicons name="mail-outline" size={16} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
                  <Text style={[s.fieldValue, { color: colors.text }]}>{profile.email}</Text>
                  <Text style={[s.fieldNote, { color: colors.textMuted }]}>Cannot be changed</Text>
                </View>
              </View>

              <Divider colors={colors} />

              {/* Phone */}
              <View style={s.fieldWrap}>
                <View style={[s.iconBadge, { backgroundColor: "#10B98118" }]}>
                  <Ionicons name="call-outline" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
                  {isEditing ? (
                    <View style={s.phoneRow}>
                      <TouchableOpacity
                        onPress={() => { setCountrySearch(""); setShowCountryPicker(true) }}
                        style={[s.dialBtn, { backgroundColor: isDark ? colors.surface : "#F8F9FA", borderColor: colors.border }]}
                      >
                        <Text style={s.dialFlag}>{profile.countryFlag}</Text>
                        <Text style={[s.dialCode, { color: colors.text }]}>{profile.countryDialCode}</Text>
                        <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                      </TouchableOpacity>
                      <TextInput
                        style={[s.phoneInput, { backgroundColor: isDark ? colors.surface : "#F8F9FA", borderColor: colors.border, color: colors.text }]}
                        value={profile.phoneNumber}
                        onChangeText={(t) => up({ phoneNumber: t.replace(/\D/g, "") })}
                        placeholder="3001234567"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="phone-pad"
                        maxLength={15}
                      />
                    </View>
                  ) : (
                    <Text style={[s.fieldValue, { color: colors.text }]}>
                      {profile.phoneNumber ? `${profile.countryDialCode} ${profile.phoneNumber}` : "Not provided"}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ── Personal Details card ── */}
          <Animated.View style={{
            opacity:   card2Anim,
            transform: [{ translateY: card2Anim.interpolate({ inputRange: [0,1], outputRange: [20, 0] }) }],
          }}>
            <View style={[s.card, { backgroundColor: isDark ? colors.backgroundSecondary : "#fff", borderColor: colors.border }]}>
              <SectionHeader icon="document-text-outline" title="Personal Details" color="#10B981" isDark={isDark} />

              {/* Date of Birth */}
              <FieldRow
                label="Date of Birth" icon="calendar-outline" iconColor="#7C3AED"
                value={profile.date_of_birth} placeholder="YYYY-MM-DD"
                isEditing={isEditing} colors={colors} isDark={isDark}
                keyboardType="numeric" maxLength={10}
                onChangeText={(text) => {
                  let c = text.replace(/\D/g, "")
                  if (c.length > 4) c = c.slice(0,4) + "-" + c.slice(4)
                  if (c.length > 7) c = c.slice(0,7) + "-" + c.slice(7)
                  up({ date_of_birth: c.slice(0,10) })
                }}
              />

              <Divider colors={colors} />

              {/* Address */}
              <FieldRow
                label="Address" icon="home-outline" iconColor="#F59E0B"
                value={profile.address} placeholder="Enter your address"
                isEditing={isEditing} colors={colors} isDark={isDark}
                onChangeText={(t) => up({ address: t })}
              />

              <Divider colors={colors} />

              {/* City + Country */}
              <View style={s.twoCol}>
                <View style={{ flex: 1 }}>
                  <FieldRow
                    label="City" icon="business-outline" iconColor="#EF4444"
                    value={profile.city} placeholder="City"
                    isEditing={isEditing} colors={colors} isDark={isDark}
                    onChangeText={(t) => up({ city: t })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldRow
                    label="Country" icon="globe-outline" iconColor="#06B6D4"
                    value={profile.country} placeholder="Country"
                    isEditing={isEditing} colors={colors} isDark={isDark}
                    onChangeText={(t) => up({ country: t })}
                  />
                </View>
              </View>

              <Divider colors={colors} />

              {/* Bio */}
              <View style={s.fieldWrap}>
                <View style={[s.iconBadge, { backgroundColor: "#8B5CF618" }]}>
                  <Ionicons name="chatbubble-outline" size={16} color="#8B5CF6" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
                    {isEditing && (
                      <Text style={[s.charCount, { color: profile.bio.length >= MAX_BIO ? "#EF4444" : colors.textMuted }]}>
                        {profile.bio.length}/{MAX_BIO}
                      </Text>
                    )}
                  </View>
                  {isEditing ? (
                    <TextInput
                      style={[s.textarea, { backgroundColor: isDark ? colors.surface : "#F8F9FA", borderColor: colors.border, color: colors.text }]}
                      value={profile.bio}
                      onChangeText={(t) => up({ bio: t.slice(0, MAX_BIO) })}
                      placeholder="Tell us about yourself…"
                      placeholderTextColor={colors.textMuted}
                      multiline numberOfLines={4}
                      maxLength={MAX_BIO}
                      textAlignVertical="top"
                    />
                  ) : (
                    <Text style={[s.fieldValue, { color: colors.text }]}>{profile.bio || "Not provided"}</Text>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Bottom save/cancel bar when editing */}
          {isEditing && (
            <Animated.View style={{
              opacity:   editBtnAnim,
              transform: [{ translateY: editBtnAnim.interpolate({ inputRange: [0,1], outputRange: [20, 0] }) }],
            }}>
              <View style={s.actionRow}>
                <TouchableOpacity onPress={handleCancel} disabled={saving} style={s.cancelBtnWrap} activeOpacity={0.8}>
                  <View style={[s.cancelBtn, { backgroundColor: isDark ? "#1e1e2e" : "#F1F5F9", borderColor: colors.border }]}>
                    <Ionicons name="close-outline" size={18} color={colors.text} />
                    <Text style={[s.cancelBtnText, { color: colors.text }]}>Cancel</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} disabled={saving} style={s.saveBtnWrap} activeOpacity={0.85}>
                  <LinearGradient
                    colors={isDark ? ["#1d4ed8","#4f46e5"] : ["#4F46E5","#7C3AED"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.saveBtn}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={s.saveBtnText}>Save Changes</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Country Picker Modal ── */}
      <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
        <View style={s.pickerOverlay}>
          <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={() => setShowCountryPicker(false)} />
          <View style={[s.pickerSheet, { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }]}>
            {/* Handle */}
            <View style={[s.pickerHandle, { backgroundColor: isDark ? "#3A3A3C" : "#C7C7CC" }]} />

            <View style={s.pickerHeader}>
              <Text style={[s.pickerTitle, { color: isDark ? "#fff" : "#000" }]}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)} style={s.pickerClose}>
                <Ionicons name="close" size={20} color={isDark ? "#fff" : "#000"} />
              </TouchableOpacity>
            </View>

            <View style={[s.searchRow, { backgroundColor: isDark ? "#2C2C2E" : "#E5E5EA" }]}>
              <Ionicons name="search-outline" size={16} color={isDark ? "#8E8E93" : "#6B6B6B"} />
              <TextInput
                style={[s.searchInput, { color: isDark ? "#fff" : "#000" }]}
                placeholder="Search country or dial code…"
                placeholderTextColor={isDark ? "#8E8E93" : "#6B6B6B"}
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = item.dialCode === profile.countryDialCode && item.flag === profile.countryFlag
                return (
                  <TouchableOpacity
                    onPress={() => {
                      up({ countryDialCode: item.dialCode, countryFlag: item.flag })
                      setShowCountryPicker(false)
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    }}
                    style={[
                      s.countryRow,
                      { borderBottomColor: isDark ? "#2C2C2E" : "#E5E5EA" },
                      isSelected && { backgroundColor: isDark ? "#1e1b4b" : "#EEF2FF" },
                    ]}
                  >
                    <Text style={s.countryFlag}>{item.flag}</Text>
                    <Text style={[s.countryName, { color: isDark ? "#fff" : "#000" }]}>{item.name}</Text>
                    <Text style={[s.countryDial, { color: isDark ? "#8E8E93" : "#6B6B6B" }]}>{item.dialCode}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={18} color={ACCENT} />}
                  </TouchableOpacity>
                )
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── FieldRow helper ──────────────────────────────────────────────────────────

const FieldRow = ({
  label, icon, iconColor, value, placeholder, isEditing,
  colors, isDark, onChangeText, keyboardType, maxLength,
}: {
  label: string; icon: string; iconColor: string
  value: string; placeholder: string
  isEditing: boolean; colors: any; isDark: boolean
  onChangeText: (t: string) => void
  keyboardType?: any; maxLength?: number
}) => (
  <View style={s.fieldWrap}>
    <View style={[s.iconBadge, { backgroundColor: iconColor + "18" }]}>
      <Ionicons name={icon as any} size={16} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {isEditing ? (
        <TextInput
          style={[s.textInput, { backgroundColor: isDark ? colors.surface : "#F8F9FA", borderColor: colors.border, color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          maxLength={maxLength}
        />
      ) : (
        <Text style={[s.fieldValue, { color: colors.text }]}>{value || "Not provided"}</Text>
      )}
    </View>
  </View>
)

const Divider = ({ colors }: { colors: any }) => (
  <View style={[s.divider, { backgroundColor: colors.border }]} />
)

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, letterSpacing: 0.3 },
  scroll:      { padding: 20, paddingBottom: 40, gap: 14 },

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
  heroName:    { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
  heroEmail:   { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4, marginBottom: 16 },
  heroCta: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  heroCtaCancel: { backgroundColor: "rgba(255,255,255,0.1)" },
  heroCtaText:   { fontSize: 14, fontWeight: "700", color: "#fff" },
  heroCtaRow:    { flexDirection: "row", gap: 10 },

  // Cards
  card: {
    borderRadius: 18, borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },

  // Fields
  fieldWrap:  { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  iconBadge:  { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  fieldValue: { fontSize: 15, fontWeight: "500", lineHeight: 20 },
  fieldNote:  { fontSize: 11, fontStyle: "italic", marginTop: 3 },
  charCount:  { fontSize: 11, fontWeight: "600" },
  divider:    { height: StyleSheet.hairlineWidth, marginVertical: 14, marginHorizontal: -18 },
  twoCol:     { flexDirection: "row", gap: 0 },

  // Inputs
  textInput: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, marginTop: 2,
  },
  textarea: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, minHeight: 88, marginTop: 2,
  },

  // Phone
  phoneRow:  { flexDirection: "row", gap: 8, marginTop: 2 },
  dialBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 10,
  },
  dialFlag:  { fontSize: 18 },
  dialCode:  { fontSize: 13, fontWeight: "600" },
  phoneInput: {
    flex: 1, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },

  // Action buttons
  actionRow:    { flexDirection: "row", gap: 12 },
  cancelBtnWrap:{ flex: 1, borderRadius: 14, overflow: "hidden" },
  cancelBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600" },
  saveBtnWrap:  { flex: 2, borderRadius: 14, overflow: "hidden" },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },

  // Country picker
  pickerOverlay:  { flex: 1, justifyContent: "flex-end" },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  pickerSheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "78%", paddingBottom: 34 },
  pickerHandle:   { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  pickerHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  pickerTitle:    { fontSize: 17, fontWeight: "700" },
  pickerClose:    { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput:  { flex: 1, fontSize: 15 },
  countryRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryFlag:  { fontSize: 22, width: 30 },
  countryName:  { flex: 1, fontSize: 15, fontWeight: "500" },
  countryDial:  { fontSize: 14 },
})

export default PersonalInformationScreen