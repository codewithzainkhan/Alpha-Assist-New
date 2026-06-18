"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { Appearance } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { supabase } from "../../services/supabase"
import { useAuth } from "../../hooks/useAuth"

const THEME_STORAGE_KEY = "@alphaassist_theme_mode"

export type ThemeMode = "light" | "dark" | "system"
export type ActiveTheme = "light" | "dark"

interface ThemeContextType {
  themeMode: ThemeMode
  activeTheme: ActiveTheme
  setThemeMode: (mode: ThemeMode) => Promise<void>
  loadThemeForUser: (userId: string) => Promise<void>
  colors: typeof darkColors | typeof lightColors
  isReady: boolean
  isLoadingExternally: boolean
}

interface ThemeProviderProps {
  children: ReactNode
  forceMode?: ThemeMode
}

// Dark theme colors (current app theme)
const darkColors = {
  background: "#0B0B0F",
  backgroundSecondary: "#12121A",
  backgroundTertiary: "#1A1A2E",
  surface: "#2A2A3E",
  primary: "#4A9EFF",
  primaryDark: "#357ABD",
  secondary: "#6B73FF",
  accent: "#00D4FF",
  text: "#FFFFFF",
  textSecondary: "#8B9DC3",
  textMuted: "#6B7280",
  border: "#2A2A3E",
  error: "#FF4444",
  success: "#4CAF50",
  gradient: ["#0B0B0F", "#12121A", "#1A1A2E"],
  primaryGradient: ["#4A9EFF", "#6B73FF"],
}

// Light theme colors (opposite of dark theme)
const lightColors = {
  background: "#FFFFFF",
  backgroundSecondary: "#F5F5F7",
  backgroundTertiary: "#E8E8ED",
  surface: "#FFFFFF",
  primary: "#4A9EFF",
  primaryDark: "#357ABD",
  secondary: "#6B73FF",
  accent: "#00D4FF",
  text: "#000000",
  textSecondary: "#4A5568",
  textMuted: "#718096",
  border: "#E2E8F0",
  error: "#FF4444",
  success: "#4CAF50",
  gradient: ["#FFFFFF", "#F5F5F7", "#E8E8ED"],
  primaryGradient: ["#4A9EFF", "#6B73FF"],
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children, forceMode }: ThemeProviderProps) {
  const { user } = useAuth()
  const getSystemScheme = (): ActiveTheme => {
    const scheme = Appearance.getColorScheme()
    return scheme === "dark" ? "dark" : "light"
  }
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system")
  const [activeTheme, setActiveTheme] = useState<ActiveTheme>(getSystemScheme())
  const [isReady, setIsReady] = useState<boolean>(false)
  const [isLoadingExternally, setIsLoadingExternally] = useState<boolean>(false)
  const isLoadingExternallyRef = useRef(false)

  // Load from AsyncStorage on first mount so preference is instant (no flicker)
  useEffect(() => {
    if (forceMode) {
      setThemeModeState(forceMode)
      setIsReady(true)
      return
    }
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(stored => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeModeState(stored)
      }
      setIsReady(true)
    }).catch(() => setIsReady(true))
  }, [forceMode])

  useEffect(() => {
    if (forceMode) return
    if (user && !isLoadingExternallyRef.current) {
      loadThemePreference()
    } else if (!user) {
      setIsLoadingExternally(false)
      isLoadingExternallyRef.current = false
    }
  }, [user, forceMode])

  useEffect(() => {
    if (themeMode === "system") {
      setActiveTheme(getSystemScheme())
      const sub = Appearance.addChangeListener(({ colorScheme }) => {
        const next = colorScheme === "dark" ? "dark" : "light"
        setActiveTheme(next)
      })
      return () => sub.remove()
    } else {
      setActiveTheme(themeMode)
    }
  }, [themeMode])

  const loadThemePreference = async () => {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("theme_mode")
        .eq("user_id", user?.id)
        .single()

      if (error) {
        if ((error as any).code === "PGRST116") {
          await supabase.from("user_preferences").upsert(
            {
              user_id: user?.id,
              theme_mode: "system",
            },
            { onConflict: "user_id" },
          )
          setThemeModeState("system")
          return
        }
        console.error("Error loading theme preference:", error)
        setThemeModeState("system")
        return
      }

      if (data?.theme_mode) {
        const mode = data.theme_mode as ThemeMode
        setThemeModeState(mode)
        AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {})
      } else {
        await supabase.from("user_preferences").upsert(
          { user_id: user?.id, theme_mode: "system" },
          { onConflict: "user_id" },
        )
        setThemeModeState("system")
      }
    } catch (error) {
      console.error("Error loading theme preference:", error)
      setThemeModeState("system")
    }
  }

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode)
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {})

    if (user) {
      try {
        const { error } = await supabase.from("user_preferences").upsert(
          { user_id: user.id, theme_mode: mode },
          { onConflict: "user_id" },
        )
        if (error) console.error("Error saving theme preference:", error)
      } catch (error) {
        console.error("Error saving theme preference:", error)
      }
    }
  }

  const loadThemeForUser = async (userId: string) => {
    try {
      isLoadingExternallyRef.current = true
      setIsLoadingExternally(true)
      // Keep isReady as true when loading externally to prevent loading screen
      // The App.tsx will check isLoadingExternally to avoid showing loading screen
      const { data, error } = await supabase
        .from("user_preferences")
        .select("theme_mode")
        .eq("user_id", userId)
        .single()

      if (error) {
        if ((error as any).code === "PGRST116") {
          // No preference found, create default
          await supabase.from("user_preferences").upsert(
            {
              user_id: userId,
              theme_mode: "system",
            },
            { onConflict: "user_id" },
          )
          setThemeModeState("system")
          setIsLoadingExternally(false)
          isLoadingExternallyRef.current = false
          return
        }
        console.error("Error loading theme preference:", error)
        setThemeModeState("system")
        setIsLoadingExternally(false)
        isLoadingExternallyRef.current = false
        return
      }

      if (data?.theme_mode) {
        const mode = data.theme_mode as ThemeMode
        setThemeModeState(mode)
        AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {})
      } else {
        await supabase.from("user_preferences").upsert(
          { user_id: userId, theme_mode: "system" },
          { onConflict: "user_id" },
        )
        setThemeModeState("system")
      }
      setIsLoadingExternally(false)
      isLoadingExternallyRef.current = false
    } catch (error) {
      console.error("Error loading theme preference:", error)
      setThemeModeState("system")
      setIsLoadingExternally(false)
      isLoadingExternallyRef.current = false
    }
  }

  const colors = activeTheme === "light" ? lightColors : darkColors

  return (
    <ThemeContext.Provider value={{ themeMode, activeTheme, setThemeMode, loadThemeForUser, colors, isReady, isLoadingExternally }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
