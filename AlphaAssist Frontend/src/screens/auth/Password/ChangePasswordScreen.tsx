"use client"

import { useState, useRef, useEffect } from "react"
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback, Animated, ActivityIndicator,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { MainStackParamList } from "../../../types/navigation"
import { LinearGradient } from "expo-linear-gradient"
import { supabase } from "../../../services/supabase"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useAuth } from "../../../hooks/useAuth"
import { useTheme } from "../../../components/context/ThemeContext"

type Nav = StackNavigationProp<MainStackParamList, "ChangePassword">

// ─── Reusable password field ──────────────────────────────────────────────────
const PassField = ({
  label, icon, iconColor, placeholder, value, onChangeText,
  showPass, onToggle,
}: {
  label: string; icon: string; iconColor: string; placeholder: string
  value: string; onChangeText: (t: string) => void
  showPass: boolean; onToggle: () => void
}) => {
  const [focused, setFocused] = useState(false)
  const { activeTheme } = useTheme()
  const isDark = activeTheme === "dark"

  return (
    <View style={pf.wrap}>
      <Text style={pf.label}>{label}</Text>
      <View style={[
        pf.box,
        { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
        focused && [pf.boxFocused, { borderColor: iconColor }],
      ]}>
        <View style={[pf.iconBg, { backgroundColor: iconColor + "20" }]}>
          <Ionicons name={icon as any} size={16} color={focused ? iconColor : (isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)")} />
        </View>
        <TextInput
          style={[pf.input, { color: isDark ? "#fff" : "#111" }]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)"}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!showPass}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity onPress={onToggle} style={pf.eye}>
          <Ionicons
            name={showPass ? "eye-outline" : "eye-off-outline"}
            size={18}
            color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
          />
        </TouchableOpacity>
      </View>
    </View>
  )
}
const pf = StyleSheet.create({
  wrap:  { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  box: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 4,
  },
  boxFocused: { },
  iconBg: { width: 36, height: 50, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 2 },
  input:  { flex: 1, height: 50, fontSize: 15 },
  eye:    { width: 44, height: 50, alignItems: "center", justifyContent: "center" },
})

// ─── Requirement row ──────────────────────────────────────────────────────────
const Req = ({ label, met }: { label: string; met: boolean }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
    <View style={[rq.dot, { backgroundColor: met ? "#10B981" : "rgba(150,150,150,0.25)" }]}>
      {met && <Ionicons name="checkmark" size={10} color="#fff" />}
    </View>
    <Text style={[rq.text, { color: met ? "#10B981" : "rgba(150,150,150,0.7)" }]}>{label}</Text>
  </View>
)
const rq = StyleSheet.create({
  dot:  { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 13 },
})

// ─── Main screen ──────────────────────────────────────────────────────────────
const ChangePasswordScreen = () => {
  const navigation = useNavigation<Nav>()
  const { user } = useAuth()
  const { activeTheme } = useTheme()
  const isDark = activeTheme === "dark"

  const [oldPassword,     setOldPassword]     = useState("")
  const [newPassword,     setNewPassword]     = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showOld,         setShowOld]         = useState(false)
  const [showNew,         setShowNew]         = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [loading,         setLoading]         = useState(false)

  // Entrance anims
  const headerAnim = useRef(new Animated.Value(0)).current
  const card1Anim  = useRef(new Animated.Value(0)).current
  const card2Anim  = useRef(new Animated.Value(0)).current
  const card3Anim  = useRef(new Animated.Value(0)).current
  const btnAnim    = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.stagger(70, [
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(card1Anim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(card2Anim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(card3Anim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(btnAnim,    { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()
  }, [])

  const passwordChecks = {
    length:       newPassword.length >= 8 && newPassword.length <= 15,
    uppercase:    /[A-Z]/.test(newPassword),
    special:      /[^A-Za-z0-9]/.test(newPassword),
    alphanumeric: /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword),
  }
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch  = newPassword !== "" && newPassword === confirmPassword

  const handleChangePassword = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!oldPassword.trim()) { Alert.alert("Error", "Please enter your current password"); return }
    if (!newPassword.trim())  { Alert.alert("Error", "Please enter a new password"); return }
    if (!isPasswordValid)     { Alert.alert("Error", "New password must be 8–15 chars, include uppercase, number and special character."); return }
    if (newPassword !== confirmPassword) { Alert.alert("Error", "New passwords do not match"); return }
    if (oldPassword === newPassword) { Alert.alert("Error", "New password must differ from your current password"); return }
    if (!user?.email) { Alert.alert("Error", "User email not found"); return }

    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email, password: oldPassword,
      })
      if (signInError) { Alert.alert("Error", "Current password is incorrect"); setLoading(false); return }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) { Alert.alert("Error", updateError.message || "Failed to update password"); setLoading(false); return }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert("Password Updated", "Your password has been changed successfully.", [{
        text: "OK", onPress: () => {
          setOldPassword(""); setNewPassword(""); setConfirmPassword("")
          navigation.goBack()
        },
      }])
    } catch (error: any) {
      Alert.alert("Error", error.message || "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  // Theme colours
  const bg      = isDark ? "#0f0f1a" : "#f4f4f8"
  const cardBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)"
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"
  const textPrimary   = isDark ? "#fff" : "#111"
  const textSecondary = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)"
  const labelColor    = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"

  const slideIn = (anim: Animated.Value) => ({
    opacity:   anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [18,0] }) }],
  })

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[s.container, { backgroundColor: bg }]}>

        {/* Subtle top gradient tint */}
        <LinearGradient
          colors={isDark
            ? ["rgba(79,70,229,0.18)", "transparent"]
            : ["rgba(79,70,229,0.07)", "transparent"]
          }
          style={s.topTint}
        />

        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >

              {/* ── Header ── */}
              <Animated.View style={[s.header, slideIn(headerAnim)]}>
                {/* Back button */}
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack() }}
                  style={[s.backBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}
                >
                  <Ionicons name="arrow-back-outline" size={20} color={textPrimary} />
                </TouchableOpacity>

                <View style={s.headerText}>
                  <Text style={[s.title, { color: textPrimary }]}>Change Password</Text>
                  <Text style={[s.subtitle, { color: textSecondary }]}>
                    Verify your current password, then set a new one
                  </Text>
                </View>

                {/* Lock icon badge */}
                <LinearGradient
                  colors={["#4F46E5", "#7C3AED"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.iconBadge}
                >
                  <Ionicons name="key-outline" size={22} color="#fff" />
                </LinearGradient>
              </Animated.View>

              {/* ── Security notice ── */}
              <Animated.View style={[s.notice, {
                backgroundColor: isDark ? "rgba(79,70,229,0.1)" : "rgba(79,70,229,0.07)",
                borderColor: isDark ? "rgba(129,140,248,0.2)" : "rgba(79,70,229,0.15)",
              }, slideIn(headerAnim)]}>
                <Ionicons name="shield-outline" size={16} color="#818CF8" />
                <Text style={[s.noticeText, { color: isDark ? "rgba(129,140,248,0.85)" : "#4F46E5" }]}>
                  We'll verify your current password before making changes
                </Text>
              </Animated.View>

              {/* ── Step 1: Current password ── */}
              <Animated.View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }, slideIn(card1Anim)]}>
                <View style={s.stepRow}>
                  <LinearGradient colors={["#4F46E5","#818CF8"]} style={s.stepBadge}>
                    <Text style={s.stepNum}>1</Text>
                  </LinearGradient>
                  <Text style={[s.stepTitle, { color: textPrimary }]}>Verify Identity</Text>
                </View>
                <PassField
                  label="CURRENT PASSWORD"
                  icon="lock-closed-outline" iconColor="#4F46E5"
                  placeholder="Enter your current password"
                  value={oldPassword} onChangeText={setOldPassword}
                  showPass={showOld} onToggle={() => setShowOld(!showOld)}
                />
              </Animated.View>

              {/* ── Step 2: New password ── */}
              <Animated.View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }, slideIn(card2Anim)]}>
                <View style={s.stepRow}>
                  <LinearGradient colors={["#7C3AED","#A78BFA"]} style={s.stepBadge}>
                    <Text style={s.stepNum}>2</Text>
                  </LinearGradient>
                  <Text style={[s.stepTitle, { color: textPrimary }]}>New Password</Text>
                </View>
                <PassField
                  label="NEW PASSWORD"
                  icon="lock-open-outline" iconColor="#7C3AED"
                  placeholder="Enter a new password"
                  value={newPassword} onChangeText={setNewPassword}
                  showPass={showNew} onToggle={() => setShowNew(!showNew)}
                />

                {/* Requirements */}
                {newPassword.length > 0 && (
                  <View style={[s.reqBox, {
                    backgroundColor: isDark ? "rgba(167,139,250,0.07)" : "rgba(124,58,237,0.05)",
                    borderColor: isDark ? "rgba(167,139,250,0.15)" : "rgba(124,58,237,0.12)",
                  }]}>
                    <Text style={[s.reqTitle, { color: labelColor }]}>Must include:</Text>
                    <Req label="8–15 characters"    met={passwordChecks.length} />
                    <Req label="1 uppercase letter"  met={passwordChecks.uppercase} />
                    <Req label="Letters and numbers" met={passwordChecks.alphanumeric} />
                    <Req label="1 special character" met={passwordChecks.special} />
                  </View>
                )}
              </Animated.View>

              {/* ── Step 3: Confirm ── */}
              <Animated.View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }, slideIn(card3Anim)]}>
                <View style={s.stepRow}>
                  <LinearGradient colors={["#0EA5E9","#38BDF8"]} style={s.stepBadge}>
                    <Text style={s.stepNum}>3</Text>
                  </LinearGradient>
                  <Text style={[s.stepTitle, { color: textPrimary }]}>Confirm</Text>
                </View>
                <PassField
                  label="CONFIRM NEW PASSWORD"
                  icon="shield-checkmark-outline" iconColor="#0EA5E9"
                  placeholder="Confirm your new password"
                  value={confirmPassword} onChangeText={setConfirmPassword}
                  showPass={showConfirm} onToggle={() => setShowConfirm(!showConfirm)}
                />

                {/* Match indicator */}
                {confirmPassword.length > 0 && (
                  <View style={[s.matchRow, {
                    backgroundColor: passwordsMatch
                      ? (isDark ? "#10B98115" : "#10B98110")
                      : (isDark ? "#EF444415" : "#EF444410"),
                  }]}>
                    <Ionicons
                      name={passwordsMatch ? "checkmark-circle-outline" : "close-circle-outline"}
                      size={15} color={passwordsMatch ? "#10B981" : "#EF4444"}
                    />
                    <Text style={[s.matchText, { color: passwordsMatch ? "#10B981" : "#EF4444" }]}>
                      {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                    </Text>
                  </View>
                )}
              </Animated.View>

              {/* ── Update button ── */}
              <Animated.View style={slideIn(btnAnim)}>
                <TouchableOpacity onPress={handleChangePassword} disabled={loading} activeOpacity={0.87}>
                  <LinearGradient
                    colors={loading ? ["#374151","#4B5563"] : ["#4F46E5","#7C3AED"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btn}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                          <Text style={s.btnText}>Update Password</Text>
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack() }}
                  style={s.cancelRow}
                >
                  <Text style={[s.cancelText, { color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </Animated.View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  safe:      { flex: 1 },
  topTint:   { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  scroll:    { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 44 },

  // Header
  header: {
    flexDirection: "row", alignItems: "flex-start",
    gap: 14, marginBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  headerText: { flex: 1 },
  title:      { fontSize: 22, fontWeight: "800", letterSpacing: 0.2, marginBottom: 4 },
  subtitle:   { fontSize: 13, lineHeight: 19 },
  iconBadge: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:4}, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },

  // Notice
  notice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 17 },

  // Cards
  card: {
    borderRadius: 18, borderWidth: 1,
    padding: 18, marginBottom: 12,
    shadowColor: "#000", shadowOffset: {width:0,height:2}, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  stepRow:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  stepNum:   { fontSize: 12, fontWeight: "800", color: "#fff" },
  stepTitle: { fontSize: 15, fontWeight: "700" },

  // Requirements
  reqBox:   { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 4 },
  reqTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },

  // Match
  matchRow:  { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  matchText: { fontSize: 13, fontWeight: "600" },

  // Button
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 17, borderRadius: 16,
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:4}, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    marginBottom: 4,
  },
  btnText:    { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  cancelRow:  { alignItems: "center", paddingVertical: 14 },
  cancelText: { fontSize: 14, fontWeight: "600" },
})

export default ChangePasswordScreen