"use client"

import { useState, useRef, useEffect } from "react"
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback, Animated,
  Dimensions, ActivityIndicator,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import { LinearGradient } from "expo-linear-gradient"
import { supabase } from "../../../services/supabase"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"

const { width, height } = Dimensions.get("window")
type Nav = StackNavigationProp<AuthStackParamList, "ForgotPassword">

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>()
  const [email,   setEmail]   = useState("")
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)

  // Entrance anims
  const iconAnim   = useRef(new Animated.Value(0)).current
  const iconScale  = useRef(new Animated.Value(0.7)).current
  const titleAnim  = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(14)).current
  const cardAnim   = useRef(new Animated.Value(0)).current
  const btnAnim    = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current

  useEffect(() => {
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
      Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(btnAnim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()
  }, [])

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  const onSendOtp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const normalized = email.trim().toLowerCase()
    if (!normalized)             { Alert.alert("Error", "Please enter your email"); return }
    if (!validateEmail(normalized)) { Alert.alert("Error", "Please enter a valid email address"); return }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: false },
      })
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert("Not Found", "No account found for this email address.")
        return
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert("Code Sent", "We've sent a verification code to your email.")
      navigation.navigate("ResetPassword", { email: normalized })
    } catch {
      Alert.alert("Error", "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

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
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.kav}>
            <View style={s.inner}>

              {/* ── Lock icon with glow ── */}
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
                  <Ionicons name="lock-open-outline" size={44} color="rgba(255,255,255,0.92)" />
                </LinearGradient>
              </Animated.View>

              {/* ── Title ── */}
              <Animated.View style={{
                opacity: titleAnim,
                transform: [{ translateY: titleSlide }],
                alignItems: "center", marginBottom: 32,
              }}>
                <Text style={s.title}>Forgot Password?</Text>
                <Text style={s.subtitle}>
                  No worries! Enter your email and{"\n"}we'll send you a reset code.
                </Text>
              </Animated.View>

              {/* ── Email card ── */}
              <Animated.View style={[s.card, {
                opacity:   cardAnim,
                transform: [{ translateY: cardAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
              }]}>
                <Text style={s.fieldLabel}>EMAIL ADDRESS</Text>
                <View style={[s.fieldBox, focused && s.fieldBoxFocused]}>
                  <View style={s.fieldIconWrap}>
                    <Ionicons
                      name="mail-outline" size={18}
                      color={focused ? "#818CF8" : "rgba(255,255,255,0.3)"}
                    />
                  </View>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="Enter your email address"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onSubmitEditing={onSendOtp}
                    returnKeyType="send"
                  />
                  {email.length > 0 && validateEmail(email.trim()) && (
                    <View style={s.validDot}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
              </Animated.View>

              {/* ── Info note ── */}
              <Animated.View style={[s.infoRow, { opacity: cardAnim }]}>
                <Ionicons name="information-circle-outline" size={15} color="rgba(129,140,248,0.6)" />
                <Text style={s.infoText}>
                  A 6-digit code will be sent to your registered email address.
                </Text>
              </Animated.View>

              {/* ── Send button ── */}
              <Animated.View style={[s.btnWrap, {
                opacity:   btnAnim,
                transform: [{ translateY: btnAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
              }]}>
                <TouchableOpacity onPress={onSendOtp} disabled={loading} activeOpacity={0.87}>
                  <LinearGradient
                    colors={loading ? ["#374151","#4B5563"] : ["#4F46E5","#7C3AED"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btn}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Ionicons name="send-outline" size={18} color="#fff" />
                          <Text style={s.btnText}>Send Reset Code</Text>
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* ── Back to login ── */}
              <Animated.View style={[s.backRow, { opacity: btnAnim }]}>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack() }}
                  style={s.backBtn}
                >
                  <Ionicons name="arrow-back-outline" size={16} color="#818CF8" />
                  <Text style={s.backText}>Back to Login</Text>
                </TouchableOpacity>
              </Animated.View>

            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0c29" },
  safe:      { flex: 1 },
  kav:       { flex: 1 },
  inner: {
    flex: 1, paddingHorizontal: 28,
    justifyContent: "center", paddingBottom: 24,
  },

  blob: { position: "absolute", borderRadius: 999 },
  blob1: { width: 280, height: 280, top: -60,  left: -80,  backgroundColor: "rgba(79,70,229,0.14)" },
  blob2: { width: 220, height: 220, bottom: 60, right: -60, backgroundColor: "rgba(124,58,237,0.11)" },

  // Icon area
  iconArea:   { alignItems: "center", justifyContent: "center", marginBottom: 28 },
  halo: {
    position: "absolute", width: 150, height: 150, borderRadius: 75,
    backgroundColor: "#4F46E5",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 50,
  },
  iconCircle: {
    width: 110, height: 110, borderRadius: 55,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.6, shadowRadius: 20, elevation: 14,
  },

  // Title
  title:    { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: 0.3, marginBottom: 10 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.42)", letterSpacing: 0.3, textAlign: "center", lineHeight: 22 },

  // Field
  fieldLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1,
    color: "rgba(255,255,255,0.35)", marginBottom: 8,
  },
  card: { width: "100%", marginBottom: 12 },
  fieldBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 4,
  },
  fieldBoxFocused: {
    borderColor: "#818CF8",
    backgroundColor: "rgba(129,140,248,0.08)",
  },
  fieldIconWrap: { width: 44, height: 52, alignItems: "center", justifyContent: "center" },
  fieldInput:    { flex: 1, height: 52, fontSize: 15, color: "#fff" },
  validDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#10B981",
    alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },

  // Info
  infoRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(129,140,248,0.07)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(129,140,248,0.15)",
    padding: 12, marginBottom: 24,
  },
  infoText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 18 },

  // Button
  btnWrap: { borderRadius: 16, overflow: "hidden", marginBottom: 18 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 17,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },

  // Back
  backRow: { alignItems: "center" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  backText: { fontSize: 14, color: "#818CF8", fontWeight: "700" },
})