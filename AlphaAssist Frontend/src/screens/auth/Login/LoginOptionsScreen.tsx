"use client"

import { useRef, useEffect } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  SafeAreaView, Alert, Image, Animated, Dimensions,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import { supabase } from "../../../services/supabase"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as WebBrowser from "expo-web-browser"
import * as Haptics from "expo-haptics"
import {
  registerForPushNotifications,
  scheduleGoogleOnboardingNotifications,
  scheduleReEngagementIfNeeded,
} from "../../../services/notifications"

WebBrowser.maybeCompleteAuthSession()

const { width, height } = Dimensions.get("window")
type Nav = StackNavigationProp<AuthStackParamList, "LoginOptions">

// ─── Floating particle ────────────────────────────────────────────────────────
const Particle = ({ x, y, size, color, delay }: {
  x: number; y: number; size: number; color: string; delay: number
}) => {
  const floatAnim   = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    setTimeout(() => {
      Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(opacityAnim, { toValue: 0.5, duration: 1400, useNativeDriver: true }),
          Animated.timing(floatAnim,   { toValue: -14, duration: 2800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacityAnim, { toValue: 0,   duration: 1400, useNativeDriver: true }),
          Animated.timing(floatAnim,   { toValue: 0,   duration: 2800, useNativeDriver: true }),
        ]),
      ])).start()
    }, delay)
  }, [])
  return (
    <Animated.View style={[{
      position: "absolute", left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      opacity: opacityAnim,
      transform: [{ translateY: floatAnim }],
    }]} />
  )
}

const PARTICLES = [
  { x: 30,        y: height * 0.1,  size: 5, color: "#818CF8", delay: 0   },
  { x: width - 50,y: height * 0.15, size: 4, color: "#A78BFA", delay: 500 },
  { x: 60,        y: height * 0.55, size: 6, color: "#6EE7B7", delay: 900 },
  { x: width - 70,y: height * 0.5,  size: 4, color: "#F9A8D4", delay: 300 },
  { x: width * 0.4,y:height * 0.08, size: 3, color: "#7DD3FC", delay: 700 },
]

// ─── Main screen ──────────────────────────────────────────────────────────────
const LoginOptionsScreen = () => {
  const navigation = useNavigation<Nav>()

  const logoAnim   = useRef(new Animated.Value(0)).current
  const logoScale  = useRef(new Animated.Value(0.8)).current
  const titleAnim  = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(16)).current
  const btn1Anim   = useRef(new Animated.Value(0)).current
  const btn2Anim   = useRef(new Animated.Value(0)).current
  const footerAnim = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
    ])).start()

    Animated.stagger(100, [
      Animated.parallel([
        Animated.spring(logoAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      ]),
      Animated.parallel([
        Animated.timing(titleAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.spring(btn1Anim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(btn2Anim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(footerAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()
  }, [])

  const handleGoogleLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      const redirectUrl = "alphaassist://auth/callback"
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      })
      if (error)    { Alert.alert("Error", error.message); return }
      if (!data?.url){ Alert.alert("Error", "No OAuth URL returned"); return }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
      if (result.type === "success" && result.url) {
        const hashParams   = new URLSearchParams(result.url.split("#")[1])
        const accessToken  = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")

        if (accessToken && refreshToken) {
          const { data: sessionData, error: sessionError } =
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })

          if (sessionError) { Alert.alert("Error", sessionError.message); return }

          // ── Notifications ────────────────────────────────────────────────
          if (sessionData?.user) {
            const userId = sessionData.user.id
            try {
              await registerForPushNotifications()

              // Check if this is a brand-new Google user
              // Supabase sets created_at == last_sign_in_at on first sign-in
              const createdAt     = new Date(sessionData.user.created_at).getTime()
              const lastSignIn    = new Date(sessionData.user.last_sign_in_at ?? 0).getTime()
              const isNewUser     = Math.abs(createdAt - lastSignIn) < 5000 // within 5 s = new

              const displayName =
                sessionData.user.user_metadata?.full_name ||
                sessionData.user.user_metadata?.name ||
                sessionData.user.email?.split("@")[0] ||
                "there"
              const firstName = displayName.split(" ")[0]

              if (isNewUser) {
                await scheduleGoogleOnboardingNotifications(firstName)
              } else {
                await scheduleReEngagementIfNeeded(userId)
              }
            } catch (notifErr) {
              console.warn("Google login notifications failed:", notifErr)
            }
          }
          // ─────────────────────────────────────────────────────────────────
        }
      }
    } catch {
      Alert.alert("Error", "Failed to sign in with Google")
    }
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient
        colors={["#0f0c29", "#1a1040", "#302b63", "#0f0c29"]}
        locations={[0, 0.3, 0.7, 1]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[s.blob, s.blob1]} />
      <View style={[s.blob, s.blob2]} />
      {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

      <SafeAreaView style={s.safe}>
        <View style={s.inner}>

          {/* Logo */}
          <Animated.View style={[s.logoArea, { opacity: logoAnim, transform: [{ scale: logoScale }] }]}>
            <Animated.View style={[s.halo, {
              opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.25, 0.6] }),
            }]} />
            <LinearGradient
              colors={["#4F46E5", "#7C3AED", "#9333EA"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.logoCircle}
            >
              <Image source={require("../../../../assets/images/auth.png")} style={s.logoImg} resizeMode="contain" />
            </LinearGradient>
          </Animated.View>

          {/* Title */}
          <Animated.View style={{ opacity: titleAnim, transform: [{ translateY: titleSlide }], alignItems: "center", marginBottom: 8 }}>
            <Text style={s.appName}>
              <Text style={s.nameWhite}>Alpha</Text>
              <Text style={s.nameAccent}>Assist</Text>
            </Text>
            <Text style={s.subtitle}>Your AI-Powered Assistant</Text>
          </Animated.View>

          {/* Divider */}
          <Animated.View style={[s.dividerRow, { opacity: titleAnim }]}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>Choose how to continue</Text>
            <View style={s.dividerLine} />
          </Animated.View>

          {/* Buttons */}
          <View style={s.btns}>
            <Animated.View style={{ opacity: btn1Anim, transform: [{ translateY: btn1Anim.interpolate({ inputRange: [0,1], outputRange: [20,0] }) }] }}>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigation.navigate("Login") }}
                activeOpacity={0.85} style={s.btnWrap}
              >
                <LinearGradient colors={["#4F46E5","#7C3AED"]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.emailBtn}>
                  <View style={s.btnIconWrap}><Ionicons name="mail-outline" size={20} color="#fff" /></View>
                  <Text style={s.emailBtnText}>Continue with Email</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={{ opacity: btn2Anim, transform: [{ translateY: btn2Anim.interpolate({ inputRange: [0,1], outputRange: [20,0] }) }] }}>
              <TouchableOpacity onPress={handleGoogleLogin} activeOpacity={0.85} style={s.btnWrap}>
                <View style={s.googleBtn}>
                  <View style={s.googleIconCircle}>
                    <Image source={require("../../../../assets/images/png-google.png")} style={s.googleImg} resizeMode="contain" />
                  </View>
                  <Text style={s.googleBtnText}>Continue with Google</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Footer */}
          <Animated.View style={[s.footer, { opacity: footerAnim, transform: [{ translateY: footerAnim.interpolate({ inputRange: [0,1], outputRange: [12,0] }) }] }]}>
            <Text style={s.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("Signup") }}>
              <Text style={s.footerLink}>Sign up</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Terms */}
          <Animated.View style={{ opacity: footerAnim, alignItems: "center", marginTop: 12 }}>
            <Text style={s.terms}>
              By continuing, you agree to our{" "}
              <Text style={s.termsLink}>Terms of Service</Text>
              {" "}and{" "}
              <Text style={s.termsLink}>Privacy Policy</Text>
            </Text>
          </Animated.View>

        </View>
      </SafeAreaView>
    </View>
  )
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#0f0c29" },
  safe:           { flex: 1 },
  inner:          { flex: 1, paddingHorizontal: 28, alignItems: "center", justifyContent: "center", paddingBottom: 20 },
  blob:           { position: "absolute", borderRadius: 999 },
  blob1:          { width: 300, height: 300, top: -60,  left: -80,  backgroundColor: "rgba(79,70,229,0.15)" },
  blob2:          { width: 240, height: 240, bottom: 20, right: -60, backgroundColor: "rgba(124,58,237,0.12)" },
  logoArea:       { alignItems: "center", justifyContent: "center", marginBottom: 28 },
  halo:           { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "#4F46E5", shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 60 },
  logoCircle:     { width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.15)", shadowColor: "#4F46E5", shadowOffset: {width:0,height:8}, shadowOpacity: 0.7, shadowRadius: 24, elevation: 16 },
  logoImg:        { width: 130, height: 130, borderRadius: 65 },
  appName:        { fontSize: 34, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  nameWhite:      { color: "#fff" },
  nameAccent:     { color: "#818CF8" },
  subtitle:       { fontSize: 14, color: "rgba(255,255,255,0.45)", letterSpacing: 0.5 },
  dividerRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 28, marginTop: 20 },
  dividerLine:    { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.12)" },
  dividerText:    { fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: "600", letterSpacing: 0.5 },
  btns:           { width: "100%", gap: 14, marginBottom: 28 },
  btnWrap:        { width: "100%", borderRadius: 18, overflow: "hidden" },
  emailBtn:       { flexDirection: "row", alignItems: "center", paddingVertical: 17, paddingHorizontal: 20, gap: 12 },
  btnIconWrap:    { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  emailBtnText:   { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  googleBtn:      { flexDirection: "row", alignItems: "center", paddingVertical: 17, paddingHorizontal: 20, gap: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 18 },
  googleIconCircle:{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  googleImg:      { width: 22, height: 22 },
  googleBtnText:  { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  footer:         { flexDirection: "row", alignItems: "center" },
  footerText:     { fontSize: 14, color: "rgba(255,255,255,0.45)" },
  footerLink:     { fontSize: 14, color: "#818CF8", fontWeight: "700" },
  terms:          { fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", lineHeight: 16 },
  termsLink:      { color: "rgba(129,140,248,0.6)", fontWeight: "600" },
})

export default LoginOptionsScreen