"use client"

import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from "@react-navigation/native"
import { StatusBar } from "expo-status-bar"
import { AuthProvider, useAuth } from "./src/hooks/useAuth"
import { ThemeProvider, useTheme } from "./src/components/context/ThemeContext"
import { AuthNavigator } from "./src/navigation/AuthNavigator"
import { MainNavigator } from "./src/navigation/MainNavigator"
import { useEffect, useRef, useState } from "react"
import { StripeProvider } from "@stripe/stripe-react-native"
import {
  registerForPushNotifications,
  scheduleEngagementNotifications,
  cancelEngagementNotifications,
  scheduleReportNotifications,
  cancelReportNotifications,
} from "./src/services/notifications"
import { generateAndSaveAllReports } from "./src/services/reports"
import * as Notifications from "expo-notifications"
import SplashScreen from "./src/screens/auth/Intro/SplashScreen"

// ── Navigation ref — used to navigate from notification tap handler ─────────
const navigationRef = createNavigationContainerRef<any>()

function AppWithTheme() {
  const { user } = useAuth()
  const isAuthed = !!user
  return (
    <ThemeProvider forceMode={isAuthed ? undefined : "system"}>
      <AppContent />
    </ThemeProvider>
  )
}

function AppContent() {
  const { user, loading } = useAuth()
  const { isReady, activeTheme, isLoadingExternally } = useTheme()
  const wasAuthenticated = useRef(false)
  const isLogout         = useRef(false)
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener     = useRef<Notifications.EventSubscription | null>(null)
  const [showSplash, setShowSplash] = useState(true)

  // ── Always show splash for at least 2s on every cold start ───────────────
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2000)
    return () => clearTimeout(t)
  }, [])

  if (user) {
    wasAuthenticated.current = true
    isLogout.current = false
  } else if (wasAuthenticated.current && !user && !loading) {
    if (!isLogout.current) isLogout.current = true
  }

  useEffect(() => {
    if (!user && isLogout.current) {
      const t = setTimeout(() => (isLogout.current = false), 100)
      return () => clearTimeout(t)
    }
  }, [user])

  // ── Generate & save reports on every login ───────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    generateAndSaveAllReports(user.id)
  }, [user?.id])

  // ── Notification setup ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      cancelEngagementNotifications()
      cancelReportNotifications()
      return
    }

    // 1. Permission + push token
    registerForPushNotifications().then(async (token) => {
      try {
        const { supabase } = await import("./src/services/supabase")
        // Detect user's local timezone (e.g. "Asia/Karachi")
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const updates: Record<string, string> = { timezone }
        if (token) {
          console.log("[App] Push token:", token)
          updates.push_token = token
        }
        // Save push token + timezone to profiles so cron Edge Function can
        // generate reports at the user's local midnight and send notifications
        await supabase.from("profiles").update(updates).eq("id", user.id)
      } catch (e) {
        console.warn("[App] Failed to save push token / timezone:", e)
      }
    })

    // 2. Engagement notifications (every 2 hrs)
    // resetEngagementSchedule().then(() => scheduleEngagementNotifications())
    scheduleEngagementNotifications()
    scheduleReportNotifications()

    // 3. Foreground notification listener
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("[App] Foreground notification:", notification.request.content.title)
      }
    )

    // 4. Tap handler — app was backgrounded/killed, user tapped notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>
        console.log("[App] Notification tapped:", data)

// ── Report notification tapped — navigate to ReportScreen ─────────
        if (data?.type === "report_daily" || data?.type === "report_weekly" || data?.type === "report_monthly") {
          const period = data.period ?? (
            data.type === "report_daily"   ? "daily"   :
            data.type === "report_weekly"  ? "weekly"  : "monthly"
          )
          if (navigationRef.isReady()) {
            navigationRef.navigate("Report", { period })
          }
        }
      }
    )

    return () => {
      if (notificationListener.current) notificationListener.current.remove()
      if (responseListener.current)     responseListener.current.remove()
    }
  }, [user])
  // ─────────────────────────────────────────────────────────────────────────

  // ── Always show splash on cold start, wait for session + min 2s ─────────
  if (showSplash || loading || (user && !isReady && !isLoadingExternally)) {
    return <SplashScreen standalone={true} />
  }

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        key={user ? "auth" : "unauth"}
        theme={activeTheme === "dark" ? DarkTheme : DefaultTheme}
      >
        {/* Force status bar icons to match app theme regardless of system theme */}
        <StatusBar
          style={activeTheme === "dark" ? "light" : "dark"}
          backgroundColor={activeTheme === "dark" ? "#0f0f1a" : "#ffffff"}
          translucent={false}
        />
        {user ? <MainNavigator /> : <AuthNavigator />}
      </NavigationContainer>

    </>
  )
}

export default function App() {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
      <AuthProvider>
        <AppWithTheme />
      </AuthProvider>
    </StripeProvider>
  )
}

// styles removed — splash is now handled by SplashScreen component