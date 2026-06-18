"use client"

import { useRef, useEffect } from "react"
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, Animated,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"

const { width, height } = Dimensions.get("window")
type Nav = StackNavigationProp<AuthStackParamList, "Intro">

// Feature pills shown below the image
const FEATURES = [
  { icon: "mic-outline",        label: "Voice Cloning",    color: "#818CF8" },
  { icon: "chatbubble-outline", label: "AI Chat",          color: "#34D399" },
  { icon: "analytics-outline",  label: "Smart Analytics",  color: "#38BDF8" },
  { icon: "star-outline",       label: "Personalized",     color: "#F59E0B" },
]

// Floating particle
const Particle = ({
  x, y, size, color, delay,
}: { x: number; y: number; size: number; color: string; delay: number }) => {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 3200 + delay, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 3200 + delay, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return (
    <Animated.View style={{
      position: "absolute", left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 0] }),
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }],
    }} />
  )
}

const IntroScreen = () => {
  const navigation = useNavigation<Nav>()

  // Entrance anims
  const logoAnim   = useRef(new Animated.Value(0)).current
  const logoScale  = useRef(new Animated.Value(0.85)).current
  const titleAnim  = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(20)).current
  const subAnim    = useRef(new Animated.Value(0)).current
  const imgAnim    = useRef(new Animated.Value(0)).current
  const imgScale   = useRef(new Animated.Value(0.9)).current
  const pillsAnim  = useRef(new Animated.Value(0)).current
  const btnAnim    = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Glow pulse
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2600, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2600, useNativeDriver: true }),
    ])).start()

    // Staggered entrance
    Animated.stagger(100, [
      Animated.parallel([
        Animated.spring(logoAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      ]),
      Animated.parallel([
        Animated.timing(titleAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(subAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(imgAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
        Animated.spring(imgScale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      ]),
      Animated.spring(pillsAnim, { toValue: 1, useNativeDriver: true, tension: 55, friction: 10 }),
      Animated.spring(btnAnim,   { toValue: 1, useNativeDriver: true, tension: 55, friction: 10 }),
    ]).start()
  }, [])

  const handleGetStarted = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      await AsyncStorage.setItem("hasSeenIntro", "true")
    } catch {}
    navigation.navigate("LoginOptions")
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background gradient */}
      <LinearGradient
        colors={["#0f0c29", "#1a1040", "#302b63", "#0f0c29"]}
        locations={[0, 0.3, 0.7, 1]}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient blobs */}
      <View style={[s.blob, s.blob1]} />
      <View style={[s.blob, s.blob2]} />
      <View style={[s.blob, s.blob3]} />

      {/* Particles */}
      {[
        { x: 30,       y: height * 0.18, size: 5,  color: "rgba(129,140,248,0.7)", delay: 0    },
        { x: width-55, y: height * 0.22, size: 4,  color: "rgba(167,139,250,0.6)", delay: 400  },
        { x: 60,       y: height * 0.55, size: 6,  color: "rgba(52,211,153,0.5)",  delay: 800  },
        { x: width-40, y: height * 0.60, size: 4,  color: "rgba(56,189,248,0.6)",  delay: 200  },
        { x: width*0.4,y: height * 0.08, size: 5,  color: "rgba(249,115,22,0.4)",  delay: 1200 },
        { x: width*0.7,y: height * 0.78, size: 4,  color: "rgba(129,140,248,0.5)", delay: 600  },
      ].map((p, i) => <Particle key={i} {...p} />)}

      <View style={s.inner}>

        {/* ── Logo wordmark ── */}
        <Animated.View style={[s.logoRow, {
          opacity: logoAnim,
          transform: [{ scale: logoScale }],
        }]}>
          <Animated.View style={[s.halo, {
            opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.15, 0.4] }),
          }]} />
          <LinearGradient
            colors={["#4F46E5", "#7C3AED", "#9333EA"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.logoBadge}
          >
            <Ionicons name="sparkles-outline" size={28} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={s.logoAlpha}>Alpha</Text>
            <Text style={s.logoAssist}>Assist</Text>
          </View>
        </Animated.View>

        {/* ── Tagline ── */}
        <Animated.View style={{
          opacity: titleAnim,
          transform: [{ translateY: titleSlide }],
          alignItems: "center", marginBottom: 6,
        }}>
          <Text style={s.tagline}>Your personal AI,{"\n"}built around you.</Text>
        </Animated.View>

        <Animated.View style={{ opacity: subAnim, alignItems: "center", marginBottom: 20 }}>
          <Text style={s.sub}>
            Voice cloning · Smart chat · Real-time analytics
          </Text>
        </Animated.View>

        {/* ── Hero image ── */}
        <Animated.View style={[s.imgWrap, {
          opacity: imgAnim,
          transform: [{ scale: imgScale }],
        }]}>
          <LinearGradient
            colors={["rgba(79,70,229,0.22)", "rgba(124,58,237,0.08)", "transparent"]}
            style={s.imgGlow}
          />
          <Image
            source={require("../../../../assets/images/intro.jpg")}
            style={s.img}
            resizeMode="contain"
          />
        </Animated.View>

        {/* ── Feature pills ── */}
        <Animated.View style={[s.pillsRow, {
          opacity:   pillsAnim,
          transform: [{ translateY: pillsAnim.interpolate({ inputRange: [0,1], outputRange: [12,0] }) }],
        }]}>
          {FEATURES.map(({ icon, label, color }) => (
            <View key={label} style={[s.pill, { borderColor: color + "35", backgroundColor: color + "12" }]}>
              <Ionicons name={icon as any} size={13} color={color} />
              <Text style={[s.pillText, { color }]}>{label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── CTA button ── */}
        <Animated.View style={[s.btnWrap, {
          opacity:   btnAnim,
          transform: [{ translateY: btnAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
        }]}>
          <TouchableOpacity onPress={handleGetStarted} activeOpacity={0.87}>
            <LinearGradient
              colors={["#4F46E5", "#7C3AED"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.btn}
            >
              <Text style={s.btnText}>Get Started</Text>
              <Ionicons name="arrow-forward-outline" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Dot indicator — single dot since it's a one-screen intro */}
          <View style={s.dotsRow}>
            {[0,1,2].map((i) => (
              <View key={i} style={[
                s.dot,
                { backgroundColor: i === 0 ? "#818CF8" : "rgba(255,255,255,0.2)", width: i === 0 ? 20 : 6 }
              ]} />
            ))}
          </View>
        </Animated.View>

      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0c29" },
  inner: {
    flex: 1, alignItems: "center",
    paddingHorizontal: 28, paddingTop: 60, paddingBottom: 44,
    justifyContent: "space-between",
  },

  // Background blobs
  blob: { position: "absolute", borderRadius: 999 },
  blob1: { width: 320, height: 320, top: -80,  left: -100, backgroundColor: "rgba(79,70,229,0.18)"  },
  blob2: { width: 260, height: 260, top: height*0.35, right: -80,  backgroundColor: "rgba(124,58,237,0.13)" },
  blob3: { width: 200, height: 200, bottom: 60, left: -40, backgroundColor: "rgba(56,189,248,0.07)"  },

  // Logo
  logoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  halo: {
    position: "absolute", width: 90, height: 90, borderRadius: 45, left: -12,
    backgroundColor: "#4F46E5",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 40,
  },
  logoBadge: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  logoAlpha:  { fontSize: 30, fontWeight: "900", color: "#fff",    letterSpacing: -0.5 },
  logoAssist: { fontSize: 14, fontWeight: "700", color: "#818CF8", letterSpacing: 3, marginTop: -4 },

  // Tagline
  tagline: {
    fontSize: 32, fontWeight: "800", color: "#fff",
    textAlign: "center", lineHeight: 40, letterSpacing: -0.3,
  },
  sub: {
    fontSize: 13, color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.3, textAlign: "center",
  },

  // Hero image
  imgWrap: { width: width * 0.76, aspectRatio: 1, position: "relative" },
  imgGlow: {
    position: "absolute", inset: 0,
    top: -20, left: -20, right: -20, bottom: -20,
    borderRadius: 160,
  },
  img: { width: "100%", height: "100%" },

  // Feature pills
  pillsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontWeight: "700" },

  // CTA
  btnWrap: { width: "100%", alignItems: "center", gap: 16 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 18, borderRadius: 18,
    width: width - 56,
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.45, shadowRadius: 18, elevation: 12,
  },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 0.2 },

  // Dots
  dotsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot:     { height: 6, borderRadius: 3 },
})

export default IntroScreen