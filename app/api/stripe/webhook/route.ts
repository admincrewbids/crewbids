import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log("Webhook metadata:", session.metadata);

      const userId = session.metadata?.userId;
      const packageId = session.metadata?.packageId;

      if (!userId || !packageId) {
        console.error("Missing metadata on completed checkout session:", {
          sessionId: session.id,
          metadata: session.metadata,
        });
        return new NextResponse("Missing metadata", { status: 400 });
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
        console.error("Error writing unlock from webhook:", error);
        return new NextResponse("DB write failed", { status: 500 });
      }

      console.log("Unlock granted from Stripe webhook:", {
        userId,
        packageId,
        amountPaid,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return new NextResponse("Webhook handler failed", { status: 500 });
  }
}