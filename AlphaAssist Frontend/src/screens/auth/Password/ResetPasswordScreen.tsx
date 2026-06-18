"use client"

import { useState, useRef, useEffect } from "react"
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback, Animated, ActivityIndicator,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import { LinearGradient } from "expo-linear-gradient"
import { supabase } from "../../../services/supabase"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useAuth } from "../../../hooks/useAuth"

type ResetRoute = RouteProp<AuthStackParamList, "ResetPassword">
type ResetNav   = StackNavigationProp<AuthStackParamList, "ResetPassword">

// ─── Requirement row ──────────────────────────────────────────────────────────
const Req = ({ label, met }: { label: string; met: boolean }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
    <View style={[r.dot, { backgroundColor: met ? "#10B981" : "rgba(255,255,255,0.15)" }]}>
      {met && <Ionicons name="checkmark" size={10} color="#fff" />}
    </View>
    <Text style={[r.text, { color: met ? "#10B981" : "rgba(255,255,255,0.4)" }]}>{label}</Text>
  </View>
)
const r = StyleSheet.create({
  dot:  { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 13 },
})

// ─── Password field helper ────────────────────────────────────────────────────
const PassField = ({
  label, icon, placeholder, value, onChangeText,
  showPass, onToggle, focused, onFocus, onBlur,
}: {
  label: string; icon: string; placeholder: string
  value: string; onChangeText: (t: string) => void
  showPass: boolean; onToggle: () => void
  focused: boolean; onFocus: () => void; onBlur: () => void
}) => (
  <View style={pf.wrap}>
    <Text style={pf.label}>{label}</Text>
    <View style={[pf.box, focused && pf.boxFocused]}>
      <View style={[pf.iconBg, { backgroundColor: "#A78BFA22" }]}>
        <Ionicons name={icon as any} size={16} color={focused ? "#A78BFA" : "rgba(255,255,255,0.3)"} />
      </View>
      <TextInput
        style={pf.input}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.2)"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!showPass}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <TouchableOpacity onPress={onToggle} style={pf.eye}>
        <Ionicons name={showPass ? "eye-outline" : "eye-off-outline"} size={18} color="rgba(255,255,255,0.35)" />
      </TouchableOpacity>
    </View>
  </View>
)
const pf = StyleSheet.create({
  wrap:     { marginBottom: 16 },
  label:    { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 8 },
  box: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 4,
  },
  boxFocused: { borderColor: "#A78BFA", backgroundColor: "rgba(167,139,250,0.08)" },
  iconBg:   { width: 36, height: 50, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 2 },
  input:    { flex: 1, height: 50, fontSize: 15, color: "#fff" },
  eye:      { width: 44, height: 50, alignItems: "center", justifyContent: "center" },
})

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
  const navigation = useNavigation<ResetNav>()
  const route      = useRoute<ResetRoute>()
  const email      = route.params?.email
  const { signOut } = useAuth()

  // FIX: ref to programmatically focus the hidden OTP TextInput
  const otpInputRef = useRef<TextInput>(null)

  const [otp,             setOtp]             = useState("")
  const [password,        setPassword]        = useState("")
  const [confirm,         setConfirm]         = useState("")
  const [showPass,        setShowPass]        = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [otpFocused,      setOtpFocused]      = useState(false)
  const [passFocused,     setPassFocused]     = useState(false)
  const [confirmFocused,  setConfirmFocused]  = useState(false)

  // Entrance anims
  const iconAnim   = useRef(new Animated.Value(0)).current
  const iconScale  = useRef(new Animated.Value(0.7)).current
  const titleAnim  = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(14)).current
  const form1Anim  = useRef(new Animated.Value(0)).current
  const form2Anim  = useRef(new Animated.Value(0)).current
  const form3Anim  = useRef(new Animated.Value(0)).current
  const btnAnim    = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ])).start()

    Animated.stagger(80, [
      Animated.parallel([
        Animated.spring(iconAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      ]),
      Animated.parallel([
        Animated.timing(titleAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.spring(form1Anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(form2Anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(form3Anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(btnAnim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()
  }, [])

  const passwordChecks = {
    length:       password.length >= 8 && password.length <= 15,
    uppercase:    /[A-Z]/.test(password),
    special:      /[^A-Za-z0-9]/.test(password),
    alphanumeric: /[A-Za-z]/.test(password) && /\d/.test(password),
  }
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch  = password !== "" && password === confirm

  const onUpdatePassword = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!otp.trim())          { Alert.alert("Error", "Please enter the verification code"); return }
    if (!password.trim() || !confirm.trim()) { Alert.alert("Error", "Please enter and confirm your new password"); return }
    if (!isPasswordValid)     { Alert.alert("Error", "Password must be 8–15 chars, include uppercase, number and special character."); return }
    if (password !== confirm) { Alert.alert("Error", "Passwords do not match"); return }

    setLoading(true)
    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email, token: otp.trim(), type: "email",
      })
      if (verifyError || !verifyData?.session) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert("Invalid Code", verifyError?.message || "The code is incorrect or expired.")
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) { Alert.alert("Update Failed", updateError.message); return }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await signOut()
      navigation.replace("Login")
      setTimeout(() => {
        Alert.alert("Password Updated", "Please sign in with your new password.")
      }, 300)
    } catch {
      Alert.alert("Error", "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  // FIX: pad to always show 6 boxes; split correctly
  const otpDigits = otp.padEnd(6, " ").split("")

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={s.container}>
        {/* Background */}
        <LinearGradient
          colors={["#0f0c29", "#1a1040", "#302b63", "#0f0c29"]}
          locations={[0, 0.3, 0.7, 1]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[s.blob, s.blob1]} />
        <View style={[s.blob, s.blob2]} />

        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >

              {/* ── Key icon ── */}
              <Animated.View style={[s.iconArea, {
                opacity: iconAnim,
                transform: [{ scale: iconScale }],
              }]}>
                <Animated.View style={[s.halo, {
                  opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.2, 0.55] }),
                }]} />
                <LinearGradient
                  colors={["#4F46E5", "#7C3AED", "#9333EA"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.iconCircle}
                >
                  <Ionicons name="key-outline" size={44} color="rgba(255,255,255,0.92)" />
                </LinearGradient>
              </Animated.View>

              {/* ── Title ── */}
              <Animated.View style={{
                opacity: titleAnim,
                transform: [{ translateY: titleSlide }],
                alignItems: "center", marginBottom: 28,
              }}>
                <Text style={s.title}>Reset Password</Text>
                <Text style={s.subtitle}>Enter the code sent to</Text>
                <View style={s.emailPill}>
                  <Ionicons name="mail-outline" size={13} color="#818CF8" />
                  <Text style={s.emailText}>{email}</Text>
                </View>
              </Animated.View>

              {/* ── Step 1: OTP code ── */}
              <Animated.View style={{
                opacity:   form1Anim,
                transform: [{ translateY: form1Anim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
              }}>
                <View style={s.stepHeader}>
                  <View style={s.stepBadge}><Text style={s.stepNum}>1</Text></View>
                  <Text style={s.stepLabel}>VERIFICATION CODE</Text>
                </View>

                {/*
                  FIX: Wrap boxes + hidden input in a single container.
                  The TouchableOpacity wrapping the whole area focuses the
                  hidden TextInput on press. The TextInput sits on top via
                  absolute positioning and opacity:0, so it captures keyboard
                  input while the styled boxes show the digits visually.
                */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => otpInputRef.current?.focus()}
                  style={s.otpContainer}
                >
                  {/* Visible styled digit boxes */}
                  <View style={s.otpRow} pointerEvents="none">
                    {otpDigits.map((d, i) => {
                      const filled = i < otp.length
                      const active = otpFocused && i === otp.length
                      return (
                        <View key={i} style={[
                          s.otpBox,
                          active && s.otpBoxFocused,
                          filled && s.otpBoxFilled,
                        ]}>
                          <Text style={[s.otpDigit, filled && s.otpDigitFilled]}>
                            {filled ? otp[i] : ""}
                          </Text>
                          {/* Cursor blink when this slot is active */}
                          {active && <View style={s.cursor} />}
                        </View>
                      )
                    })}
                  </View>

                  {/* Hidden input — absorbs keyboard input */}
                  <TextInput
                    ref={otpInputRef}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={s.hiddenOtp}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    caretHidden
                  />
                </TouchableOpacity>
              </Animated.View>

              {/* ── Step 2: New password ── */}
              <Animated.View style={{
                opacity:   form2Anim,
                transform: [{ translateY: form2Anim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
                marginTop: 20,
              }}>
                <View style={s.stepHeader}>
                  <View style={s.stepBadge}><Text style={s.stepNum}>2</Text></View>
                  <Text style={s.stepLabel}>NEW PASSWORD</Text>
                </View>

                <PassField
                  label="NEW PASSWORD" icon="lock-closed-outline"
                  placeholder="Enter new password" value={password}
                  onChangeText={setPassword} showPass={showPass}
                  onToggle={() => setShowPass(!showPass)}
                  focused={passFocused}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                />

                {/* Requirements */}
                {password.length > 0 && (
                  <View style={s.reqBox}>
                    <Text style={s.reqTitle}>Password must include:</Text>
                    <Req label="8–15 characters"    met={passwordChecks.length} />
                    <Req label="1 uppercase letter"  met={passwordChecks.uppercase} />
                    <Req label="Letters and numbers" met={passwordChecks.alphanumeric} />
                    <Req label="1 special character" met={passwordChecks.special} />
                  </View>
                )}
              </Animated.View>

              {/* ── Step 3: Confirm ── */}
              <Animated.View style={{
                opacity:   form3Anim,
                transform: [{ translateY: form3Anim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
                marginTop: 4,
              }}>
                <View style={s.stepHeader}>
                  <View style={s.stepBadge}><Text style={s.stepNum}>3</Text></View>
                  <Text style={s.stepLabel}>CONFIRM PASSWORD</Text>
                </View>

                <PassField
                  label="CONFIRM NEW PASSWORD" icon="shield-checkmark-outline"
                  placeholder="Confirm new password" value={confirm}
                  onChangeText={setConfirm} showPass={showConfirm}
                  onToggle={() => setShowConfirm(!showConfirm)}
                  focused={confirmFocused}
                  onFocus={() => setConfirmFocused(true)}
                  onBlur={() => setConfirmFocused(false)}
                />

                {/* Match indicator */}
                {confirm.length > 0 && (
                  <View style={[s.matchRow, { backgroundColor: passwordsMatch ? "#10B98115" : "#EF444415" }]}>
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
              <Animated.View style={[s.btnWrap, {
                opacity:   btnAnim,
                transform: [{ translateY: btnAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
              }]}>
                <TouchableOpacity onPress={onUpdatePassword} disabled={loading} activeOpacity={0.87}>
                  <LinearGradient
                    colors={loading ? ["#374151","#4B5563"] : ["#4F46E5","#7C3AED"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btn}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Ionicons name="key-outline" size={20} color="#fff" />
                          <Text style={s.btnText}>Update Password</Text>
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                {/* Back link */}
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("Login") }}
                  style={s.backRow}
                >
                  <Ionicons name="arrow-back-outline" size={15} color="#818CF8" />
                  <Text style={s.backText}>Back to Login</Text>
                </TouchableOpacity>
              </Animated.View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0c29" },
  safe:      { flex: 1 },
  scroll:    { paddingHorizontal: 28, paddingTop: 20, paddingBottom: 44 },

  blob: { position: "absolute", borderRadius: 999 },
  blob1: { width: 280, height: 280, top: -60,  left: -80,  backgroundColor: "rgba(79,70,229,0.14)" },
  blob2: { width: 220, height: 220, bottom: 60, right: -60, backgroundColor: "rgba(124,58,237,0.11)" },

  // Icon
  iconArea:  { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  halo: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    backgroundColor: "#4F46E5",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 46,
  },
  iconCircle: {
    width: 106, height: 106, borderRadius: 53,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.6, shadowRadius: 20, elevation: 14,
  },

  // Title
  title:    { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: 0.3, marginBottom: 8 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.42)", marginBottom: 10 },
  emailPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(129,140,248,0.12)",
    borderWidth: 1, borderColor: "rgba(129,140,248,0.25)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  emailText: { fontSize: 13, color: "#818CF8", fontWeight: "700" },

  // Step headers
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#4F46E5",
    alignItems: "center", justifyContent: "center",
  },
  stepNum:   { fontSize: 11, fontWeight: "800", color: "#fff" },
  stepLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.4)" },

  // FIX: OTP container is the tappable area that focuses the hidden input
  otpContainer: {
    position: "relative",
    marginBottom: 6,
    height: 58,  // enough to contain the boxes + hidden input
  },

  // Visible digit boxes row
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    position: "absolute",
    top: 0, left: 0, right: 0,
  },
  otpBox: {
    width: 42, height: 50, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  otpBoxFocused: { borderColor: "#818CF8", backgroundColor: "rgba(129,140,248,0.1)" },
  otpBoxFilled:  { borderColor: "#818CF8", backgroundColor: "rgba(129,140,248,0.07)" },
  otpDigit:      { fontSize: 20, fontWeight: "800", color: "rgba(255,255,255,0.25)" },
  otpDigitFilled:{ color: "#fff" },

  // FIX: hidden input covers the full container area so taps land on it
  hiddenOtp: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0,
    color: "transparent",
  },

  // FIX: simple cursor indicator for the active slot
  cursor: {
    position: "absolute",
    bottom: 10,
    width: 2,
    height: 20,
    backgroundColor: "#818CF8",
    borderRadius: 1,
  },

  // Requirements
  reqBox:   { marginBottom: 16, padding: 14, backgroundColor: "rgba(167,139,250,0.07)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(167,139,250,0.15)" },
  reqTitle: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },

  // Match
  matchRow:  { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  matchText: { fontSize: 13, fontWeight: "600" },

  // Button
  btnWrap: { marginTop: 12 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 17, borderRadius: 16,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },

  // Back
  backRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  backText: { fontSize: 14, color: "#818CF8", fontWeight: "700" },
})