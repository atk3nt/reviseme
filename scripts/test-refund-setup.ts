/**
 * Create test data for refund flow testing
 * Run with: npx tsx scripts/test-refund-setup.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupRefundTest() {
  // Use custom test email from env, or fall back to test account
  const testEmail = process.env.TEST_USER_EMAIL || 'appmarkrai@gmail.com';
  
  console.log('🧪 Setting up refund test data...\n');
  
  // 1. Find or create test user
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', testEmail)
    .single();
  
  if (!user) {
    console.log('📝 Creating test user...');
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email: testEmail,
        name: 'Test Refund User',
        has_access: true,
        email_verified: new Date().toISOString()
      })
      .select()
      .single();
    
    if (userError) {
      console.error('❌ Error creating user:', userError);
      process.exit(1);
    }
    
    user = newUser;
    console.log(`✅ Test user created: ${user.email} (${user.id})\n`);
  } else {
    console.log(`✅ Test user exists: ${user.email} (${user.id})\n`);
  }
  
  // 2. Check for existing payment
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (existingPayment) {
    const paymentDate = new Date(existingPayment.paid_at);
    const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = 7 - daysSincePayment;
    
    console.log('📋 Existing payment found:');
    console.log(`   Payment ID: ${existingPayment.id}`);
    console.log(`   Amount: £${(existingPayment.amount / 100).toFixed(2)}`);
    console.log(`   Status: ${existingPayment.status}`);
    console.log(`   Paid: ${paymentDate.toLocaleDateString()} (${daysSincePayment} days ago)`);
    console.log(`   Days remaining for refund: ${daysRemaining}\n`);
    
    if (daysRemaining > 0) {
      console.log('✅ Payment is eligible for refund!\n');
    } else {
      console.log('⚠️  Payment is expired. Creating a fresh payment...\n');
      
      // Create new payment
      const { data: newPayment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          stripe_session_id: `cs_test_${Date.now()}`,
          stripe_customer_id: `cus_test_${Date.now()}`,
          amount: 2999,
          currency: 'GBP',
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (paymentError) {
        console.error('❌ Error creating payment:', paymentError);
        process.exit(1);
      }
      
      console.log('✅ New payment created:');
      console.log(`   Payment ID: ${newPayment.id}`);
      console.log(`   Amount: £${(newPayment.amount / 100).toFixed(2)}\n`);
    }
  } else {
    console.log('📝 Creating test payment...');
    const { data: newPayment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        stripe_session_id: `cs_test_${Date.now()}`,
        stripe_customer_id: `cus_test_${Date.now()}`,
        amount: 2999,
        currency: 'GBP',
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (paymentError) {
      console.error('❌ Error creating payment:', paymentError);
      process.exit(1);
    }
    
    console.log('✅ Test payment created:');
    console.log(`   Payment ID: ${newPayment.id}`);
    console.log(`   Amount: £${(newPayment.amount / 100).toFixed(2)}`);
    console.log(`   Status: ${newPayment.status}\n`);
  }
  
  // 3. Summary
  console.log('✨ Test data ready!\n');
  console.log(`📧 Using test email: ${testEmail}`);
  if (process.env.TEST_USER_EMAIL) {
    console.log('   (Custom email from TEST_USER_EMAIL env variable)\n');
  } else {
    console.log('   (Testing alias - set TEST_USER_EMAIL env var to override)\n');
  }
  console.log('📋 Next steps:');
  console.log(`   1. Sign in to your app with: ${testEmail}`);
  console.log('   2. Open Support Modal (click Support button)');
  console.log('   3. Click "Guarantee" button');
  console.log('   4. Verify eligibility check shows payment details');
  console.log('   5. Click "Confirm Refund"');
  console.log('   6. Check results:\n');
  console.log('   ✅ Stripe Dashboard → Refunds (should see refund)');
  console.log('   ✅ Database: payments.status = "refunded"');
  console.log('   ✅ Database: users.has_access = false');
  console.log('   ✅ Email inbox (if Resend configured)');
  console.log('   ✅ Logs table has refund event\n');
  
  console.log('💡 To test expired refund, run:');
  console.log('   UPDATE payments SET paid_at = NOW() - INTERVAL \'8 days\' WHERE user_id = \'' + user.id + '\';\n');
}

setupRefundTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

