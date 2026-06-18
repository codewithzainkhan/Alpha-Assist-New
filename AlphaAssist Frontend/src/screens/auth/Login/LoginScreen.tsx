"use client"

import { useState, useRef, useEffect } from "react"
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  Image, Keyboard, TouchableWithoutFeedback, Animated,
  Dimensions, ActivityIndicator,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import { supabase } from "../../../services/supabase"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useTheme } from "../../../components/context/ThemeContext"
import { scheduleReEngagementIfNeeded } from "../../../services/notifications"

const { width, height } = Dimensions.get("window")
type Nav = StackNavigationProp<AuthStackParamList, "Login">

const LoginScreen = () => {
  const navigation = useNavigation<Nav>()
  const { loadThemeForUser } = useTheme()

  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passFocused,  setPassFocused]  = useState(false)

  const logoAnim   = useRef(new Animated.Value(0)).current
  const logoScale  = useRef(new Animated.Value(0.8)).current
  const titleAnim  = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(14)).current
  const form1Anim  = useRef(new Animated.Value(0)).current
  const form2Anim  = useRef(new Animated.Value(0)).current
  const btnAnim    = useRef(new Animated.Value(0)).current
  const footerAnim = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ])).start()

    Animated.stagger(90, [
      Animated.parallel([
        Animated.spring(logoAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      ]),
      Animated.parallel([
        Animated.timing(titleAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.spring(form1Anim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(form2Anim,  { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(btnAnim,    { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(footerAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()
  }, [])

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  const handleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!email.trim())         { Alert.alert("Error", "Please enter your email"); return }
    if (!validateEmail(email)) { Alert.alert("Error", "Please enter a valid email address"); return }
    if (!password.trim())      { Alert.alert("Error", "Please enter your password"); return }
    if (password.length < 6)   { Alert.alert("Error", "Password must be at least 6 characters"); return }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      })

      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert("Login Failed", error.message)
        setLoading(false)
      } else if (data.user) {
        try { await loadThemeForUser(data.user.id) } catch {}

        // ── Re-engagement: fires if user hasn't opened app in 3+ days ──────
        try {
          await scheduleReEngagementIfNeeded(data.user.id)
        } catch (notifErr) {
          console.warn("Re-engagement notification failed:", notifErr)
        }
        // ────────────────────────────────────────────────────────────────────
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred")
      setLoading(false)
    }
  }

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

              {/* Logo */}
              <Animated.View style={[s.logoArea, { opacity: logoAnim, transform: [{ scale: logoScale }] }]}>
                <Animated.View style={[s.halo, {
                  opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.2, 0.55] }),
                }]} />
                <LinearGradient
                  colors={["#4F46E5","#7C3AED","#9333EA"]}
                  start={{ x:0, y:0 }} end={{ x:1, y:1 }}
                  style={s.logoCircle}
                >
                  <Image source={require("../../../../assets/images/auth.png")} style={s.logoImg} resizeMode="contain" />
                </LinearGradient>
              </Animated.View>

              {/* Title */}
              <Animated.View style={{ opacity: titleAnim, transform: [{ translateY: titleSlide }], alignItems: "center", marginBottom: 28 }}>
                <Text style={s.title}>Welcome back</Text>
                <Text style={s.subtitle}>Sign in to continue your journey</Text>
              </Animated.View>

              {/* Email */}
              <Animated.View style={[s.fieldWrap, { opacity: form1Anim, transform: [{ translateY: form1Anim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }] }]}>
                <Text style={s.fieldLabel}>EMAIL</Text>
                <View style={[s.fieldBox, emailFocused && s.fieldBoxFocused]}>
                  <View style={s.fieldIconWrap}>
                    <Ionicons name="mail-outline" size={18} color={emailFocused ? "#818CF8" : "rgba(255,255,255,0.3)"} />
                  </View>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="Enter your email"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />
                </View>
              </Animated.View>

              {/* Password */}
              <Animated.View style={[s.fieldWrap, { opacity: form2Anim, transform: [{ translateY: form2Anim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }] }]}>
                <Text style={s.fieldLabel}>PASSWORD</Text>
                <View style={[s.fieldBox, passFocused && s.fieldBoxFocused]}>
                  <View style={s.fieldIconWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color={passFocused ? "#818CF8" : "rgba(255,255,255,0.3)"} />
                  </View>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="Enter your password"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setPassFocused(true)}
                    onBlur={() => setPassFocused(false)}
                  />
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPassword(!showPassword) }}
                    style={s.eyeBtn}
                  >
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={18} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("ForgotPassword") }}
                  style={s.forgotBtn}
                >
                  <Text style={s.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Button */}
              <Animated.View style={[s.btnWrap, { opacity: btnAnim, transform: [{ translateY: btnAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }] }]}>
                <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.87}>
                  <LinearGradient
                    colors={loading ? ["#374151","#4B5563"] : ["#4F46E5","#7C3AED"]}
                    start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                    style={s.loginBtn}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="log-in-outline" size={20} color="#fff" /><Text style={s.loginBtnText}>Sign In</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* Divider */}
              <Animated.View style={[s.dividerRow, { opacity: footerAnim }]}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </Animated.View>

              {/* Sign up */}
              <Animated.View style={[s.footer, { opacity: footerAnim, transform: [{ translateY: footerAnim.interpolate({ inputRange: [0,1], outputRange: [10,0] }) }] }]}>
                <Text style={s.footerText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("Signup") }}>
                  <Text style={s.footerLink}>Sign up</Text>
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
  container:      { flex: 1, backgroundColor: "#0f0c29" },
  safe:           { flex: 1 },
  kav:            { flex: 1 },
  inner:          { flex: 1, paddingHorizontal: 28, justifyContent: "center", paddingBottom: 24 },
  blob:           { position: "absolute", borderRadius: 999 },
  blob1:          { width: 300, height: 300, top: -80,  left: -80,  backgroundColor: "rgba(79,70,229,0.14)" },
  blob2:          { width: 220, height: 220, bottom: 60, right: -60, backgroundColor: "rgba(124,58,237,0.11)" },
  logoArea:       { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  halo:           { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "#4F46E5", shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 50 },
  logoCircle:     { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.12)", shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.6, shadowRadius: 20, elevation: 14 },
  logoImg:        { width: 110, height: 110, borderRadius: 55 },
  title:          { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: 0.3, marginBottom: 6 },
  subtitle:       { fontSize: 14, color: "rgba(255,255,255,0.42)", letterSpacing: 0.4 },
  fieldWrap:      { width: "100%", marginBottom: 16 },
  fieldLabel:     { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 8 },
  fieldBox:       { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 4 },
  fieldBoxFocused:{ borderColor: "#818CF8", backgroundColor: "rgba(129,140,248,0.08)" },
  fieldIconWrap:  { width: 42, height: 52, alignItems: "center", justifyContent: "center" },
  fieldInput:     { flex: 1, height: 52, fontSize: 15, color: "#fff" },
  eyeBtn:         { width: 44, height: 52, alignItems: "center", justifyContent: "center" },
  forgotBtn:      { alignSelf: "flex-end", marginTop: 8 },
  forgotText:     { fontSize: 13, color: "#818CF8", fontWeight: "600" },
  btnWrap:        { width: "100%", marginTop: 4, marginBottom: 20, borderRadius: 16, overflow: "hidden" },
  loginBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 17 },
  loginBtnText:   { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  dividerRow:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  dividerLine:    { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.1)" },
  dividerText:    { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  footer:         { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText:     { fontSize: 14, color: "rgba(255,255,255,0.42)" },
  footerLink:     { fontSize: 14, color: "#818CF8", fontWeight: "700" },
})

export default LoginScreen