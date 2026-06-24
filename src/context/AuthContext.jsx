/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  signUp: async () => {},
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  role: null,
  isAdmin: false,
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
        return null
      }
      return data
    } catch (err) {
      console.error('Unexpected error fetching profile:', err)
      return null
    }
  }

  useEffect(() => {
    let active = true

    // Safety timeout: force loading to false after 3 seconds max, so the app is never stuck on startup
    const safetyTimeout = setTimeout(() => {
      if (active) {
        console.warn('Auth initialization timed out, forcing loading state to false.')
        setLoading(false)
      }
    }, 3000)

    // Check active session
    supabase.auth.getSession()
      .then(async (res) => {
        if (!active) return
        try {
          const session = res?.data?.session
          if (session?.user) {
            setUser(session.user)
            const prof = await fetchProfile(session.user.id)
            if (active) setProfile(prof)
          } else {
            setUser(null)
            setProfile(null)
          }
        } catch (err) {
          console.error('Error in getSession handler:', err)
        } finally {
          if (active) {
            setLoading(false)
            clearTimeout(safetyTimeout)
          }
        }
      })
      .catch((err) => {
        console.error('Error getting session:', err)
        if (active) {
          setLoading(false)
          clearTimeout(safetyTimeout)
        }
      })

    // Listen for auth changes
    const authChangeResult = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return
        try {
          if (session?.user) {
            setUser(session.user)
            const prof = await fetchProfile(session.user.id)
            if (active) setProfile(prof)
          } else {
            setUser(null)
            setProfile(null)
          }
        } catch (err) {
          console.error('Error in onAuthStateChange handler:', err)
        } finally {
          if (active) {
            setLoading(false)
            clearTimeout(safetyTimeout)
          }
        }
      }
    )

    const subscription = authChangeResult?.data?.subscription

    return () => {
      active = false
      clearTimeout(safetyTimeout)
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [])

  const signUp = async (username, password, role = 'player') => {
    setLoading(true)
    try {
      const normalized = username.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      const email = `${normalized}@labandememe.net`
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            role,
          },
        },
      })
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Signup error:', error.message)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  const login = async (username, password) => {
    setLoading(true)
    try {
      const normalized = username.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      
      // Try with .net domain first (new accounts)
      const emailNet = `${normalized}@labandememe.net`
      let { data, error } = await supabase.auth.signInWithPassword({
        email: emailNet,
        password,
      })
      
      // If failed, try with .com domain (fallback for old accounts/cached sessions)
      if (error) {
        const emailCom = `${normalized}@labandememe.com`
        const retryResult = await supabase.auth.signInWithPassword({
          email: emailCom,
          password,
        })
        if (!retryResult.error) {
          return { data: retryResult.data, error: null }
        }
      }
      
      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('Login error:', error.message)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setProfile(null)
    } catch (error) {
      console.error('Logout error:', error.message)
    } finally {
      setLoading(false)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      const prof = await fetchProfile(user.id)
      setProfile(prof)
      return prof
    }
    return null
  }

  const value = {
    user,
    profile,
    loading,
    signUp,
    login,
    logout,
    refreshProfile,
    role: profile?.role || null,
    isAdmin: profile?.role === 'creator',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
