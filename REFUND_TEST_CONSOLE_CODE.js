// Quick refund test - paste into browser console

// 1. Create test payment
fetch('/api/dev/create-test-payment', { method: 'POST' })
  .then(r => r.json())
  .then(data => console.log('✅ Payment created:', data));

// 2. Process refund (after payment is created, get payment ID from above, then run):
// fetch('/api/refund/request', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({ paymentId: 'YOUR_PAYMENT_ID_HERE' })
// })
//   .then(r => r.json())
//   .then(data => console.log('✅ Refund processed:', data));
