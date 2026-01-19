import { Resend } from 'resend';
import config from '@/config';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(userEmail, userName) {
  try {
    const preheaderText = "Your revision journey starts now.";
    
    const text = `
Welcome to ReviseMe!

Your revision journey starts now.

Thank you for signing up! We're excited to have you here.

Need Help?

You can navigate to the Settings and Support/Feedback buttons to send an email directly to our inbox. We can help with any problems, bugs, or feature suggestions you might have.

You can also email us directly at ${config.resend.supportEmail}

Tips for Success:

• Be honest about your confidence ratings - it helps us prioritise correctly
• Set realistic availability - consistency is better than cramming
• Check your plan daily and mark blocks as done
• Don't worry if you miss a session - we'll reschedule it for you

Questions? Just reply to this email - we'd love to hear from you!

Good luck with your A-Levels!
— The ReviseMe Team
    `.trim();

    const { data, error } = await resend.emails.send({
      from: config.resend.fromAdmin,
      to: [userEmail],
      replyTo: config.resend.supportEmail,
      subject: 'Welcome to ReviseMe!',
      text: text,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <!--[if !mso]><!-->
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
          <!--<![endif]-->
          <style>
            @media only screen and (max-width: 600px) {
              .container { padding: 15px !important; }
              h1 { font-size: 24px !important; }
            }
          </style>
          <!--[if mso]>
          <style type="text/css">
            body, table, td {font-family: Arial, sans-serif !important;}
          </style>
          <![endif]-->
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
          <div style="display: none; font-size: 1px; color: #fefefe; line-height: 1px; font-family: 'DM Sans', sans-serif; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
            ${preheaderText}
          </div>
          <div class="container" style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FFFFFF;">
            <div style="text-align: center; margin-bottom: 30px;">
              <img 
                src="https://reviseme.co/reviseme_email_logo.png" 
                alt="ReviseMe Logo" 
                style="max-width: 200px; height: auto; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;"
              />
              <h1 style="color: #001433; font-size: 28px; margin-bottom: 10px; font-weight: 700;">Welcome to ReviseMe!</h1>
              <p style="color: #003D99; font-size: 16px; margin: 0;">Your revision journey starts now.</p>
              <p style="color: #003D99; font-size: 16px; margin: 10px 0 0 0;">Thank you for signing up! We're excited to have you here.</p>
            </div>
            
            <div style="background: #E5F0FF; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <h2 style="color: #001433; margin-bottom: 15px; font-weight: 600;">Need Help?</h2>
              <p style="color: #003D99; line-height: 1.6; margin: 0;">
                You can navigate to the Settings and Support/Feedback buttons to send an email directly to our inbox. 
                We can help with any problems, bugs, or feature suggestions you might have.
              </p>
              <p style="color: #003D99; line-height: 1.6; margin: 10px 0 0 0;">
                You can also email us directly at <a href="mailto:${config.resend.supportEmail}" style="color: #0066FF; text-decoration: underline;">${config.resend.supportEmail}</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5F0FF; padding-top: 20px; margin-top: 30px;">
              <h3 style="color: #001433; margin-bottom: 15px; font-weight: 600;">Tips for Success</h3>
              <ul style="color: #003D99; line-height: 1.6; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Be honest about your confidence ratings - it helps us prioritise correctly</li>
                <li style="margin-bottom: 8px;">Set realistic availability - consistency is better than cramming</li>
                <li style="margin-bottom: 8px;">Check your plan daily and mark blocks as done</li>
                <li>Don't worry if you miss a session - we'll reschedule it for you</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5F0FF;">
              <p style="color: #003D99; font-size: 14px; margin: 0;">
                Questions? Just reply to this email - we'd love to hear from you!
              </p>
              <p style="color: #003D99; font-size: 14px; margin: 5px 0 0 0;">
                Good luck with your A-Levels!<br>
                <span style="font-weight: 600; color: #001433;">— The ReviseMe Team</span>
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('Error sending welcome email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error };
  }
}
