"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setReady(true);
      } else {
        setErrorMessage(
          "This reset link is missing or expired. Request a new password reset email."
        );
      }
    }

    checkRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleResetPassword() {
    setErrorMessage(null);
    setMessage(null);

    if (!password.trim() || !confirmPassword.trim()) {
      setErrorMessage("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Please use a password with at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      console.error("Password reset failed:", error);
      setErrorMessage(error.message || "Could not update your password.");
      return;
    }

    setMessage("Password updated. Redirecting you back to CrewBids...");

    setTimeout(() => {
      router.push("/");
    }, 1200);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0b1f4d 0%, #0d2d6c 55%, #0a2357 100%)",
        color: "#fff",
        fontFamily: "Inter, Arial, sans-serif",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            marginBottom: 20,
            color: "rgba(255,255,255,0.9)",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Back to CrewBids
        </Link>

        <div
          style={{
            background: "#ffffff",
            color: "#0f172a",
            borderRadius: 22,
            padding: 28,
            boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              marginBottom: 8,
            }}
          >
            Reset your password
          </div>

          <div
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              color: "#64748b",
              marginBottom: 18,
            }}
          >
            Enter your new password below. Once it is saved, you can return to
            CrewBids and sign in normally.
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!ready || saving}
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                outline: "none",
                boxSizing: "border-box",
                background: ready ? "#fff" : "#f8fafc",
              }}
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!ready || saving}
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                outline: "none",
                boxSizing: "border-box",
                background: ready ? "#fff" : "#f8fafc",
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

            {message ? (
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
                {message}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={!ready || saving}
              style={{
                background: ready ? "#f97316" : "#cbd5e1",
                color: ready ? "#fff" : "#64748b",
                border: "none",
                borderRadius: 12,
                padding: "13px 18px",
                fontSize: 16,
                fontWeight: 800,
                cursor: ready && !saving ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Updating password..." : "Save new password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
