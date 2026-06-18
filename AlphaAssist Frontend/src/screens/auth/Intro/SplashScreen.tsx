"use client"

import { useEffect, useRef } from "react"
import { View, Text, StyleSheet, StatusBar, Animated, Dimensions, Image } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { LinearGradient } from "expo-linear-gradient"

const { width, height } = Dimensions.get("window")
// type Nav = StackNavigationProp<AuthStackParamList, "Splash">

// ─── Floating particle ────────────────────────────────────────────────────────
const Particle = ({
  x, y, size, color, delay,
}: { x: number; y: number; size: number; color: string; delay: number }) => {
  const floatAnim = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(opacityAnim, { toValue: 0.7, duration: 1200, useNativeDriver: true }),
            Animated.timing(floatAnim,   { toValue: -18, duration: 2400, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(opacityAnim, { toValue: 0,   duration: 1200, useNativeDriver: true }),
            Animated.timing(floatAnim,   { toValue: 0,   duration: 2400, useNativeDriver: true }),
          ]),
        ])
      ).start()
    }, delay)
  }, [])

  return (
    <Animated.View style={[
      s.particle,
      {
        left: x, top: y,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        opacity: opacityAnim,
        transform: [{ translateY: floatAnim }],
      },
    ]} />
  )
}

const PARTICLES = [
  { x: 40,        y: height * 0.15, size: 6,  color: "#818CF8", delay: 0    },
  { x: width-60,  y: height * 0.2,  size: 4,  color: "#A78BFA", delay: 400  },
  { x: 80,        y: height * 0.7,  size: 5,  color: "#6EE7B7", delay: 800  },
  { x: width-80,  y: height * 0.65, size: 7,  color: "#F9A8D4", delay: 200  },
  { x: width*0.3, y: height * 0.12, size: 4,  color: "#7DD3FC", delay: 600  },
  { x: width*0.7, y: height * 0.8,  size: 5,  color: "#FCD34D", delay: 1000 },
  { x: 20,        y: height * 0.45, size: 3,  color: "#818CF8", delay: 1200 },
  { x: width-30,  y: height * 0.42, size: 4,  color: "#34D399", delay: 300  },
]

// ─── Props ────────────────────────────────────────────────────────────────────
interface SplashScreenProps {
  // standalone=true: rendered from App.tsx for session splash — no navigation logic
  // standalone=false (default): normal auth flow, navigates after 5s
  standalone?: boolean
}

// ─── Main screen ──────────────────────────────────────────────────────────────
const SplashScreen = ({ standalone = false }: SplashScreenProps) => {
  // const navigation = standalone ? null : useNavigation<Nav>()

  const fadeAnim      = useRef(new Animated.Value(0)).current
  const scaleAnim     = useRef(new Animated.Value(0.75)).current
  const glowAnim      = useRef(new Animated.Value(0)).current
  const taglineAnim   = useRef(new Animated.Value(0)).current
  const taglineSlide  = useRef(new Animated.Value(12)).current
  const progressAnim  = useRef(new Animated.Value(0)).current
  const ring1Anim     = useRef(new Animated.Value(0)).current
  const ring2Anim     = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fadeAnim,  { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 10 }),
    ]).start()

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(taglineSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start()
    }, 400)

    Animated.loop(
      Animated.timing(ring1Anim, { toValue: 1, duration: 6000, useNativeDriver: true })
    ).start()
    Animated.loop(
      Animated.timing(ring2Anim, { toValue: 1, duration: 9000, useNativeDriver: true })
    ).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start()

    // Progress bar duration: 2s for standalone session splash, 4.8s for auth flow
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: standalone ? 1800 : 4800,
      useNativeDriver: false,
    }).start()

    // Navigation only in normal auth flow
    // if (!standalone && navigation) {
    //   const checkIntro = async () => {
    //     try {
    //       const seen = await AsyncStorage.getItem("hasSeenIntro")
    //       setTimeout(() => {
    //         navigation.replace(seen === "true" ? "LoginOptions" : "Intro")
    //       }, 5000)
    //     } catch {
    //       setTimeout(() => navigation.replace("Intro"), 5000)
    //     }
    //   }
    //   checkIntro()
    // }
  }, [])

  const ring1Rotate  = ring1Anim.interpolate({ inputRange: [0,1], outputRange: ["0deg","360deg"] })
  const ring2Rotate  = ring2Anim.interpolate({ inputRange: [0,1], outputRange: ["360deg","0deg"] })
  const progressWidth = progressAnim.interpolate({ inputRange: [0,1], outputRange: ["0%","100%"] })

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
      <View style={[s.blob, s.blob3]} />

      {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

      <Animated.View style={[s.logoArea, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Animated.View style={[s.halo, { opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.3, 0.7] }) }]} />
        <Animated.View style={[s.ring, s.ring1, { transform: [{ rotate: ring1Rotate }] }]}>
          <View style={s.ringDot1} />
        </Animated.View>
        <Animated.View style={[s.ring, s.ring2, { transform: [{ rotate: ring2Rotate }] }]}>
          <View style={s.ringDot2} />
        </Animated.View>
        <LinearGradient
          colors={["#4F46E5", "#7C3AED", "#9333EA"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.logoCircle}
        >
          <Image
            source={require("../../../../assets/images/auth.png")}
            style={s.logoImage}
            resizeMode="contain"
          />
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[s.nameWrap, { opacity: fadeAnim }]}>
        <Text style={s.appName}>
          <Text style={s.nameWhite}>Alpha</Text>
          <Text style={s.nameAccent}>Assist</Text>
        </Text>
      </Animated.View>

      <Animated.View style={{ opacity: taglineAnim, transform: [{ translateY: taglineSlide }] }}>
        <View style={s.taglineRow}>
          <View style={s.taglineDash} />
          <Text style={s.tagline}>Your AI-Powered Assistant</Text>
          <View style={s.taglineDash} />
        </View>
      </Animated.View>

      <Animated.View style={[s.pillsRow, { opacity: taglineAnim }]}>
        {["AI Chat", "Smart Goals", "Analytics"].map((label, i) => (
          <View key={label} style={[s.pill, { backgroundColor: ["#4F46E530","#7C3AED30","#0EA5E930"][i] }]}>
            <Text style={[s.pillText, { color: ["#818CF8","#C084FC","#38BDF8"][i] }]}>{label}</Text>
          </View>
        ))}
      </Animated.View>

      <View style={s.progressWrap}>
        <View style={s.progressTrack}>
          <Animated.View style={[s.progressFill, { width: progressWidth }]}>
            <LinearGradient
              colors={["#4F46E5", "#7C3AED", "#A855F7"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.progressDot} />
          </Animated.View>
        </View>
        <Text style={s.progressLabel}>Loading…</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0c29", alignItems: "center", justifyContent: "center" },

  blob: { position: "absolute", borderRadius: 999 },
  blob1: { width: 340, height: 340, top: -80, left: -100, backgroundColor: "rgba(79,70,229,0.18)" },
  blob2: { width: 280, height: 280, bottom: 40, right: -80, backgroundColor: "rgba(124,58,237,0.15)" },
  blob3: { width: 200, height: 200, top: height * 0.5, left: width * 0.3, backgroundColor: "rgba(14,165,233,0.08)" },

  particle: { position: "absolute" },

  logoArea: { alignItems: "center", justifyContent: "center", marginBottom: 32 },
  halo: {
    position: "absolute", width: 230, height: 230, borderRadius: 115,
    backgroundColor: "#4F46E5", shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 60, elevation: 0,
  },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 1, alignItems: "flex-end", justifyContent: "center" },
  ring1: { width: 210, height: 210, borderColor: "rgba(129,140,248,0.3)" },
  ring2: { width: 250, height: 250, borderColor: "rgba(167,139,250,0.2)" },
  ringDot1: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#818CF8", shadowColor: "#818CF8", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 6 },
  ringDot2: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#C084FC", shadowColor: "#C084FC", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 4 },

  logoCircle: { width: 160, height: 160, borderRadius: 80, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.15)", shadowColor: "#4F46E5", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.8, shadowRadius: 30, elevation: 20 },
  logoImage: { width: 160, height: 160, borderRadius: 80 },

  nameWrap:   { marginBottom: 10 },
  appName:    { fontSize: 38, fontWeight: "800", letterSpacing: 1.5 },
  nameWhite:  { color: "#FFFFFF" },
  nameAccent: { color: "#818CF8" },

  taglineRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  taglineDash: { width: 24, height: 1, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 1 },
  tagline:     { fontSize: 14, color: "rgba(255,255,255,0.55)", letterSpacing: 0.8, fontWeight: "400" },

  pillsRow: { flexDirection: "row", gap: 10, marginBottom: 52 },
  pill:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  pillText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },

  progressWrap:  { position: "absolute", bottom: 60, alignItems: "center", gap: 10 },
  progressTrack: { width: 180, height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" },
  progressFill:  { height: "100%", borderRadius: 2, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  progressDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", shadowColor: "#fff", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 4, marginRight: -3 },
  progressLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: "600", letterSpacing: 1.2 },
})

export default SplashScreen