"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import type { User } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ── Restore persisted session from AsyncStorage on cold start ────────────
    // With AsyncStorage configured in supabase.ts, getSession() reads the saved
    // token from device storage. If the JWT is expired it silently refreshes it.
    // This is what keeps the user logged in across app restarts/kills.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // ── Listen for all future auth state changes ──────────────────────────────
    // Fires on: login, logout, token refresh, password change, account deletion.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] State changed:", event, session?.user?.email)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    try {
      console.log("[Auth] Starting signOut")
      setUser(null)
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("[Auth] Error signing out:", error)
        throw error
      }
      console.log("[Auth] SignOut completed")
    } catch (error) {
      console.error("[Auth] SignOut failed:", error)
      // Keep user as null even if Supabase signOut fails — show login screen
      setUser(null)
      throw error
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}