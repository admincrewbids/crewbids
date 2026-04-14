import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, packageId } = body;

    if (!userId || !packageId) {
      console.error("Missing userId or packageId before checkout", {
        userId,
        packageId,
      });

      return NextResponse.json(
        { error: "Missing userId or packageId" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const priceId = process.env.STRIPE_CREWBIDS_PRICE_ID;
    const secretKeyPresent = !!process.env.STRIPE_SECRET_KEY;

    console.log("Stripe checkout debug", {
      secretKeyPresent,
      priceIdPresent: !!priceId,
      appUrl,
      packageId,
      userId,
    });

    if (!appUrl || !priceId || !secretKeyPresent) {
      return NextResponse.json(
        {
          error: "Missing Stripe environment variables",
          debug: {
            secretKeyPresent,
            priceIdPresent: !!priceId,
            appUrl,
          },
        },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      automatic_tax: {
        enabled: true,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?checkout=success&packageId=${packageId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      metadata: {
        userId,
        packageId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);

    return NextResponse.json(
      {
        error: "Unable to create checkout session",
        details: error?.message ?? String(error),
        type: error?.type ?? null,
        code: error?.code ?? null,
      },
      { status: 500 }
    );
  }
}
