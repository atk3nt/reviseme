# Family Access - Quick Start

## ⚡ How to Add a Family Member (30 seconds)

### 1. Add Their Email

Edit: `app/api/dev/set-access/route.js`

```javascript
const FAMILY_EMAILS = [
  'mom@example.com',        // ← Add emails here
  'brother@example.com',    // ← One per line
];
```

### 2. Deploy

```bash
git add .
git commit -m "Add family member"
git push
```

### 3. Share This Link

Send them: **app.reviseme.co/family**

---

## 📧 Message Template for Family

```
Hi! I've set up free access for you to ReviseMe.

Here's how to activate it:

1. Go to: app.reviseme.co/family
2. Click "Sign In" and use THIS email: your.email@example.com
3. Check your email for the magic link and click it
4. Click "Activate My Family Access"
5. Start onboarding!

You won't need to pay - the payment page will be skipped automatically.

Let me know if you have any issues!
```

---

## ✅ That's It!

They'll have full access without ever seeing the payment page.

See `FAMILY_ACCESS_SETUP.md` for full documentation.
