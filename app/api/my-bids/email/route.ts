import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCrewList(crewNumbers: unknown) {
  if (!Array.isArray(crewNumbers) || crewNumbers.length === 0) {
    return [];
  }

  return crewNumbers
    .map((crew) => String(crew ?? "").trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bidId, userId, email } = body ?? {};

    if (!bidId || !userId || !email) {
      return NextResponse.json(
        { error: "Missing bidId, userId, or email" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey || !resendFromEmail) {
      return NextResponse.json(
        { error: "Missing Resend environment variables" },
        { status: 500 }
      );
    }

    const { data: bid, error: bidError } = await supabaseAdmin
      .from("my_bids")
      .select("id, user_id, title, prompt, crew_numbers, created_at")
      .eq("id", bidId)
      .eq("user_id", userId)
      .maybeSingle();

    if (bidError) {
      console.error("Error loading bid for email:", bidError);
      return NextResponse.json(
        { error: "Unable to load saved bid" },
        { status: 500 }
      );
    }

    if (!bid) {
      return NextResponse.json(
        { error: "Saved bid not found" },
        { status: 404 }
      );
    }

    const crewList = formatCrewList(bid.crew_numbers);
    const title = String(bid.title || "Saved Bid List").trim() || "Saved Bid List";
    const safeTitle = escapeHtml(title);
    const safePrompt = escapeHtml(String(bid.prompt || "").trim());
    const savedOn = bid.created_at
      ? new Date(bid.created_at).toLocaleString("en-CA", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/Toronto",
        })
      : null;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h1 style="margin: 0 0 16px; color: #0b1f4d;">${safeTitle}</h1>
        <p style="margin: 0 0 20px;">Here is a copy of your saved CrewBid list.</p>
        ${
          savedOn
            ? `<p style="margin: 0 0 20px; color: #475569;"><strong>Saved:</strong> ${escapeHtml(
                savedOn
              )}</p>`
            : ""
        }
        ${
          safePrompt
            ? `
              <div style="margin: 0 0 20px; padding: 16px; border: 1px solid #fed7aa; background: #fff7ed; border-radius: 12px;">
                <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #9a3412; margin-bottom: 8px;">
                  Prompt Used
                </div>
                <div>${safePrompt}</div>
              </div>
            `
            : ""
        }
        <div style="padding: 16px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 12px;">
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; margin-bottom: 10px;">
            Ranked Crews
          </div>
          ${
            crewList.length > 0
              ? `<ol style="margin: 0; padding-left: 22px;">${crewList
                  .map(
                    (crew) =>
                      `<li style="margin: 0 0 6px;">Crew ${escapeHtml(crew)}</li>`
                  )
                  .join("")}</ol>`
              : `<div>No saved crews.</div>`
          }
        </div>
      </div>
    `;

    const text = [
      title,
      "",
      "Here is a copy of your saved CrewBid list.",
      savedOn ? `Saved: ${savedOn}` : null,
      bid.prompt ? "" : null,
      bid.prompt ? `Prompt Used: ${String(bid.prompt).trim()}` : null,
      "",
      "Ranked Crews:",
      crewList.length > 0
        ? crewList.map((crew, index) => `${index + 1}. Crew ${crew}`).join("\n")
        : "No saved crews.",
    ]
      .filter(Boolean)
      .join("\n");

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [email],
        subject: `Your CrewBid list: ${title}`,
        html,
        text,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend email error:", resendData);
      return NextResponse.json(
        { error: "Unable to send email", details: resendData },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      emailId: resendData?.id ?? null,
    });
  } catch (error: unknown) {
    const details =
      error instanceof Error ? error.message : String(error);

    console.error("Error sending saved bid email:", error);
    return NextResponse.json(
      {
        error: "Unable to send email",
        details,
      },
      { status: 500 }
    );
  }
}
