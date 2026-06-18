"use client"

import { Text, View, Animated, Image, StyleSheet } from "react-native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useRef, useEffect, useState } from "react"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { BlurView } from "expo-blur"
import { useTheme } from "../../components/context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import { supabase } from "../../services/supabase"

// Screens
import DashboardScreen      from "../../screens/main/Dashboard/DashboardScreen"
import PersonalizationScreen from "../../screens/main/PersonalizationScreen"
import AnalyticsScreen      from "../../screens/main/AnalyticsScreen"
import ProfileScreen        from "../../screens/main/Profile/ProfileScreen"

const Tab = createBottomTabNavigator()

// ─── Accent colours per tab (matches hero icon badge colours across the app) ──
const TAB_ACCENTS: Record<string, [string, string]> = {
  Home:        ["#4F46E5", "#818CF8"],
  Personalize: ["#7C3AED", "#A78BFA"],
  Analytics:   ["#0EA5E9", "#38BDF8"],
  Profile:     ["#10B981", "#34D399"],
}

// ─── Generic tab icon ─────────────────────────────────────────────────────────

const TabIcon = ({
  focused,
  iconName,
  iconNameOutline,
  tabName,
}: {
  focused: boolean
  iconName: keyof typeof Ionicons.glyphMap
  iconNameOutline: keyof typeof Ionicons.glyphMap
  tabName: string
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const { activeTheme } = useTheme()
  const isDark  = activeTheme === "dark"
  const [light, dark] = TAB_ACCENTS[tabName] ?? ["#4F46E5", "#818CF8"]
  const accent  = isDark ? dark : light

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.15 : 1,
      useNativeDriver: true,
      speed: 30, bounciness: 10,
    }).start()
  }, [focused])

  return (
    <Animated.View style={[s.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
      {focused && (
        <View style={[s.activePill, { backgroundColor: accent + "22" }]} />
      )}
      <Ionicons
        name={focused ? iconName : iconNameOutline}
        size={22}
        color={focused ? accent : isDark ? "#6B7280" : "#94A3B8"}
      />
    </Animated.View>
  )
}

// ─── Profile tab icon ─────────────────────────────────────────────────────────

const ProfileTabIcon = ({ focused }: { focused: boolean }) => {
  const { user }   = useAuth()
  const { activeTheme } = useTheme()
  const isDark     = activeTheme === "dark"
  const [light, dark] = TAB_ACCENTS["Profile"]
  const accent     = isDark ? dark : light

  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [userName, setUserName]         = useState<string>("")
  const scaleAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.15 : 1,
      useNativeDriver: true, speed: 30, bounciness: 10,
    }).start()
  }, [focused])

  useEffect(() => { if (user) loadProfileImage() }, [user])

  const getGooglePicture = (): string | null =>
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null

  const loadProfileImage = async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()

      const fallback = () => {
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "U")
        setProfileImage(getGooglePicture())
      }

      if (error) { fallback(); return }
      if (data) {
        setUserName(data.full_name || user.user_metadata?.name || user.email || "U")
        if (data.avatar_url) {
          const { data: sd, error: se } = await supabase.storage
            .from("avatars").createSignedUrl(`${user.id}.jpg`, 60*60*24*365)
          setProfileImage(!se && sd ? sd.signedUrl : getGooglePicture())
        } else {
          setProfileImage(getGooglePicture())
        }
      } else {
        await supabase.from("profiles").upsert(
          { id: user.id, full_name: user.user_metadata?.full_name || user.email },
          { onConflict: "id" }
        )
        fallback()
      }
    } catch {
      setUserName(user?.email || "U")
      setProfileImage(getGooglePicture())
    }
  }

  return (
    <Animated.View style={[s.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
      {focused && (
        <View style={[s.activePill, { backgroundColor: accent + "22" }]} />
      )}
      {profileImage ? (
        <Image
          source={{ uri: profileImage }}
          style={[
            s.avatar,
            focused
              ? { borderWidth: 2, borderColor: accent }
              : { borderWidth: 1.5, borderColor: isDark ? "#374151" : "#E2E8F0" },
          ]}
          onError={() => setProfileImage(getGooglePicture())}
        />
      ) : (
        <View style={[
          s.avatarFallback,
          {
            backgroundColor: isDark ? "#1f2937" : "#EEF2FF",
            borderWidth: focused ? 2 : 1.5,
            borderColor: focused ? accent : isDark ? "#374151" : "#E2E8F0",
          },
        ]}>
          <Text style={[s.avatarInitial, { color: focused ? accent : isDark ? "#6B7280" : "#94A3B8" }]}>
            {(userName.charAt(0) || "U").toUpperCase()}
          </Text>
        </View>
      )}
    </Animated.View>
  )
}

// ─── Bottom tabs ──────────────────────────────────────────────────────────────

export default function BottomTabs() {
  const { colors, activeTheme } = useTheme()
  const isDark = activeTheme === "dark"

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isDark ? "rgba(13,12,33,0.92)" : "rgba(255,255,255,0.92)",
          borderTopWidth: 0,
          height: 88,
          paddingBottom: 12,
          paddingTop: 6,
          elevation: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.4 : 0.08,
          shadowRadius: 20,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.4,
          marginTop: 2,
        },
        tabBarActiveTintColor:   isDark ? "#818CF8" : "#4F46E5",
        tabBarInactiveTintColor: isDark ? "#4B5563" : "#94A3B8",
        tabBarBackground: () => (
          <LinearGradient
            colors={isDark
              ? ["rgba(13,12,33,0.97)", "rgba(25,20,60,0.97)"]
              : ["rgba(255,255,255,0.97)", "rgba(248,246,255,0.97)"]
            }
            style={StyleSheet.absoluteFill}
          />
        ),
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} iconName="home" iconNameOutline="home-outline" tabName="Home" />
          ),
        }}
      />
      <Tab.Screen
        name="Personalize"
        component={PersonalizationScreen}
        options={{
          tabBarLabel: "Personalize",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} iconName="sparkles" iconNameOutline="sparkles-outline" tabName="Personalize" />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: "Analytics",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} iconName="stats-chart" iconNameOutline="stats-chart-outline" tabName="Analytics" />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Profile",
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tab.Navigator>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  iconWrap: {
    alignItems: "center", justifyContent: "center",
    width: 44, height: 32,
  },
  activePill: {
    position: "absolute",
    width: 44, height: 28, borderRadius: 14,
  },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
  },
  avatarFallback: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 11, fontWeight: "800" },
})