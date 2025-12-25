# Stripe Price Setup Guide

## The Error
"No such price: 'price_test_exam_season_pass'" means the price doesn't exist in your Stripe account.

## Solution: Create the Price in Stripe

### Step 1: Go to Stripe Dashboard
1. Go to https://dashboard.stripe.com/test/products (make sure you're in **Test mode** - toggle in top right)
2. Click **"+ Add product"** button

### Step 2: Create Product
Fill in:
- **Name:** `Exam Season Pass`
- **Description:** `Jan–July 2026 • 7-day refund guarantee`
- Click **"Continue"**

### Step 3: Set Price
- **Pricing model:** One time
- **Price:** `29.99`
- **Currency:** `GBP` (British Pound)
- **Billing period:** One time
- Click **"Save product"**

### Step 4: Copy the Price ID
After creating, you'll see the product. Click on it to see details.
- Look for **"Price ID"** - it will look like `price_1ABC123...` or `price_test_1ABC123...`
- **Copy this ID**

### Step 5: Update Config
Update `config.js` with your actual Price ID:

```javascript
priceId:
  process.env.NODE_ENV === "development"
    ? "price_test_YOUR_ACTUAL_ID_HERE",  // Replace with your Stripe test price ID
    : "price_live_YOUR_ACTUAL_ID_HERE",  // Replace with your Stripe live price ID
```

## Quick Alternative: Use Existing Price

If you already have a price in Stripe:
1. Go to https://dashboard.stripe.com/test/products
2. Find your existing product/price
3. Copy its Price ID
4. Update `config.js` with that ID

## Test Mode vs Live Mode

- **Test mode:** Use test API keys and test price IDs (starts with `price_test_`)
- **Live mode:** Use live API keys and live price IDs (starts with `price_`)

Make sure you're using test mode price IDs when `NODE_ENV === "development"`.

