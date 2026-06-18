"use client"

import type React from "react"
import { Text, StyleSheet, StatusBar, View, Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import { useTheme } from "../../components/context/ThemeContext"

interface HeaderProps {
  title: string
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  const { activeTheme } = useTheme()
  const isDark   = activeTheme === "dark"
  const insets   = useSafeAreaInsets()

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <LinearGradient
        colors={
          isDark
            ? ["rgba(13,12,33,0.97)", "rgba(25,20,60,0.97)"]
            : ["rgba(255,255,255,0.97)", "rgba(248,246,255,0.97)"]
        }
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <Text style={[s.title, { color: isDark ? "#fff" : "#0F172A" }]}>
          {title}
        </Text>
      </LinearGradient>
    </>
  )
}

const s = StyleSheet.create({
  header: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "flex-end",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(129,140,248,0.18)",
    // Shadow matching bottom tab bar
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
})

export default Header