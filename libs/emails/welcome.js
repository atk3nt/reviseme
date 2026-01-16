import { Resend } from 'resend';
import config from '@/config';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(userEmail, userName) {
  try {
    const { data, error } = await resend.emails.send({
      from: config.resend.fromAlex,
      to: [userEmail],
      subject: 'Welcome to ReviseMe! 🎯',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #001433; font-size: 28px; margin-bottom: 10px;">Welcome to ReviseMe! 🎯</h1>
            <p style="color: #003D99; font-size: 16px;">Your AI-powered revision journey starts now</p>
          </div>
          
          <div style="background: #E5F0FF; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #001433; margin-bottom: 15px;">What's next?</h2>
            <ol style="color: #003D99; line-height: 1.6;">
              <li><strong>Complete your setup:</strong> Choose your subjects and exam boards</li>
              <li><strong>Rate your confidence:</strong> Tell us how confident you feel about each topic</li>
              <li><strong>Set your availability:</strong> When can you study each day?</li>
              <li><strong>Get your personalized plan:</strong> We'll create your first revision schedule</li>
            </ol>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://reviseme.co/onboarding" 
               style="background: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              Start Your Setup →
            </a>
          </div>
          
          <div style="border-top: 1px solid #E5F0FF; padding-top: 20px; margin-top: 30px;">
            <h3 style="color: #001433; margin-bottom: 15px;">Pro Tips for Success:</h3>
            <ul style="color: #003D99; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>Be honest about your confidence ratings - it helps us prioritize correctly</li>
              <li>Set realistic availability - consistency is better than cramming</li>
              <li>Check your plan daily and mark blocks as done</li>
              <li>Don't worry if you miss a session - we'll reschedule it for you</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5F0FF;">
            <p style="color: #003D99; font-size: 14px; margin: 0;">
              Questions? Just reply to this email - I'd love to hear from you!
            </p>
            <p style="color: #003D99; font-size: 14px; margin: 5px 0 0 0;">
              Good luck with your A-Levels! 🚀<br>
              <span style="font-weight: 600; color: #001433;">— Alex</span>
            </p>
          </div>
        </div>
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


