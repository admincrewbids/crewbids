import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const supabase = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function clearStaleSupabaseAuthSession() {
  if (typeof window === "undefined") return;

  try {
    const host = new URL(supabaseUrl).host;
    const projectRef = host.split(".")[0];
    const keys = [
      `sb-${projectRef}-auth-token`,
      ...Object.keys(window.localStorage).filter(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
      ),
    ];

    Array.from(new Set(keys)).forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn("Could not clear stale Supabase auth session:", error);
  }
}

export function isRefreshTokenNotFoundError(error: any) {
  const message = String(error?.message || "");
  const code = String(error?.code || error?.error_code || "");

  return (
    code === "refresh_token_not_found" ||
    /refresh_token_not_found|Invalid Refresh Token|Refresh Token Not Found/i.test(
      message
    )
  );
}
