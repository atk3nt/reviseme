import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import configFile from "@/config";
import { supabaseAdmin } from "@/libs/supabase";
import { findCheckoutSession } from "@/libs/stripe";

// Initialize Stripe only if the secret key is available
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// This is where we receive Stripe webhook events
// It used to update the user data, send emails, etc...
// By default, it'll store the user in the database
// See more: https://shipfa.st/docs/features/payments
export async function POST(req) {
  // Check if Stripe is configured
  if (!stripe || !webhookSecret) {
    console.error("Stripe is not configured properly. Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Stripe configuration missing" }, { status: 500 });
  }

  const body = await req.text();

  const signature = (await headers()).get("stripe-signature");

  let data;
  let eventType;
  let event;

  // verify Stripe event is legit
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed. ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  data = event.data;
  eventType = event.type;

  try {
    switch (eventType) {
      case "checkout.session.completed": {
        // First payment is successful and a subscription is created (if mode was set to "subscription" in ButtonCheckout)
        // ✅ Grant access to the product

        const session = await findCheckoutSession(data.object.id);

        const customerId = session?.customer;
        const priceId = session?.line_items?.data[0]?.price.id;
        const userId = data.object.client_reference_id;
        const plan = configFile.stripe.plans.find((p) => p.priceId === priceId);

        if (!plan) break;

        const customer = await stripe.customers.retrieve(customerId);

        let user;

        // Get or update user. userId is passed in the checkout session (clientReferenceID) to identify the user when we get the webhook event
        if (userId) {
          // Update existing user
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
              price_id: priceId,
              customer_id: customerId,
              has_access: true
            })
            .eq('id', userId);
          
          if (updateError) {
            console.error('Error updating user:', updateError);
            throw updateError;
          }
          
          user = { id: userId };
        } else if (customer.email) {
          // Try to find user by email
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', customer.email)
            .single();
          
          if (existingUser) {
            // Update existing user
            const { error: updateError } = await supabaseAdmin
              .from('users')
              .update({
                price_id: priceId,
                customer_id: customerId,
                has_access: true
              })
              .eq('id', existingUser.id);
            
            if (updateError) {
              console.error('Error updating user:', updateError);
              throw updateError;
            }
            
            user = existingUser;
          } else {
            console.error("No user found for email:", customer.email);
            throw new Error("No user found");
          }
        } else {
          console.error("No user ID or email found");
          throw new Error("No user found");
        }

        // Create payment record for one-time payments (mode: 'payment')
        // This is needed for refund functionality
        if (session.mode === 'payment' && session.payment_intent && user?.id) {
          const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
          
          // Create payment record
          const { error: paymentError } = await supabaseAdmin
            .from('payments')
            .insert({
              user_id: user.id,
              stripe_session_id: session.id,
              stripe_customer_id: customerId,
              amount: session.amount_total, // Amount in cents
              currency: session.currency || 'GBP',
              status: 'paid',
              paid_at: new Date().toISOString()
            });

          if (paymentError) {
            // Log error but don't fail the webhook - payment might already exist
            console.error('Error creating payment record:', paymentError);
            // Check if payment already exists (unique constraint on stripe_session_id)
            if (paymentError.code !== '23505') { // Not a duplicate key error
              throw paymentError;
            }
          } else {
            console.log('✅ Payment record created for user:', user.id);
          }
        }

        // Extra: send email with user link, product page, etc...
        // try {
        //   await sendEmail({to: ...});
        // } catch (e) {
        //   console.error("Email issue:" + e?.message);
        // }

        break;
      }

      case "checkout.session.expired": {
        // User didn't complete the transaction
        // You don't need to do anything here, by you can send an email to the user to remind him to complete the transaction, for instance
        break;
      }

      case "customer.subscription.updated": {
        // The customer might have changed the plan (higher or lower plan, cancel soon etc...)
        // You don't need to do anything here, because Stripe will let us know when the subscription is canceled for good (at the end of the billing cycle) in the "customer.subscription.deleted" event
        // You can update the user data to show a "Cancel soon" badge for instance
        break;
      }

      case "customer.subscription.deleted": {
        // The customer subscription stopped
        // ❌ Revoke access to the product (for subscription products only)
        const subscription = await stripe.subscriptions.retrieve(
          data.object.id
        );

        const { data: user } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('customer_id', subscription.customer)
          .single();

        if (user) {
          // Revoke access to your product
          await supabaseAdmin
            .from('users')
            .update({ has_access: false })
            .eq('id', user.id);
        }

        break;
      }

      case "invoice.paid": {
        // Customer just paid an invoice (for instance, a recurring payment for a subscription)
        // ✅ Grant access to the product
        const priceId = data.object.lines.data[0].price.id;
        const customerId = data.object.customer;

        const { data: user } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('customer_id', customerId)
          .single();

        if (user) {
          // Make sure the invoice is for the same plan (priceId) the user subscribed to
          if (user.price_id !== priceId) break;

          // Grant user access to your product
          await supabaseAdmin
            .from('users')
            .update({ has_access: true })
            .eq('id', user.id);
        }

        break;
      }

      case "invoice.payment_failed":
        // A payment failed (for instance the customer does not have a valid payment method)
        // ❌ Revoke access to the product
        // ⏳ OR wait for the customer to pay (more friendly):
        //      - Stripe will automatically email the customer (Smart Retries)
        //      - We will receive a "customer.subscription.deleted" when all retries were made and the subscription has expired

        break;

      default:
      // Unhandled event type
    }
  } catch (e) {
    console.error("stripe error: " + e.message + " | EVENT TYPE: " + eventType);
  }

  return NextResponse.json({});
}
