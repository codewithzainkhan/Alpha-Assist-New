"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Keyboard,
  Animated,
  Alert,
  Image,
  ScrollView,
  InteractionManager,
  Pressable,
  Modal,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"
import { Audio } from "expo-av"
import { useTheme } from "../../../components/context/ThemeContext"
import * as Haptics from "expo-haptics"
import { useAuth } from "../../../hooks/useAuth"
import { useRoute, type RouteProp } from "@react-navigation/native"
import type { MainStackParamList } from "../../../types/navigation"
import { apiPostForm, apiGet, apiPost, apiDelete, BASE_URL } from "../../../services/api"
import { supabase } from "../../../services/supabase"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { scheduleTaskNotifications } from "../../../services/notifications"

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT       = "#4F46E5"
const ACCENT_DARK  = "#60A5FA"
const ACCENT_LIGHT = "#818CF8"
const GREEN        = "#10B981"

// ─── Types ────────────────────────────────────────────────────────────────────
type ChatMode = "text" | "voice" | "image"

type Message = {
  id:       string
  text:     string
  isBot:    boolean
  time:     string
  mode?:    ChatMode
  images?:  string[] | null
  audioUri?: string | null
}

type Conversation = {
  id:       string
  title:    string
  preview:  string
  time:     string
  messages: Message[]
}

// Module-level state — survives component unmount/remount (stack navigation)
let _isNewChatSession = false
let _currentConversationId: string | null = null
let _historyLoaded = false
let _cachedConversations: Conversation[] = []
let _cachedMessages: Message[] | null = null
let _cachedActiveConvoId: string | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

const relativeDay = (isoDate: string) => {
  const today     = new Date().toLocaleDateString("en-CA")
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA")
  if (isoDate === today)     return "Today"
  if (isoDate === yesterday) return "Yesterday"
  return new Date(isoDate).toLocaleDateString([], { month: "short", day: "numeric" })
}

const formatDuration = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`

const guessMime = (uri: string, fallback: string) => {
  const l = uri.toLowerCase()
  if (l.endsWith(".png"))  return "image/png"
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg"
  if (l.endsWith(".m4a"))  return "audio/m4a"
  if (l.endsWith(".mp3"))  return "audio/mpeg"
  if (l.endsWith(".webm")) return "audio/webm"
  return fallback
}

// ─── Audio Player component ───────────────────────────────────────────────────
const AudioPlayer: React.FC<{ uri: string; isDark: boolean; isBot: boolean }> = ({ uri, isDark, isBot }) => {
  const soundRef   = useRef<Audio.Sound | null>(null)
  const [playing,  setPlaying]  = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)

  useEffect(() => {
    Audio.Sound.createAsync({ uri }, { shouldPlay: false })
      .then(({ sound }) => {
        soundRef.current = sound
        sound.getStatusAsync().then((s: any) => {
          if (s?.isLoaded && s.durationMillis) setDuration(s.durationMillis)
        })
      }).catch(() => {})
    return () => { soundRef.current?.unloadAsync().catch(() => {}) }
  }, [uri])

  const onStatus = (s: any) => {
    if (!s?.isLoaded) return
    if (s.durationMillis) setDuration(s.durationMillis)
    setPosition(s.positionMillis ?? 0)
    setPlaying(s.isPlaying ?? false)
    if (s.didJustFinish) { setPlaying(false); setPosition(s.durationMillis ?? 0) }
  }

  const toggle = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri })
        soundRef.current = sound
        sound.setOnPlaybackStatusUpdate(onStatus)
        await sound.playAsync()
        return
      }
      const s: any = await soundRef.current.getStatusAsync()
      if (!s?.isLoaded) {
        await soundRef.current.unloadAsync()
        const { sound } = await Audio.Sound.createAsync({ uri })
        soundRef.current = sound
        sound.setOnPlaybackStatusUpdate(onStatus)
        await sound.playAsync()
        return
      }
      const atEnd = (s.positionMillis ?? 0) >= (s.durationMillis ?? 0) - 200
      if (s.isPlaying) {
        await soundRef.current.pauseAsync()
      } else {
        if (atEnd) await soundRef.current.setPositionAsync(0)
        soundRef.current.setOnPlaybackStatusUpdate(onStatus)
        await soundRef.current.playAsync()
      }
    } catch {}
  }

  const progress  = duration > 0 ? Math.min(1, position / duration) : 0
  const accentCol = isBot ? (isDark ? ACCENT_LIGHT : ACCENT) : "#fff"
  const trackCol  = isBot
    ? (isDark ? "rgba(99,102,241,0.2)" : "rgba(79,70,229,0.12)")
    : "rgba(255,255,255,0.25)"
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 190 }}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.8}
        style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: isBot
            ? (isDark ? "rgba(99,102,241,0.2)" : "rgba(79,70,229,0.1)")
            : "rgba(255,255,255,0.2)",
          alignItems: "center", justifyContent: "center",
        }}>
        <Ionicons name={playing ? "pause" : "play"} size={15} color={accentCol} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: trackCol, overflow: "hidden", marginBottom: 5 }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: accentCol, borderRadius: 2 }} />
        </View>
        <Text style={{ fontSize: 11, color: isBot
          ? (isDark ? "rgba(165,180,252,0.6)" : "rgba(79,70,229,0.5)")
          : "rgba(255,255,255,0.65)" }}>
          {fmt(position)}{duration ? ` / ${fmt(duration)}` : ""}
        </Text>
      </View>
    </View>
  )
}

// ─── Typing dots ──────────────────────────────────────────────────────────────
const TypingDots: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current]
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 150),
        Animated.timing(d, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0,  duration: 300, useNativeDriver: true }),
      ]))
    )
    anims.forEach(a => a.start())
    return () => anims.forEach(a => a.stop())
  }, [])
  const dotColor = isDark ? "rgba(165,180,252,0.7)" : "rgba(79,70,229,0.5)"
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 3, alignSelf: "flex-start" }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8, marginTop: 4, overflow: "hidden" }}>
        <Image
          source={require("../../../../assets/images/splash.png")}
          style={{ width: 32, height: 32, borderRadius: 16 }}
          resizeMode="cover"
        />
      </View>
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 12, paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      }}>
        {dots.map((d, i) => (
          <Animated.View key={i} style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: dotColor, marginHorizontal: 2.5,
            transform: [{ translateY: d }],
          }} />
        ))}
      </View>
    </View>
  )
}

// ─── Mode tab pill ────────────────────────────────────────────────────────────
const ModeTab: React.FC<{
  mode: ChatMode; label: string; icon: string
  active: boolean; isDark: boolean; onPress: () => void
}> = ({ mode, label, icon, active, isDark, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.75}
    style={{
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 13, paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: active
        ? (isDark ? "rgba(99,102,241,0.25)" : "rgba(79,70,229,0.12)")
        : "transparent",
      borderWidth: active ? 1 : 0,
      borderColor: isDark ? "rgba(99,102,241,0.35)" : "rgba(79,70,229,0.25)",
    }}>
    <Ionicons name={icon as any} size={13} color={active ? (isDark ? ACCENT_LIGHT : ACCENT) : (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)")} />
    <Text style={{
      fontSize: 12, fontWeight: "600",
      color: active ? (isDark ? ACCENT_LIGHT : ACCENT) : (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"),
    }}>{label}</Text>
  </TouchableOpacity>
)

// ─── Suggestion chip ──────────────────────────────────────────────────────────
const SuggestionChip: React.FC<{ label: string; icon: string; onPress: () => void; isDark: boolean }> = ({ label, icon, onPress, isDark }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.75}
    style={{
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 13, paddingVertical: 8,
      backgroundColor: isDark ? "rgba(99,102,241,0.1)" : "rgba(79,70,229,0.07)",
      borderRadius: 20, borderWidth: 1,
      borderColor: isDark ? "rgba(99,102,241,0.25)" : "rgba(79,70,229,0.18)",
      marginRight: 8,
    }}>
    <Ionicons name={icon as any} size={13} color={isDark ? ACCENT_LIGHT : ACCENT} />
    <Text style={{ fontSize: 12, fontWeight: "600", color: isDark ? ACCENT_LIGHT : ACCENT }}>{label}</Text>
  </TouchableOpacity>
)

// ─── Main Screen ──────────────────────────────────────────────────────────────
const AiChatScreen: React.FC = () => {
  const { colors, activeTheme } = useTheme()
  const isDark = activeTheme === "dark"
  const accent = isDark ? ACCENT_DARK : ACCENT
  const { user } = useAuth()
  const route = useRoute<RouteProp<MainStackParamList, "AIChat">>()
  const initialMessage = (route.params as any)?.initialMessage as string | undefined

  // ── State ─────────────────────────────────────────────────────────────────
  const [chatMode, setChatMode] = useState<ChatMode>("text")
  const [messages, setMessages] = useState<Message[]>(
    _cachedMessages ?? [{
      id:    "welcome",
      text:  "Hi! I'm AlphaAssist, your personal AI. Ask me anything, share images, or send a voice message. How can I help you today? 🚀",
      isBot: true,
      time:  nowTime(),
    }]
  )

  const [input,          setInput]          = useState("")
  const [isLoading,      setIsLoading]      = useState(false)
  const [isTyping,       setIsTyping]       = useState(false)
  const [pendingImages,  setPendingImages]  = useState<string[]>([])
  const [recordedAudio,  setRecordedAudio]  = useState<{ uri: string; duration: number } | null>(null)
  const [isRecording,    setIsRecording]    = useState(false)
  const [recordingDur,   setRecordingDur]   = useState(0)
  const [viewerUri,      setViewerUri]      = useState<string | null>(null)
  const [sidebarVisible,  setSidebarVisible]  = useState(false)
  const [conversations,   setConversations]   = useState<Conversation[]>(_cachedConversations)
  const [activeConvoId,   setActiveConvoId]   = useState<string | null>(_cachedActiveConvoId)
  const [profileImage,    setProfileImage]    = useState<string | null>(null)
  const [userInitial,     setUserInitial]     = useState("U")

  // ── Call state ────────────────────────────────────────────────────────────
  const [callModalVisible, setCallModalVisible] = useState(false)
  const [callPhoneInput,   setCallPhoneInput]   = useState("")
  const [callActive,       setCallActive]       = useState(false)
  const [callSid,          setCallSid]          = useState<string | null>(null)
  const [callStatus,       setCallStatus]       = useState<"idle" | "calling" | "connected" | "ending">("idle")
  const callPulse    = useRef(new Animated.Value(1)).current
  const isEndingCall = useRef(false)   // synchronous guard — state updates are async

  const flatListRef     = useRef<FlatList<Message>>(null)
  const inputRef        = useRef<TextInput>(null)
  const recordingRef    = useRef<Audio.Recording | null>(null)
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const sendingRef      = useRef(false)
  const pulseAnim    = useRef(new Animated.Value(1)).current
  const viewerAnim   = useRef(new Animated.Value(0)).current
  const headerAnim   = useRef(new Animated.Value(0)).current
  const sidebarAnim  = useRef(new Animated.Value(-300)).current

  // ── Load chat history from backend once on first focus ───────────────────
  useFocusEffect(
    useCallback(() => {
      if (!user || _historyLoaded) return
      apiGet<Array<{
        role: string; content: string; message_type: string; created_at: string
        conversation_id?: string | null; image_url?: string | null; user_prompt?: string | null
        audio_url?: string | null
      }>>("/api/chat-history?limit=200")
        .then(rows => {
          if (!rows || rows.length === 0) return

          const toMessage = (r: typeof rows[0], i: number): Message => {
            const mode  = (r.message_type as ChatMode) ?? "text"
            const isBot = r.role === "assistant"
            const time  = new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            if (mode === "image" && !isBot) {
              return { id: `hist-${i}-${r.created_at}`, text: r.user_prompt || "", isBot, time, mode, images: r.image_url ? [r.image_url] : null }
            }
            if (mode === "voice") {
              return { id: `hist-${i}-${r.created_at}`, text: r.content, isBot, time, mode, audioUri: r.audio_url ?? null }
            }
            return { id: `hist-${i}-${r.created_at}`, text: r.content, isBot, time, mode }
          }

          // Group by conversation_id (new chats) or fall back to date (legacy messages)
          const grouped: Record<string, typeof rows> = {}
          rows.forEach(r => {
            const key = r.conversation_id || new Date(r.created_at).toLocaleDateString("en-CA")
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(r)
          })

          const convs: Conversation[] = Object.entries(grouped)
            .sort(([, a], [, b]) => {
              const aTime = a[a.length - 1]?.created_at ?? ""
              const bTime = b[b.length - 1]?.created_at ?? ""
              return bTime.localeCompare(aTime)
            })
            .map(([key, keyRows]) => {
              const firstUser = keyRows.find(r => r.role === "user")
              const rawText   = (firstUser?.user_prompt || firstUser?.content || "").trim()

              let title: string
              if (!rawText) {
                const t = firstUser?.message_type
                title = t === "voice" ? "Voice conversation" : t === "image" ? "Image analysis" : "New conversation"
              } else {
                let t = rawText.replace(/[?!.]+$/, "").split("\n")[0].trim()
                if (t.length > 40) {
                  const cut = t.slice(0, 40)
                  const lastSpace = cut.lastIndexOf(" ")
                  t = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut) + "…"
                }
                title = t.charAt(0).toUpperCase() + t.slice(1)
              }

              const lastTs = keyRows[keyRows.length - 1]?.created_at
              const dayLabel = lastTs ? relativeDay(new Date(lastTs).toLocaleDateString("en-CA")) : ""
              return { id: key, title, preview: rawText.slice(0, 55) || "…", time: dayLabel, messages: keyRows.map(toMessage) }
            })
          setConversations(convs)
          _cachedConversations = convs
          _historyLoaded = true

          // Skip restoring messages when in a new chat session
          if (_isNewChatSession) return

          // Show most recent conversation by default
          const latest = convs[0]
          if (latest) {
            setActiveConvoId(latest.id)
            setMessages(latest.messages)
            _cachedActiveConvoId = latest.id
            _cachedMessages = latest.messages
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100)
          }
        })
        .catch(() => {/* silently keep welcome message */})
        .finally(() => {
          // If Dashboard sent an initialMessage param, auto-send it
          if (initialMessage) {
            setInput(initialMessage)
            setTimeout(() => inputRef.current?.focus(), 300)
          }
        })
    }, [user, initialMessage])
  )

  // ── Load user profile picture ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    const googlePic = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    ;(async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle()
        const name = data?.full_name || user.user_metadata?.full_name || user.email || "U"
        setUserInitial((name.charAt(0) || "U").toUpperCase())
        if (!error && data?.avatar_url) {
          const { data: sd, error: se } = await supabase.storage
            .from("avatars").createSignedUrl(`${user.id}.jpg`, 60 * 60 * 24 * 365)
          setProfileImage(!se && sd ? sd.signedUrl : googlePic)
        } else {
          setProfileImage(googlePic)
        }
      } catch {
        setProfileImage(googlePic)
      }
    })()
  }, [user?.id])

  // ── Keep module-level cache in sync with live messages ───────────────────
  useEffect(() => {
    _cachedMessages = messages
  }, [messages])

  // ── Setup effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    const kbShow = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    })
    return () => {
      kbShow.remove()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (viewerUri) {
      Animated.spring(viewerAnim, { toValue: 1, useNativeDriver: true, tension: 55, friction: 9 }).start()
    } else {
      viewerAnim.setValue(0)
    }
  }, [viewerUri])

  useEffect(() => {
    Animated.timing(sidebarAnim, {
      toValue: sidebarVisible ? 0 : -300,
      duration: 230,
      useNativeDriver: true,
    }).start()
  }, [sidebarVisible])

  useEffect(() => {
    if (messages.length > 1 || isTyping) {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80)
      })
    }
  }, [messages.length, isTyping])

  // ── Push bot error message ────────────────────────────────────────────────
  const pushError = (msg: string) => {
    setMessages(prev => [...prev, { id: `e-${Date.now()}`, text: msg, isBot: true, time: nowTime() }])
  }

  // ── Text send — streaming SSE via XHR + responseText polling ────────────
  // React Native's XHR onprogress doesn't fire incrementally, so we poll
  // xhr.responseText on a 50ms timer to get near-real-time token rendering.
  const sendTextMessage = async (text: string) => {
    const botMsgId = `b-${Date.now()}`
    setMessages(prev => [...prev, {
      id: botMsgId, text: "", isBot: true, time: nowTime(), mode: "text",
    }])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not authenticated — please log in.")

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `${BASE_URL}/api/chat/stream`)
        xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`)
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.timeout = 60000

        let lastIndex = 0
        let accumulated = ""
        let firstToken = true

        const processChunk = () => {
          const full = xhr.responseText
          if (full.length <= lastIndex) return
          const newText = full.slice(lastIndex)
          lastIndex = full.length

          for (const line of newText.split("\n")) {
            if (!line.startsWith("data: ")) continue
            const raw = line.slice(6).trim()
            if (raw === "[DONE]") return
            try {
              const parsed = JSON.parse(raw)
              if (parsed.error) { reject(new Error("Server stream error")); return }
              // Backend confirmation event (action result / warning) — shown as-is
              if (parsed.confirm) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === botMsgId
                      ? { ...m, text: (m.text || "").trimEnd() + "\n\n" + parsed.confirm }
                      : m
                  )
                )
                // Schedule push notification for chatbot-created tasks
                if (parsed.task?.message_reminder) {
                  scheduleTaskNotifications({
                    id:              parsed.task.id,
                    taskName:        parsed.task.task_name,
                    scheduledDate:   parsed.task.scheduled_date,
                    scheduledTime:   parsed.task.scheduled_time,
                    messageReminder: true,
                    reminderTime:    parsed.task.reminder_time ?? undefined,
                  }).catch(() => {})
                }
                continue
              }
              if (firstToken) { setIsTyping(false); firstToken = false }
              accumulated += parsed.c ?? ""
              // Strip action block — either via <<<ACTION>>> marker or bare {"action": JSON
              let display: string
              const markerIdx = accumulated.indexOf("<<<ACTION>>>")
              const jsonIdx    = accumulated.indexOf('{"action"')
              if (markerIdx !== -1) {
                display = accumulated.slice(0, markerIdx)
              } else if (jsonIdx !== -1) {
                // Also remove any trailing markdown header line before the JSON
                display = accumulated.slice(0, jsonIdx).replace(/\n+#[^\n]*\n?$/, "").trimEnd()
              } else {
                display = accumulated
              }
              setMessages(prev =>
                prev.map(m => m.id === botMsgId ? { ...m, text: display } : m)
              )
            } catch {}
          }
        }

        const pollTimer = setInterval(processChunk, 50)

        xhr.onload = () => {
          clearInterval(pollTimer)
          if (xhr.status >= 400) {
            try {
              const errBody = JSON.parse(xhr.responseText)
              reject(new Error(errBody.detail || `Request failed (${xhr.status})`))
            } catch {
              reject(new Error(`Request failed (${xhr.status})`))
            }
            return
          }
          processChunk()
          resolve()
        }
        xhr.onerror   = () => { clearInterval(pollTimer); reject(new Error("Network error — check backend is running.")) }
        xhr.ontimeout = () => { clearInterval(pollTimer); reject(new Error("Request timed out.")) }
        xhr.send(JSON.stringify({ message: text, conversation_id: _currentConversationId }))
      })
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== botMsgId))
      pushError(e.message || "Failed to send message. Please try again.")
    }
  }

  // ── Voice send ────────────────────────────────────────────────────────────
  const sendVoiceMessage = async (audioUri: string) => {
    const fd = new FormData()
    fd.append("file", { uri: audioUri, name: "audio.m4a", type: guessMime(audioUri, "audio/m4a") } as any)
    try {
      const data = await apiPostForm<{
        transcript: string; response: string; audio_url: string | null; audio_base64: string | null
      }>("/api/voice-chat", fd)

      // Play TTS reply immediately if available
      const audioSrc = data.audio_url
        ? data.audio_url
        : data.audio_base64
          ? `data:audio/mp3;base64,${data.audio_base64}`
          : null

      setMessages(prev => [...prev, {
        id:       `b-${Date.now()}`,
        text:     data.response,
        isBot:    true,
        time:     nowTime(),
        mode:     "voice",
        audioUri: audioSrc,
      }])

    } catch (e: any) {
      pushError(e.message || "Voice processing failed. Please try again.")
    }
  }

  // ── Image send ────────────────────────────────────────────────────────────
  const sendImageMessage = async (imageUris: string[], text: string) => {
    // Send one image at a time (backend takes single file)
    for (const uri of imageUris) {
      const fd = new FormData()
      fd.append("file",   { uri, name: `img_${Date.now()}.jpg`, type: guessMime(uri, "image/jpeg") } as any)
      fd.append("prompt", text || "")
      try {
        const data = await apiPostForm<{ image_description: string; response: string }>("/api/image-chat", fd)
        setMessages(prev => [...prev, {
          id: `b-${Date.now()}`, text: data.response, isBot: true, time: nowTime(), mode: "image",
        }])
      } catch (e: any) {
        pushError(e.message || "Image analysis failed. Please try again.")
      }
    }
  }

  // ── Main sendMessage dispatcher ───────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if ((!text && !pendingImages.length && !recordedAudio) || sendingRef.current || isLoading) return
    if (!user) { Alert.alert("Not logged in", "Please log in to use the chat."); return }

    sendingRef.current = true
    setIsLoading(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    // Optimistic user message
    const userMsg: Message = {
      id:       `u-${Date.now()}`,
      text:     text || (pendingImages.length ? "(Image)" : ""),
      isBot:    false,
      time:     nowTime(),
      mode:     chatMode,
      images:   pendingImages.length ? [...pendingImages] : null,
      audioUri: recordedAudio?.uri ?? null,
    }
    setMessages(prev => [...prev, userMsg])
    setInput(""); setPendingImages([]); setRecordedAudio(null)
    inputRef.current?.focus()

    const typingTimer = setTimeout(() => setIsTyping(true), 400)

    try {
      if (recordedAudio) {
        await sendVoiceMessage(recordedAudio.uri)
      } else if (pendingImages.length) {
        await sendImageMessage(pendingImages, text)
      } else {
        await sendTextMessage(text)
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      pushError("Network error — make sure the backend is running and try again.")
    } finally {
      clearTimeout(typingTimer)
      setIsTyping(false)
      setIsLoading(false)
      sendingRef.current = false
    }
  }, [input, pendingImages, recordedAudio, isLoading, chatMode, user])

  // ── Attach ────────────────────────────────────────────────────────────────
  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, quality: 0.85,
    })
    if (!r.canceled) {
      setPendingImages(p => [...p, ...r.assets.map(a => a.uri)])
      setChatMode("image")
    }
  }

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    const uri = (r as any).uri
    if (uri) { setPendingImages(p => [...p, uri]); setChatMode("image") }
  }

  const handleAttach = () =>
    Alert.alert("Attach", "Choose source", [
      { text: "Photo Library", onPress: pickImage },
      { text: "Files",         onPress: pickFile  },
      { text: "Cancel", style: "cancel" },
    ])

  // ── Record ────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync()
    if (status !== "granted") { Alert.alert("Microphone permission required"); return }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
    recordingRef.current = recording
    setIsRecording(true); setRecordingDur(0); setChatMode("voice")
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 650, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,   duration: 650, useNativeDriver: true }),
    ])).start()
    timerRef.current = setInterval(() => setRecordingDur(d => d + 1), 1000)
  }

  const stopRecording = async () => {
    const rec = recordingRef.current; if (!rec) return
    setIsRecording(false); pulseAnim.stopAnimation(); pulseAnim.setValue(1)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    await rec.stopAndUnloadAsync()
    const uri = rec.getURI()
    if (uri) setRecordedAudio({ uri, duration: recordingDur })
    recordingRef.current = null; setRecordingDur(0)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  // ── Call handlers ─────────────────────────────────────────────────────────
  const openCallModal = async () => {
    const saved = await AsyncStorage.getItem("@alphaassist_phone")
    if (saved) setCallPhoneInput(saved)
    setCallModalVisible(true)
  }

  const startCall = async () => {
    const phone = callPhoneInput.trim()
    if (!phone) { Alert.alert("Phone number required"); return }
    setCallModalVisible(false)
    setCallStatus("calling")
    setCallActive(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    Animated.loop(Animated.sequence([
      Animated.timing(callPulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
      Animated.timing(callPulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ])).start()
    try {
      await AsyncStorage.setItem("@alphaassist_phone", phone)
      const res = await apiPost<{ call_sid: string; status: string }>("/api/calls/assistant", { phone_number: phone })
      setCallSid(res.call_sid)
      setCallStatus("connected")
    } catch (e: any) {
      isEndingCall.current = false
      setCallActive(false)
      setCallStatus("idle")
      callPulse.stopAnimation(); callPulse.setValue(1)
      Alert.alert("Call Failed", e.message || "Could not start call. Make sure your number includes the country code (e.g. +923114401609).")
    }
  }

  const endCall = async () => {
    if (isEndingCall.current) return
    isEndingCall.current = true
    const sidToCancel = callSid
    setCallStatus("ending")
    setCallActive(false)
    setCallSid(null)
    callPulse.stopAnimation(); callPulse.setValue(1)
    try {
      if (sidToCancel) await apiDelete(`/api/calls/assistant/${sidToCancel}`)
    } catch {}
    setCallStatus("idle")
    isEndingCall.current = false
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  // ── Render message ────────────────────────────────────────────────────────
  // Keep a ref so renderMessage doesn't depend on messages (avoids re-rendering
  // all visible items on every streaming token update).
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isBot     = item.isBot
    const hasImages = !!(item.images?.length)
    const hasAudio  = !!item.audioUri
    const hasText   = !!(item.text?.trim() && item.text.trim() !== "(Image)")
    const prevIsBot = index > 0 && messagesRef.current[index - 1]?.isBot
    const showAvatar = isBot && !prevIsBot

    const modeBadge =
      item.mode === "voice" ? "mic" :
      item.mode === "image" ? "image" : null

    return (
      <View style={{
        flexDirection: "row",
        alignSelf: isBot ? "flex-start" : "flex-end",
        maxWidth: "89%",
        marginVertical: 3,
        alignItems: "flex-start",
      }}>
        {isBot && (
          <View style={{
            width: 32, height: 32, borderRadius: 16,
            marginRight: 8, marginTop: 4, overflow: "hidden",
            opacity: showAvatar ? 1 : 0,
          }}>
            <Image
              source={require("../../../../assets/images/splash.png")}
              style={{ width: 32, height: 32, borderRadius: 16 }}
              resizeMode="cover"
            />
          </View>
        )}

        <View style={{ flex: isBot ? 1 : undefined, flexShrink: 1 }}>
          {hasImages && (
            <View style={{
              flexDirection: "row", flexWrap: "wrap", gap: 6,
              marginBottom: (hasText || hasAudio) ? 6 : 0,
              alignSelf: isBot ? "flex-start" : "flex-end",
            }}>
              {item.images!.map((uri, i) => (
                <TouchableOpacity key={i} onPress={() => setViewerUri(uri)} activeOpacity={0.88}>
                  <Image source={{ uri }} style={{
                    width:  item.images!.length === 1 ? 230 : 115,
                    height: item.images!.length === 1 ? 210 : 115,
                    borderRadius: 14, borderWidth: 1,
                    borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                  }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {(hasText || hasAudio) && (
            isBot ? (
              <View style={{
                backgroundColor: isDark ? "rgba(22,22,42,0.97)" : "#F1F5FF",
                borderRadius: 18, borderBottomLeftRadius: showAvatar ? 4 : 18,
                paddingHorizontal: 15, paddingVertical: 11,
                borderWidth: 1,
                borderColor: isDark ? "rgba(99,102,241,0.18)" : "rgba(79,70,229,0.1)",
              }}>
                {modeBadge && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                    <Ionicons name={modeBadge as any} size={11} color={isDark ? ACCENT_LIGHT : ACCENT} />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: isDark ? ACCENT_LIGHT : ACCENT, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {item.mode}
                    </Text>
                  </View>
                )}
                {hasAudio && (
                  <View style={{ marginBottom: hasText ? 8 : 0 }}>
                    <AudioPlayer uri={item.audioUri!} isDark={isDark} isBot />
                  </View>
                )}
                {hasText && (
                  <Text style={{ fontSize: 15, lineHeight: 22, color: isDark ? "#E4E4F0" : "#1a1a2e" }}>
                    {item.text}
                  </Text>
                )}
                <Text style={{ fontSize: 11, marginTop: 5, color: isDark ? "rgba(165,180,252,0.4)" : "rgba(79,70,229,0.35)", alignSelf: "flex-end" }}>
                  {item.time}
                </Text>
              </View>
            ) : (
              <LinearGradient
                colors={["#4F46E5", "#7C3AED"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 18, borderBottomRightRadius: 4,
                  paddingHorizontal: 15, paddingVertical: 11,
                }}>
                {hasAudio && (
                  <View style={{ marginBottom: hasText ? 8 : 0 }}>
                    <AudioPlayer uri={item.audioUri!} isDark={isDark} isBot={false} />
                  </View>
                )}
                {hasText && (
                  <Text style={{ fontSize: 15, lineHeight: 22, color: "#fff" }}>{item.text}</Text>
                )}
                <Text style={{ fontSize: 11, marginTop: 5, color: "rgba(255,255,255,0.55)", alignSelf: "flex-end" }}>
                  {item.time}
                </Text>
              </LinearGradient>
            )
          )}
        </View>

        {!isBot && (
          <View style={{
            width: 30, height: 30, borderRadius: 15,
            marginLeft: 8, marginTop: 4, overflow: "hidden",
            flexShrink: 0,
          }}>
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={{ width: 30, height: 30, borderRadius: 15 }}
                resizeMode="cover"
              />
            ) : (
              <View style={{
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: isDark ? "#1f2937" : "#EEF2FF",
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: isDark ? ACCENT_LIGHT : ACCENT }}>
                  {userInitial}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    )
  }, [isDark, profileImage, userInitial])

  const showSend = input.trim().length > 0 || pendingImages.length > 0 || !!recordedAudio

  const CHIPS = [
    { label: "What are my tasks?",      icon: "checkbox-outline"     },
    { label: "My pending goals",        icon: "flag-outline"         },
    { label: "Plan my day",             icon: "calendar-outline"     },
    { label: "Help me focus",           icon: "flash-outline"        },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: headerAnim }}>
          <View style={{
            flexDirection: "row", alignItems: "center",
            paddingHorizontal: 16, paddingVertical: 13,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.1)",
            backgroundColor: colors.background,
          }}>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setSidebarVisible(true) }} activeOpacity={0.7}
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                alignItems: "center", justifyContent: "center",
                borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                marginRight: 12,
              }}>
              <Ionicons name="menu" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <Image
              source={require("../../../../assets/images/splash.png")}
              style={{ width: 42, height: 42, borderRadius: 21, marginRight: 12 }}
              resizeMode="cover"
            />

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.3 }}>
                AlphaAssist
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN }} />
                <Text style={{ fontSize: 12, color: GREEN, fontWeight: "500" }}>Online · AI Assistant</Text>
              </View>
            </View>

            {/* ── Call button ──────────────────────────────────────────── */}
            {callActive ? (
              <Animated.View style={{ transform: [{ scale: callPulse }] }}>
                <TouchableOpacity onPress={endCall} activeOpacity={0.85}
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: "#EF4444",
                    alignItems: "center", justifyContent: "center",
                    shadowColor: "#EF4444", shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.5, shadowRadius: 6, elevation: 4,
                  }}>
                  <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <TouchableOpacity onPress={openCallModal} activeOpacity={0.8}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)",
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: isDark ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.2)",
                }}>
                <Ionicons name="call-outline" size={18} color={GREEN} />
              </TouchableOpacity>
            )}

          </View>

        </Animated.View>

        {/* ── Active call banner ──────────────────────────────────────────── */}
        {callActive && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            paddingHorizontal: 16, paddingVertical: 10,
            backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)",
            borderBottomWidth: 1,
            borderBottomColor: isDark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.15)",
          }}>
            <Animated.View style={{ transform: [{ scale: callPulse }] }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#10B981" }} />
            </Animated.View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: GREEN }}>
              {callStatus === "calling" ? "Calling you…" : "Call in progress — speak to AlphaAssist"}
            </Text>
            <TouchableOpacity onPress={endCall} activeOpacity={0.8}
              style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                paddingHorizontal: 12, paddingVertical: 5,
                backgroundColor: "#EF4444", borderRadius: 20,
              }}>
              <Ionicons name="call" size={13} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>End</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Messages list ────────────────────────────────────────────────── */}
        <FlatList
          ref={flatListRef}
          data={isTyping ? messages.filter(m => !(m.isBot && !m.text?.trim())) : messages}
          renderItem={renderMessage}
          keyExtractor={m => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 10, gap: 4 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
          windowSize={5}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={100}
          ListFooterComponent={isTyping ? <TypingDots isDark={isDark} /> : null}
        />

        {/* ── Suggestion chips ────────────────────────────────────────────── */}
        {messages.length <= 2 && !isLoading && (
          <View style={{ paddingVertical: 8, paddingLeft: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {CHIPS.map(c => (
                <SuggestionChip key={c.label} label={c.label} icon={c.icon} isDark={isDark}
                  onPress={() => { setInput(c.label); inputRef.current?.focus() }} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Pending attachments preview ──────────────────────────────────── */}
        {(pendingImages.length > 0 || recordedAudio) && (
          <View style={{
            borderTopWidth: 1,
            borderTopColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.1)",
            backgroundColor: isDark ? "rgba(12,12,22,0.98)" : "#F8F8FC",
            paddingHorizontal: 14, paddingVertical: 10,
            flexDirection: "row", gap: 10, alignItems: "center",
          }}>
            {recordedAudio && (
              <View style={{
                flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: isDark ? "rgba(99,102,241,0.1)" : "rgba(79,70,229,0.07)",
                borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
                borderWidth: 1, borderColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(79,70,229,0.15)",
              }}>
                <Ionicons name="mic" size={15} color={accent} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: accent }}>
                  Voice · {formatDuration(recordedAudio.duration)}
                </Text>
                <TouchableOpacity onPress={() => setRecordedAudio(null)}>
                  <Ionicons name="close-circle" size={18} color={accent} />
                </TouchableOpacity>
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {pendingImages.map((uri, i) => (
                <View key={i} style={{ marginRight: 8, position: "relative" }}>
                  <Image source={{ uri }} style={{
                    width: 58, height: 58, borderRadius: 10,
                    borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)",
                  }} />
                  <TouchableOpacity onPress={() => setPendingImages(p => p.filter((_, j) => j !== i))}
                    style={{
                      position: "absolute", top: -5, right: -5,
                      width: 18, height: 18, borderRadius: 9,
                      backgroundColor: "#EF4444",
                      alignItems: "center", justifyContent: "center",
                    }}>
                    <Ionicons name="close" size={11} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <View style={{
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.1)",
          backgroundColor: colors.background,
          paddingHorizontal: 12, paddingVertical: 10,
          flexDirection: "row", alignItems: "flex-end", gap: 8,
        }}>
          <TouchableOpacity onPress={handleAttach} activeOpacity={0.75}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: isDark ? "rgba(99,102,241,0.1)" : "rgba(79,70,229,0.07)",
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: isDark ? "rgba(99,102,241,0.22)" : "rgba(79,70,229,0.15)",
            }}>
            <Ionicons name="attach" size={19} color={accent} />
          </TouchableOpacity>

          <View style={{
            flex: 1, minHeight: 40, maxHeight: 120,
            backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
            borderRadius: 22, borderWidth: 1,
            borderColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(79,70,229,0.15)",
            paddingHorizontal: 16, paddingVertical: 10,
            justifyContent: "center",
          }}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder={
                isRecording
                  ? `Recording ${formatDuration(recordingDur)}…`
                  : chatMode === "voice"
                    ? "Record a voice message…"
                    : chatMode === "image"
                      ? "Attach an image and ask anything…"
                      : "Message AlphaAssist…"
              }
              placeholderTextColor={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
              style={{ fontSize: 15, color: colors.text, padding: 0, maxHeight: 100 }}
              multiline
              editable={!isLoading && !isRecording}
              autoCorrect
              autoCapitalize="sentences"
              onSubmitEditing={sendMessage}
            />
          </View>

          {showSend ? (
            <TouchableOpacity onPress={sendMessage} disabled={isLoading} activeOpacity={0.85}>
              <LinearGradient colors={["#4F46E5", "#7C3AED"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
                {isLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={16} color="#fff" style={{ marginLeft: 2 }} />
                }
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity onPress={isRecording ? stopRecording : startRecording} activeOpacity={0.85}>
                <LinearGradient
                  colors={isRecording ? ["#EF4444", "#DC2626"] : ["#4F46E5", "#7C3AED"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={isRecording ? "stop" : "mic"} size={17} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Image fullscreen viewer ──────────────────────────────────────── */}
      {viewerUri && (
        <Pressable
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.92)", zIndex: 100,
            alignItems: "center", justifyContent: "center",
          }}
          onPress={() => setViewerUri(null)}>
          <Animated.Image
            source={{ uri: viewerUri }}
            style={{ width: "90%", height: "70%", borderRadius: 16, transform: [{ scale: viewerAnim }] }}
            resizeMode="contain"
          />
          <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 16, fontSize: 13 }}>Tap to close</Text>
        </Pressable>
      )}

      {/* ── Sidebar backdrop ─────────────────────────────────────────────── */}
      {sidebarVisible && (
        <Pressable
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)", zIndex: 40,
          }}
          onPress={() => setSidebarVisible(false)}
        />
      )}

      <Animated.View style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: 300, zIndex: 50,
        transform: [{ translateX: sidebarAnim }],
        backgroundColor: isDark ? "rgba(12,12,24,0.99)" : "#fff",
        borderRightWidth: 1,
        borderRightColor: isDark ? "rgba(99,102,241,0.18)" : "rgba(79,70,229,0.1)",
        shadowColor: "#000", shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.25, shadowRadius: 16, elevation: 20,
      }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{
            flexDirection: "row", alignItems: "center",
            paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.08)",
          }}>
            <Image
              source={require("../../../../assets/images/splash.png")}
              style={{ width: 34, height: 34, borderRadius: 17, marginRight: 10 }}
              resizeMode="cover"
            />
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text, letterSpacing: -0.4 }}>
              Chats
            </Text>
            <TouchableOpacity onPress={() => setSidebarVisible(false)} activeOpacity={0.7}
              style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                alignItems: "center", justifyContent: "center",
              }}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={async () => {
              _isNewChatSession = true
              _currentConversationId = null
              _cachedActiveConvoId = null
              _cachedMessages = null
              setActiveConvoId(null)
              setMessages([{ id: "welcome-new", text: "Hi! I'm AlphaAssist. How can I help you today? 🚀", isBot: true, time: nowTime() }])
              setSidebarVisible(false)
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              try {
                const conv = await apiPost<{ id: string }>("/api/conversations", {})
                _currentConversationId = conv.id
              } catch {}
            }}
            activeOpacity={0.8}
            style={{ marginHorizontal: 14, marginTop: 14, marginBottom: 6, borderRadius: 14, overflow: "hidden" }}>
            <LinearGradient colors={["#4F46E5", "#7C3AED"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>New Chat</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={{
            fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase",
            color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
            paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6,
          }}>Recent</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {conversations.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={36}
                  color={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} />
                <Text style={{ marginTop: 10, fontSize: 13, color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)" }}>
                  No conversations yet
                </Text>
              </View>
            ) : conversations.map(c => {
              const isActive = activeConvoId === c.id
              return (
                <View key={c.id} style={{
                    flexDirection: "row", alignItems: "center",
                    marginHorizontal: 10, marginVertical: 2,
                    borderRadius: 14,
                    backgroundColor: isActive ? (isDark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.08)") : "transparent",
                    borderWidth: isActive ? 1 : 0,
                    borderColor: isDark ? "rgba(99,102,241,0.25)" : "rgba(79,70,229,0.15)",
                  }}>
                  <TouchableOpacity
                    onPress={() => {
                      _isNewChatSession = false
                      _currentConversationId = null
                      _cachedActiveConvoId = c.id
                      _cachedMessages = c.messages
                      setActiveConvoId(c.id)
                      setMessages(c.messages)
                      setSidebarVisible(false)
                      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 80)
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    }}
                    activeOpacity={0.75}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12 }}>
                    <View style={{
                      width: 38, height: 38, borderRadius: 19, marginRight: 12,
                      backgroundColor: isActive
                        ? (isDark ? "rgba(99,102,241,0.25)" : "rgba(79,70,229,0.12)")
                        : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"),
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Ionicons name="chatbubble-ellipses-outline" size={16}
                        color={isActive ? (isDark ? ACCENT_LIGHT : ACCENT) : colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 14, fontWeight: isActive ? "700" : "600",
                        color: isActive ? (isDark ? ACCENT_LIGHT : ACCENT) : colors.text,
                      }} numberOfLines={1}>{c.title}</Text>
                      <Text style={{ fontSize: 11, marginTop: 2, color: colors.textMuted }}>{c.time}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert("Delete Conversation", "Remove this conversation?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: async () => {
                          try {
                            await apiDelete(`/api/conversations/${c.id}`)
                          } catch {}
                          setConversations(prev => prev.filter(x => x.id !== c.id))
                          if (activeConvoId === c.id) {
                            _isNewChatSession = true
                            setActiveConvoId(null)
                            setMessages([{ id: "welcome-del", text: "Hi! I'm AlphaAssist. How can I help you today? 🚀", isBot: true, time: nowTime() }])
                          }
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                        }},
                      ])
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ paddingRight: 12, paddingLeft: 4 }}>
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )
            })}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
      {/* ── Call modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={callModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCallModalVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setCallModalVisible(false)}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{
              width: "85%",
              backgroundColor: isDark ? "#1a1a2e" : "#fff",
              borderRadius: 24, padding: 24,
              borderWidth: 1,
              borderColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(79,70,229,0.12)",
              shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
            }}>
            {/* Icon + title */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)",
                alignItems: "center", justifyContent: "center", marginBottom: 14,
                borderWidth: 1, borderColor: isDark ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.2)",
              }}>
                <Ionicons name="call" size={28} color={GREEN} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 }}>
                Call AlphaAssist
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: "center", lineHeight: 18 }}>
                AlphaAssist will call you and help you create tasks, set goals, and manage your day — just by talking.
              </Text>
            </View>

            {/* Phone input */}
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Your Phone Number
            </Text>
            <View style={{
              flexDirection: "row", alignItems: "center",
              borderWidth: 1, borderColor: isDark ? "rgba(99,102,241,0.3)" : "rgba(79,70,229,0.2)",
              borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
              marginBottom: 6,
            }}>
              <Ionicons name="phone-portrait-outline" size={16} color={accent} style={{ marginRight: 8 }} />
              <TextInput
                value={callPhoneInput}
                onChangeText={setCallPhoneInput}
                placeholder="+92 311 440 1609"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"}
                keyboardType="phone-pad"
                style={{ flex: 1, fontSize: 16, color: colors.text }}
                autoFocus
              />
            </View>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 20, paddingHorizontal: 2 }}>
              Include your country code, e.g. +92 for Pakistan, +1 for US
            </Text>

            {/* Buttons */}
            <TouchableOpacity onPress={startCall} activeOpacity={0.85}
              style={{ borderRadius: 14, overflow: "hidden", marginBottom: 10 }}>
              <LinearGradient colors={["#10B981", "#059669"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 }}>
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>Start Call</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setCallModalVisible(false)} activeOpacity={0.7}
              style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  )
}

export default AiChatScreen
