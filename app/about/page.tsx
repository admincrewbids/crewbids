"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AboutPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSessionEmail() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user?.email) {
        setEmail(session.user.email);
      }
    }

    loadSessionEmail();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmitContactForm() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setErrorMessage("Please fill out all contact form fields.");
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          subject,
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const details =
          typeof data?.details === "string"
            ? data.details
            : data?.details?.message ||
              data?.details?.error ||
              data?.error ||
              "Could not send your message.";
        setErrorMessage(String(details));
        setSending(false);
        return;
      }

      setStatusMessage("Message sent. We will get back to you as soon as we can.");
      setSubject("");
      setMessage("");
    } catch (error) {
      console.error("Contact form failed:", error);
      setErrorMessage("Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0b1f4d 0%, #0d2d6c 55%, #0a2357 100%)",
        color: "#fff",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "clamp(18px, 4vw, 28px) clamp(16px, 4vw, 24px) clamp(32px, 6vw, 48px)",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 42,
          }}
        >
          <Link
            href="/"
            style={{
              color: "#fff",
              textDecoration: "none",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            CrewBids
          </Link>

          <div
            style={{
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              maxWidth: 480,
            }}
          >
            <Link
              href="/how-it-works"
              style={{
                color: "rgba(255,255,255,0.9)",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              How It Works
            </Link>
            <Link
              href="/"
              style={{
                color: "rgba(255,255,255,0.9)",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Home
            </Link>
            <Link
              href="/my-bids"
              style={{
                color: "rgba(255,255,255,0.9)",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              My Bids
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: "clamp(20px, 4vw, 28px)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 20 }}>
            <div
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 24,
                padding: "clamp(20px, 5vw, 28px)",
                boxShadow: "0 18px 44px rgba(0,0,0,0.16)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "rgba(249,115,22,0.18)",
                  border: "1px solid rgba(249,115,22,0.26)",
                  color: "#fdba74",
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 18,
                }}
              >
                About CrewBids
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(34px, 9vw, 54px)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.04em",
                  fontWeight: 900,
                  maxWidth: 700,
                  overflowWrap: "anywhere",
                }}
              >
                Built to help crews sort bids faster and with more confidence.
              </h1>

              <p
                style={{
                  marginTop: 20,
                  marginBottom: 0,
                  fontSize: "clamp(17px, 4.5vw, 20px)",
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.92)",
                  maxWidth: 760,
                }}
              >
                CrewBids helps users upload a bid package, describe what matters,
                and get ranked crew options with clearer reasoning and a saved
                shortlist they can come back to later.
              </p>
            </div>

            <div
              style={{
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: 22,
                padding: "clamp(18px, 4vw, 24px)",
                boxShadow: "0 18px 44px rgba(0,0,0,0.16)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "grid",
                gap: 18,
              }}
            >
              <div
                style={{
                  fontSize: "clamp(20px, 5vw, 24px)",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  overflowWrap: "anywhere",
                }}
              >
                Disclaimer
              </div>

              <div style={{ color: "#475569", lineHeight: 1.7, fontSize: "clamp(14px, 3.8vw, 15px)" }}>
                CrewBids is a decision-support tool. It helps organize bid-package
                data and rank options based on the preferences you provide, but it
                does not replace your own review of the source bid package.
              </div>

              <div style={{ color: "#475569", lineHeight: 1.7, fontSize: "clamp(14px, 3.8vw, 15px)" }}>
                Users are responsible for confirming job details, terminal rules,
                operating times, days off, pay impacts, and any final bidding
                decisions before submitting bids. CrewBids is not legal, employment,
                tax, union, or financial advice.
              </div>

              <div style={{ color: "#475569", lineHeight: 1.7, fontSize: "clamp(14px, 3.8vw, 15px)" }}>
                Parsed data and AI interpretations may occasionally be incomplete,
                imperfect, or differently interpreted from how you would rank bids
                manually. Always use your own judgment before relying on results.
              </div>
            </div>

            <div
              style={{
                background: "#fff7ed",
                color: "#7c2d12",
                borderRadius: 22,
                padding: "clamp(18px, 4vw, 24px)",
                boxShadow: "0 18px 44px rgba(0,0,0,0.12)",
                border: "1px solid #fed7aa",
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: "clamp(20px, 5vw, 24px)",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  overflowWrap: "anywhere",
                }}
              >
                Money-Back Guarantee
              </div>

              <div style={{ lineHeight: 1.7, fontSize: "clamp(14px, 3.8vw, 15px)" }}>
                CrewBids currently offers a risk-free first unlock policy with a
                refund window of 24 hours from purchase.
              </div>

              <div style={{ lineHeight: 1.7, fontSize: "clamp(14px, 3.8vw, 15px)" }}>
                If something is clearly not working as expected, or if the paid
                unlock did not deliver the intended experience, contact us within
                that 24-hour window and include the email tied to your account plus
                a short description of the issue.
              </div>

              <div style={{ lineHeight: 1.7, fontSize: "clamp(14px, 3.8vw, 15px)" }}>
                Refund requests are reviewed manually. We may update this policy as
                the product evolves, but any future changes should be reflected on
                this page.
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: 22,
              padding: "clamp(18px, 4vw, 24px)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.16)",
              border: "1px solid rgba(255,255,255,0.14)",
              display: "grid",
              gap: 16,
              alignSelf: "start",
            }}
          >
            <div
              style={{
                fontSize: "clamp(22px, 5.5vw, 26px)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                overflowWrap: "anywhere",
              }}
            >
              Contact us
            </div>

            <div
              style={{
                color: "#64748b",
                fontSize: "clamp(14px, 3.8vw, 15px)",
                lineHeight: 1.6,
              }}
            >
              Questions, refund requests, account issues, or feature feedback all
              belong here.
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <input
                type="text"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <textarea
                placeholder="How can we help?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />

              {errorMessage ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    color: "#be123c",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {errorMessage}
                </div>
              ) : null}

              {statusMessage ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#166534",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {statusMessage}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSubmitContactForm}
                disabled={sending}
                style={{
                  background: "#f97316",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px 18px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: sending ? "wait" : "pointer",
                  opacity: sending ? 0.8 : 1,
                  boxShadow: "0 10px 24px rgba(249,115,22,0.24)",
                  width: "100%",
                }}
              >
                {sending ? "Sending..." : "Send message"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
