# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your app. Once configured, users will be able to sign in with their Google accounts.

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)
- Your app domain (e.g., `reviseme.co` or `localhost:3000` for development)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., "ReviseMe")
5. Click **"Create"**
6. Wait for the project to be created, then select it

## Step 2: Enable Google+ API

1. In the Google Cloud Console, go to **"APIs & Services" > "Library"**
2. Search for **"Google+ API"** or **"Google Identity Services"**
3. Click on it and click **"Enable"**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services" > "Credentials"**
2. Click **"+ Create Credentials"** at the top
3. Select **"OAuth client ID"**
4. If prompted, configure the OAuth consent screen first:
   - Choose **"External"** (unless you have a Google Workspace)
   - Fill in the required fields:
     - **App name:** `ReviseMe` (or your app name)
     - **User support email:** Your email
     - **Developer contact information:** Your email
   - Click **"Save and Continue"** through the scopes (default is fine)
   - Add test users if needed (for development)
   - Click **"Save and Continue"** to finish
5. Back at the credentials page, click **"+ Create Credentials" > "OAuth client ID"**
6. Select **"Web application"** as the application type
7. Give it a name (e.g., "ReviseMe Web Client")
8. Add **Authorized JavaScript origins:**
   - For development: `http://localhost:3000`
   - For production: `https://reviseme.co` (or your domain)
9. Add **Authorized redirect URIs:**
   - For development: `http://localhost:3000/api/auth/callback/google`
   - For production: `https://reviseme.co/api/auth/callback/google` (or your domain)
10. Click **"Create"**

## Step 4: Copy Your Credentials

After creating the OAuth client, you'll see a popup with:
- **Client ID** (looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
- **Client secret** (looks like: `GOCSPX-abcdefghijklmnopqrstuvwxyz`)

**Copy both of these values** - you'll need them in the next step.

## Step 5: Add Environment Variables

Add these to your `.env.local` file (for development) or your hosting platform's environment variables (for production):

```env
GOOGLE_ID=your_client_id_here
GOOGLE_SECRET=your_client_secret_here
```

**Important:** 
- Never commit these values to git
- Make sure `.env.local` is in your `.gitignore`
- For production, add these in your hosting platform (Vercel, etc.)

## Step 6: Verify Setup

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Go to your sign-in page
3. You should now see a **"Sign in with Google"** button
4. Click it and test the authentication flow

## Troubleshooting

### "Error 400: redirect_uri_mismatch"

This means the redirect URI in your Google OAuth settings doesn't match what NextAuth is using.

**Solution:**
1. Go back to Google Cloud Console > Credentials
2. Click on your OAuth 2.0 Client ID
3. Make sure the **Authorized redirect URIs** includes:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`
4. Save and wait a few minutes for changes to propagate

### Google Sign-In Button Not Showing

**Check:**
1. Environment variables are set correctly
2. `GOOGLE_ID` doesn't contain placeholder text like `your_google`
3. Server has been restarted after adding environment variables
4. Check browser console for any errors

### "Access blocked: This app's request is invalid"

**For development:**
- Make sure you've added your email as a test user in the OAuth consent screen
- Go to **"APIs & Services" > "OAuth consent screen"**
- Add your email under **"Test users"**

**For production:**
- You'll need to publish your app (submit for verification) if you want to allow all users
- For now, test users can still sign in

## Production Checklist

- [ ] OAuth consent screen is configured
- [ ] Authorized redirect URIs include your production domain
- [ ] Environment variables are set in your hosting platform
- [ ] Test the sign-in flow on production
- [ ] Verify user data is saved correctly in your database

## Security Notes

- Keep your `GOOGLE_SECRET` secure and never expose it in client-side code
- Regularly rotate your OAuth credentials
- Monitor your Google Cloud Console for any suspicious activity
- Use different OAuth clients for development and production if possible

## Next Steps

Once Google OAuth is working:
- Users can sign in with their Google accounts
- User profile data (name, email, image) will be automatically saved
- The authentication flow is handled by NextAuth automatically

---

**Time Required:** ~10-15 minutes  
**Impact:** Users can sign in with Google instead of email

