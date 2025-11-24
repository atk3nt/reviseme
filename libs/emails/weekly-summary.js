import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWeeklySummaryEmail(userEmail, userName, summary, stats) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'ReviseMe <noreply@reviseme.co>',
      to: [userEmail],
      subject: `Your Weekly Revision Summary - ${stats.weekStart}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 10px;">Weekly Summary 📊</h1>
            <p style="color: #6b7280; font-size: 16px;">Here's how you did this week</p>
          </div>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #1f2937; margin-bottom: 15px;">This Week's Stats</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
              <div style="text-align: center; padding: 15px; background: white; border-radius: 6px;">
                <div style="font-size: 24px; font-weight: bold; color: #10b981;">${stats.blocksDone}</div>
                <div style="color: #6b7280; font-size: 14px;">Blocks Completed</div>
              </div>
              <div style="text-align: center; padding: 15px; background: white; border-radius: 6px;">
                <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${stats.completionRate}%</div>
                <div style="color: #6b7280; font-size: 14px;">Completion Rate</div>
              </div>
            </div>
          </div>
          
          <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #92400e; margin-bottom: 15px;">🤖 AI Insights</h2>
            <div style="color: #92400e; line-height: 1.6;">
              ${summary.split('\n').map(point => `<div style="margin-bottom: 8px;">• ${point.trim()}</div>`).join('')}
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://reviseme.co/plan" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; margin-right: 10px;">
              View Your Plan
            </a>
            <a href="https://reviseme.co/insights" 
               style="background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              See All Insights
            </a>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
            <h3 style="color: #1f2937; margin-bottom: 15px;">Keep it up! 💪</h3>
            <p style="color: #374151; line-height: 1.6; margin: 0;">
              ${stats.blocksDone > 0 ? 
                `You're doing great! ${stats.blocksDone} revision sessions this week is excellent progress.` : 
                'Ready to get started? Your personalized revision plan is waiting for you.'
              }
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Questions? Reply to this email or visit our help center.
            </p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('Error sending weekly summary email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending weekly summary email:', error);
    return { success: false, error };
  }
}


