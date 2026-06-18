"use client"

import { useState, useEffect, useRef } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet,
   ScrollView, Alert, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform, Animated,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as Haptics from "expo-haptics"
import { LinearGradient } from "expo-linear-gradient"
import { useTheme } from "../../../../components/context/ThemeContext"
import { useAuth } from "../../../../hooks/useAuth"
import { supabase } from "../../../../services/supabase"
import Header from "../../../../components/common/Header"
import { Ionicons } from "@expo/vector-icons"

type SubscriptionTier = "basic" | "standard" | "premium"

interface SubscriptionPlan {
  id: SubscriptionTier
  name: string
  price: string
  amount: number
  period: string
  icon: string
  iconColor: string
  iconBg: string
  iconBgDark: string
  accentColor: string
  features: string[]
  popular?: boolean
}

const PLANS: SubscriptionPlan[] = [
  {
    id: "basic",
    name: "Basic",
    price: "Free",
    period: "forever",
    amount: 0,
    icon: "flash-outline",
    iconColor: "#6B7280",
    iconBg: "#F3F4F6",
    iconBgDark: "#1f2937",
    accentColor: "#6B7280",
    features: [
      "60 AI text messages / day",
      "10 voice messages / day",
      "10 image analyses / day",
      "Task & goal management via chat",
      "Push notifications & reminders",
      "Basic chat history",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    price: "PKR 2,000",
    period: "/ month",
    amount: 700,
    icon: "star-outline",
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    iconBgDark: "#1e3a5f",
    accentColor: "#3B82F6",
    features: [
      "100 AI text messages / day",
      "50 voice messages / day",
      "10 image analyses / day",
      "Voice cloning (reply in your voice)",
      "Chat personalization (tone profiles)",
      "Call reminders via phone",
      "Priority support",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "PKR 5,000",
    period: "/ month",
    amount: 1800,
    icon: "diamond-outline",
    iconColor: "#F59E0B",
    iconBg: "#FFFBEB",
    iconBgDark: "#3b2500",
    accentColor: "#F59E0B",
    features: [
      "Unlimited text messages",
      "Unlimited voice messages",
      "Unlimited image analyses",
      "All Standard features",
      "24/7 premium support",
      "Early access to beta features",
    ],
    popular: true,
  },
]

// ─── Plan card ─────────────────────────────────────────────────────────────────

const PlanCard = ({
  plan, isSelected, isCurrent, isDark, colors, onPress, anim,
}: {
  plan: SubscriptionPlan; isSelected: boolean; isCurrent: boolean
  isDark: boolean; colors: any; onPress: () => void; anim: Animated.Value
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 50 }),
    ]).start()
    onPress()
  }

  const borderColor = isCurrent ? "#10B981" : isSelected ? plan.accentColor : colors.border
  const borderWidth = isCurrent || isSelected ? 2 : 1

  return (
    <Animated.View style={{
      opacity:   anim,
      transform: [
        { translateY: anim.interpolate({ inputRange: [0,1], outputRange: [20,0] }) },
        { scale: scaleAnim },
      ],
    }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.9}>
        <View style={[
          cs.card,
          {
            backgroundColor: isDark ? colors.backgroundSecondary : "#fff",
            borderColor, borderWidth,
          },
          isSelected && !isCurrent && { backgroundColor: isDark ? colors.backgroundTertiary : plan.accentColor + "08" },
          isCurrent && { backgroundColor: isDark ? "#0a2218" : "#F0FDF4" },
        ]}>

          {/* Top badge */}
          {isCurrent && (
            <View style={[cs.badge, { backgroundColor: "#10B981" }]}>
              <Ionicons name="checkmark-circle" size={11} color="#fff" />
              <Text style={cs.badgeText}>Current Plan</Text>
            </View>
          )}
          {!isCurrent && plan.popular && (
            <LinearGradient colors={["#F59E0B","#D97706"]} start={{x:0,y:0}} end={{x:1,y:0}} style={cs.badge}>
              <Ionicons name="star" size={11} color="#fff" />
              <Text style={cs.badgeText}>Most Popular</Text>
            </LinearGradient>
          )}

          {/* Header row */}
          <View style={cs.cardHeader}>
            <View style={[cs.iconWrap, { backgroundColor: isDark ? plan.iconBgDark : plan.iconBg }]}>
              <Ionicons name={plan.icon as any} size={22} color={plan.iconColor} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[cs.planName, { color: colors.text }]}>{plan.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                <Text style={[cs.planPrice, { color: isCurrent ? "#10B981" : plan.accentColor }]}>
                  {plan.price}
                </Text>
                {plan.period !== "forever" && (
                  <Text style={[cs.planPeriod, { color: colors.textSecondary }]}>{plan.period}</Text>
                )}
                {plan.period === "forever" && (
                  <Text style={[cs.planPeriod, { color: "#10B981" }]}>forever</Text>
                )}
              </View>
            </View>
            {/* Selection indicator */}
            <View style={[
              cs.radio,
              {
                borderColor: isCurrent ? "#10B981" : isSelected ? plan.accentColor : colors.border,
                backgroundColor: (isCurrent || isSelected)
                  ? (isCurrent ? "#10B981" : plan.accentColor)
                  : "transparent",
              },
            ]}>
              {(isCurrent || isSelected) && (
                <Ionicons name="checkmark" size={13} color="#fff" />
              )}
            </View>
          </View>

          {/* Feature list */}
          <View style={cs.features}>
            {plan.features.map((f, i) => (
              <View key={i} style={cs.featureRow}>
                <View style={[cs.featureDot, {
                  backgroundColor: isCurrent ? "#10B981" : isSelected ? plan.accentColor : colors.border,
                }]} />
                <Text style={[cs.featureText, { color: isSelected || isCurrent ? colors.text : colors.textSecondary }]}>
                  {f}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const cs = StyleSheet.create({
  card: {
    borderRadius: 18, padding: 18, position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  badge: {
    position: "absolute", top: -1, right: 18,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  badgeText:    { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardHeader:   { flexDirection: "row", alignItems: "center", marginBottom: 16, marginTop: 10 },
  iconWrap:     { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planName:     { fontSize: 18, fontWeight: "800", letterSpacing: 0.1 },
  planPrice:    { fontSize: 20, fontWeight: "800" },
  planPeriod:   { fontSize: 13 },
  radio: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  features:     { gap: 8 },
  featureRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  featureDot:   { width: 6, height: 6, borderRadius: 3 },
  featureText:  { fontSize: 14, flex: 1, lineHeight: 20 },
})

// ─── Main screen ───────────────────────────────────────────────────────────────

const SubscriptionScreen = () => {
  const { colors, activeTheme } = useTheme()
  const { user }    = useAuth()
  const isDark      = activeTheme === "dark"
  const ACCENT      = isDark ? "#818CF8" : "#4F46E5"

  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>("basic")
  const [currentTier,  setCurrentTier]  = useState<SubscriptionTier>("basic")
  const [loadingTier,  setLoadingTier]  = useState(true)
  const [loading,      setLoading]      = useState(false)
  const [showPayment,  setShowPayment]  = useState(false)

  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCVC,    setCardCVC]    = useState("")
  const [cardName,   setCardName]   = useState("")
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})

  // Entrance anims
  const topAnim   = useRef(new Animated.Value(0)).current
  const cardAnims = useRef(PLANS.map(() => new Animated.Value(0))).current
  const btnAnim   = useRef(new Animated.Value(0)).current

  useEffect(() => { if (user) loadCurrentTier() }, [user])

  const runEntrance = () => {
    Animated.stagger(90, [
      Animated.spring(topAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      ...cardAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 })),
      Animated.spring(btnAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
    ]).start()
  }

  const loadCurrentTier = async () => {
    if (!user?.id) return
    try {
      setLoadingTier(true)
      const { data, error } = await supabase.from("profiles")
        .select("subscription_tier").eq("id", user.id).maybeSingle()
      if (!error && data?.subscription_tier) {
        const tier = data.subscription_tier as SubscriptionTier
        setCurrentTier(tier); setSelectedTier(tier)
      }
    } catch (e) {
      console.error("Error loading tier:", e)
    } finally {
      setLoadingTier(false)
      runEntrance()
    }
  }

  const updateDB = async (tier: SubscriptionTier) => {
    if (!user?.id) return
    const { error } = await supabase.from("profiles")
      .update({ subscription_tier: tier }).eq("id", user.id)
    if (!error) setCurrentTier(tier)
  }

  const formatCardNumber = (t: string) => {
    const c = t.replace(/\D/g, "")
    return (c.match(/.{1,4}/g) || []).join(" ").substr(0, 19)
  }
  const formatExpiry = (t: string) => {
    const c = t.replace(/\D/g, "")
    return c.length >= 2 ? c.substr(0,2) + "/" + c.substr(2,2) : c
  }

  const validateCard = () => {
    const errors: Record<string,string> = {}
    const raw = cardNumber.replace(/\s/g, "")
    if (!cardName.trim())       errors.cardName   = "Name is required"
    if (raw.length !== 16)      errors.cardNumber = "Invalid card number"
    if (cardExpiry.length !== 5) errors.cardExpiry = "Invalid expiry"
    if (cardCVC.length < 3)     errors.cardCVC    = "Invalid CVC"
    if (cardExpiry.length === 5) {
      const [m, y] = cardExpiry.split("/")
      const now = new Date()
      const em = parseInt(m), ey = parseInt("20"+y)
      if (em<1||em>12||ey<now.getFullYear()||(ey===now.getFullYear()&&em<now.getMonth()+1))
        errors.cardExpiry = "Card has expired"
    }
    setCardErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubscribe = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (selectedTier === currentTier) {
      Alert.alert("Already Subscribed", `You're already on the ${PLANS.find(p=>p.id===currentTier)?.name} plan.`)
      return
    }
    if (selectedTier === "basic") {
      Alert.alert("Downgrade to Basic", "Are you sure you want to downgrade?", [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: async () => {
          await updateDB("basic")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          Alert.alert("Done", "You are now on the Basic plan.")
        }},
      ])
      return
    }
    setCardNumber(""); setCardExpiry(""); setCardCVC(""); setCardName(""); setCardErrors({})
    setShowPayment(true)
  }

  const handlePayment = async () => {
    if (!validateCard()) return
    setLoading(true)
    try {
      const plan = PLANS.find(p => p.id === selectedTier)!
      const { data: sd } = await supabase.auth.getSession()
      const token = sd?.session?.access_token
      const res   = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL}/create-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
          },
          body: JSON.stringify({ amount: plan.amount, tier: selectedTier }),
        }
      )
      const result = JSON.parse(await res.text())
      if (result.error) { Alert.alert("Payment Failed", result.error); return }
      if (result.status === "succeeded" || result.status === "requires_capture") {
        await updateDB(selectedTier)
        setShowPayment(false)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert("🎉 Payment Successful!", `You are now on the ${plan.name} plan!`)
      } else {
        Alert.alert("Payment Failed", `Status: ${result.status}. Please try again.`)
      }
    } catch {
      Alert.alert("Error", "Payment failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const selectedPlan = PLANS.find(p => p.id === selectedTier)!
  const currentPlan  = PLANS.find(p => p.id === currentTier)!

  const btnLabel = selectedTier === currentTier
    ? `✓  ${currentPlan.name} — Current Plan`
    : selectedTier === "basic"
    ? "Downgrade to Basic"
    : `Subscribe to ${selectedPlan.name} · ${selectedPlan.price}`

  const btnColors: [string,string] = selectedTier === currentTier
    ? ["#10B981","#059669"]
    : selectedTier === "standard"
    ? ["#1d4ed8","#3B82F6"]
    : ["#b45309","#F59E0B"]

  // ── Loading ──
  if (loadingTier) {
    return (
      <SafeAreaView 
      edges={["left", "right", "bottom"]}
      style={[s.container, { backgroundColor: colors.background }]}>
        <Header title="Subscription" />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading plans…</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView 
    edges={["left", "right", "bottom"]}
    style={[s.container, { backgroundColor: colors.background }]}>
      <Header title="Subscription" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Top summary strip ── */}
        <Animated.View style={{
          opacity:   topAnim,
          transform: [{ translateY: topAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
        }}>
          <View style={[s.topStrip, { backgroundColor: isDark ? colors.backgroundSecondary : "#fff", borderColor: colors.border }]}>
            <View style={s.topLeft}>
              <View style={[s.topIconBg, { backgroundColor: isDark ? currentPlan.iconBgDark : currentPlan.iconBg }]}>
                <Ionicons name={currentPlan.icon as any} size={20} color={currentPlan.iconColor} />
              </View>
              <View>
                <Text style={[s.topLabel, { color: colors.textSecondary }]}>ACTIVE PLAN</Text>
                <Text style={[s.topPlan, { color: colors.text }]}>{currentPlan.name}</Text>
              </View>
            </View>
            <View style={[s.activePill, { backgroundColor: "#10B98120", borderColor: "#10B98140" }]}>
              <View style={s.activeDot} />
              <Text style={s.activePillText}>Active</Text>
            </View>
          </View>

          <Text style={[s.chooseLine, { color: colors.textSecondary }]}>
            Choose the plan that's right for you
          </Text>
        </Animated.View>

        {/* ── Plan cards ── */}
        {PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isSelected={selectedTier === plan.id}
            isCurrent={currentTier === plan.id}
            isDark={isDark}
            colors={colors}
            anim={cardAnims[i]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setSelectedTier(plan.id)
            }}
          />
        ))}

        {/* ── Subscribe button ── */}
        <Animated.View style={{
          opacity:   btnAnim,
          transform: [{ translateY: btnAnim.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }],
        }}>
          <TouchableOpacity onPress={handleSubscribe} activeOpacity={0.85} style={s.subBtnWrap}>
            <LinearGradient colors={btnColors} start={{x:0,y:0}} end={{x:1,y:0}} style={s.subBtn}>
              <Ionicons
                name={selectedTier === currentTier ? "checkmark-circle-outline" : "card-outline"}
                size={20} color="#fff"
              />
              <Text style={s.subBtnText}>{btnLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secure note */}
          <View style={s.secureRow}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={[s.secureText, { color: colors.textMuted }]}>Payments secured by Stripe</Text>
          </View>
        </Animated.View>

      </ScrollView>

      {/* ── Payment Modal ── */}
      <Modal visible={showPayment} transparent animationType="slide" onRequestClose={() => setShowPayment(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => !loading && setShowPayment(false)} />
          <View style={[s.sheet, { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }]}>

            {/* Handle */}
            <View style={[s.handle, { backgroundColor: isDark ? "#3A3A3C" : "#C7C7CC" }]} />

            {/* Sheet header */}
            <View style={s.sheetHeader}>
              <TouchableOpacity onPress={() => !loading && setShowPayment(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={isDark ? "#fff" : "#000"} />
              </TouchableOpacity>
              <Text style={[s.sheetTitle, { color: isDark ? "#fff" : "#000" }]}>Payment Details</Text>
              <View style={[s.stripePill, { backgroundColor: "#6772E518" }]}>
                <Ionicons name="lock-closed" size={11} color="#6772E5" />
                <Text style={s.stripeText}>Stripe</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>

              {/* Order summary */}
              <LinearGradient
                colors={isDark ? ["#0f0c29","#302b63"] : ["#667eea","#764ba2"]}
                start={{x:0,y:0}} end={{x:1,y:1}}
                style={s.orderCard}
              >
                <Text style={s.orderLabel}>ORDER SUMMARY</Text>
                <Text style={s.orderPlanName}>{selectedPlan.name} Plan</Text>
                <Text style={s.orderPrice}>{selectedPlan.price}<Text style={s.orderPeriod}> {selectedPlan.period}</Text></Text>
              </LinearGradient>

              {/* Card fields */}
              <CardField
                label="Cardholder Name" icon="person-outline"
                placeholder="John Doe" value={cardName}
                onChangeText={setCardName}
                error={cardErrors.cardName}
                isDark={isDark} colors={colors}
              />
              <CardField
                label="Card Number" icon="card-outline"
                placeholder="4242 4242 4242 4242" value={cardNumber}
                onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                error={cardErrors.cardNumber}
                keyboardType="numeric" maxLength={19}
                isDark={isDark} colors={colors}
                suffix={
                  cardNumber.length > 0
                    ? <Text style={s.cardType}>{cardNumber.startsWith("4") ? "VISA" : cardNumber.startsWith("5") ? "MC" : ""}</Text>
                    : undefined
                }
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <CardField
                    label="Expiry" icon="calendar-outline"
                    placeholder="MM/YY" value={cardExpiry}
                    onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                    error={cardErrors.cardExpiry}
                    keyboardType="numeric" maxLength={5}
                    isDark={isDark} colors={colors}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CardField
                    label="CVC" icon="lock-closed-outline"
                    placeholder="123" value={cardCVC}
                    onChangeText={(t) => setCardCVC(t.replace(/\D/g,"").substr(0,4))}
                    error={cardErrors.cardCVC}
                    keyboardType="numeric" maxLength={4}
                    secureTextEntry isDark={isDark} colors={colors}
                  />
                </View>
              </View>

              <TouchableOpacity onPress={handlePayment} disabled={loading} activeOpacity={0.85} style={s.payBtnWrap}>
                <LinearGradient
                  colors={loading ? ["#6B7280","#4B5563"] : ["#4F46E5","#7C3AED"]}
                  start={{x:0,y:0}} end={{x:1,y:0}}
                  style={s.payBtn}
                >
                  {loading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="lock-closed" size={18} color="#fff" /><Text style={s.payBtnText}>Pay {selectedPlan.price}</Text></>
                  }
                </LinearGradient>
              </TouchableOpacity>

              <View style={s.secureRow}>
                <Ionicons name="shield-checkmark-outline" size={13} color={isDark ? "#6B7280" : "#94A3B8"} />
                <Text style={[s.secureText, { color: isDark ? "#6B7280" : "#94A3B8" }]}>
                  Your payment is encrypted and secured by Stripe
                </Text>
              </View>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Card field helper ─────────────────────────────────────────────────────────

const CardField = ({
  label, icon, placeholder, value, onChangeText, error,
  keyboardType, maxLength, secureTextEntry, isDark, colors, suffix,
}: {
  label: string; icon: string; placeholder: string
  value: string; onChangeText: (t: string) => void
  error?: string; keyboardType?: any; maxLength?: number
  secureTextEntry?: boolean; isDark: boolean; colors: any
  suffix?: React.ReactNode
}) => (
  <View style={s.fieldGroup}>
    <Text style={[s.fieldLabel, { color: isDark ? "#8E8E93" : "#6B7280" }]}>{label}</Text>
    <View style={[
      s.fieldBox,
      {
        backgroundColor: isDark ? "#2C2C2E" : "#fff",
        borderColor: error ? "#EF4444" : isDark ? "#3A3A3C" : "#E2E8F0",
      },
    ]}>
      <Ionicons name={icon as any} size={17} color={isDark ? "#8E8E93" : "#94A3B8"} style={{ marginRight: 10 }} />
      <TextInput
        style={[s.fieldInput, { color: isDark ? "#fff" : "#0F172A" }]}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "#48484A" : "#CBD5E1"}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
      />
      {suffix}
    </View>
    {error && <Text style={s.fieldError}>{error}</Text>}
  </View>
)

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14 },
  scroll:      { padding: 20, paddingBottom: 44, gap: 14 },

  // Top strip
  topStrip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 16, borderWidth: 1, padding: 14,
    shadowColor: "#000", shadowOffset: { width:0, height:2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
    marginBottom: 10,
  },
  topLeft:      { flexDirection: "row", alignItems: "center", gap: 12 },
  topIconBg:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  topLabel:     { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  topPlan:      { fontSize: 16, fontWeight: "800", marginTop: 1 },
  activePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  activeDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  activePillText: { fontSize: 12, fontWeight: "700", color: "#10B981" },
  chooseLine:     { fontSize: 13, textAlign: "center", marginBottom: 2 },

  // Subscribe button
  subBtnWrap: { borderRadius: 16, overflow: "hidden" },
  subBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 17,
  },
  subBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  secureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10 },
  secureText: { fontSize: 12 },

  // Payment modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34,
    maxHeight: "92%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 2 },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
  },
  closeBtn:   { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  stripePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  stripeText: { fontSize: 12, color: "#6772E5", fontWeight: "700" },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 20, gap: 14 },

  // Order card
  orderCard:   { borderRadius: 16, padding: 20, marginBottom: 4 },
  orderLabel:  { fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  orderPlanName:{ fontSize: 20, fontWeight: "800", color: "#fff" },
  orderPrice:  { fontSize: 26, fontWeight: "800", color: "#fff", marginTop: 2 },
  orderPeriod: { fontSize: 14, color: "rgba(255,255,255,0.7)" },

  // Card fields
  fieldGroup:  { gap: 6 },
  fieldLabel:  { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  fieldBox: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldInput:  { flex: 1, fontSize: 15 },
  fieldError:  { fontSize: 12, color: "#EF4444", marginLeft: 2 },
  cardType: {
    fontSize: 10, fontWeight: "800", color: "#1A1F71",
    backgroundColor: "#E8E8E8", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },

  // Pay button
  payBtnWrap: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  payBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16,
  },
  payBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
})

export default SubscriptionScreen