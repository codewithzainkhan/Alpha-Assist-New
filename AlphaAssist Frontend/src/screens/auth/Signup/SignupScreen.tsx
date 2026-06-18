"use client"

import { useState, useRef, useEffect } from "react"
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform,
  ScrollView, Image, Modal, FlatList, Keyboard,
  Animated, Dimensions, ActivityIndicator,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { AuthStackParamList } from "../../../types/navigation"
import { supabase } from "../../../services/supabase"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"

const { width, height } = Dimensions.get("window")
type Nav = StackNavigationProp<AuthStackParamList, "Signup">

// ─── Country codes ─────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: "+1",   country: "US/Canada",     flag: "🇺🇸", minDigits: 10, maxDigits: 10 },
  { code: "+44",  country: "United Kingdom",flag: "🇬🇧", minDigits: 10, maxDigits: 10 },
  { code: "+92",  country: "Pakistan",      flag: "🇵🇰", minDigits: 10, maxDigits: 10 },
  { code: "+91",  country: "India",         flag: "🇮🇳", minDigits: 10, maxDigits: 10 },
  { code: "+86",  country: "China",         flag: "🇨🇳", minDigits: 11, maxDigits: 11 },
  { code: "+49",  country: "Germany",       flag: "🇩🇪", minDigits: 10, maxDigits: 11 },
  { code: "+33",  country: "France",        flag: "🇫🇷", minDigits: 9,  maxDigits: 9  },
  { code: "+39",  country: "Italy",         flag: "🇮🇹", minDigits: 9,  maxDigits: 10 },
  { code: "+34",  country: "Spain",         flag: "🇪🇸", minDigits: 9,  maxDigits: 9  },
  { code: "+7",   country: "Russia",        flag: "🇷🇺", minDigits: 10, maxDigits: 10 },
  { code: "+55",  country: "Brazil",        flag: "🇧🇷", minDigits: 10, maxDigits: 11 },
  { code: "+52",  country: "Mexico",        flag: "🇲🇽", minDigits: 10, maxDigits: 10 },
  { code: "+81",  country: "Japan",         flag: "🇯🇵", minDigits: 10, maxDigits: 10 },
  { code: "+82",  country: "South Korea",   flag: "🇰🇷", minDigits: 9,  maxDigits: 10 },
  { code: "+61",  country: "Australia",     flag: "🇦🇺", minDigits: 9,  maxDigits: 9  },
  { code: "+27",  country: "South Africa",  flag: "🇿🇦", minDigits: 9,  maxDigits: 9  },
  { code: "+20",  country: "Egypt",         flag: "🇪🇬", minDigits: 10, maxDigits: 10 },
  { code: "+966", country: "Saudi Arabia",  flag: "🇸🇦", minDigits: 9,  maxDigits: 9  },
  { code: "+971", country: "UAE",           flag: "🇦🇪", minDigits: 9,  maxDigits: 9  },
  { code: "+90",  country: "Turkey",        flag: "🇹🇷", minDigits: 10, maxDigits: 10 },
  { code: "+62",  country: "Indonesia",     flag: "🇮🇩", minDigits: 9,  maxDigits: 12 },
  { code: "+60",  country: "Malaysia",      flag: "🇲🇾", minDigits: 9,  maxDigits: 10 },
  { code: "+63",  country: "Philippines",   flag: "🇵🇭", minDigits: 10, maxDigits: 10 },
  { code: "+65",  country: "Singapore",     flag: "🇸🇬", minDigits: 8,  maxDigits: 8  },
  { code: "+880", country: "Bangladesh",    flag: "🇧🇩", minDigits: 10, maxDigits: 10 },
  { code: "+94",  country: "Sri Lanka",     flag: "🇱🇰", minDigits: 9,  maxDigits: 9  },
  { code: "+977", country: "Nepal",         flag: "🇳🇵", minDigits: 10, maxDigits: 10 },
  { code: "+31",  country: "Netherlands",   flag: "🇳🇱", minDigits: 9,  maxDigits: 9  },
  { code: "+46",  country: "Sweden",        flag: "🇸🇪", minDigits: 9,  maxDigits: 9  },
  { code: "+47",  country: "Norway",        flag: "🇳🇴", minDigits: 8,  maxDigits: 8  },
  { code: "+45",  country: "Denmark",       flag: "🇩🇰", minDigits: 8,  maxDigits: 8  },
  { code: "+41",  country: "Switzerland",   flag: "🇨🇭", minDigits: 9,  maxDigits: 9  },
  { code: "+43",  country: "Austria",       flag: "🇦🇹", minDigits: 10, maxDigits: 11 },
  { code: "+32",  country: "Belgium",       flag: "🇧🇪", minDigits: 9,  maxDigits: 9  },
  { code: "+351", country: "Portugal",      flag: "🇵🇹", minDigits: 9,  maxDigits: 9  },
  { code: "+48",  country: "Poland",        flag: "🇵🇱", minDigits: 9,  maxDigits: 9  },
  { code: "+380", country: "Ukraine",       flag: "🇺🇦", minDigits: 9,  maxDigits: 9  },
  { code: "+30",  country: "Greece",        flag: "🇬🇷", minDigits: 10, maxDigits: 10 },
  { code: "+64",  country: "New Zealand",   flag: "🇳🇿", minDigits: 8,  maxDigits: 9  },
  { code: "+54",  country: "Argentina",     flag: "🇦🇷", minDigits: 10, maxDigits: 10 },
  { code: "+56",  country: "Chile",         flag: "🇨🇱", minDigits: 9,  maxDigits: 9  },
  { code: "+57",  country: "Colombia",      flag: "🇨🇴", minDigits: 10, maxDigits: 10 },
  { code: "+234", country: "Nigeria",       flag: "🇳🇬", minDigits: 10, maxDigits: 10 },
  { code: "+98",  country: "Iran",          flag: "🇮🇷", minDigits: 10, maxDigits: 10 },
  { code: "+93",  country: "Afghanistan",   flag: "🇦🇫", minDigits: 9,  maxDigits: 9  },
  { code: "+66",  country: "Thailand",      flag: "🇹🇭", minDigits: 9,  maxDigits: 9  },
  { code: "+84",  country: "Vietnam",       flag: "🇻🇳", minDigits: 9,  maxDigits: 10 },
]

// ─── Field component ───────────────────────────────────────────────────────────
const Field = ({
  label, icon, iconColor, placeholder, value, onChangeText,
  keyboardType, secureTextEntry, onBlur, error, hint,
  rightElement, autoCapitalize = "none",
}: {
  label: string; icon: string; iconColor: string
  placeholder: string; value: string
  onChangeText: (t: string) => void
  keyboardType?: any; secureTextEntry?: boolean
  onBlur?: () => void; error?: string; hint?: string
  rightElement?: React.ReactNode
  autoCapitalize?: "none" | "words" | "sentences" | "characters"
}) => {
  const [focused, setFocused] = useState(false)
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      <View style={[f.box, focused && f.boxFocused, !!error && f.boxError]}>
        <View style={[f.iconBg, { backgroundColor: iconColor + "22" }]}>
          <Ionicons name={icon as any} size={16} color={focused ? iconColor : "rgba(255,255,255,0.3)"} />
        </View>
        <TextInput
          style={f.input}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.() }}
        />
        {rightElement}
      </View>
      {error ? (
        <View style={f.errRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
          <Text style={f.errText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={f.hint}>{hint}</Text>
      ) : null}
    </View>
  )
}
const f = StyleSheet.create({
  wrap:      { marginBottom: 18 },
  label:     { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.4)", marginBottom: 8 },
  box: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 4,
  },
  boxFocused: { borderColor: "#818CF8", backgroundColor: "rgba(129,140,248,0.08)" },
  boxError:   { borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.05)" },
  iconBg:     { width: 36, height: 50, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 2 },
  input:      { flex: 1, height: 50, fontSize: 15, color: "#fff" },
  errRow:     { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  errText:    { fontSize: 12, color: "#EF4444" },
  hint:       { fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 5 },
})

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

// ─── Main screen ──────────────────────────────────────────────────────────────
const SignupScreen = () => {
  const navigation = useNavigation<Nav>()

  const [name,                setName]                = useState("")
  const [email,               setEmail]               = useState("")
  const [emailError,          setEmailError]          = useState("")
  const [phone,               setPhone]               = useState("")
  const [phoneError,          setPhoneError]          = useState("")
  const [selectedCountry,     setSelectedCountry]     = useState(COUNTRY_CODES[2])
  const [showCountryPicker,   setShowCountryPicker]   = useState(false)
  const [countrySearch,       setCountrySearch]       = useState("")
  const [password,            setPassword]            = useState("")
  const [confirmPassword,     setConfirmPassword]     = useState("")
  const [showPassword,        setShowPassword]        = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading,             setLoading]             = useState(false)

  // Entrance anims
  const logoAnim  = useRef(new Animated.Value(0)).current
  const logoScale = useRef(new Animated.Value(0.8)).current
  const titleAnim = useRef(new Animated.Value(0)).current
  const titleSlide= useRef(new Animated.Value(14)).current
  const formAnim  = useRef(new Animated.Value(0)).current
  const glowAnim  = useRef(new Animated.Value(0)).current

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
      Animated.spring(formAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start()
  }, [])

  // ── Validation ──
  const passwordChecks = {
    length:       password.length >= 8 && password.length <= 15,
    uppercase:    /[A-Z]/.test(password),
    special:      /[^A-Za-z0-9]/.test(password),
    alphanumeric: /[A-Za-z]/.test(password) && /\d/.test(password),
  }
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch  = password !== "" && password === confirmPassword

  const validateEmail = (v: string) => {
    if (!v.trim()) return "Email is required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Please enter a valid email"
    return ""
  }
  const validatePhone = (v: string) => {
    const d = v.replace(/\D/g, "")
    if (!d) return "Phone number is required"
    if (d.length < selectedCountry.minDigits) return `Min ${selectedCountry.minDigits} digits for ${selectedCountry.country}`
    if (d.length > selectedCountry.maxDigits) return `Max ${selectedCountry.maxDigits} digits for ${selectedCountry.country}`
    return ""
  }

  const handlePhoneChange = (v: string) => {
    const d = v.replace(/\D/g, "")
    setPhone(d)
    setPhoneError(d ? validatePhone(d) : "")
  }

  const filteredCountries = COUNTRY_CODES.filter(
    (c) => c.country.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.includes(countrySearch)
  )

  const handleSignup = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const emailErr = validateEmail(email)
    const phoneErr = validatePhone(phone)
    setEmailError(emailErr); setPhoneError(phoneErr)

    if (!name.trim())    { Alert.alert("Error", "Please enter your full name"); return }
    if (emailErr)        { Alert.alert("Error", emailErr); return }
    if (phoneErr)        { Alert.alert("Error", phoneErr); return }
    if (!isPasswordValid){ Alert.alert("Error", "Password must be 8–15 chars, include uppercase, number and special character."); return }
    if (password !== confirmPassword) { Alert.alert("Error", "Passwords do not match"); return }

    setLoading(true)
    try {
      const fullPhone = `${selectedCountry.code}${phone}`
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { full_name: name.trim(), phone: fullPhone } },
      })
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already") || error.status === 422) {
          Alert.alert("Account Exists", "An account with this email already exists.", [
            { text: "Sign In", onPress: () => navigation.navigate("Login") },
            { text: "Cancel", style: "cancel" },
          ])
        } else {
          Alert.alert("Signup Failed", error.message)
        }
        return
      }
      if (data.user?.identities?.length === 0) {
        Alert.alert("Account Exists", "An account with this email already exists.", [
          { text: "Sign In", onPress: () => navigation.navigate("Login") },
          { text: "Cancel", style: "cancel" },
        ])
        return
      }
      if (data.user) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert("Verify your email", "Check your inbox for a verification code.", [
          { text: "OK", onPress: () => navigation.navigate("OTP", {
            email: email.trim().toLowerCase(),
            userData: { name: name.trim(), phone: fullPhone },
          })},
        ])
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const closeCountryPicker = () => { Keyboard.dismiss(); setShowCountryPicker(false); setCountrySearch("") }

  return (
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
            showsVerticalScrollIndicator={false}
          >

            {/* ── Logo ── */}
            <Animated.View style={[s.logoArea, {
              opacity: logoAnim,
              transform: [{ scale: logoScale }],
            }]}>
              <Animated.View style={[s.halo, {
                opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.2, 0.5] }),
              }]} />
              <LinearGradient
                colors={["#4F46E5", "#7C3AED", "#9333EA"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.logoCircle}
              >
                <Image source={require("../../../../assets/images/auth.png")} style={s.logoImg} resizeMode="contain" />
              </LinearGradient>
            </Animated.View>

            {/* ── Title ── */}
            <Animated.View style={{
              opacity: titleAnim,
              transform: [{ translateY: titleSlide }],
              alignItems: "center", marginBottom: 28,
            }}>
              <Text style={s.title}>Create Account</Text>
              <Text style={s.subtitle}>Join the future of AI assistance</Text>
            </Animated.View>

            {/* ── Form ── */}
            <Animated.View style={{
              opacity:   formAnim,
              transform: [{ translateY: formAnim.interpolate({ inputRange: [0,1], outputRange: [20,0] }) }],
            }}>

              {/* Full Name */}
              <Field
                label="FULL NAME" icon="person-outline" iconColor="#818CF8"
                placeholder="Enter your full name" value={name}
                onChangeText={setName} autoCapitalize="words"
              />

              {/* Email */}
              <Field
                label="EMAIL ADDRESS" icon="mail-outline" iconColor="#38BDF8"
                placeholder="Enter your email" value={email}
                onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(validateEmail(v)) }}
                onBlur={() => setEmailError(validateEmail(email))}
                keyboardType="email-address" error={emailError}
              />

              {/* Phone */}
              <View style={{ marginBottom: 18 }}>
                <Text style={f.label}>PHONE NUMBER</Text>
                <View style={s.phoneRow}>
                  {/* Country picker button */}
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCountryPicker(true) }}
                    style={[s.dialBtn, phoneError ? s.dialBtnError : {}]}
                  >
                    <Text style={{ fontSize: 20 }}>{selectedCountry.flag}</Text>
                    <Text style={s.dialCode}>{selectedCountry.code}</Text>
                    <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                  {/* Number input */}
                  <View style={[s.phoneBox, phoneError ? s.phoneBoxError : {}]}>
                    <TextInput
                      style={s.phoneInput}
                      placeholder={`${selectedCountry.minDigits}${selectedCountry.minDigits !== selectedCountry.maxDigits ? `–${selectedCountry.maxDigits}` : ""} digits`}
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={phone}
                      onChangeText={handlePhoneChange}
                      keyboardType="phone-pad"
                      maxLength={selectedCountry.maxDigits}
                    />
                  </View>
                </View>
                {phoneError
                  ? <View style={f.errRow}><Ionicons name="alert-circle-outline" size={13} color="#EF4444" /><Text style={f.errText}>{phoneError}</Text></View>
                  : phone.length > 0
                  ? <Text style={f.hint}>Full: {selectedCountry.code}{phone}</Text>
                  : null
                }
              </View>

              {/* Password */}
              <Field
                label="PASSWORD" icon="lock-closed-outline" iconColor="#A78BFA"
                placeholder="Create a secure password" value={password}
                onChangeText={setPassword} secureTextEntry={!showPassword}
                rightElement={
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                }
              />

              {/* Password requirements */}
              {password.length > 0 && (
                <View style={s.reqBox}>
                  <Text style={s.reqTitle}>Password must include:</Text>
                  <Req label="8–15 characters"       met={passwordChecks.length} />
                  <Req label="1 uppercase letter"     met={passwordChecks.uppercase} />
                  <Req label="Letters and numbers"    met={passwordChecks.alphanumeric} />
                  <Req label="1 special character"    met={passwordChecks.special} />
                </View>
              )}

              {/* Confirm Password */}
              <Field
                label="CONFIRM PASSWORD" icon="shield-checkmark-outline" iconColor="#34D399"
                placeholder="Confirm your password" value={confirmPassword}
                onChangeText={setConfirmPassword} secureTextEntry={!showConfirmPassword}
                rightElement={
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={s.eyeBtn}>
                    <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                }
              />

              {/* Match indicator */}
              {confirmPassword.length > 0 && (
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

              {/* Create Account button */}
              <TouchableOpacity onPress={handleSignup} disabled={loading} activeOpacity={0.87} style={s.btnWrap}>
                <LinearGradient
                  colors={loading ? ["#374151","#4B5563"] : ["#4F46E5","#7C3AED"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.btn}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="person-add-outline" size={20} color="#fff" /><Text style={s.btnText}>Create Account</Text></>
                  }
                </LinearGradient>
              </TouchableOpacity>

              {/* Sign in link */}
              <View style={s.footer}>
                <Text style={s.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("Login") }}>
                  <Text style={s.footerLink}>Sign In</Text>
                </TouchableOpacity>
              </View>

            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Country Picker Modal ── */}
      <Modal visible={showCountryPicker} animationType="slide" transparent onRequestClose={closeCountryPicker}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeCountryPicker} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Select Country</Text>
              <TouchableOpacity onPress={closeCountryPicker} style={s.sheetClose}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={s.searchRow}>
              <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.35)" />
              <TextInput
                style={s.searchInput}
                placeholder="Search country or code…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCorrect={false}
              />
              {countrySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCountrySearch("")}>
                  <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.countCount}>{filteredCountries.length} countries</Text>
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code + item.country}
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selectedCountry.code === item.code && selectedCountry.country === item.country
                return (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setSelectedCountry(item); setPhone(""); setPhoneError("")
                      setShowCountryPicker(false); setCountrySearch("")
                    }}
                    style={[s.countryRow, isSelected && s.countryRowSelected]}
                  >
                    <Text style={{ fontSize: 22, width: 32 }}>{item.flag}</Text>
                    <Text style={[s.countryName, isSelected && { color: "#818CF8" }]}>{item.country}</Text>
                    <Text style={s.countryCode}>{item.code}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={18} color="#818CF8" />}
                  </TouchableOpacity>
                )
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0c29" },
  safe:      { flex: 1 },
  scroll:    { paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40 },

  blob: { position: "absolute", borderRadius: 999 },
  blob1: { width: 280, height: 280, top: -60,  left: -80,  backgroundColor: "rgba(79,70,229,0.13)" },
  blob2: { width: 220, height: 220, bottom: 60, right: -60, backgroundColor: "rgba(124,58,237,0.1)"  },

  logoArea:  { alignItems: "center", justifyContent: "center", marginBottom: 20 },
  halo: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    backgroundColor: "#4F46E5",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:0}, shadowOpacity: 1, shadowRadius: 40,
  },
  logoCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#4F46E5", shadowOffset: {width:0,height:6}, shadowOpacity: 0.5, shadowRadius: 18, elevation: 12,
  },
  logoImg:  { width: 96, height: 96, borderRadius: 48 },
  title:    { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: 0.3, marginBottom: 6 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4 },

  // Phone
  phoneRow: { flexDirection: "row", gap: 10 },
  dialBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12, height: 50,
  },
  dialBtnError: { borderColor: "#EF4444" },
  dialCode: { fontSize: 14, fontWeight: "700", color: "#fff" },
  phoneBox: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14, justifyContent: "center", height: 50,
  },
  phoneBoxError: { borderColor: "#EF4444" },
  phoneInput:    { fontSize: 15, color: "#fff" },

  // Eye button
  eyeBtn: { width: 44, height: 50, alignItems: "center", justifyContent: "center" },

  // Password requirements
  reqBox:   { marginBottom: 18, padding: 14, backgroundColor: "rgba(129,140,248,0.07)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(129,140,248,0.15)" },
  reqTitle: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },

  // Match
  matchRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 18 },
  matchText: { fontSize: 13, fontWeight: "600" },

  // Button
  btnWrap: { borderRadius: 16, overflow: "hidden", marginBottom: 20, marginTop: 4 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 17,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },

  // Footer
  footer:     { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14, color: "rgba(255,255,255,0.42)" },
  footerLink: { fontSize: 14, color: "#818CF8", fontWeight: "700" },

  // Country sheet
  sheet: {
    backgroundColor: "#1a1040", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: "62%", paddingBottom: Platform.OS === "ios" ? 8 : 16,
    borderTopWidth: 1, borderColor: "rgba(129,140,248,0.2)",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  sheetTitle:  { fontSize: 17, fontWeight: "700", color: "#fff" },
  sheetClose:  { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput:  { flex: 1, fontSize: 15, color: "#fff" },
  countCount:   { fontSize: 11, color: "rgba(255,255,255,0.25)", paddingHorizontal: 20, marginBottom: 4 },
  countryRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  countryRowSelected: { backgroundColor: "rgba(129,140,248,0.1)" },
  countryName: { flex: 1, fontSize: 15, fontWeight: "500", color: "#fff" },
  countryCode: { fontSize: 14, color: "rgba(255,255,255,0.45)", fontWeight: "600" },
})

export default SignupScreen