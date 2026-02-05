// ============================================
// CREATE TEST PAYMENT - Browser Console Script
// ============================================
// 
// HOW TO USE:
// 1. Make sure you're logged in to your app
// 2. Open browser console (F12 or Cmd+Option+I)
// 3. Copy and paste this entire file
// 4. Press Enter
// 
// This will create a test payment that you can use
// to test the refund flow with feedback.
// ============================================

(async function createTestPayment() {
  console.log('🚀 Creating test payment...');
  
  try {
    const response = await fetch('/api/dev/create-test-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ SUCCESS! Test payment created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Amount:', data.payment?.amountInPounds ? `£${data.payment.amountInPounds}` : `£${(data.payment?.amount / 100).toFixed(2)}`);
      console.log('Status:', data.payment?.status);
      console.log('Payment ID:', data.payment?.id);
      if (data.payment?.daysRemaining) {
        console.log('Days remaining for refund:', data.payment.daysRemaining);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('📝 Next steps:');
      console.log('1. Open the Support Modal (click Support in sidebar)');
      console.log('2. Click "Guarantee" option');
      console.log('3. Enter feedback (10+ characters)');
      console.log('4. Click "Confirm Refund"');
      console.log('');
      console.log('✨ Your test payment is ready!');
      
      // Show alert
      alert(`✅ Test payment created successfully!\n\nAmount: £${data.payment?.amountInPounds || (data.payment?.amount / 100).toFixed(2)}\n\nNow you can test the refund flow!`);
      
      return data;
    } else {
      console.error('❌ ERROR:', data.error);
      if (data.details) {
        console.error('Details:', data.details);
      }
      
      if (response.status === 401) {
        console.error('');
        console.error('⚠️ You need to be logged in first!');
        console.error('Please sign in and try again.');
        alert('❌ Error: You need to be logged in first!\n\nPlease sign in and try again.');
      } else {
        alert(`❌ Error: ${data.error}\n\n${data.details || ''}`);
      }
      
      return null;
    }
  } catch (error) {
    console.error('❌ EXCEPTION:', error);
    console.error('');
    console.error('⚠️ Make sure you are:');
    console.error('1. Logged in to the app');
    console.error('2. Running this in the browser console (not terminal)');
    console.error('3. On a page within your app (not a different domain)');
    
    alert(`❌ Error: ${error.message}\n\nMake sure you're logged in and running this in the browser console.`);
    
    return null;
  }
})();

// ============================================
// ALTERNATIVE: Manual Database Insert
// ============================================
// 
// If the above doesn't work, you can manually insert
// a test payment in Supabase SQL Editor:
//
// 1. Go to Supabase Dashboard
// 2. Open SQL Editor
// 3. Run this query (replace YOUR_USER_ID):
//
// INSERT INTO payments (
//   user_id,
//   stripe_session_id,
//   stripe_customer_id,
//   amount,
//   currency,
//   status,
//   paid_at
// ) VALUES (
//   'YOUR_USER_ID',  -- Get this from users table
//   'cs_test_' || floor(random() * 1000000)::text,
//   'cus_test_' || floor(random() * 1000000)::text,
//   2999,  -- £29.99
//   'GBP',
//   'paid',
//   NOW()
// )
// RETURNING *;
//
// ============================================
