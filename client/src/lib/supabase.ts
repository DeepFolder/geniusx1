import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://axpnoypdylbjnwcylsxe.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cG5veXBkeWxiam53Y3lsc3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NDYwNTEsImV4cCI6MjA2NjAyMjA1MX0.LY2jMo9AHdjQkadNNC3AKxphJFTHrTaZFdXyMJ2BQ2o'

console.log('Supabase configuration:', { 
  url: supabaseUrl ? 'configured' : 'missing',
  key: supabaseAnonKey ? 'configured' : 'missing'
})

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
})

// Helper function to sync Supabase auth with our backend
export async function syncAuthWithBackend() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session?.user) {
      // Verify user exists in our database
      const response = await fetch('/api/auth/verify-supabase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          supabaseUserId: session.user.id,
          email: session.user.email
        })
      })
      
      if (response.ok) {
        return await response.json()
      }
    }
    
    return null
  } catch (error) {
    console.error('Auth sync error:', error)
    return null
  }
}

// Fallback authentication for when Supabase is not configured
export async function fallbackLogin(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Login failed')
  }
  
  return response.json()
}

// Enhanced auth service that works with or without Supabase
export const authService = {
  async login(email: string, password: string) {
    if (supabaseUrl && supabaseAnonKey) {
      // Use Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) throw new Error(error.message)
      
      // Sync with backend
      const backendUser = await syncAuthWithBackend()
      return { user: backendUser, session: data.session }
    } else {
      // Use fallback authentication
      return await fallbackLogin(email, password)
    }
  },

  async logout() {
    if (supabaseUrl && supabaseAnonKey) {
      await supabase.auth.signOut()
    }
    
    // Always logout from backend too
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    })
  },

  async getCurrentUser() {
    if (supabaseUrl && supabaseAnonKey) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        return await syncAuthWithBackend()
      }
    }
    
    // Fallback to backend session check
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    })
    
    if (response.ok) {
      return await response.json()
    }
    
    if (response.status === 401) {
      return null
    }
    
    throw new Error('Failed to get user')
  },

  async register(userData: any) {
    if (supabaseUrl && supabaseAnonKey) {
      // Use Supabase auth for registration
      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            first_name: userData.firstName,
            last_name: userData.lastName
          }
        }
      })
      
      if (error) throw new Error(error.message)
      
      // Create user in our backend
      const response = await fetch('/api/auth/register-supabase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session?.access_token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          supabaseUserId: data.user?.id,
          ...userData
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Registration failed')
      }
      
      return await response.json()
    } else {
      // Use fallback registration
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Registration failed')
      }
      
      return response.json()
    }
  }
}