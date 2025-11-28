import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { sendEmail } from "@/libs/resend";
import config from "@/config";

export async function POST(req) {
  try {
    const session = await auth();
    
    // Allow dev mode bypass for testing
    const isDev = process.env.NODE_ENV === 'development';
    const hasAuth = session?.user?.id;
    
    if (!hasAuth && !isDev) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { type, message } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "Type and message are required" },
        { status: 400 }
      );
    }

    const typeLabels = {
      issue: "Issue",
      idea: "Idea",
      other: "Other"
    };

    // Use session data if available, otherwise use dev fallbacks
    const userEmail = session?.user?.email || "dev-test@reviseme.local";
    const userName = session?.user?.name || "Dev Tester";
    const userId = session?.user?.id || "dev-user-id";

    // Send email to support inbox
    const supportEmail = config.resend.supportEmail || "support@reviseme.co";
    
    console.log("Attempting to send support email:", {
      to: supportEmail,
      from: config.resend.fromAdmin,
      subject: `[${typeLabels[type] || "Support"}] Message from ${userName}`,
      hasResendKey: !!process.env.RESEND_API_KEY
    });
    
    await sendEmail({
      to: supportEmail,
      subject: `[${typeLabels[type] || "Support"}] Message from ${userName}`,
      text: `
Type: ${typeLabels[type] || type}
From: ${userName} (${userEmail})
User ID: ${userId}
${isDev && !hasAuth ? '\n[DEV MODE - No authentication required]' : ''}

Message:
${message}
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1f2937; margin-bottom: 20px;">New Support Message</h2>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p><strong>Type:</strong> ${typeLabels[type] || type}</p>
            <p><strong>From:</strong> ${userName} (${userEmail})</p>
            <p><strong>User ID:</strong> ${userId}</p>
            ${isDev && !hasAuth ? '<p style="color: #f59e0b;"><strong>[DEV MODE - No authentication required]</strong></p>' : ''}
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
        </div>
      `,
      replyTo: userEmail,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support email error:", error);
    const errorMessage = error?.message || error?.toString() || "Unknown error";
    return NextResponse.json(
      { 
        error: "Failed to send message",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

