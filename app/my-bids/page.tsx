"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type SavedBid = {
  id: string;
  title?: string | null;
  prompt?: string | null;
  crew_numbers?: string[] | null;
  created_at?: string | null;
};

export default function MyBidsPage() {
  const [myBids, setMyBids] = useState<SavedBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingBidId, setSendingBidId] = useState<string | null>(null);

  useEffect(() => {
    async function loadMyBids() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id;

      if (!userId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("my_bids")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading my bids:", error);
      } else {
        setMyBids(data || []);
      }

      setLoading(false);
    }

    loadMyBids();
  }, []);

  async function handleDeleteBid(id: string) {
    const confirmed = confirm("Delete this saved bid?");
    if (!confirmed) return;

    const { error } = await supabase.from("my_bids").delete().eq("id", id);

    if (error) {
      console.error("Error deleting bid:", error);
      alert("Could not delete bid.");
      return;
    }

    setMyBids((prev) => prev.filter((bid) => bid.id !== id));
  }

  async function handleEmailBid(bid: SavedBid) {
    try {
      setSendingBidId(bid.id);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id;
      const email = session?.user?.email;

      if (!userId || !email) {
        alert("Please sign in again before emailing your bid list.");
        return;
      }

      const response = await fetch("/api/my-bids/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bidId: bid.id,
          userId,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Email bid failed:", data);
        const details =
          typeof data?.details === "string"
            ? data.details
            : data?.details?.message ||
              data?.details?.error ||
              data?.error ||
              "Could not send your email copy.";
        alert(String(details));
        return;
      }

      alert(`Email sent to ${email}`);
    } catch (error) {
      console.error("Error emailing bid:", error);
      alert("Could not send your email copy.");
    } finally {
      setSendingBidId(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f5f9",
        color: "#0f172a",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0b1f4d 0%, #0d2d6c 55%, #0a2357 100%)",
          color: "#fff",
          padding: "24px 32px 120px",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
              marginBottom: 48,
            }}
          >
            <Link
              href="/"
              style={{
                color: "#fff",
                textDecoration: "none",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              ← Back to CrewBid
            </Link>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/how-it-works"
                style={{
                  color: "rgba(255,255,255,0.9)",
                  textDecoration: "none",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                How It Works
              </Link>

              <Link
                href="/about"
                style={{
                  color: "rgba(255,255,255,0.9)",
                  textDecoration: "none",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                About & Contact
              </Link>

              <Link
                href="/"
                style={{
                  color: "rgba(255,255,255,0.9)",
                  textDecoration: "none",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                Home
              </Link>

              <div
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                My Bids
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 14,
              maxWidth: 760,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 800,
                width: "fit-content",
              }}
            >
              📋 Saved Lists
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 52,
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              My Bids
            </h1>

            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#f97316",
                fontStyle: "italic",
              }}
            >
              Your saved ranked crew lists
            </div>

            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.92)",
                maxWidth: 700,
              }}
            >
              Review your final saved rankings, email yourself a copy, or delete
              old bid lists when they are no longer needed.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: "-72px auto 0",
          padding: "0 20px 40px",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 22,
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
            padding: 24,
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 24,
                fontSize: 16,
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Loading My Bids...
            </div>
          ) : myBids.length === 0 ? (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 28,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                No saved bids yet
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 15,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Save a ranked crew list from the main page and it will appear
                here.
              </div>

              <Link
                href="/"
                style={{
                  display: "inline-block",
                  marginTop: 16,
                  background: "#f97316",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 12,
                  padding: "12px 18px",
                  fontWeight: 800,
                  boxShadow: "0 10px 24px rgba(249, 115, 22, 0.25)",
                }}
              >
                Go Rank Crews
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {myBids.map((bid) => (
                <div
                  key={bid.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 18,
                    padding: 20,
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 20,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: "1 1 520px", minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 900,
                            color: "#0f172a",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {bid.title || "Saved Bid List"}
                        </div>

                        <div
                          style={{
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            border: "1px solid #bfdbfe",
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {Array.isArray(bid.crew_numbers)
                            ? `${bid.crew_numbers.length} crews ranked`
                            : "Saved List"}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        Saved{" "}
                        {bid.created_at
                          ? new Date(bid.created_at).toLocaleString()
                          : "Unknown"}
                      </div>

                      {bid.prompt ? (
                        <div
                          style={{
                            marginTop: 14,
                            padding: 12,
                            borderRadius: 12,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#64748b",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              marginBottom: 6,
                            }}
                          >
                            Prompt Used
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#334155",
                              lineHeight: 1.5,
                              fontWeight: 600,
                            }}
                          >
                            {bid.prompt}
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginTop: 14,
                          padding: 14,
                          borderRadius: 14,
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#9a3412",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 8,
                          }}
                        >
                          Ranked Crews
                        </div>

                        <div
                          style={{
                            fontSize: 15,
                            color: "#7c2d12",
                            lineHeight: 1.7,
                            fontWeight: 700,
                            wordBreak: "break-word",
                          }}
                        >
                          {Array.isArray(bid.crew_numbers) &&
                          bid.crew_numbers.length > 0
                            ? bid.crew_numbers.join(" → ")
                            : "No saved crews"}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        minWidth: 220,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleEmailBid(bid)}
                        disabled={sendingBidId === bid.id}
                        style={{
                          background:
                            "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 12,
                          padding: "12px 16px",
                          fontWeight: 800,
                          cursor:
                            sendingBidId === bid.id ? "wait" : "pointer",
                          opacity: sendingBidId === bid.id ? 0.75 : 1,
                          boxShadow:
                            "0 10px 24px rgba(249, 115, 22, 0.25)",
                        }}
                      >
                        {sendingBidId === bid.id
                          ? "Sending..."
                          : "Email Me a Copy"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteBid(bid.id)}
                        style={{
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: 12,
                          padding: "12px 16px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
