import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendRefundConfirmationEmail(userEmail, userName, refundAmount, refundId) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'ReviseMe <hello@reviseme.co>',
      to: [userEmail],
      subject: 'Refund Processed - Markr Planner',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 10px;">Refund Processed ✅</h1>
            <p style="color: #6b7280; font-size: 16px;">Your refund has been successfully processed</p>
          </div>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #1f2937; margin-bottom: 15px;">Refund Details</h2>
            <div style="background: white; padding: 15px; border-radius: 6px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: #374151;">Amount Refunded:</span>
                <span style="font-weight: bold; color: #1f2937;">£${refundAmount}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: #374151;">Refund ID:</span>
                <span style="font-family: monospace; color: #6b7280;">${refundId}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #374151;">Date Processed:</span>
                <span style="color: #6b7280;">${new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #dc2626; margin-bottom: 15px;">Important Information</h2>
            <ul style="color: #7f1d1d; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>Your access to Markr Planner has been revoked</li>
              <li>The refund will appear on your original payment method within 5-10 business days</li>
              <li>You can re-purchase anytime if you change your mind</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://reviseme.co/pricing" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              View Pricing Again
            </a>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
            <h3 style="color: #1f2937; margin-bottom: 15px;">We're Sorry to See You Go</h3>
            <p style="color: #374151; line-height: 1.6; margin: 0;">
              We're sorry Markr Planner wasn't the right fit for you. If you have any feedback 
              about your experience, we'd love to hear it. Your input helps us improve.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Questions about this refund? Reply to this email.
            </p>
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">
              Thank you for trying Markr Planner! 🙏
            </p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('Error sending refund confirmation email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending refund confirmation email:', error);
    return { success: false, error };
  }
}


