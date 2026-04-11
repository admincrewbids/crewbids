import { NextRequest, NextResponse } from "next/server";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subject, message } = body ?? {};

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Missing name, email, subject, or message" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;
    const supportEmail = process.env.SUPPORT_EMAIL || resendFromEmail;

    if (!resendApiKey || !resendFromEmail || !supportEmail) {
      return NextResponse.json(
        { error: "Missing email environment variables" },
        { status: 500 }
      );
    }

    const safeName = escapeHtml(String(name).trim());
    const safeEmail = escapeHtml(String(email).trim());
    const safeSubject = escapeHtml(String(subject).trim());
    const safeMessage = escapeHtml(String(message).trim()).replace(/\n/g, "<br />");

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [supportEmail],
        reply_to: email,
        subject: `CrewBids Contact: ${String(subject).trim()}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
            <h1 style="margin: 0 0 16px; color: #0b1f4d;">New CrewBids Contact Message</h1>
            <p><strong>Name:</strong> ${safeName}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Subject:</strong> ${safeSubject}</p>
            <div style="margin-top: 18px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
              ${safeMessage}
            </div>
          </div>
        `,
        text: [
          "New CrewBids Contact Message",
          "",
          `Name: ${String(name).trim()}`,
          `Email: ${String(email).trim()}`,
          `Subject: ${String(subject).trim()}`,
          "",
          String(message).trim(),
        ].join("\n"),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Contact email error:", resendData);
      return NextResponse.json(
        { error: "Unable to send message", details: resendData },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Contact route failed:", error);
    return NextResponse.json(
      { error: "Unable to send message", details },
      { status: 500 }
    );
  }
}
