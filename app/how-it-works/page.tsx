import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Upload your bid package",
    description:
      "Start by uploading the PDF for your current bid cycle. CrewBids reads the package, finds crews and job pages, and gets everything ready for ranking.",
  },
  {
    number: "02",
    title: "Describe what matters to you",
    description:
      "Tell CrewBids what you want in plain language. You can mention terminals, mornings or nights, overtime, weekends off, exclusions, spareboard, UP, and more.",
  },
  {
    number: "03",
    title: "Review your ranked results",
    description:
      "CrewBids ranks matching crews, explains why they fit, shows excluded crews, and lets you inspect daily jobs before you decide what belongs on your final list.",
  },
  {
    number: "04",
    title: "Save, email, and refine",
    description:
      "Save your final ordering to My Bids, email yourself a copy, include excluded crews if you want, and come back later without losing your saved work.",
  },
];

const examplePrompts = [
  "Weekends off, no early starts, prefer Lewis Rd",
  "Bradford first, most OT to least, no UP jobs",
  "Spareboard only, late starts, least operating time",
  "Willowbrook first, no mornings, prefer weekends off",
];

export default function HowItWorksPage() {
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
          padding: "28px 24px 48px",
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
            }}
          >
            <Link
              href="/about"
              style={{
                color: "rgba(255,255,255,0.9)",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              About & Contact
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
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
            gap: 28,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 22 }}>
            <div
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 24,
                padding: 28,
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
                How CrewBids Works
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 56,
                  lineHeight: 1.02,
                  letterSpacing: "-0.04em",
                  fontWeight: 900,
                  maxWidth: 760,
                }}
              >
                A simpler way to turn a bid package into a real shortlist.
              </h1>

              <p
                style={{
                  marginTop: 20,
                  marginBottom: 0,
                  fontSize: 20,
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.92)",
                  maxWidth: 760,
                }}
              >
                CrewBids is built for people who already know what matters to
                them, but do not want to sort every crew manually from scratch.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              {steps.map((step) => (
                <div
                  key={step.number}
                  style={{
                    background: "#ffffff",
                    color: "#0f172a",
                    borderRadius: 20,
                    padding: 22,
                    boxShadow: "0 18px 44px rgba(0,0,0,0.16)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    display: "grid",
                    gridTemplateColumns: "84px minmax(0, 1fr)",
                    gap: 18,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 20,
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      color: "#ea580c",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      fontWeight: 900,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {step.number}
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 900,
                        letterSpacing: "-0.03em",
                        marginBottom: 8,
                      }}
                    >
                      {step.title}
                    </div>
                    <div
                      style={{
                        color: "#475569",
                        fontSize: 15,
                        lineHeight: 1.7,
                      }}
                    >
                      {step.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 20, position: "sticky", top: 20 }}>
            <div
              style={{
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: 22,
                padding: 24,
                boxShadow: "0 18px 44px rgba(0,0,0,0.16)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                }}
              >
                What is free?
              </div>

              <div style={{ color: "#475569", lineHeight: 1.7, fontSize: 15 }}>
                You can upload a package, run one preview, and see the top three
                ranked crews for that package before unlocking the full analysis.
              </div>

              <div style={{ color: "#475569", lineHeight: 1.7, fontSize: 15 }}>
                Unlocking gives you the full ranking, excluded crews, explanations,
                restore-on-return behavior, saved lists, and email delivery from
                My Bids.
              </div>
            </div>

            <div
              style={{
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: 22,
                padding: 24,
                boxShadow: "0 18px 44px rgba(0,0,0,0.16)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                }}
              >
                Good prompt examples
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {examplePrompts.map((example) => (
                  <div
                    key={example}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      color: "#334155",
                      fontSize: 14,
                      lineHeight: 1.55,
                      fontWeight: 600,
                    }}
                  >
                    {example}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "#fff7ed",
                color: "#7c2d12",
                borderRadius: 22,
                padding: 24,
                boxShadow: "0 18px 44px rgba(0,0,0,0.12)",
                border: "1px solid #fed7aa",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                }}
              >
                Before you start
              </div>

              <div style={{ lineHeight: 1.7, fontSize: 15 }}>
                Use the exact bid package for the cycle you care about, keep your
                prompt simple and direct, and always review the source PDF before
                placing final bids.
              </div>

              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  marginTop: 4,
                  textDecoration: "none",
                  background: "#f97316",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "13px 18px",
                  fontWeight: 800,
                  boxShadow: "0 10px 24px rgba(249,115,22,0.24)",
                }}
              >
                Go to CrewBids
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
