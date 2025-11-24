import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import config from "@/config"
import { supabaseAdmin } from "./supabase"

export const { handlers, auth, signIn, signOut } = NextAuth({
  
  secret: process.env.NEXTAUTH_SECRET,
  
  providers: [
    EmailProvider({
      server: {
        host: "smtp.resend.com",
        port: 465,
        auth: {
          user: "resend",
          pass: process.env.RESEND_API_KEY,
        },
      },
      from: config.resend.fromNoReply,
    }),
    // Only add Google provider if credentials are configured
    ...(process.env.GOOGLE_ID && process.env.GOOGLE_SECRET && !process.env.GOOGLE_ID.includes('your_google')
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_ID,
          clientSecret: process.env.GOOGLE_SECRET,
          async profile(profile) {
            return {
              id: profile.sub,
              name: profile.given_name ? profile.given_name : profile.name,
              email: profile.email,
              image: profile.picture,
            };
          },
        })]
      : []),
  ],
  
  // Custom adapter that uses Supabase directly
  adapter: {
    async createUser(user) {
      console.log('[AUTH] createUser called with:', user.email)
      try {
        const { data, error } = await supabaseAdmin
          .from('users')
          .insert({
            email: user.email,
            name: user.name,
            image: user.image,
            email_verified: user.emailVerified ? new Date(user.emailVerified) : null,
          })
          .select()
          .single()
        
        if (error) {
          console.error('[AUTH] createUser error:', error)
          throw error
        }
        console.log('[AUTH] createUser success:', data?.id)
        // Map snake_case to camelCase for NextAuth
        return {
          id: data.id,
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.email_verified,
        }
      } catch (e) {
        console.error('[AUTH] createUser exception:', e)
        throw e
      }
    },
    async getUser(id) {
      console.log('[AUTH] getUser called with id:', id)
      try {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select()
          .eq('id', id)
          .single()
        
        if (error) {
          console.error('[AUTH] getUser error:', error)
          return null
        }
        console.log('[AUTH] getUser result:', data ? 'found' : 'not found')
        return data ? {
          id: data.id,
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.email_verified,
        } : null
      } catch (e) {
        console.error('[AUTH] getUser exception:', e)
        return null
      }
    },
    async getUserByEmail(email) {
      console.log('[AUTH] getUserByEmail called with:', email)
      try {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select()
          .eq('email', email)
          .single()
        
        if (error) {
          console.error('[AUTH] getUserByEmail error:', error)
          // Don't throw on "not found" - just return null
          if (error.code === 'PGRST116') {
            console.log('[AUTH] User not found (will create new)')
            return null
          }
          return null
        }
        console.log('[AUTH] getUserByEmail result:', data ? 'found' : 'not found')
        return data ? {
          id: data.id,
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.email_verified,
        } : null
      } catch (e) {
        console.error('[AUTH] getUserByEmail exception:', e)
        return null
      }
    },
    async getUserByAccount({ providerAccountId, provider }) {
      console.log('[AUTH] getUserByAccount called for:', provider, providerAccountId)
      try {
        const { data, error } = await supabaseAdmin
          .from('accounts')
          .select('user_id')
          .eq('provider', provider)
          .eq('provider_account_id', providerAccountId)
          .single()
        
        if (error) {
          console.error('[AUTH] getUserByAccount error:', error)
          // Don't throw on "not found" - just return null
          if (error.code === 'PGRST116') {
            console.log('[AUTH] Account not found (will create new)')
            return null
          }
          // For other errors, log and return null (don't throw to avoid breaking auth flow)
          return null
        }
        
        if (!data) return null
        return await this.getUser(data.user_id)
      } catch (e) {
        console.error('[AUTH] getUserByAccount exception:', e)
        return null
      }
    },
    async updateUser(user) {
      console.log('[AUTH] updateUser called for:', user.id)
      const updateData = {}
      if (user.email !== undefined) updateData.email = user.email
      if (user.name !== undefined) updateData.name = user.name
      if (user.image !== undefined) updateData.image = user.image
      if (user.emailVerified !== undefined) updateData.email_verified = user.emailVerified ? new Date(user.emailVerified) : null
      
      const { data, error } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single()
      
      if (error) throw error
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        image: data.image,
        emailVerified: data.email_verified,
      }
    },
    async linkAccount(account) {
      console.log('[AUTH] linkAccount called for:', account.provider, account.providerAccountId)
      try {
        const accountData = {
          user_id: account.userId,
          type: account.type,
          provider: account.provider,
          provider_account_id: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: account.session_state,
        }
        const { data, error } = await supabaseAdmin
          .from('accounts')
          .insert(accountData)
          .select()
          .single()
        
        if (error) {
          console.error('[AUTH] linkAccount error:', error)
          // Check for duplicate key errors (account already exists)
          if (error.code === '23505') {
            console.warn('[AUTH] Account already linked (duplicate key)')
            // Return the account anyway - it's already linked
            return account
          }
          // For other errors, throw to prevent silent failures
          throw error
        }
        
        console.log('[AUTH] linkAccount success:', data?.id)
        return account
      } catch (e) {
        console.error('[AUTH] linkAccount exception:', e)
        throw e
      }
    },
    async createSession(session) {
      console.log('[AUTH] createSession called')
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .insert({
          session_token: session.sessionToken,
          user_id: session.userId,
          expires: session.expires,
        })
        .select()
        .single()
      
      if (error) throw error
      return {
        sessionToken: data.session_token,
        userId: data.user_id,
        expires: data.expires,
      }
    },
    async getSessionAndUser(sessionToken) {
      console.log('[AUTH] getSessionAndUser called')
      try {
        const { data: session, error } = await supabaseAdmin
          .from('sessions')
          .select()
          .eq('session_token', sessionToken)
          .single()
        
        if (error) {
          console.error('[AUTH] getSessionAndUser error:', error)
          // Don't throw on "not found" - just return null
          if (error.code === 'PGRST116') {
            console.log('[AUTH] Session not found')
            return null
          }
          // For other errors, log and return null
          return null
        }
        
        if (!session) return null
        
        const user = await this.getUser(session.user_id)
        return { 
          session: {
            sessionToken: session.session_token,
            userId: session.user_id,
            expires: session.expires,
          }, 
          user 
        }
      } catch (e) {
        console.error('[AUTH] getSessionAndUser exception:', e)
        return null
      }
    },
    async updateSession(session) {
      console.log('[AUTH] updateSession called')
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .update({
          expires: session.expires,
        })
        .eq('session_token', session.sessionToken)
        .select()
        .single()
      
      if (error) throw error
      return {
        sessionToken: data.session_token,
        userId: data.user_id,
        expires: data.expires,
      }
    },
    async deleteSession(sessionToken) {
      console.log('[AUTH] deleteSession called')
      try {
        const { error } = await supabaseAdmin
          .from('sessions')
          .delete()
          .eq('session_token', sessionToken)
        
        if (error) {
          console.error('[AUTH] deleteSession error:', error)
          // Don't throw - session might already be deleted
        }
      } catch (e) {
        console.error('[AUTH] deleteSession exception:', e)
        // Don't throw - deletion is idempotent
      }
    },
    async createVerificationToken(token) {
      console.log('[AUTH] createVerificationToken called')
      const { data, error} = await supabaseAdmin
        .from('verification_tokens')
        .insert({
          identifier: token.identifier,
          token: token.token,
          expires: token.expires,
        })
        .select()
        .single()
      
      if (error) {
        console.error('[AUTH] createVerificationToken error:', error)
        throw error
      }
      return {
        identifier: data.identifier,
        token: data.token,
        expires: data.expires,
      }
    },
    async useVerificationToken({ identifier, token }) {
      console.log('[AUTH] useVerificationToken called for:', identifier)
      const { data, error } = await supabaseAdmin
        .from('verification_tokens')
        .select()
        .eq('identifier', identifier)
        .eq('token', token)
        .single()
      
      if (error || !data) {
        console.error('[AUTH] useVerificationToken error:', error)
        return null
      }
      
      // Delete the token after successful retrieval
      await supabaseAdmin
        .from('verification_tokens')
        .delete()
        .eq('identifier', identifier)
        .eq('token', token)
      
      console.log('[AUTH] Verification token validated and deleted')
      return {
        identifier: data.identifier,
        token: data.token,
        expires: data.expires,
      }
    },
  },

  callbacks: {
    session: async ({ session, token }) => {
      if (session?.user && token.sub) {
        session.user.id = token.sub
        
        // Fetch has_access from database
        try {
          const { data: userData, error } = await supabaseAdmin
            .from('users')
            .select('has_access')
            .eq('id', token.sub)
            .single()
          
          if (!error && userData) {
            session.user.hasAccess = userData.has_access || false
          }
        } catch (error) {
          console.error('[AUTH] Error fetching has_access:', error)
          session.user.hasAccess = false
        }
      }
      return session
    },
  },
  
  session: {
    strategy: "jwt",
  },
  
  theme: {
    brandColor: config.colors.main,
    logo: `https://${config.domainName}/logoAndName.png`,
  },
}); 