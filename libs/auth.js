import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import config from "@/config"
import { supabaseAdmin } from "./supabase"

// Helper function to get user by ID (used by adapter methods)
const getUserById = async (id) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select()
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('[AUTH] getUserById error:', error)
      return null
    }
    console.log('[AUTH] getUserById result:', data ? 'found' : 'not found')
    return data ? {
      id: data.id,
      email: data.email,
      name: data.name,
      image: data.image,
      emailVerified: data.email_verified,
    } : null
  } catch (e) {
    console.error('[AUTH] getUserById exception:', e)
    return null
  }
}

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
      from: config.resend.fromAdmin,
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
      console.log('[AUTH] ⭐ createUser called:', { 
        email: user.email, 
        name: user.name, 
        hasEmail: !!user.email,
        hasName: !!user.name 
      })
      
      try {
        // Validate that we have an email (required)
        if (!user.email) {
          console.error('[AUTH] ❌ createUser called without email!')
          throw new Error('Email is required to create a user')
        }
        
        // First, check if user with this email already exists (ghost user case)
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select()
          .eq('email', user.email)
          .single()
        
        if (existingUser) {
          console.log('[AUTH] ✅ User with email already exists, returning existing user:', existingUser.id)
          // Update the existing user with new info if provided
          const updateData = {}
          if (user.name && !existingUser.name) updateData.name = user.name
          if (user.image && !existingUser.image) updateData.image = user.image
          if (user.emailVerified && !existingUser.email_verified) {
            updateData.email_verified = user.emailVerified ? new Date(user.emailVerified) : null
          }
          
          if (Object.keys(updateData).length > 0) {
            console.log('[AUTH] 🔄 Updating existing user with new data:', Object.keys(updateData))
            const { data: updatedUser } = await supabaseAdmin
              .from('users')
              .update(updateData)
              .eq('id', existingUser.id)
              .select()
              .single()
            
            if (updatedUser) {
              return {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                image: updatedUser.image,
                emailVerified: updatedUser.email_verified,
              }
            }
          }
          
          // Return existing user
          return {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
            image: existingUser.image,
            emailVerified: existingUser.email_verified,
          }
        }
        
        // User doesn't exist, create new one
        console.log('[AUTH] 🆕 Creating new user in database...')
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
          console.error('[AUTH] ❌ createUser error:', error)
          // If it's a duplicate key error, try to get the existing user
          if (error.code === '23505') {
            console.log('[AUTH] 🔄 Duplicate key error, fetching existing user')
            const { data: existing } = await supabaseAdmin
              .from('users')
              .select()
              .eq('email', user.email)
              .single()
            
            if (existing) {
              console.log('[AUTH] ✅ Found existing user after duplicate key error:', existing.id)
              return {
                id: existing.id,
                email: existing.email,
                name: existing.name,
                image: existing.image,
                emailVerified: existing.email_verified,
              }
            }
          }
          throw error
        }
        console.log('[AUTH] ✅ createUser success! New user ID:', data?.id)
        // Map snake_case to camelCase for NextAuth
        return {
          id: data.id,
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.email_verified,
        }
      } catch (e) {
        console.error('[AUTH] ❌ createUser exception:', e)
        throw e
      }
    },
    async getUser(id) {
      return await getUserById(id)
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
        
        // Use the helper function instead of this.getUser
        return await getUserById(data.user_id)
      } catch (e) {
        console.error('[AUTH] getUserByAccount exception:', e)
        return null
      }
    },
    async createAccount(account) {
      // This is called when linking a new account to an existing user
      console.log('[AUTH] createAccount called for:', account.provider, account.providerAccountId)
      return await this.linkAccount(account)
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
      console.log('[AUTH] 🔗 linkAccount called:', { 
        provider: account.provider, 
        providerAccountId: account.providerAccountId,
        userId: account.userId 
      })
      
      try {
        // CRITICAL: Verify that userId exists and is valid
        if (!account.userId) {
          console.error('[AUTH] ❌ linkAccount called without userId!')
          throw new Error('Cannot link account: userId is missing')
        }
        
        // CRITICAL: Verify that the user exists in the users table before linking
        console.log('[AUTH] 🔍 Verifying user exists before linking account...')
        const { data: userExists, error: userCheckError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', account.userId)
          .single()
        
        if (userCheckError || !userExists) {
          console.error('[AUTH] ❌ User does not exist in users table:', {
            userId: account.userId,
            error: userCheckError
          })
          throw new Error(`Cannot link account: User ${account.userId} does not exist in users table. This is a critical error - createUser should have been called first.`)
        }
        
        console.log('[AUTH] ✅ User verified, proceeding with account linking...')
        
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
          console.error('[AUTH] ❌ linkAccount error:', error)
          
          // Check for duplicate key errors (account already exists)
          if (error.code === '23505') {
            console.warn('[AUTH] ⚠️ Account already linked (duplicate key)')
            // Return the account anyway - it's already linked
            return account
          }
          
          // Check for foreign key constraint violations (user doesn't exist)
          if (error.code === '23503') {
            console.error('[AUTH] ❌ Foreign key constraint violation! User does not exist:', account.userId)
            throw new Error(`Cannot link account: User ${account.userId} does not exist. This should have been caught earlier.`)
          }
          
          // For other errors, throw to prevent silent failures
          throw error
        }
        
        console.log('[AUTH] ✅ linkAccount success! Account ID:', data?.id)
        return account
      } catch (e) {
        console.error('[AUTH] ❌ linkAccount exception:', e)
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
        
        // Use the helper function instead of this.getUser
        const user = await getUserById(session.user_id)
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
    signIn: async ({ user, account, profile }) => {
      // Handle account linking for Google OAuth when user exists but no account is linked
      if (account?.provider === 'google' && user?.email) {
        try {
          // Check if user with this email already exists
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single();

          if (existingUser) {
            console.log('[AUTH] Found existing user with email:', user.email);
            
            // Check if Google account is already linked
            const { data: existingAccount } = await supabaseAdmin
              .from('accounts')
              .select('id')
              .eq('user_id', existingUser.id)
              .eq('provider', 'google')
              .eq('provider_account_id', account.providerAccountId)
              .single();

            // If account doesn't exist, manually link it
            if (!existingAccount) {
              console.log('[AUTH] Manually linking Google account to existing user:', existingUser.id);
              
              try {
                await supabaseAdmin
                  .from('accounts')
                  .insert({
                    user_id: existingUser.id,
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
                  });
                
                console.log('[AUTH] Successfully linked Google account');
                
                // Update user object with existing user ID so NextAuth uses the existing user
                user.id = existingUser.id;
                return true;
              } catch (linkError) {
                // If duplicate key error, account is already linked
                if (linkError.code === '23505') {
                  console.log('[AUTH] Account already linked (duplicate key)');
                  user.id = existingUser.id;
                  return true;
                }
                console.error('[AUTH] Error linking account:', linkError);
                // Still allow sign in even if linking fails
                return true;
              }
            } else {
              console.log('[AUTH] Google account already linked');
            }
          }
        } catch (error) {
          // If check fails, still allow sign in
          console.log('[AUTH] Error in signIn callback:', error.message);
        }
      }
      
      // Always allow sign in
      return true;
    },
    session: async ({ session, token }) => {
      if (session?.user && token.sub) {
        session.user.id = token.sub
        
        // Fetch has_access and has_completed_onboarding from database
        try {
          const { data: userData, error } = await supabaseAdmin
            .from('users')
            .select('has_access, has_completed_onboarding')
            .eq('id', token.sub)
            .single()
          
          if (!error && userData) {
            session.user.hasAccess = userData.has_access || false
            session.user.hasCompletedOnboarding = userData.has_completed_onboarding || false
          }
        } catch (error) {
          console.error('[AUTH] Error fetching user data:', error)
          session.user.hasAccess = false
          session.user.hasCompletedOnboarding = false
        }
      }
      return session
    },
  },
  
  session: {
    strategy: "jwt",
  },
  
  // Allow automatic account linking when emails match
  // Safe because both Google and Email providers verify email addresses
  allowDangerousEmailAccountLinking: true,
  
  theme: {
    brandColor: config.colors.main,
    logo: `https://${config.domainName}/logoAndName.png`,
  },
}); 