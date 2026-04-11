import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, userId, packageId } = body ?? {};

    if (!sessionId || !userId || !packageId) {
      return NextResponse.json(
        { error: "Missing sessionId, userId, or packageId" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: "Checkout session not found" },
        { status: 404 }
      );
    }

    const metadataUserId = session.metadata?.userId;
    const metadataPackageId = session.metadata?.packageId;

    if (metadataUserId !== userId || metadataPackageId !== packageId) {
      return NextResponse.json(
        { error: "Checkout session metadata mismatch" },
        { status: 400 }
      );
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error: "Checkout session is not paid",
          paymentStatus: session.payment_status,
        },
        { status: 400 }
      );
    }

    const amountPaid =
      typeof session.amount_total === "number" ? session.amount_total : 999;

    const { error } = await supabaseAdmin
      .from("bid_unlocks")
      .upsert(
        {
          user_id: userId,
          bid_package_id: packageId,
          amount_paid: amountPaid,
          status: "paid",
        },
        {
          onConflict: "user_id,bid_package_id",
        }
      );

    if (error) {
      console.error("Error confirming checkout session unlock:", error);
      return NextResponse.json(
        { error: "Unable to store unlock" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error confirming checkout session:", error);
    return NextResponse.json(
      { error: "Unable to confirm checkout session" },
      { status: 500 }
    );
  }
}
