"use client"

import { useState, useEffect, useRef } from "react"
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback, Animated,
  Dimensions, ActivityIndicator,
} from "react-native"
import { useNavigation, useRoute } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { RouteProp } from "@react-navigation/native"
import type { AuthStackParamList } from "../../../types/navigation"
import { supabase } from "../../../services/supabase"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { scheduleOnboardingNotifications, registerForPushNotifications } from "../../../services/notifications"

const { width } = Dimensions.get("window")
type Nav   = StackNavigationProp<AuthStackParamList, "OTP">
type Route = RouteProp<AuthStackParamList, "OTP">

// ─── Individual OTP box ────────────────────────────────────────────────────────
const OTPBox = ({ value, focused }: { value: string; focused: boolean }) => (
  <View style={[ob.box, focused && ob.boxFocused, value && ob.boxFilled]}>
    <Text style={[ob.digit, value && ob.digitFilled]}>{value || ""}</Text>
    {focused && !value && <View style={ob.cursor} />}
  </View>
)
const ob = StyleSheet.create({
  box:        { width: 46, height: 56, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  boxFocused: { borderColor: "#818CF8", backgroundColor: "rgba(129,140,248,0.1)" },
  boxFilled:  { borderColor: "#818CF8", backgroundColor: "rgba(129,140,248,0.07)" },
  digit:      { fontSize: 22, fontWeight: "800", color: "rgba(255,255,255,0.3)" },
  digitFilled:{ color: "#fff" },
  cursor:     { width: 2, height: 22, borderRadius: 1, backgroundColor: "#818CF8", position: "absolute" },
})

// ─── Main screen ──────────────────────────────────────────────────────────────
const OTPScreen = () => {
  const navigation = useNavigation<Nav>()
  const route      = useRoute<Route>()
  const { email, userData } = route.params

  const [otp,          setOtp]          = useState("")
  const [loading,      setLoading]      = useState(false)
  const [resendTimer,  setResendTimer]  = useState(60)
  const [canResend,    setCanResend]    = useState(false)
  const [inputFocused, setInputFocused] = useState(false)

  const inputRef = useRef<TextInput>(null)

  // Entrance anims
  const iconAnim    = useRef(new Animated.Value(0)).current
  const iconScale   = useRef(new Animated.Value(0.7)).current
  const titleAnim   = useRef(new Animated.Value(0)).current
  const titleSlide  = useRef(new Animated.Value(14)).current
  const boxesAnim   = useRef(new Animated.Value(0)).current
  const btnAnim     = useRef(new Animated.Value(0)).current
  const glowAnim    = useRef(new Animated.Value(0)).current
  const successAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { setCanResend(true); clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)

    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ])).start()

    Animated.stagger(90, [
      Animated.parallel([
        Animated.spring(iconAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      ]),
      Animated.parallel([
        Animated.timing(titleAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.spring(boxesAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(btnAnim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()

    return () => clearInterval(timer)
  }, [])

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`

  const handleVerifyOTP = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!otp.trim())      { Alert.alert("Error", "Please enter the code"); return }
    if (otp.length !== 6) { Alert.alert("Error", "Code must be 6 digits"); return }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email, token: otp, type: "signup",
      })

      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert("Verification Failed", error.message)
        setLoading(false)
        return
      }

      if (data.user) {
        // ── Save profile ──────────────────────────────────────────────────────
        const { error: profileError } = await supabase.from("profiles").upsert(
          { id: data.user.id, full_name: userData.name, email, phone: userData.phone },
          { onConflict: "id" }
        )
        if (profileError) console.error("Profile upsert error:", profileError)

        // ── Notifications: request permission then fire onboarding sequence ──
        try {
          await registerForPushNotifications()
          const firstName = userData.name.split(" ")[0] || userData.name
          await scheduleOnboardingNotifications(firstName)
        } catch (notifErr) {
          console.warn("Onboarding notifications failed:", notifErr)
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Animated.spring(successAnim, {
          toValue: 1, useNativeDriver: true, tension: 60, friction: 9,
        }).start()
        Alert.alert("✅ Verified!", "Your account has been verified.", [{ text: "Continue" }])
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    if (!canResend) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLoading(true); setCanResend(false); setResendTimer(60)
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email })
      if (error) { Alert.alert("Error", error.message); setCanResend(true) }
      else {
        Alert.alert("Sent!", "A new code has been sent to your email.")
        const timer = setInterval(() => {
          setResendTimer((prev) => {
            if (prev <= 1) { setCanResend(true); clearInterval(timer); return 0 }
            return prev - 1
          })
        }, 1000)
      }
    } catch {
      Alert.alert("Error", "Failed to resend code.")
      setCanResend(true)
    } finally {
      setLoading(false)
    }
  }

  const digits = otp.padEnd(6, "").split("")

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={s.container}>
        <LinearGradient
          colors={["#0f0c29", "#1a1040", "#302b63", "#0f0c29"]}
          locations={[0, 0.3, 0.7, 1]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[s.blob, s.blob1]} />
        <View style={[s.blob, s.blob2]} />

        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.kav}>
            <View style={s.inner}>

              {/* Shield icon */}
              <Animated.View style={[s.iconArea, { opacity: iconAnim, transform: [{ scale: iconScale }] }]}>
                <Animated.View style={[s.halo, {
                  opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.2, 0.55] }),
                }]} />
                <LinearGradient
                  colors={["#4F46E5", "#7C3AED", "#9333EA"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.iconCircle}
                >
                  <Ionicons name="shield-checkmark-outline" size={44} color="rgba(255,255,255,0.92)" />
                </LinearGradient>
              </Animated.View>

              {/* Title */}
              <Animated.View style={{ opacity: titleAnim, transform: [{ translateY: titleSlide }], alignItems: "center", marginBottom: 32 }}>
                <Text style={s.title}>Verify Your Account</Text>
                <Text style={s.subtitle}>We sent a 6-digit code to</Text>
                <View style={s.emailPill}>
                  <Ionicons name="mail-outline" size={13} color="#818CF8" />
                  <Text style={s.emailText}>{email}</Text>
                </View>
              </Animated.View>

              {/* OTP boxes */}
              <Animated.View style={{
                opacity:   boxesAnim,
                transform: [{ translateY: boxesAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
              }}>
                <Text style={s.fieldLabel}>VERIFICATION CODE</Text>
                <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={s.boxRow}>
                  {digits.map((d, i) => (
                    <OTPBox key={i} value={d.trim()} focused={inputFocused && otp.length === i} />
                  ))}
                </TouchableOpacity>
                <TextInput
                  ref={inputRef}
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={s.hiddenInput}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  autoFocus
                />
                <View style={s.progressDots}>
                  {[0,1,2,3,4,5].map((i) => (
                    <View key={i} style={[s.dot, { backgroundColor: i < otp.length ? "#818CF8" : "rgba(255,255,255,0.15)" }]} />
                  ))}
                </View>
              </Animated.View>

              {/* Resend */}
              <Animated.View style={[s.resendRow, { opacity: boxesAnim }]}>
                {canResend ? (
                  <TouchableOpacity onPress={handleResendOTP} disabled={loading} style={s.resendBtn}>
                    <Ionicons name="refresh-outline" size={15} color="#818CF8" />
                    <Text style={s.resendActive}>Resend Code</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.resendTimer}>
                    <Ionicons name="time-outline" size={15} color="rgba(255,255,255,0.3)" />
                    <Text style={s.resendCooldown}>Resend in {formatTime(resendTimer)}</Text>
                  </View>
                )}
              </Animated.View>

              {/* Verify button */}
              <Animated.View style={[s.btnWrap, {
                opacity:   btnAnim,
                transform: [{ translateY: btnAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
              }]}>
                <TouchableOpacity onPress={handleVerifyOTP} disabled={loading || otp.length < 6} activeOpacity={0.87}>
                  <LinearGradient
                    colors={
                      loading        ? ["#374151","#4B5563"] :
                      otp.length < 6 ? ["#2d2d50","#2d2d50"] :
                      ["#4F46E5","#7C3AED"]
                    }
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btn}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="checkmark-circle-outline" size={20} color="#fff" /><Text style={s.btnText}>Verify Account</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
                {otp.length < 6 && !loading && (
                  <Text style={s.btnHint}>{6 - otp.length} digit{6 - otp.length !== 1 ? "s" : ""} remaining</Text>
                )}
              </Animated.View>

            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#0f0c29" },
  safe:       { flex: 1 },
  kav:        { flex: 1 },
  inner:      { flex: 1, paddingHorizontal: 28, justifyContent: "center", paddingBottom: 24 },
  blob:       { position: "absolute", borderRadius: 999 },
  blob1:      { width: 280, height: 280, top: -60,  left: -80,  backgroundColor: "rgba(79,70,229,0.14)" },
  blob2:      { width: 220, height: 220, bottom: 60, right: -60, backgroundColor: "rgba(124,58,237,0.11)" },
  iconArea:   { alignItems: "center", justifyContent: "center", marginBottom: 28 },
  halo:       { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "#4F46E5", shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 50 },
  iconCircle: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.12)", shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.6, shadowRadius: 20, elevation: 14 },
  title:      { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: 0.3, marginBottom: 8 },
  subtitle:   { fontSize: 14, color: "rgba(255,255,255,0.42)", marginBottom: 10 },
  emailPill:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(129,140,248,0.12)", borderWidth: 1, borderColor: "rgba(129,140,248,0.25)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  emailText:  { fontSize: 13, color: "#818CF8", fontWeight: "700" },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 14, textAlign: "center" },
  boxRow:     { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 16 },
  hiddenInput:{ position: "absolute", width: 1, height: 1, opacity: 0 },
  progressDots:{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 20 },
  dot:        { width: 6, height: 6, borderRadius: 3 },
  resendRow:  { alignItems: "center", marginBottom: 28 },
  resendBtn:  { flexDirection: "row", alignItems: "center", gap: 6 },
  resendActive:{ fontSize: 14, color: "#818CF8", fontWeight: "700" },
  resendTimer: { flexDirection: "row", alignItems: "center", gap: 6 },
  resendCooldown:{ fontSize: 13, color: "rgba(255,255,255,0.3)" },
  btnWrap:    { borderRadius: 16, overflow: "hidden" },
  btn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 17 },
  btnText:    { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  btnHint:    { textAlign: "center", marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.25)" },
})

export default OTPScreen