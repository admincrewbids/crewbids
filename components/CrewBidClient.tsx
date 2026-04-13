"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { parseCrewCycleChartText } from "../lib/crewCycleParser";
import { extractPdfPagesFromFile } from "../lib/pdfTextExtractor";
import { parseStandbyJobDescriptions } from "../lib/standbyJobParser";
import { parseSpareboardDescriptions } from "../lib/spareboardParser";
import {
  parseCrewCycleFromImages,
  parseCrewCycleFromTextPages,
  detectCycleRows,
  loadImageToCanvasForDebug,
} from "../lib/crewCycleImageParser";
import {
  logPromptDebugBatchSummary,
  logPromptDebugSummary,
  summarizePromptDebugBatch,
  summarizePromptDebugResult,
  type PromptDebugBatchSummary,
  type PromptDebugResult,
  type PromptDebugSummary,
} from "../lib/promptDebug";
import {
  DEFAULT_PROMPT_REGRESSION_SUITE,
  type PromptRegressionCase,
} from "../lib/promptRegressionSuite";
import { normalizePromptText } from "../lib/promptNormalization";
import { evaluatePromptRegressionAssertions } from "../lib/promptRegressionAssertions";
import { analyzeParsedPreferences } from "../lib/promptRuleAnalysis";
import { supabase } from "../lib/supabase";

const DEBUG_LOGS = false;

function debugLog(...args: unknown[]) {
  if (!DEBUG_LOGS) return;
  console.log(...args);
}

function calculateDurationFromTimes(
  onDuty?: string | null,
  offDuty?: string | null
) {
  if (!onDuty || !offDuty) return null;

  const parse = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  
  const start = parse(onDuty);
  const end = parse(offDuty);

  if (start == null || end == null) return null;

  let diff = end - start;
  if (diff < 0) diff += 24 * 60;

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function attachJobDetailsToRow(
  row: any,
  jobLookupMap: Record<string, any> | Map<string, any>,
  standbyJobLookupMap: Record<string, any> | Map<string, any>,
  spareboardLookupMap: Record<string, any> | Map<string, any>
){
  if (!row || !row.daily) return row;

  const getJobDetail = (jobNo: string) => {
    if (jobLookupMap instanceof Map) {
      return jobLookupMap.get(jobNo) || null;
    }
    return jobLookupMap[jobNo] || null;
  };

  const getStandbyJobDetail = (jobNo: string) => {
    if (standbyJobLookupMap instanceof Map) {
      return standbyJobLookupMap.get(jobNo) || null;
    }
    return standbyJobLookupMap[jobNo] || null;
  };

  const normalizeJobNo = (value: any) => {
    if (typeof value !== "string") return null;
    const cleaned = value.trim().replace(/[^\d]/g, "");
    return cleaned || null;
  };

  const isStandbyRow = row.crew_code === "STBY" || row.is_two_week_stby === true;
const isSpareboardRow =
  typeof row.crew_id === "string" && /^3\d{3}$/.test(row.crew_id.trim());
  const findStandbyFallbackFromRow = (jobNo: string, currentDay: any) => {
    const allDays = [
      ...(Array.isArray(row.daily) ? row.daily : []),
      ...(Array.isArray(row.week1?.daily) ? row.week1.daily : []),
      ...(Array.isArray(row.week2?.daily) ? row.week2.daily : []),
    ];

    for (const candidate of allDays) {
      if (!candidate || candidate === currentDay) continue;
      if (candidate.is_day_off) continue;

      const candidateJobNo = normalizeJobNo(candidate.job_no);
      if (candidateJobNo !== jobNo) continue;

      if (candidate.on_duty && candidate.off_duty) {
        return {
          on_duty: candidate.on_duty,
          off_duty: candidate.off_duty,
          duration:
            candidate.duration ??
            calculateDurationFromTimes(candidate.on_duty, candidate.off_duty),
        };
      }
    }

    return null;
  };

  const enrichDay = (day: any, isStandbyRow: boolean) => {
    const existingJobNo =
      typeof day?.job_no === "string" && day.job_no.trim()
        ? day.job_no.trim()
        : null;

    const isExplicitOff =
      day?.is_day_off === true ||
      existingJobNo === "OFF";

    if (isExplicitOff) {
      return {
        ...day,
        job_no: null,
        job_detail: null,
      };
    }

    const normalizedJobNo = normalizeJobNo(existingJobNo);

    if (!normalizedJobNo) {
      return {
        ...day,
        job_no: existingJobNo,
        job_detail: null,
      };
    }

    if (isStandbyRow) {
      if (isSpareboardRow) {
  const spare = spareboardLookupMap instanceof Map
    ? spareboardLookupMap.get(normalizedJobNo)
    : spareboardLookupMap[normalizedJobNo];

  const on_duty = spare?.on_duty ?? null;
  const off_duty = spare?.off_duty ?? null;
  const duration = calculateDurationFromTimes(on_duty, off_duty);

  return {
    ...day,
    job_no: normalizedJobNo,
    job_detail: spare,
    on_duty,
    off_duty,
    duration,
    operating_hours_daily: null,
    van_hours_daily: null,
    split_time: null, // ðŸ‘ˆ ADD THIS LINE
    pdf_page_number: null,
  };
}
      const standbyDetail = getStandbyJobDetail(normalizedJobNo);

      let on_duty = standbyDetail?.on_duty ?? day?.on_duty ?? null;
      let off_duty = standbyDetail?.off_duty ?? day?.off_duty ?? null;
      let duration = day?.duration ?? null;

      if ((!on_duty || !off_duty)) {
        const fallback = findStandbyFallbackFromRow(normalizedJobNo, day);
        if (fallback) {
          on_duty = on_duty ?? fallback.on_duty ?? null;
          off_duty = off_duty ?? fallback.off_duty ?? null;
          duration = duration ?? fallback.duration ?? null;
        }
      }

      duration = duration ?? calculateDurationFromTimes(on_duty, off_duty);

      return {
        ...day,
        job_no: normalizedJobNo,
        job_detail: standbyDetail,
        on_duty,
        off_duty,
        duration,
        operating_hours_daily: null,
        van_hours_daily: null,
        split_time: null, // ðŸ‘ˆ ADD THIS LINE
        pdf_page_number: null,
      };
    }

    const jobDetail = getJobDetail(normalizedJobNo);

            return {
      ...day,
      job_no: normalizedJobNo,
      job_detail: jobDetail,
      on_duty: jobDetail?.on_duty ?? day?.on_duty ?? null,
      off_duty: jobDetail?.off_duty ?? day?.off_duty ?? null,
      duration: jobDetail?.duration ?? day?.duration ?? null,
      operating_hours_daily:
        jobDetail?.operating_hours_daily ?? day?.operating_hours_daily ?? null,
      van_hours_daily:
        jobDetail?.van_hours_daily ?? day?.van_hours_daily ?? null,
      split_time: jobDetail?.split_time ?? day?.split_time ?? null,
      pdf_page_number:
        jobDetail?.pdf_page_number ?? day?.pdf_page_number ?? null,
    };
  };

  const enrichedDaily = row.daily.map((day: any) =>
    enrichDay(day, isStandbyRow)
  );

  const enrichedWeek1 = row.week1
    ? {
        ...row.week1,
        daily: (row.week1.daily || []).map((day: any) =>
          enrichDay(day, isStandbyRow)
        ),
      }
    : row.week1;

  const enrichedWeek2 = row.week2
    ? {
        ...row.week2,
        daily: (row.week2.daily || []).map((day: any) =>
          enrichDay(day, isStandbyRow)
        ),
      }
    : row.week2;

  return {
    ...row,
    daily: enrichedDaily,
    is_two_week_stby: row.is_two_week_stby,
    week1: enrichedWeek1,
    week2: enrichedWeek2,
  };
}

async function interpretPromptWithAI(prompt: string) {
  try {
    const response = await fetch("/api/ai/interpret", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    const result = await response.json();
    debugLog("AI ROUTE RESULT:", result);

    if (!response.ok) {
      throw new Error(`AI request failed: ${result?.source ?? "unknown"}`);
    }

    debugLog("INTERPRETATION SOURCE:", result?.source ?? "unknown");

    const aiResult = result?.preferences ?? null;
    return aiResult;
  } catch (err) {
    console.error("AI interpretation failed:", err);
    return null;
  }
}

async function hasUsedPreview(userId?: string | null, packageId?: string | null) {
  if (!userId || !packageId) return false;

  const { data, error } = await supabase
    .from("bid_package_previews")
    .select("id")
    .eq("user_id", userId)
    .eq("bid_package_id", packageId)
    .maybeSingle();

  if (error) {
    console.error("Error checking preview:", error);
    return false;
  }

  return !!data;
}
async function markPreviewUsed(userId?: string | null, packageId?: string | null) {
  if (!userId || !packageId) return;

  const { error } = await supabase
    .from("bid_package_previews")
    .insert({
      user_id: userId,
      bid_package_id: packageId,
    });

  if (error && error.code !== "23505") {
    console.error("Error marking preview used:", error);
  }
}
async function saveAnalysisRun({
  userId,
  packageId,
  prompt,
  parsedPreferences,
  rankedCrews,
  excludedCrews,
}: {
  userId?: string | null;
  packageId?: string | null;
  prompt: string;
  parsedPreferences: any;
  rankedCrews: any[];
  excludedCrews: any[];
}): Promise<boolean> {
  if (!userId || !packageId || !prompt.trim()) return false;

  const { error: deleteError } = await supabase
    .from("saved_runs")
    .delete()
    .eq("user_id", userId)
    .eq("bid_package_id", packageId);

  if (deleteError) {
    console.warn(
      "Error deleting previous analysis run:",
      JSON.stringify(
        {
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint,
          code: deleteError.code,
          full: deleteError,
          userId,
          packageId,
        },
        null,
        2
      )
    );
    return false;
  }

  const { error } = await supabase.from("saved_runs").insert({
    user_id: userId,
    bid_package_id: packageId,
    prompt,
    parsed_preferences: parsedPreferences,
    ranked_results: rankedCrews,
    excluded_results: excludedCrews,
  });

  if (error) {
    console.warn(
      "Error saving analysis run:",
      JSON.stringify(
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          full: error,
          userId,
          packageId,
        },
        null,
        2
      )
    );
    return false;
  }

  return true;
}
// Helper: render one PDF page to an image for cycle-chart image parsing/debug
async function renderPageToImage(pdf: any, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);

  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context");
  }
  

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toDataURL("image/png");
}




type ParsedCycleDay = {
  day: string;
  day_index: number;
  job_no: string | null;
  is_day_off: boolean;
  on_duty?: string | null;
  off_duty?: string | null;
  duration?: string | null;
  operating_hours_daily?: number | null;
  van_hours_daily?: number | null;
  split_time?: string | null;
  pdf_page_number?: number | null;
  job_detail?: any;
};

type ParsedCycleWeek = {
  label: "Week 1" | "Week 2";
  daily: ParsedCycleDay[];
  jobs: string[];
  days_off: string[];
  days_off_list: string[];
};

type Crew = {
  id: string;
  crew_number?: string;
  jobs?: string[];
  job_details?: any[];
  daily?: ParsedCycleDay[];
  terminal: string;

  // âœ… WEEKLY numeric (for ranking)
  operating_hours_weekly?: number;
  overtime_hours_weekly?: number;
  total_paid_hours_weekly?: number;

  // âœ… DAYS OFF
  days_off?: string[];
  days_off_list?: string[];
  days_off_count?: number;
  works_weekends?: boolean;

  // âœ… WEEKLY display fields
  work_time_weekly?: string;
  overtime_weekly_text?: string;
  topup_weekly?: string;
  split_time_weekly?: string;
  operating_time_weekly?: string;

  // âœ… STBY-only 2-week shape
  is_two_week_stby?: boolean;
  week1?: ParsedCycleWeek;
  week2?: ParsedCycleWeek;

  notes?: string;
  score?: number;
};

type PreferenceStrength = "hard" | "strong" | "soft";


type SortField =
  | "on_duty"
  | "off_duty"
  | "operating_hours_daily"
  | "operating_hours_weekly"
  | "van_hours_daily"
  | "overtime_hours_weekly"
  | "total_paid_hours_weekly"
  | "weekends_off"
  | "three_day_off_jobs";

type ScopedPreference = {
  terminal: string;
  normalized_terminal: string;
  priority_rank: number;
  sort_preferences: {
    field: SortField;
    direction: "asc" | "desc";
    strength: PreferenceStrength;
    weight?: number;
  }[];
  filters: {
    field: string;
    operator: string;
    value: string | number | boolean | string[];
    strength: PreferenceStrength;
  }[];
  required_days_off: string[];
  requires_weekends_off: boolean;
};

type ParsedPreferences = {
  filters: {
    field: string;
    operator: string;
    value: string | number | boolean | string[];
    strength: PreferenceStrength;
  }[];
  priority_groups: {
    rank: number;
    strength: PreferenceStrength;
    conditions: {
      field: string;
      operator: string;
      value: string | number | boolean;
    }[];
  }[];
  sort_preferences: {
    field: SortField; // âœ… FIXED (was string)
    direction: "asc" | "desc";
    strength: PreferenceStrength;
    weight?: number;
  }[];
  tradeoffs: {
    type: string;
    value?: string;
    weight?: number;
  }[];
  unknown_clauses: {
    text: string;
  }[];
  scoped_preferences?: ScopedPreference[];
};

type ScoreBreakdownItem = {
  label: string;
  points: number;
};

type PreferenceClause = {
  text: string;
  sentenceIndex: number;
};

type RankedCrew = Crew & {
  score: number;
  scoreBreakdown: ScoreBreakdownItem[];
  explanation: string;
  included_override?: boolean;
  override_reason?: string;
};

declare global {
  interface Window {
    __crewbidsDebug?: {
      runPrompt: (prompt: string) => Promise<PromptDebugResult | null>;
      inspectCurrent: () => PromptDebugResult | null;
      getLoadedCrewCount: () => number;
      summarizePrompt: (prompt: string) => Promise<PromptDebugSummary | null>;
      summarizeCurrent: () => PromptDebugSummary | null;
      summarizePrompts: (
        prompts: string[]
      ) => Promise<PromptDebugBatchSummary | null>;
      listRegressionSuite: () => PromptRegressionCase[];
      runRegressionSuite: () => Promise<PromptDebugBatchSummary | null>;
    };
  }
}

const CANONICAL_TERMINAL_ALIASES: Record<string, string[]> = {
  wrmf: ["wrmf", "whitby"],
  willowbrook: ["willowbrook", "wb"],
  "lewis road": ["lewis road", "lewis"],
  "richmond hill": ["richmond hill", "rh"],
  milton: ["milton", "mil"],
  barrie: ["barrie", "bar"],
  bradford: ["bradford"],
  kitchener: ["kitchener", "kit"],
  lincolnville: ["lincolnville", "linc", "lcn"],
  spareboard: ["spareboard", "spare board", "spare"],
  standby: ["stdby", "standby", "stand by"],
};

function normalizeTerminalName(terminal: string | undefined): string {
  if (!terminal) return "";

  const t = terminal.toLowerCase().trim().replace(/\s+/g, " ");

  for (const [canonical, aliases] of Object.entries(CANONICAL_TERMINAL_ALIASES)) {
    if (canonical === t || aliases.includes(t)) {
      return canonical;
    }
  }

  return t;
}

function formatTerminalDisplayName(terminal: string | undefined): string {
  const normalized = normalizeTerminalName(terminal);

  switch (normalized) {
    case "wrmf":
      return "WRMF";
    case "willowbrook":
      return "Willowbrook";
    case "lewis road":
      return "Lewis Road";
    case "richmond hill":
      return "Richmond Hill";
    case "milton":
      return "Milton";
    case "barrie":
      return "Barrie";
    case "bradford":
      return "Bradford";
    case "kitchener":
      return "Kitchener";
    case "lincolnville":
      return "Lincolnville";
    case "spareboard":
      return "Spareboard";
    case "standby":
      return "Standby";
    default:
      if (!terminal) return "";
      return terminal
        .trim()
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
  }
}
async function hashFile(file: File) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function unlockPackage(
  packageId: string,
  userId?: string | null
): Promise<boolean> {
  if (!packageId || !userId) return false;

  const { error } = await supabase.from("bid_unlocks").insert({
    bid_package_id: packageId,
    user_id: userId,
    amount_paid: 999, // âœ… FIXED (cents)
  });

  if (error) {
    console.error("Error unlocking package:", JSON.stringify({
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      full: error,
      packageId,
      userId,
    }, null, 2));
    return false;
  }

  return true;
}

const BID_PACKAGE_BUCKET = "bid-packages";

async function uploadBidPackagePdf(
  file: File,
  userId: string,
  packageId: string
): Promise<{ storagePath: string | null }> {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userId}/${packageId}/${safeFileName}`;

  const { error } = await supabase.storage
    .from(BID_PACKAGE_BUCKET)
    .upload(storagePath, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (error) {
    console.error("Error uploading PDF to storage:", error);
    return { storagePath: null };
  }

  return { storagePath };
}

async function saveBidPackageStoragePath(
  packageId: string,
  storagePath: string
): Promise<boolean> {
  const { error } = await supabase
    .from("bid_packages")
    .update({ storage_path: storagePath })
    .eq("id", packageId);

  if (error) {
    console.error("Error saving storage path to bid_packages:", error);
    return false;
  }

  return true;
}

async function getSignedBidPackageUrl(
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BID_PACKAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }

  return data?.signedUrl ?? null;
}

async function getBidPackageById(packageId: string) {
  const { data, error } = await supabase
    .from("bid_packages")
    .select("id, file_name, storage_path, file_hash, user_id")
    .eq("id", packageId)
    .maybeSingle();

 if (error) {
  console.warn("Error loading bid package by id:", error);
  return null;
}
if (!data) {
  console.warn("No bid package found for id:", packageId);

  // prevent infinite retry loop
  localStorage.removeItem("crewbids_last_package_id");

  return null;
}

  return data ?? null;
}

async function findOrCreateBidPackage(
  file: File,
  userId?: string | null
): Promise<{
  packageId: string | null;
  fileHash: string | null;
  storagePath: string | null;
}> {
  const fileHash = await hashFile(file);

  let existingQuery = supabase
    .from("bid_packages")
    .select("id, file_hash, user_id, storage_path")
    .eq("file_hash", fileHash)
    .limit(1);

  if (userId) {
    existingQuery = existingQuery.eq("user_id", userId);
  } else {
    existingQuery = existingQuery.is("user_id", null);
  }

  const { data: existingRows, error: existingError } = await existingQuery;

  if (existingError) {
    console.error("Error checking existing bid package", existingError);
    return { packageId: null, fileHash, storagePath: null };
  }

  const existing = existingRows?.[0];
  if (existing?.id) {
    return {
      packageId: existing.id,
      fileHash,
      storagePath: existing.storage_path ?? null,
    };
  }

  const { data: createdRows, error: createError } = await supabase
    .from("bid_packages")
    .insert({
      user_id: userId ?? null,
      file_hash: fileHash,
      file_name: file.name,
    })
    .select("id, storage_path")
    .limit(1);

  if (createError) {
    console.error(
      "Error creating bid package",
      JSON.stringify(
        {
          message: createError.message,
          details: createError.details,
          hint: createError.hint,
          code: createError.code,
          full: createError,
          userId,
          fileHash,
          fileName: file.name,
        },
        null,
        2
      )
    );
    return { packageId: null, fileHash, storagePath: null };
  }

  return {
    packageId: createdRows?.[0]?.id ?? null,
    fileHash,
    storagePath: createdRows?.[0]?.storage_path ?? null,
  };
}
async function checkPackageUnlock(
  packageId: string,
  userId?: string | null
): Promise<boolean> {
  if (!packageId || !userId) return false;

  const { data, error } = await supabase
    .from("bid_unlocks")
    .select("id")
    .eq("bid_package_id", packageId)
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("Error checking package unlock:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      full: error,
      packageId,
      userId,
    });
    return false;
  }

  return !!data?.length;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasStrongLanguage(text: string) {
  return (
    text.includes("really") ||
    text.includes("strongly") ||
    text.includes("very important") ||
    text.includes("most important") ||
    text.includes("top priority") ||
    text.includes("absolutely")
  );
}

function getPreferenceWeight(text: string, baseWeight = 5) {
  const lower = text.toLowerCase();

  if (
    lower.includes("slightly") ||
    lower.includes("a bit") ||
    lower.includes("kind of")
  ) {
    return Math.max(1, baseWeight - 2);
  }

  if (
    lower.includes("really") ||
    lower.includes("strongly") ||
    lower.includes("very important")
  ) {
    return baseWeight + 2;
  }

  if (
    lower.includes("most important") ||
    lower.includes("top priority") ||
    lower.includes("absolutely")
  ) {
    return baseWeight + 4;
  }

  return baseWeight;
}

function extractTerminalPriorities(prompt: string, crews: Crew[]) {
  const text = prompt.toLowerCase().replace(/[â€™]/g, "'");

  const uniqueCrewTerminals = Array.from(
    new Set(
      crews
        .map((crew) => normalizeTerminalName(crew.terminal))
        .filter(Boolean)
    )
  );
  function extractDaysOffList(daily: any[]): string[] {
  return daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day);
}

  const candidates = uniqueCrewTerminals.map((canonical) => {
    const aliases = CANONICAL_TERMINAL_ALIASES[canonical] ?? [canonical];
    return { canonical, aliases: Array.from(new Set([canonical, ...aliases])) };
  });

  const matches: { terminal: string; index: number }[] = [];

  for (const candidate of candidates) {
    let bestIndex = -1;

    for (const alias of candidate.aliases) {
      const pattern = new RegExp(`\\b${escapeRegex(alias.toLowerCase())}\\b`, "i");
      const match = pattern.exec(text);
      if (match && (bestIndex === -1 || match.index < bestIndex)) {
        bestIndex = match.index;
      }
    }

    if (bestIndex !== -1) {
      matches.push({ terminal: candidate.canonical, index: bestIndex });
    }
  }

  matches.sort((a, b) => a.index - b.index);
  return matches.map((m) => m.terminal);
}



function getClauseTerminal(clause: string, crews: Crew[]): string | null {
  const matches = extractTerminalPriorities(clause, crews).map(normalizeTerminalName);
  return matches.length > 0 ? matches[0] : null;
}

function getAvoidTerminalFromClause(clause: string, crews: Crew[]): string | null {
  const normalizedClause = clause.toLowerCase().replace(/[Ã¢â‚¬â„¢]/g, "'");
  if (!/\bavoid\b/i.test(normalizedClause)) return null;

  return getClauseTerminal(clause, crews);
}

function getExcludedTerminalFromClause(clause: string, crews: Crew[]): string | null {
  const normalizedClause = clause.toLowerCase().replace(/[ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/g, "'");
  if (!/^\s*exclude\s+/.test(normalizedClause)) return null;

  return getClauseTerminal(clause, crews);
}

function getExplicitExcludedTerminalFromText(text: string): string | null {
  const normalizedText = text.toLowerCase().replace(/[Ã¢â‚¬â„¢]/g, "'").trim().replace(/\s+/g, " ");

  for (const [canonical, aliases] of Object.entries(CANONICAL_TERMINAL_ALIASES)) {
    for (const alias of Array.from(new Set([canonical, ...aliases]))) {
      const normalizedAlias = alias.toLowerCase().trim().replace(/\s+/g, " ");
      if (normalizedText === `exclude ${normalizedAlias}`) {
        return canonical;
      }
    }
  }

  return null;
}

function dedupeSortPreferences(
  sortPreferences: ParsedPreferences["sort_preferences"]
): ParsedPreferences["sort_preferences"] {
  const seen = new Map<string, ParsedPreferences["sort_preferences"][number]>();

  for (const sort of sortPreferences) {
    const key = `${sort.field}|${sort.direction}|${sort.strength}`;
    const existing = seen.get(key);

    if (!existing || (sort.weight ?? 0) > (existing.weight ?? 0)) {
      seen.set(key, sort);
    }
  }

  return Array.from(seen.values());
}

function mergeScopedAndGlobalSortPreferences(
  scopedSortPreferences:
    | ParsedPreferences["sort_preferences"]
    | ScopedPreference["sort_preferences"]
    | undefined,
  globalSortPreferences: ParsedPreferences["sort_preferences"]
): ParsedPreferences["sort_preferences"] {
  const scoped = scopedSortPreferences ?? [];
  const scopedFields = new Set(scoped.map((sort) => sort.field));
  const remainingGlobalSorts = (globalSortPreferences ?? []).filter(
    (sort) => !scopedFields.has(sort.field)
  );

  return dedupeSortPreferences([
    ...scoped,
    ...remainingGlobalSorts,
  ] as ParsedPreferences["sort_preferences"]);
}
function ensureScopedPreference(
  parsed: ParsedPreferences,
  terminal: string,
  normalized_terminal: string
): ScopedPreference {
  if (!parsed.scoped_preferences) {
    parsed.scoped_preferences = [];
  }

  let existing = parsed.scoped_preferences.find(
    (s) => s.normalized_terminal === normalized_terminal
  );

  if (!existing) {
    existing = {
      terminal,
      normalized_terminal,
      priority_rank: parsed.scoped_preferences.length + 1,
      sort_preferences: [],
      filters: [],
      required_days_off: [],
      requires_weekends_off: false,
    };
    parsed.scoped_preferences.push(existing);
  }

  return existing;
}

function normalizeTimeToken(hourRaw?: string, minuteRaw?: string) {
  if (!hourRaw) return null;
  const hour = hourRaw.padStart(2, "0");
  const minute = (minuteRaw ?? "00").padStart(2, "0");
  return `${hour}:${minute}`;
}

function containsAny(text: string, phrases: readonly string[]) {
  return phrases.some((p) => text.includes(p));
}

function dedupeFilters(
  filters: ParsedPreferences["filters"]
): ParsedPreferences["filters"] {
  const seen = new Map<string, ParsedPreferences["filters"][number]>();

  for (const filter of filters) {
    const key = `${filter.field}|${filter.operator}|${JSON.stringify(filter.value)}|${filter.strength}`;
    if (!seen.has(key)) {
      seen.set(key, filter);
    }
  }

  return Array.from(seen.values());
}

function removeRedundantPlainTerminalPriorityGroups(
  priorityGroups: ParsedPreferences["priority_groups"]
): ParsedPreferences["priority_groups"] {
  const keptGroups: ParsedPreferences["priority_groups"] = [];

  for (const group of priorityGroups) {
    const terminalConditions = group.conditions.filter(
      (condition) => condition.field === "terminal"
    );
    const terminalValue = terminalConditions[0]?.value;
    const normalizedTerminal =
      typeof terminalValue === "string"
        ? normalizeTerminalName(terminalValue)
        : null;
    const isPlainTerminalGroup =
      normalizedTerminal != null &&
      group.conditions.length === 1 &&
      terminalConditions.length === 1;

    const hasEarlierConditionalGroupForSameTerminal =
      isPlainTerminalGroup &&
      keptGroups.some((earlierGroup) => {
        const earlierTerminalConditions = earlierGroup.conditions.filter(
          (condition) => condition.field === "terminal"
        );
        const earlierTerminalValue = earlierTerminalConditions[0]?.value;
        const earlierNormalizedTerminal =
          typeof earlierTerminalValue === "string"
            ? normalizeTerminalName(earlierTerminalValue)
            : null;

        return (
          earlierNormalizedTerminal === normalizedTerminal &&
          earlierGroup.conditions.length > 1
        );
      });

    if (hasEarlierConditionalGroupForSameTerminal) {
      continue;
    }

    keptGroups.push(group);
  }

  return keptGroups.map((group, index) => ({
    ...group,
    rank: index + 1,
  }));
}

function shouldTreatOperatingAsWeekly(prompt: string) {
  const text = prompt.toLowerCase().replace(/[â€™]/g, "'");

  const explicitlyDaily =
    text.includes("daily operating") ||
    text.includes("operating daily") ||
    text.includes("operating hours daily") ||
    text.includes("daily op");

  if (explicitlyDaily) {
    return false;
  }

  return (
    containsAny(text, PHRASES.least_operating) ||
    containsAny(text, PHRASES.most_operating)
  );
}

function normalizeOperatingSortFields(
  parsed: ParsedPreferences,
  prompt: string
): ParsedPreferences {
  if (!shouldTreatOperatingAsWeekly(prompt)) {
    return parsed;
  }

  return {
    ...parsed,
    sort_preferences: dedupeSortPreferences(
      (parsed.sort_preferences ?? []).map((sort) =>
        sort.field === "operating_hours_daily"
          ? { ...sort, field: "operating_hours_weekly" as SortField }
          : sort
      )
    ),
    scoped_preferences: (parsed.scoped_preferences ?? []).map((scope) => ({
      ...scope,
      sort_preferences: dedupeSortPreferences(
        (scope.sort_preferences ?? []).map((sort) =>
          sort.field === "operating_hours_daily"
            ? { ...sort, field: "operating_hours_weekly" as SortField }
            : sort
        )
      ),
    })),
  };
}

function areFiltersEquivalent(
  a: ParsedPreferences["filters"][number],
  b: ParsedPreferences["filters"][number]
) {
  return (
    a.field === b.field &&
    a.operator === b.operator &&
    JSON.stringify(a.value) === JSON.stringify(b.value) &&
    a.strength === b.strength
  );
}

function removeRedundantTerminalAllowlistFilters(
  filters: ParsedPreferences["filters"]
): ParsedPreferences["filters"] {
  return filters.filter((filter, index, allFilters) => {
    if (
      filter.field !== "terminal" ||
      filter.operator !== "in" ||
      !Array.isArray(filter.value) ||
      filter.strength !== "hard"
    ) {
      return true;
    }

    const normalizedValues = Array.from(
      new Set(filter.value.map((value) => normalizeTerminalName(String(value))))
    ).sort();

    return !allFilters.some((candidate, candidateIndex) => {
      if (candidateIndex === index) return false;

      if (
        candidate.field !== "terminal" ||
        candidate.operator !== "in" ||
        !Array.isArray(candidate.value) ||
        candidate.strength !== "hard"
      ) {
        return false;
      }

      const candidateValues = Array.from(
        new Set(
          candidate.value.map((value) => normalizeTerminalName(String(value)))
        )
      ).sort();

      if (candidateValues.length <= normalizedValues.length) {
        return false;
      }

      return normalizedValues.every((value) => candidateValues.includes(value));
    });
  });
}

function areSortPreferencesEquivalent(
  a: ParsedPreferences["sort_preferences"][number],
  b: ParsedPreferences["sort_preferences"][number]
) {
  return (
    a.field === b.field &&
    a.direction === b.direction &&
    a.strength === b.strength &&
    (a.weight ?? null) === (b.weight ?? null)
  );
}

function removeOvergeneralizedMergedRules(
  merged: ParsedPreferences,
  fallback: ParsedPreferences
): ParsedPreferences {
  const fallbackGlobalFilters = fallback.filters ?? [];
  const fallbackScopedFilterFields = new Set(
    (fallback.scoped_preferences ?? []).flatMap((scope) =>
      (scope.filters ?? []).map((filter) => filter.field)
    )
  );
  const fallbackGlobalFilterFields = new Set(
    fallbackGlobalFilters.map((filter) => filter.field)
  );
  const fallbackScopedOnlyFilterFields = new Set(
    Array.from(fallbackScopedFilterFields).filter(
      (field) => !fallbackGlobalFilterFields.has(field)
    )
  );

  merged.filters = (merged.filters ?? []).filter((filter) => {
    if (!fallbackScopedOnlyFilterFields.has(filter.field)) {
      return true;
    }

    return fallbackGlobalFilters.some((fallbackFilter) =>
      areFiltersEquivalent(fallbackFilter, filter)
    );
  });

  const fallbackGlobalSorts = fallback.sort_preferences ?? [];
  const fallbackScopedSortFields = new Set(
    (fallback.scoped_preferences ?? []).flatMap((scope) =>
      (scope.sort_preferences ?? []).map((sort) => sort.field)
    )
  );
  const fallbackGlobalSortFields = new Set(
    fallbackGlobalSorts.map((sort) => sort.field)
  );
  const fallbackScopedOnlySortFields = new Set(
    Array.from(fallbackScopedSortFields).filter(
      (field) => !fallbackGlobalSortFields.has(field)
    )
  );

  merged.sort_preferences = (merged.sort_preferences ?? []).filter((sort) => {
    if (!fallbackScopedOnlySortFields.has(sort.field)) {
      return true;
    }

    return fallbackGlobalSorts.some((fallbackSort) =>
      areSortPreferencesEquivalent(fallbackSort, sort)
    );
  });

  return merged;
}

function mergeParsedPreferences(
  primary: ParsedPreferences,
  fallback: ParsedPreferences
): ParsedPreferences {
  const merged: ParsedPreferences = {
    filters: dedupeFilters([
      ...(primary.filters ?? []),
      ...(fallback.filters ?? []),
    ]),
    priority_groups: [
      ...(primary.priority_groups ?? []),
    ],
    sort_preferences: dedupeSortPreferences([
      ...(primary.sort_preferences ?? []),
      ...(fallback.sort_preferences ?? []),
    ]),
    tradeoffs: [
      ...(primary.tradeoffs ?? []),
      ...(fallback.tradeoffs ?? []),
    ],
    unknown_clauses: [
      ...(primary.unknown_clauses ?? []),
      ...(fallback.unknown_clauses ?? []),
    ],
    scoped_preferences: [
      ...((primary.scoped_preferences ?? []).map((scope) => ({
        ...scope,
        filters: [...(scope.filters ?? [])],
        sort_preferences: [...(scope.sort_preferences ?? [])],
        required_days_off: [...(scope.required_days_off ?? [])],
      })) as ScopedPreference[]),
    ],
  };

  for (const fallbackGroup of fallback.priority_groups ?? []) {
    const exists = merged.priority_groups.some((group) =>
      JSON.stringify(group.conditions) === JSON.stringify(fallbackGroup.conditions)
    );

    if (!exists) {
      merged.priority_groups.push(fallbackGroup);
    }
  }

  for (const fallbackScope of fallback.scoped_preferences ?? []) {
    const scope = ensureScopedPreference(
      merged,
      fallbackScope.terminal,
      fallbackScope.normalized_terminal
    );

    scope.priority_rank = Math.min(
      scope.priority_rank ?? Number.MAX_SAFE_INTEGER,
      fallbackScope.priority_rank ?? Number.MAX_SAFE_INTEGER
    );
    scope.filters = dedupeFilters([
      ...(scope.filters ?? []),
      ...(fallbackScope.filters ?? []),
    ]);
    scope.sort_preferences = dedupeSortPreferences([
      ...(scope.sort_preferences ?? []),
      ...(fallbackScope.sort_preferences ?? []),
    ]);
    scope.required_days_off = Array.from(
      new Set([
        ...(scope.required_days_off ?? []),
        ...(fallbackScope.required_days_off ?? []),
      ])
    );
    scope.requires_weekends_off =
      scope.requires_weekends_off || fallbackScope.requires_weekends_off;
  }

  merged.priority_groups = removeRedundantPlainTerminalPriorityGroups(
    merged.priority_groups
      .sort((a, b) => a.rank - b.rank)
      .map((group, index) => ({
        ...group,
        rank: index + 1,
      }))
  );

  merged.scoped_preferences = (merged.scoped_preferences ?? [])
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((scope, index) => ({
      ...scope,
      priority_rank: index + 1,
    }));

  merged.unknown_clauses = (merged.unknown_clauses ?? []).filter(
    (clause) => !isClauseDeterministicallyHandled(clause.text)
  );

  merged.filters = removeRedundantTerminalAllowlistFilters(
    dedupeFilters(merged.filters ?? [])
  );

  return merged;
}

function splitIntoPreferenceClauses(prompt: string): PreferenceClause[] {
  return prompt
    .split(/[.;]/)
    .flatMap((sentence, sentenceIndex) =>
      sentence
        .split(
          /\b(?:then|after that|next|followed by|and then|but include|but keep|finally|lastly)\b|(?:\s+\bbut\b\s+)|,/i
        )
        .map((part) => part.trim())
        .filter(Boolean)
        .map((text) => ({
          text,
          sentenceIndex,
        }))
    );
}

function isClearlyGlobalClause(clause: string) {
  return (
    containsAny(clause, PHRASES.exclude_all_others) ||
    containsAny(clause, PHRASES.exclude_standby) ||
    containsAny(clause, PHRASES.exclude_spareboard) ||
    containsAny(clause, PHRASES.exclude_up) ||
    containsAny(clause, PHRASES.include_spareboard) ||
    clause.includes("across everything") ||
    clause.includes("across all") ||
    clause.includes("across the board") ||
    clause.includes("globally") ||
    clause.includes("everywhere") ||
    clause.includes("all terminals") ||
    clause.includes("rank everything") ||
    clause.includes("no other terminals") ||
    clause.includes("hide every other terminal") ||
    clause.includes("hide all other terminals")
  );
}

function isSpareboardTerminal(value: string) {
  return normalizeTerminalName(value) === "spareboard";
}

function isStandbyTerminal(value: string) {
  return normalizeTerminalName(value) === "standby";
}

function getAllKnownTerminals(crews: Crew[]) {
  return Array.from(
    new Set(crews.map((c) => normalizeTerminalName(c.terminal)).filter(Boolean))
  );
}

function getRepresentativeJobForCrew(crew: Crew) {
  const daily = Array.isArray(crew.daily) ? crew.daily : [];
  const firstWorkedDay = daily.find((d) => !d.is_day_off && d.job_detail);
  return firstWorkedDay?.job_detail ?? crew.job_details?.[0] ?? null;
}

function hasExplicitTerminalOnlyLanguage(text: string) {
  return (
    containsAny(text, PHRASES.only_language_terminal_context) ||
    /\bonly\s+(willowbrook|wb|lewis road|lewis|wrmf|whitby|richmond hill|rh|milton|mil|barrie|bar|bradford|kitchener|kit|lincolnville|linc|lcn|spareboard|spare board|spare|standby|stdby)\b/i.test(
      text
    ) ||
    /\b(willowbrook|wb|lewis road|lewis|wrmf|whitby|richmond hill|rh|milton|mil|barrie|bar|bradford|kitchener|kit|lincolnville|linc|lcn|spareboard|spare board|spare|standby|stdby)\s+only\b/i.test(
      text
    )
  );
}

const PHRASES = {
  mornings_only: [
    "mornings only",
    "only mornings",
    "morning only",
    "morning jobs only",
    "only morning jobs",
    "just mornings",
    "just morning jobs",
    "strictly mornings",
    "strictly morning jobs",
    "nothing but mornings",
    "keep it mornings",
    "keep it morning",
    "morning work only",
    "morning crews only",
    "morning runs only",
    "morning assignments only",
    "morning shifts only",
    "morning side only",
    "daylight starts only",
    "only early starts",
  ],

  prefer_mornings: [
    "prefer mornings",
    "prefer morning",
    "mornings first",
    "morning first",
    "lean mornings",
    "more mornings",
    "favour mornings",
    "favor mornings",
    "earlier starts preferred",
    "prefer earlier starts",
    "like mornings",
    "morning leaning",
    "ideally mornings",
    "would rather mornings",
    "better if mornings",
    "keep mornings higher",
    "rank mornings first",
    "morning preference",
  ],

  no_mornings: [
    "no mornings",
    "no morning",
    "no morning jobs",
    "no morning crews",
    "no early mornings",
    "nothing in the morning",
    "nothing early",
    "nothing too early",
    "nothing before noon",
    "nothing before 12",
    "keep mornings out",
    "keep early starts out",
    "no early starts",
    "no early jobs",
    "don't give me mornings",
    "exclude mornings",
    "exclude morning jobs",
    "not mornings",
    "not morning jobs",
    "anything but mornings",
    "avoid mornings",
    "do not want mornings",
    "don't want mornings",
  ],

  evenings_only: [
    "evenings only",
    "only evenings",
    "evening only",
    "evening jobs only",
    "only evening jobs",
    "nights only",
    "only nights",
    "night jobs only",
    "just evenings",
    "strictly evenings",
    "nothing but evenings",
    "keep it evenings",
    "late jobs only",
    "later starts only",
    "only late starts",
    "afternoons only",
    "afternoon and evening only",
  ],

  prefer_evenings: [
    "prefer evenings",
    "prefer evening",
    "prefer afternoons",
    "prefer afternoon",
    "evenings first",
    "evening first",
    "nights first",
    "later starts",
    "later start",
    "prefer nights",
    "prefer later starts",
    "later starts preferred",
    "afternoons preferred",
    "afternoon starts preferred",
    "prefer afternnoons",
    "lean evenings",
    "more evening work",
    "favor evenings",
    "favour evenings",
    "ideally evenings",
    "evening preference",
    "rank evenings first",
  ],

  no_nights: [
    "no nights",
    "no night jobs",
    "exclude nights",
    "anything but nights",
    "avoid nights",
    "prefer no nights",
    "keep nights out",
    "don't want nights",
    "do not want nights",
    "no overnight jobs",
    "no overnights",
    "not nights",
    "nothing late",
    "nothing too late",
    "no late nights",
    "don't finish too late",
  ],

  include_spareboard: [
    "include spareboard",
    "but include spareboard",
    "keep spareboard",
    "allow spareboard",
    "spareboard included",
    "leave spareboard in",
    "still include spareboard",
    "don't exclude spareboard",
    "do not exclude spareboard",
  ],

  only_spareboard: [
    "spareboard only",
    "only spareboard",
    "only spare board",
    "only spare",
    "just spareboard",
    "just spare board",
    "spareboard crews only",
    "spare crews only",
  ],

  exclude_spareboard: [
    "exclude spareboard",
    "exclude spare board",
    "no spareboard",
    "no spare board",
    "not spareboard",
    "not spare board",
    "avoid spareboard",
    "remove spareboard",
    "skip spareboard",
    "keep spareboard out",
    "don't give me spareboard",
  ],

  exclude_standby: [
    "exclude standby",
    "no standby",
    "anything but standby",
    "avoid standby",
    "not standby",
    "skip standby",
    "remove standby",
    "leave out standby",
    "don't want standby",
    "do not want standby",
    "standby out",
  ],

  only_standby: [
    "standby only",
    "only standby",
    "only stdby",
    "stdby only",
    "just standby",
    "standby crews only",
  ],

  no_splits: [
    "no splits",
    "no split",
    "no split jobs",
    "no split time",
    "exclude splits",
    "exclude split jobs",
    "avoid splits",
    "avoid split jobs",
    "anything but splits",
    "don't want splits",
    "do not want splits",
    "without splits",
  ],

  exclude_shuttle_bus: [
    "no shuttle bus",
    "no shuttle buses",
    "no bus",
    "no buses",
    "exclude shuttle bus",
    "exclude shuttle buses",
    "avoid shuttle bus",
    "avoid shuttle buses",
    "without shuttle bus",
    "without shuttle buses",
    "hide shuttle bus",
    "hide shuttle buses",
  ],

  only_shuttle_bus: [
    "only shuttle bus",
    "only shuttle buses",
    "only shuttle bus jobs",
    "shuttle bus only",
    "shuttle buses only",
    "shuttle bus jobs only",
    "only bus jobs",
  ],

  exclude_up: [
    "exclude up",
    "exclude ups",
    "no up",
    "no ups",
    "no up jobs",
    "no up crews",
    "avoid up",
    "avoid ups",
    "not up",
    "not ups",
    "anything but up",
    "anything but ups",
    "no willowbrook up",
    "exclude willowbrook up",
    "keep up out",
    "keep ups out",
    "don't give me up",
    "leave out up",
  ],

  exclude_all_others: [
    "no other terminals",
    "hide every other terminal",
    "hide all other terminals",
    "exclude all other terminals",
    "all other terminals excluded",
    "exclude everything else",
    "exclude all others",
    "only these terminals",
    "nothing else",
    "nothing but",
    "only show",
    "keep it to",
    "just these terminals",
    "only these",
    "outside of that exclude the rest",
  ],

  weekends_off_hard: [
    "must have weekends off",
    "need weekends off",
    "weekends only",
    "only weekends off",
    "only weekends",
    "require weekends off",
    "hard weekends off",
    "weekends are a must",
    "must be off weekends",
    "must have saturday and sunday off",
  ],

  weekends_off_prefer: [
    "weekends off",
    "sat sun off",
    "saturday sunday off",
    "saturday and sunday free",
    "saturday sunday free",
    "have weekends off",
    "want weekends off",
    "prefer weekends off",
    "keep weekends off",
    "weekend off",
    "sats and suns off",
    "saturday and sunday off",
    "off on weekends",
    "weekends free",
  ],

  weekends_off_first: [
    "weekends off first",
    "rank weekends off first",
    "put weekends off first",
    "prioritize weekends off",
    "weekends first",
    "list weekends off first",
  ],

  weekdays_off_only: [
    "weekdays off only",
    "weekday off only",
    "weekday off jobs only",
    "weekdays off jobs only",
    "weekday-off jobs only",
    "weekday-off jobs",
    "weekday off jobs",
    "only weekdays off",
    "only weekday off",
    "only weekday-off jobs",
    "only weekday off jobs",
    "weekdays only off",
    "weekday-only off",
    "no weekends off",
    "no weekend off",
    "without weekends off",
    "keep weekends off the days off",
  ],

  three_day_off_only: [
    "3 day off jobs only",
    "three day off jobs only",
    "only 3 day off jobs",
    "only three day off jobs",
    "3-day-off jobs only",
    "only 3 day off crews",
    "only three day off crews",
  ],

  three_day_off_prefer: [
    "prefer 3 day off jobs",
    "prefer three day off jobs",
    "prefer 3 day off crews",
    "prefer three day off crews",
    "like 3 day off jobs",
    "want 3 day off jobs",
    "3 day off jobs preferred",
    "three day off jobs preferred",
  ],

  three_day_off_first: [
    "3 day off first",
    "three day off first",
    "3 day off jobs first",
    "three day off jobs first",
    "put 3 day off first",
    "put three day off first",
    "put 3 day off jobs first",
    "put three day off jobs first",
    "rank 3 day off first",
    "rank three day off first",
    "rank 3 day off jobs first",
    "rank three day off jobs first",
    "list 3 day off first",
    "list three day off first",
    "list 3 day off jobs first",
    "list three day off jobs first",
  ],

  three_day_off_last: [
    "3 day off last",
    "three day off last",
    "3 day off jobs last",
    "three day off jobs last",
    "put 3 day off last",
    "put three day off last",
    "put 3 day off jobs last",
    "put three day off jobs last",
    "rank 3 day off last",
    "rank three day off last",
    "rank 3 day off jobs last",
    "rank three day off jobs last",
    "list 3 day off last",
    "list three day off last",
    "list 3 day off jobs last",
    "list three day off jobs last",
  ],

  no_three_day_off: [
    "no 3 day off jobs",
    "no three day off jobs",
    "no 3 day off crews",
    "no three day off crews",
    "hide any 3 day off jobs",
    "hide any three day off jobs",
    "hide any 3 day off crews",
    "hide any three day off crews",
    "exclude 3 day off jobs",
    "exclude three day off jobs",
    "avoid 3 day off jobs",
    "avoid three day off jobs",
    "anything but 3 day off jobs",
    "anything but three day off jobs",
  ],

  early_finishes: [
    "early finishes",
    "early finish",
    "earlier finishes",
    "earlier finish",
    "prefer early finishes",
    "prefer earlier finishes",
    "finish earlier",
    "finishes earlier",
  ],

  most_ot: [
    "most ot",
    "most overtime",
    "highest overtime",
    "highest ot",
    "rank highest overtime to lowest",
    "rank highest ot to lowest",
    "rank them most ot to least",
    "rank them highest overtime",
    "max overtime",
    "maximum overtime",
    "want the most overtime",
    "sort by highest overtime",
    "sort by most overtime",
    "from most ot to least",
    "from highest overtime to lowest",
    "ot first",
    "biggest overtime first",
  ],

  least_ot: [
    "least ot",
    "lowest overtime",
    "least overtime",
    "lowest ot",
    "minimal overtime",
    "min overtime",
    "want the least overtime",
    "sort by lowest overtime",
    "sort by least overtime",
    "from least ot to most",
    "from lowest overtime to highest",
    "smallest overtime first",
  ],

  least_operating: [
    "least operating",
    "lowest operating",
    "least operating time",
    "least amount of operating",
    "least amount of operating time",
    "shortest operating",
    "minimum operating",
    "minimal operating",
    "lowest operating time",
    "want the least operating",
    "sort by least operating",
    "sort by lowest operating",
    "from least operating to most",
    "smaller operating first",
  ],

  most_operating: [
    "most operating",
    "highest operating",
    "longest operating",
    "maximum operating",
    "most operating time",
    "sort by most operating",
    "sort by highest operating",
    "from most operating to least",
    "want the most operating",
  ],

  least_van: [
    "least van",
    "lowest van",
    "least van time",
    "minimal van",
    "minimum van",
    "lowest van time",
    "want the least van",
    "sort by least van",
    "sort by lowest van",
    "from least van to most",
  ],

  most_van: [
    "most van",
    "highest van",
    "most van time",
    "maximum van",
    "want the most van",
    "sort by most van",
    "sort by highest van",
    "from most van to least",
  ],

  only_language_terminal_context: [
    "only show",
    "only these terminals",
    "just these terminals",
    "keep it to",
    "nothing outside",
    "only willowbrook",
    "only lewis road",
    "only wrmf",
    "only barrie",
    "only milton",
    "only bradford",
    "only kitchener",
    "only lincolnville",
    "only spareboard",
    "only standby",
  ],
} as const;

const PHRASE_INTENT_DEFINITIONS = {
  mornings_only: {
    phrases: PHRASES.mornings_only,
    conflictsWith: ["no_mornings", "prefer_evenings"],
  },
  prefer_mornings: {
    phrases: PHRASES.prefer_mornings,
    conflictsWith: ["no_mornings", "prefer_evenings"],
  },
  no_mornings: {
    phrases: PHRASES.no_mornings,
    conflictsWith: ["mornings_only", "prefer_mornings"],
  },
  evenings_only: {
    phrases: PHRASES.evenings_only,
    conflictsWith: ["mornings_only", "prefer_mornings"],
  },
  prefer_evenings: {
    phrases: PHRASES.prefer_evenings,
    conflictsWith: ["mornings_only", "prefer_mornings"],
  },
  no_nights: {
    phrases: PHRASES.no_nights,
    conflictsWith: ["evenings_only", "prefer_evenings"],
  },
  early_finishes: {
    phrases: PHRASES.early_finishes,
    conflictsWith: [],
  },
  include_spareboard: {
    phrases: PHRASES.include_spareboard,
    conflictsWith: ["exclude_spareboard"],
  },
  only_spareboard: {
    phrases: PHRASES.only_spareboard,
    conflictsWith: ["exclude_spareboard"],
  },
  exclude_spareboard: {
    phrases: PHRASES.exclude_spareboard,
    conflictsWith: ["include_spareboard", "only_spareboard"],
  },
  exclude_standby: {
    phrases: PHRASES.exclude_standby,
    conflictsWith: [],
  },
  only_standby: {
    phrases: PHRASES.only_standby,
    conflictsWith: ["exclude_standby"],
  },
  no_splits: {
    phrases: PHRASES.no_splits,
    conflictsWith: [],
  },
  exclude_shuttle_bus: {
    phrases: PHRASES.exclude_shuttle_bus,
    conflictsWith: ["only_shuttle_bus"],
  },
  only_shuttle_bus: {
    phrases: PHRASES.only_shuttle_bus,
    conflictsWith: ["exclude_shuttle_bus"],
  },
  exclude_up: {
    phrases: PHRASES.exclude_up,
    conflictsWith: [],
  },
  weekends_off_hard: {
    phrases: PHRASES.weekends_off_hard,
    conflictsWith: [],
  },
  weekends_off_prefer: {
    phrases: PHRASES.weekends_off_prefer,
    conflictsWith: [],
  },
  weekends_off_first: {
    phrases: PHRASES.weekends_off_first,
    conflictsWith: [],
  },
  weekdays_off_only: {
    phrases: PHRASES.weekdays_off_only,
    conflictsWith: ["weekends_off_hard", "weekends_off_prefer", "weekends_off_first"],
  },
  three_day_off_only: {
    phrases: PHRASES.three_day_off_only,
    conflictsWith: ["no_three_day_off"],
  },
  three_day_off_prefer: {
    phrases: PHRASES.three_day_off_prefer,
    conflictsWith: ["no_three_day_off", "three_day_off_last"],
  },
  three_day_off_first: {
    phrases: PHRASES.three_day_off_first,
    conflictsWith: ["no_three_day_off", "three_day_off_last"],
  },
  three_day_off_last: {
    phrases: PHRASES.three_day_off_last,
    conflictsWith: ["three_day_off_only", "three_day_off_prefer", "three_day_off_first"],
  },
  no_three_day_off: {
    phrases: PHRASES.no_three_day_off,
    conflictsWith: ["three_day_off_only", "three_day_off_prefer", "three_day_off_first"],
  },
  most_ot: {
    phrases: PHRASES.most_ot,
    conflictsWith: ["least_ot"],
  },
  least_ot: {
    phrases: PHRASES.least_ot,
    conflictsWith: ["most_ot"],
  },
  least_operating: {
    phrases: PHRASES.least_operating,
    conflictsWith: ["most_operating"],
  },
  most_operating: {
    phrases: PHRASES.most_operating,
    conflictsWith: ["least_operating"],
  },
  least_van: {
    phrases: PHRASES.least_van,
    conflictsWith: ["most_van"],
  },
  most_van: {
    phrases: PHRASES.most_van,
    conflictsWith: ["least_van"],
  },
} as const;

type PhraseIntentKey = keyof typeof PHRASE_INTENT_DEFINITIONS;

function detectPhraseIntents(text: string): Set<PhraseIntentKey> {
  const intents = new Set<PhraseIntentKey>();

  (Object.entries(PHRASE_INTENT_DEFINITIONS) as Array<
    [PhraseIntentKey, (typeof PHRASE_INTENT_DEFINITIONS)[PhraseIntentKey]]
  >).forEach(([intentKey, definition]) => {
    if (containsAny(text, definition.phrases)) {
      intents.add(intentKey);
    }
  });

  return intents;
}

function isClauseDeterministicallyHandled(clause: string) {
  const normalized = clause.toLowerCase().replace(/[â€™]/g, "'");

  if (detectPhraseIntents(normalized).size > 0) {
    return true;
  }

  if (
    /(not before|no starts before|no jobs before|start after|starts after|no earlier than|nothing starting before|nothing before)\s+\d{1,2}:?\d{0,2}/i.test(
      clause
    )
  ) {
    return true;
  }

  if (
    /(finish|finishes|end|ends|no finishes after|doesn't finish past|doesnt finish past|not finishing past|not after|no later than)\s*(before|by|after)?\s*\d{1,2}:?\d{0,2}/i.test(
      clause
    )
  ) {
    return true;
  }

  if (/\bexactly\s+\d+\s+weekdays?\s+off\b/i.test(clause)) {
    return true;
  }

  if (/\bno\s+weekend\s+days?\s+off\b/i.test(clause)) {
    return true;
  }

  if (
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(clause) &&
    /( off|days off|must have|prefer |want |need |free)/i.test(clause)
  ) {
    return true;
  }

  if (hasExplicitTerminalOnlyLanguage(normalized)) {
    return true;
  }

  if (containsAny(normalized, PHRASES.exclude_all_others)) {
    return true;
  }

  if (
    /\bavoid\s+(willowbrook|wb|lewis road|lewis|wrmf|whitby|richmond hill|rh|milton|mil|barrie|bar|bradford|kitchener|kit|lincolnville|linc|lcn|spareboard|spare board|spare|standby|stdby)\b/i.test(
      clause
    )
  ) {
    return true;
  }

  if (
    /^\s*exclude\s+(willowbrook|wb|lewis road|lewis|wrmf|whitby|richmond hill|rh|milton|mil|barrie|bar|bradford|kitchener|kit|lincolnville|linc|lcn|spareboard|spare board|spare|standby|stdby)\b/i.test(
      clause
    )
  ) {
    return true;
  }

  if (/\bexcept at\b/i.test(clause)) {
    return true;
  }

  return false;
}

function filtersContainOnDutyRule(
  filters: ParsedPreferences["filters"] | ScopedPreference["filters"],
  operator: string,
  value: string
) {
  return (filters ?? []).some(
    (filter) =>
      filter.field === "on_duty" &&
      filter.operator === operator &&
      filter.value === value
  );
}

function removeOnDutySortPreference(
  sortPreferences:
    | ParsedPreferences["sort_preferences"]
    | ScopedPreference["sort_preferences"],
  direction: "asc" | "desc"
) {
  return (sortPreferences ?? []).filter(
    (sort) => !(sort.field === "on_duty" && sort.direction === direction)
  );
}

function removeSortPreferenceByField(
  sortPreferences:
    | ParsedPreferences["sort_preferences"]
    | ScopedPreference["sort_preferences"],
  field: SortField,
  direction?: "asc" | "desc"
) {
  return (sortPreferences ?? []).filter((sort) => {
    if (sort.field !== field) return true;
    if (!direction) return false;
    return sort.direction !== direction;
  });
}

function prioritizeSortPreference(
  sortPreferences:
    | ParsedPreferences["sort_preferences"]
    | ScopedPreference["sort_preferences"],
  field: SortField,
  direction: "asc" | "desc"
) {
  const matching = (sortPreferences ?? []).filter(
    (sort) => sort.field === field && sort.direction === direction
  );
  const remaining = (sortPreferences ?? []).filter(
    (sort) => !(sort.field === field && sort.direction === direction)
  );

  return [...matching, ...remaining];
}

function applyConflictResolutionRules(
  parsed: ParsedPreferences,
  intents: Set<PhraseIntentKey>
): ParsedPreferences {
  const nextParsed: ParsedPreferences = {
    ...parsed,
    filters: [...(parsed.filters ?? [])],
    priority_groups: [...(parsed.priority_groups ?? [])],
    sort_preferences: [...(parsed.sort_preferences ?? [])],
    tradeoffs: [...(parsed.tradeoffs ?? [])],
    unknown_clauses: [...(parsed.unknown_clauses ?? [])],
    scoped_preferences: (parsed.scoped_preferences ?? []).map((scope) => ({
      ...scope,
      filters: [...(scope.filters ?? [])],
      sort_preferences: [...(scope.sort_preferences ?? [])],
      required_days_off: [...(scope.required_days_off ?? [])],
    })),
  };

  const hasGlobalNoMorningsFilter =
    intents.has("no_mornings") ||
    filtersContainOnDutyRule(
      nextParsed.filters,
      ">=",
      TIME_BUCKETS.afternoon.start
    );

  if (hasGlobalNoMorningsFilter) {
    nextParsed.filters = nextParsed.filters.filter(
      (filter) =>
        !(
          filter.field === "on_duty" &&
          filter.operator === "<=" &&
          filter.value === TIME_BUCKETS.morning.end
        )
    );

    nextParsed.sort_preferences = removeOnDutySortPreference(
      nextParsed.sort_preferences,
      "asc"
    );
  }

  if (intents.has("prefer_evenings") || intents.has("evenings_only")) {
    nextParsed.sort_preferences = removeOnDutySortPreference(
      nextParsed.sort_preferences,
      "asc"
    );
  }

  if (intents.has("prefer_mornings") || intents.has("mornings_only")) {
    nextParsed.sort_preferences = removeOnDutySortPreference(
      nextParsed.sort_preferences,
      "desc"
    );
  }

  const hasExplicitStartTimeSortIntent =
    intents.has("prefer_mornings") ||
    intents.has("mornings_only") ||
    intents.has("no_mornings") ||
    intents.has("prefer_evenings") ||
    intents.has("evenings_only") ||
    intents.has("no_nights");

  if (!hasExplicitStartTimeSortIntent) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "on_duty"
    );
  }

  if (intents.has("most_ot")) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "overtime_hours_weekly",
      "asc"
    );
    nextParsed.sort_preferences = prioritizeSortPreference(
      nextParsed.sort_preferences,
      "overtime_hours_weekly",
      "desc"
    );
  }

  if (intents.has("least_ot")) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "overtime_hours_weekly",
      "desc"
    );
    nextParsed.sort_preferences = prioritizeSortPreference(
      nextParsed.sort_preferences,
      "overtime_hours_weekly",
      "asc"
    );
  }

  if (intents.has("most_operating")) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "operating_hours_weekly",
      "asc"
    );
  }

  if (intents.has("least_operating")) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "operating_hours_weekly",
      "desc"
    );
  }

  if (intents.has("most_van")) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "van_hours_daily",
      "asc"
    );
  }

  if (intents.has("least_van")) {
    nextParsed.sort_preferences = removeSortPreferenceByField(
      nextParsed.sort_preferences,
      "van_hours_daily",
      "desc"
    );
  }

  if (intents.has("weekends_off_first")) {
    nextParsed.sort_preferences = prioritizeSortPreference(
      nextParsed.sort_preferences,
      "weekends_off",
      "desc"
    );
  }

  if (intents.has("three_day_off_first")) {
    nextParsed.sort_preferences = prioritizeSortPreference(
      nextParsed.sort_preferences,
      "three_day_off_jobs",
      "desc"
    );
  }

  if (intents.has("three_day_off_last")) {
    nextParsed.sort_preferences = prioritizeSortPreference(
      nextParsed.sort_preferences,
      "three_day_off_jobs",
      "asc"
    );
  }

  const preferWeekendsOnly =
    intents.has("weekends_off_prefer") && !intents.has("weekends_off_hard");

  const preferThreeDayOffOnly =
    (intents.has("three_day_off_prefer") || intents.has("three_day_off_first")) &&
    !intents.has("three_day_off_only") &&
    !intents.has("no_three_day_off");

  nextParsed.filters = nextParsed.filters.filter(
    (filter) =>
      !(
        preferThreeDayOffOnly &&
        ((filter.field === "include_only_three_day_off_jobs" &&
          filter.operator === "=" &&
          filter.value === true) ||
          ((filter.field === "days_off_count" || filter.field === "days_off") &&
            filter.operator === ">=" &&
            Number(filter.value) === 3))
      ) &&
      !(
        intents.has("three_day_off_last") &&
        ((filter.field === "include_only_three_day_off_jobs" &&
          filter.operator === "=" &&
          filter.value === true) ||
          ((filter.field === "days_off_count" || filter.field === "days_off") &&
            filter.operator === ">=" &&
            Number(filter.value) === 3))
      )
  );

  nextParsed.scoped_preferences = (nextParsed.scoped_preferences ?? []).map(
    (scope) => {
      const nextScopeFilters = (scope.filters ?? []).filter(
        (filter) =>
          !(
            filtersContainOnDutyRule(
              scope.filters,
              ">=",
              TIME_BUCKETS.afternoon.start
            ) &&
            filter.field === "on_duty" &&
            filter.operator === "<=" &&
            filter.value === TIME_BUCKETS.morning.end
          ) &&
          !(
            preferWeekendsOnly &&
            filter.field === "weekends_off_hard" &&
            filter.operator === "=" &&
            filter.value === true
          ) &&
          !(
            preferThreeDayOffOnly &&
            ((filter.field === "include_only_three_day_off_jobs" &&
              filter.operator === "=" &&
              filter.value === true) ||
              ((filter.field === "days_off_count" || filter.field === "days_off") &&
                filter.operator === ">=" &&
                Number(filter.value) === 3))
          ) &&
          !(
            intents.has("three_day_off_last") &&
            ((filter.field === "include_only_three_day_off_jobs" &&
              filter.operator === "=" &&
              filter.value === true) ||
              ((filter.field === "days_off_count" || filter.field === "days_off") &&
                filter.operator === ">=" &&
                Number(filter.value) === 3))
          )
      );

      const scopeHasNoMorningsFilter = filtersContainOnDutyRule(
        nextScopeFilters,
        ">=",
        TIME_BUCKETS.afternoon.start
      );

      let nextScopeSorts = [...(scope.sort_preferences ?? [])];

      if (scopeHasNoMorningsFilter) {
        nextScopeSorts = removeOnDutySortPreference(nextScopeSorts, "asc");
      }

      if (!hasExplicitStartTimeSortIntent) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "on_duty"
        );
      }

      if (intents.has("most_ot")) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "overtime_hours_weekly",
          "asc"
        );
        nextScopeSorts = prioritizeSortPreference(
          nextScopeSorts,
          "overtime_hours_weekly",
          "desc"
        );
      }

      if (intents.has("least_ot")) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "overtime_hours_weekly",
          "desc"
        );
        nextScopeSorts = prioritizeSortPreference(
          nextScopeSorts,
          "overtime_hours_weekly",
          "asc"
        );
      }

      if (intents.has("most_operating")) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "operating_hours_weekly",
          "asc"
        );
      }

      if (intents.has("least_operating")) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "operating_hours_weekly",
          "desc"
        );
      }

      if (intents.has("most_van")) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "van_hours_daily",
          "asc"
        );
      }

      if (intents.has("least_van")) {
        nextScopeSorts = removeSortPreferenceByField(
          nextScopeSorts,
          "van_hours_daily",
          "desc"
        );
      }

      if (intents.has("weekends_off_first")) {
        nextScopeSorts = prioritizeSortPreference(
          nextScopeSorts,
          "weekends_off",
          "desc"
        );
      }

      if (intents.has("three_day_off_first")) {
        nextScopeSorts = prioritizeSortPreference(
          nextScopeSorts,
          "three_day_off_jobs",
          "desc"
        );
      }

      if (intents.has("three_day_off_last")) {
        nextScopeSorts = prioritizeSortPreference(
          nextScopeSorts,
          "three_day_off_jobs",
          "asc"
        );
      }

      return {
        ...scope,
        filters: nextScopeFilters,
        sort_preferences: nextScopeSorts,
        requires_weekends_off: preferWeekendsOnly
          ? false
          : scope.requires_weekends_off,
      };
    }
  );

  nextParsed.filters = dedupeFilters(nextParsed.filters);
  nextParsed.sort_preferences = dedupeSortPreferences(nextParsed.sort_preferences);
  nextParsed.scoped_preferences = (nextParsed.scoped_preferences ?? []).map((scope) => ({
    ...scope,
    filters: dedupeFilters(scope.filters),
    sort_preferences: dedupeSortPreferences(scope.sort_preferences),
  }));

  return nextParsed;
}


function parsePreferences(prompt: string, crews: Crew[]): ParsedPreferences {
  const text = prompt.toLowerCase().replace(/[â€™]/g, "'");

  const parsed: ParsedPreferences = {
    filters: [],
    priority_groups: [],
    sort_preferences: [],
    tradeoffs: [],
    unknown_clauses: [],
    scoped_preferences: [],
  };

  const allKnownTerminals = getAllKnownTerminals(crews);

  const clauses = splitIntoPreferenceClauses(prompt);
  const sentenceTerminalCounts = new Map<number, number>();

  for (const clauseEntry of clauses) {
    const sentenceTerminals = extractTerminalPriorities(clauseEntry.text, crews)
      .map(normalizeTerminalName)
      .filter(Boolean);

    if (sentenceTerminals.length === 0) continue;

    sentenceTerminalCounts.set(
      clauseEntry.sentenceIndex,
      Math.max(
        sentenceTerminalCounts.get(clauseEntry.sentenceIndex) ?? 0,
        new Set(sentenceTerminals).size
      )
    );
  }

  const clauseOrderedTerminals: string[] = [];

  for (const clauseEntry of clauses) {
    const rawClause = clauseEntry.text;
    const clause = rawClause.toLowerCase().replace(/[â€™]/g, "'");
    const terminal = getClauseTerminal(rawClause, crews);
    if (!terminal) continue;

    const normalized = normalizeTerminalName(terminal);

    const isExclusionClause =
      clause.includes("exclude ") ||
      clause.includes("no ") ||
      clause.includes("anything but ") ||
      clause.includes("not ") ||
      Boolean(getExcludedTerminalFromClause(rawClause, crews)) ||
      Boolean(getAvoidTerminalFromClause(rawClause, crews)) ||
      clause.includes("exclude standby") ||
      clause.includes("no standby");

    if (isExclusionClause) continue;

    if (!clauseOrderedTerminals.includes(normalized)) {
      clauseOrderedTerminals.push(normalized);
    }
  }

  const matchedTerminals = Array.from(
    new Set(
      clauses.flatMap((clauseEntry) =>
        getExcludedTerminalFromClause(clauseEntry.text, crews) ||
        getAvoidTerminalFromClause(clauseEntry.text, crews)
          ? []
          : extractTerminalPriorities(clauseEntry.text, crews).map(
              normalizeTerminalName
            )
      )
    )
  );

  const orderedTerminals =
    clauseOrderedTerminals.length > 0 ? clauseOrderedTerminals : matchedTerminals;

  const explicitIncludeSpareboard =
    containsAny(text, PHRASES.include_spareboard);

  const explicitExcludeAllOthers =
    containsAny(text, PHRASES.exclude_all_others);

  const explicitOnlyLanguage = hasExplicitTerminalOnlyLanguage(text);

  if ((explicitExcludeAllOthers || explicitOnlyLanguage) && orderedTerminals.length > 0) {
    const allowedTerminalSet = new Set<string>(orderedTerminals);

    if (explicitIncludeSpareboard) {
      allowedTerminalSet.add("spareboard");
    }

    parsed.filters.push({
      field: "terminal",
      operator: "in",
      value: Array.from(allowedTerminalSet),
      strength: "hard",
    });
  }

  orderedTerminals.forEach((terminal, index) => {
    parsed.priority_groups.push({
      rank: index + 1,
      strength: "strong",
      conditions: [{ field: "terminal", operator: "=", value: terminal }],
    });

    parsed.scoped_preferences!.push({
      terminal: formatTerminalDisplayName(terminal),
      normalized_terminal: terminal,
      priority_rank: index + 1,
      sort_preferences: [],
      filters: [],
      required_days_off: [],
      requires_weekends_off: false,
    });
  });

  const ensureScope = (terminal: string): ScopedPreference => {
    const normalized = normalizeTerminalName(terminal);

    let scoped = parsed.scoped_preferences!.find(
      (s) => s.normalized_terminal === normalized
    );

    if (!scoped) {
      const existingPriority =
        parsed.priority_groups.find(
          (g) =>
            normalizeTerminalName(
              String(g.conditions.find((c) => c.field === "terminal")?.value ?? "")
            ) === normalized
        )?.rank ?? parsed.scoped_preferences!.length + 1;

      scoped = {
        terminal: formatTerminalDisplayName(normalized),
        normalized_terminal: normalized,
        priority_rank: existingPriority,
        sort_preferences: [],
        filters: [],
        required_days_off: [],
        requires_weekends_off: false,
      };

      parsed.scoped_preferences!.push(scoped);
    }

    return scoped;
  };

  let activeTerminal: string | null = null;
  let activeTerminalSentenceIndex = -1;

  for (const clauseEntry of clauses) {
    const rawClause = clauseEntry.text;
    const clause = rawClause.toLowerCase().replace(/[â€™]/g, "'");
    const clauseTerminal = getClauseTerminal(rawClause, crews);
    const normalizedClauseTerminal = clauseTerminal
      ? normalizeTerminalName(clauseTerminal)
      : null;
    const isGlobalClause = isClearlyGlobalClause(clause);

    if (normalizedClauseTerminal) {
      activeTerminal = normalizedClauseTerminal;
      activeTerminalSentenceIndex = clauseEntry.sentenceIndex;
    } else if (isGlobalClause) {
      activeTerminal = null;
      activeTerminalSentenceIndex = -1;
    } else if (
      activeTerminal &&
      clauseEntry.sentenceIndex !== activeTerminalSentenceIndex &&
      (sentenceTerminalCounts.get(activeTerminalSentenceIndex) ?? 0) > 1
    ) {
      activeTerminal = null;
      activeTerminalSentenceIndex = -1;
    }

    const terminalForScope =
      normalizedClauseTerminal ?? (!isGlobalClause ? activeTerminal : null);

    const scoped = terminalForScope ? ensureScope(terminalForScope) : null;

    // ---- global include / exclude language ----
    const excludeAllOthers = containsAny(clause, PHRASES.exclude_all_others);

    if (excludeAllOthers && orderedTerminals.length > 0) {
      const explicitlyIncluded = new Set<string>(orderedTerminals);

      if (containsAny(text, PHRASES.include_spareboard)) {
        explicitlyIncluded.add("spareboard");
      }

      const excluded = allKnownTerminals.filter((t) => !explicitlyIncluded.has(t));

      parsed.filters.push({
        field: "terminal",
        operator: "in",
        value: Array.from(explicitlyIncluded),
        strength: "hard",
      });

      if (excluded.length > 0) {
        parsed.filters.push({
          field: "terminal",
          operator: "not_in",
          value: excluded,
          strength: "hard",
        });
      }
    }

    if (containsAny(clause, PHRASES.include_spareboard)) {
      ensureScope("spareboard");
    }

    if (containsAny(clause, PHRASES.exclude_standby)) {
      parsed.filters.push({
        field: "terminal",
        operator: "not_in",
        value: ["standby"],
        strength: "hard",
      });
    }

    if (normalizedClauseTerminal) {
      const excludedTerminal = getExcludedTerminalFromClause(rawClause, crews);

      if (
        excludedTerminal &&
        normalizeTerminalName(excludedTerminal) === normalizedClauseTerminal
      ) {
        parsed.filters.push({
          field: "terminal",
          operator: "not_in",
          value: [normalizedClauseTerminal],
          strength: "hard",
        });
        activeTerminal = null;
        activeTerminalSentenceIndex = -1;
        continue;
      }

      const avoidTerminal = getAvoidTerminalFromClause(rawClause, crews);

      if (avoidTerminal && normalizeTerminalName(avoidTerminal) === normalizedClauseTerminal) {
        parsed.tradeoffs.push({
          type: "avoid_terminal",
          value: normalizedClauseTerminal,
          weight: getPreferenceWeight(clause, 25),
        });
        activeTerminal = null;
        activeTerminalSentenceIndex = -1;
        continue;
      }
    }

    const clauseIntents = detectPhraseIntents(clause);

    if (!scoped) {
      const exactWeekdayDaysOffMatch = clause.match(
        /\bexactly\s+(\d+)\s+weekdays?\s+off\b/i
      );

      if (exactWeekdayDaysOffMatch) {
        parsed.filters.push({
          field: "weekday_days_off_count",
          operator: "=",
          value: Number(exactWeekdayDaysOffMatch[1]),
          strength: "hard",
        });
      }

      if (/\bno\s+weekend\s+days?\s+off\b/i.test(clause)) {
        parsed.filters.push({
          field: "weekend_days_off",
          operator: "=",
          value: false,
          strength: "hard",
        });
      }

      if (clauseIntents.has("weekdays_off_only")) {
        parsed.filters.push({
          field: "weekend_days_off",
          operator: "=",
          value: false,
          strength: "hard",
        });
      }

      if (clauseIntents.has("no_splits")) {
        parsed.filters.push({
          field: "split_time",
          operator: "=",
          value: "none",
          strength: "hard",
        });
      }

      if (clauseIntents.has("exclude_shuttle_bus")) {
        parsed.filters.push({
          field: "shuttle_bus",
          operator: "=",
          value: false,
          strength: "hard",
        });
      }

      if (clauseIntents.has("only_shuttle_bus")) {
        parsed.filters.push({
          field: "shuttle_bus",
          operator: "=",
          value: true,
          strength: "hard",
        });
      }

      const notBeforeMatch = clause.match(
        /(not before|no starts before|no jobs before|start after|starts after|no earlier than|nothing starting before|nothing before)\s+(\d{1,2}):?(\d{2})?/i
      );

      if (notBeforeMatch) {
        const value = normalizeTimeToken(notBeforeMatch[2], notBeforeMatch[3]);
        if (value) {
          parsed.filters.push({
            field: "on_duty",
            operator: ">=",
            value,
            strength: "hard",
          });
        }
      }

      const mentionsMorning =
        /\bmorning\b/.test(clause) || /\bmornings\b/.test(clause);

      const noMornings = clauseIntents.has("no_mornings");

      const morningsOnly =
        !noMornings &&
        (clauseIntents.has("mornings_only") ||
          (mentionsMorning && !clauseIntents.has("prefer_mornings")));

      const eveningsOnly = clauseIntents.has("evenings_only");
      const noNights = clauseIntents.has("no_nights");
      const preferMornings =
        !morningsOnly && clauseIntents.has("prefer_mornings");
      const preferEvenings =
        !eveningsOnly && clauseIntents.has("prefer_evenings");

      if (morningsOnly) {
        parsed.filters.push({
          field: "on_duty",
          operator: "<=",
          value: TIME_BUCKETS.morning.end,
          strength: "hard",
        });
      }

      if (noMornings) {
        parsed.filters.push({
          field: "on_duty",
          operator: ">=",
          value: TIME_BUCKETS.afternoon.start,
          strength: "hard",
        });
      }

      if (eveningsOnly) {
        parsed.filters.push({
          field: "on_duty",
          operator: ">=",
          value: TIME_BUCKETS.evening.start,
          strength: "hard",
        });
      }

      if (noNights) {
        parsed.filters.push({
          field: "on_duty",
          operator: "<=",
          value: TIME_BUCKETS.afternoon.end,
          strength: "hard",
        });
      }

      if (preferMornings) {
        parsed.sort_preferences.push({
          field: "on_duty",
          direction: "asc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }

      if (preferEvenings) {
        parsed.sort_preferences.push({
          field: "on_duty",
          direction: "desc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }

      const finishBeforeMatch = clause.match(
        /(finish|finishes|end|ends|no finishes after|doesn't finish past|doesnt finish past|not finishing past|not after|no later than)\s*(before|by|after)?\s*(\d{1,2}):?(\d{2})?/i
      );

      if (finishBeforeMatch) {
        const hour = finishBeforeMatch[3].padStart(2, "0");
        const minute = finishBeforeMatch[4] ?? "00";

        parsed.filters.push({
          field: "off_duty",
          operator: "<=",
          value: `${hour}:${minute}`,
          strength: "hard",
        });
      }

      if (clauseIntents.has("weekends_off_hard")) {
        parsed.filters.push({
          field: "weekends_off_hard",
          operator: "=",
          value: true,
          strength: "hard",
        });
      }

      if (
        clauseIntents.has("weekends_off_hard") ||
        clauseIntents.has("weekends_off_prefer") ||
        clauseIntents.has("weekends_off_first")
      ) {
        parsed.sort_preferences.push({
          field: "weekends_off",
          direction: "desc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 7),
        });
      }

      if (clauseIntents.has("three_day_off_only")) {
        parsed.filters.push({
          field: "include_only_three_day_off_jobs",
          operator: "=",
          value: true,
          strength: "hard",
        });
      }

      if (clauseIntents.has("no_three_day_off")) {
        parsed.filters.push({
          field: "exclude_three_day_off_jobs",
          operator: "=",
          value: true,
          strength: "hard",
        });
      }

      if (
        clauseIntents.has("three_day_off_prefer") ||
        clauseIntents.has("three_day_off_first")
      ) {
        parsed.sort_preferences.push({
          field: "three_day_off_jobs",
          direction: "desc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }

      if (clauseIntents.has("three_day_off_last")) {
        parsed.sort_preferences.push({
          field: "three_day_off_jobs",
          direction: "asc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }

      if (containsAny(clause, PHRASES.early_finishes)) {
        parsed.sort_preferences.push({
          field: "off_duty",
          direction: "asc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }

      if (containsAny(clause, PHRASES.most_ot)) {
        parsed.sort_preferences.push({
          field: "overtime_hours_weekly",
          direction: "desc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 10),
        });
      }

      if (containsAny(clause, PHRASES.least_ot)) {
        parsed.sort_preferences.push({
          field: "overtime_hours_weekly",
          direction: "asc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 10),
        });
      }

      if (containsAny(clause, PHRASES.least_operating)) {
        parsed.sort_preferences.push({
          field: "operating_hours_weekly",
          direction: "asc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 9),
        });
      }

      if (containsAny(clause, PHRASES.most_operating)) {
        parsed.sort_preferences.push({
          field: "operating_hours_weekly",
          direction: "desc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 9),
        });
      }

      if (containsAny(clause, PHRASES.least_van)) {
        parsed.sort_preferences.push({
          field: "van_hours_daily",
          direction: "asc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }

      if (containsAny(clause, PHRASES.most_van)) {
        parsed.sort_preferences.push({
          field: "van_hours_daily",
          direction: "desc",
          strength: "strong",
          weight: getPreferenceWeight(clause, 8),
        });
      }
    }

    if (!scoped) continue;

    const exactWeekdayDaysOffMatch = clause.match(
      /\bexactly\s+(\d+)\s+weekdays?\s+off\b/i
    );

    if (exactWeekdayDaysOffMatch) {
      scoped.filters.push({
        field: "weekday_days_off_count",
        operator: "=",
        value: Number(exactWeekdayDaysOffMatch[1]),
        strength: "hard",
      });
    }

    if (/\bno\s+weekend\s+days?\s+off\b/i.test(clause)) {
      scoped.filters.push({
        field: "weekend_days_off",
        operator: "=",
        value: false,
        strength: "hard",
      });
    }

    if (clauseIntents.has("weekdays_off_only")) {
      scoped.filters.push({
        field: "weekend_days_off",
        operator: "=",
        value: false,
        strength: "hard",
      });
    }

    // ---- scoped hard time filters ----
    const notBeforeMatch = clause.match(
      /(not before|no starts before|no jobs before|start after|starts after|no earlier than|nothing starting before|nothing before)\s+(\d{1,2}):?(\d{2})?/i
    );

    if (notBeforeMatch) {
      const value = normalizeTimeToken(notBeforeMatch[2], notBeforeMatch[3]);
      if (value) {
        scoped.filters.push({
          field: "on_duty",
          operator: ">=",
          value,
          strength: "hard",
        });
      }
    }

    // ---- mornings / evenings / nights ----
    const mentionsMorning =
      /\bmorning\b/.test(clause) || /\bmornings\b/.test(clause);

    const noMornings = clauseIntents.has("no_mornings");

    const morningsOnly =
      !noMornings &&
      (clauseIntents.has("mornings_only") ||
        (mentionsMorning && !clauseIntents.has("prefer_mornings")));

    const eveningsOnly = clauseIntents.has("evenings_only");

    const noNights = clauseIntents.has("no_nights");

    const preferMornings =
      !morningsOnly &&
      clauseIntents.has("prefer_mornings");

    const preferEvenings =
      !eveningsOnly &&
      clauseIntents.has("prefer_evenings");

    if (morningsOnly) {
      scoped.filters.push({
        field: "on_duty",
        operator: "<=",
        value: TIME_BUCKETS.morning.end,
        strength: "hard",
      });
    }

    if (noMornings) {
      scoped.filters.push({
        field: "on_duty",
        operator: ">=",
        value: TIME_BUCKETS.afternoon.start,
        strength: "hard",
      });
    }

    if (eveningsOnly) {
      scoped.filters.push({
        field: "on_duty",
        operator: ">=",
        value: TIME_BUCKETS.evening.start,
        strength: "hard",
      });
    }

    if (noNights) {
      scoped.filters.push({
        field: "on_duty",
        operator: "<=",
        value: TIME_BUCKETS.afternoon.end,
        strength: "hard",
      });
    }

    if (preferMornings) {
      scoped.sort_preferences.push({
        field: "on_duty",
        direction: "asc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }

    if (preferEvenings) {
      scoped.sort_preferences.push({
        field: "on_duty",
        direction: "desc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }

    const startAfterMatch = clause.match(
      /(not before|no jobs before|start after|starts after|nothing starting before|nothing before)\s*(\d{1,2}):?(\d{2})?/i
    );

    if (startAfterMatch) {
      const hour = startAfterMatch[2].padStart(2, "0");
      const minute = startAfterMatch[3] ?? "00";

      scoped.filters.push({
        field: "on_duty",
        operator: ">=",
        value: `${hour}:${minute}`,
        strength: "hard",
      });
    }

    const finishBeforeMatch = clause.match(
      /(finish|finishes|end|ends|no finishes after|doesn't finish past|doesnt finish past|not finishing past|not after|no later than)\s*(before|by|after)?\s*(\d{1,2}):?(\d{2})?/i
    );

    if (finishBeforeMatch) {
      const hour = finishBeforeMatch[3].padStart(2, "0");
      const minute = finishBeforeMatch[4] ?? "00";

      scoped.filters.push({
        field: "off_duty",
        operator: "<=",
        value: `${hour}:${minute}`,
        strength: "hard",
      });
    }

    // ---- weekends off / specific days off ----
    const wantsWeekendsOffHard = clauseIntents.has("weekends_off_hard");
    const wantsWeekendsOffPrefer =
      wantsWeekendsOffHard ||
      clauseIntents.has("weekends_off_prefer") ||
      clauseIntents.has("weekends_off_first");

    if (wantsWeekendsOffHard) {
      scoped.requires_weekends_off = true;
      scoped.filters.push({
        field: "weekends_off_hard",
        operator: "=",
        value: true,
        strength: "hard",
      });
    }

    if (wantsWeekendsOffPrefer) {
      scoped.sort_preferences.push({
        field: "weekends_off",
        direction: "desc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 7),
      });
    }

    if (clauseIntents.has("three_day_off_only")) {
      scoped.filters.push({
        field: "include_only_three_day_off_jobs",
        operator: "=",
        value: true,
        strength: "hard",
      });
    }

    if (clauseIntents.has("no_three_day_off")) {
      scoped.filters.push({
        field: "exclude_three_day_off_jobs",
        operator: "=",
        value: true,
        strength: "hard",
      });
    }

    if (
      clauseIntents.has("three_day_off_prefer") ||
      clauseIntents.has("three_day_off_first")
    ) {
      scoped.sort_preferences.push({
        field: "three_day_off_jobs",
        direction: "desc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }

    if (clauseIntents.has("three_day_off_last")) {
      scoped.sort_preferences.push({
        field: "three_day_off_jobs",
        direction: "asc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }

    if (containsAny(clause, PHRASES.early_finishes)) {
      scoped.sort_preferences.push({
        field: "off_duty",
        direction: "asc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }

    if (clauseIntents.has("no_splits")) {
      scoped.filters.push({
        field: "split_time",
        operator: "=",
        value: "none",
        strength: "hard",
      });
    }

    if (clauseIntents.has("exclude_shuttle_bus")) {
      scoped.filters.push({
        field: "shuttle_bus",
        operator: "=",
        value: false,
        strength: "hard",
      });
    }

    if (clauseIntents.has("only_shuttle_bus")) {
      scoped.filters.push({
        field: "shuttle_bus",
        operator: "=",
        value: true,
        strength: "hard",
      });
    }

    const dayMatches = Array.from(
      clause.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi)
    ).map((m) => m[1].toLowerCase());

    const hasDaysOffLanguage =
      clause.includes(" off") ||
      clause.includes("days off") ||
      clause.includes("must have") ||
      clause.includes("prefer ") ||
      clause.includes("want ") ||
      clause.includes("need ") ||
      clause.includes("free");

    if (dayMatches.length > 0 && hasDaysOffLanguage) {
      scoped.required_days_off = Array.from(new Set(dayMatches));
    }

    // ---- scoped ordered sorts ----
    if (containsAny(clause, PHRASES.most_ot)) {
      scoped.sort_preferences.push({
        field: "overtime_hours_weekly",
        direction: "desc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 10),
      });
    }

    if (containsAny(clause, PHRASES.least_ot)) {
      scoped.sort_preferences.push({
        field: "overtime_hours_weekly",
        direction: "asc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 10),
      });
    }

    if (containsAny(clause, PHRASES.least_operating)) {
      scoped.sort_preferences.push({
        field: "operating_hours_weekly",
        direction: "asc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 9),
      });
    }

    if (containsAny(clause, PHRASES.most_operating)) {
      scoped.sort_preferences.push({
        field: "operating_hours_weekly",
        direction: "desc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 9),
      });
    }

    if (containsAny(clause, PHRASES.least_van)) {
      scoped.sort_preferences.push({
        field: "van_hours_daily",
        direction: "asc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }

    if (containsAny(clause, PHRASES.most_van)) {
      scoped.sort_preferences.push({
        field: "van_hours_daily",
        direction: "desc",
        strength: "strong",
        weight: getPreferenceWeight(clause, 8),
      });
    }
  }

  const cleanedParsed = applyConflictResolutionRules(
    {
      ...parsed,
      filters: dedupeFilters(parsed.filters),
      sort_preferences: dedupeSortPreferences(parsed.sort_preferences),
      scoped_preferences: parsed.scoped_preferences!
        .map((scope) => ({
          ...scope,
          filters: dedupeFilters(scope.filters),
          sort_preferences: dedupeSortPreferences(scope.sort_preferences),
        }))
        .sort((a, b) => a.priority_rank - b.priority_rank),
    },
    detectPhraseIntents(text)
  );

  return {
    ...cleanedParsed,
    priority_groups: removeRedundantPlainTerminalPriorityGroups(
      cleanedParsed.priority_groups
    ),
  };
}

function applyDeterministicPreferenceRules(
  parsed: ParsedPreferences,
  prompt: string
): ParsedPreferences {
  const text = prompt.toLowerCase().replace(/[Ã¢â‚¬â„¢]/g, "'");

  const nextParsed: ParsedPreferences = {
    ...parsed,
    filters: [...(parsed.filters ?? [])],
    priority_groups: [...(parsed.priority_groups ?? [])],
    sort_preferences: [...(parsed.sort_preferences ?? [])],
    tradeoffs: [...(parsed.tradeoffs ?? [])],
    unknown_clauses: [...(parsed.unknown_clauses ?? [])],
    scoped_preferences: (parsed.scoped_preferences ?? []).map((scope) => ({
      ...scope,
      filters: [...(scope.filters ?? [])],
      sort_preferences: [...(scope.sort_preferences ?? [])],
      required_days_off: [...(scope.required_days_off ?? [])],
    })),
  };

  if (containsAny(text, PHRASES.exclude_up)) {
    nextParsed.filters.push({
      field: "exclude_up_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
  }

  if (containsAny(text, PHRASES.only_spareboard)) {
    nextParsed.filters.push({
      field: "include_only_spareboard_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
  }

  if (containsAny(text, PHRASES.exclude_spareboard)) {
    nextParsed.filters.push({
      field: "exclude_spareboard_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
  }

  if (containsAny(text, PHRASES.no_mornings)) {
    nextParsed.filters = nextParsed.filters.filter(
      (filter) =>
        !(
          filter.field === "on_duty" &&
          filter.operator === "<=" &&
          filter.value === TIME_BUCKETS.morning.end
        )
    );

    const hasGlobalNoMorningsFilter = nextParsed.filters.some(
      (filter) =>
        filter.field === "on_duty" &&
        filter.operator === ">=" &&
        filter.value === TIME_BUCKETS.afternoon.start
    );

    if (hasGlobalNoMorningsFilter) {
      nextParsed.sort_preferences = nextParsed.sort_preferences.filter(
        (sort) => !(sort.field === "on_duty" && sort.direction === "asc")
      );
    }

    nextParsed.scoped_preferences = (nextParsed.scoped_preferences ?? []).map(
      (scope) => {
        const nextScopeFilters = (scope.filters ?? []).filter(
          (filter) =>
            !(
              filter.field === "on_duty" &&
              filter.operator === "<=" &&
              filter.value === TIME_BUCKETS.morning.end
            )
        );

        const scopeHasNoMorningsFilter = nextScopeFilters.some(
          (filter) =>
            filter.field === "on_duty" &&
            filter.operator === ">=" &&
            filter.value === TIME_BUCKETS.afternoon.start
        );

        return {
          ...scope,
          filters: nextScopeFilters,
          sort_preferences: scopeHasNoMorningsFilter
            ? (scope.sort_preferences ?? []).filter(
                (sort) => !(sort.field === "on_duty" && sort.direction === "asc")
              )
            : [...(scope.sort_preferences ?? [])],
        };
      }
    );
  }

  nextParsed.filters = dedupeFilters(nextParsed.filters);
  nextParsed.sort_preferences = dedupeSortPreferences(nextParsed.sort_preferences);
  nextParsed.scoped_preferences = (nextParsed.scoped_preferences ?? []).map((scope) => ({
    ...scope,
    filters: dedupeFilters(scope.filters),
    sort_preferences: dedupeSortPreferences(scope.sort_preferences),
  }));

  return nextParsed;
}

function applyDeterministicPreferenceRulesV2(
  parsed: ParsedPreferences,
  prompt: string
): ParsedPreferences {
  const text = prompt.toLowerCase().replace(/[ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/g, "'");
  const intents = detectPhraseIntents(text);
  const explicitTerminalOnlyLanguage = hasExplicitTerminalOnlyLanguage(text);
  const explicitlyExcludedTerminal = getExplicitExcludedTerminalFromText(prompt);

  const nextParsed: ParsedPreferences = {
    ...parsed,
    filters: [...(parsed.filters ?? [])],
    priority_groups: [...(parsed.priority_groups ?? [])],
    sort_preferences: [...(parsed.sort_preferences ?? [])],
    tradeoffs: [...(parsed.tradeoffs ?? [])],
    unknown_clauses: [...(parsed.unknown_clauses ?? [])],
    scoped_preferences: (parsed.scoped_preferences ?? []).map((scope) => ({
      ...scope,
      filters: [...(scope.filters ?? [])],
      sort_preferences: [...(scope.sort_preferences ?? [])],
      required_days_off: [...(scope.required_days_off ?? [])],
    })),
  };

  if (explicitlyExcludedTerminal) {
    const normalizedExcludedTerminal = normalizeTerminalName(explicitlyExcludedTerminal);

    nextParsed.filters.push({
      field: "terminal",
      operator: "not_in",
      value: [normalizedExcludedTerminal],
      strength: "hard",
    });

    nextParsed.priority_groups = nextParsed.priority_groups.filter((group) => {
      const terminalCondition = group.conditions.find(
        (condition) => condition.field === "terminal"
      );

      return (
        !terminalCondition ||
        normalizeTerminalName(String(terminalCondition.value)) !==
          normalizedExcludedTerminal
      );
    });

    nextParsed.scoped_preferences = (nextParsed.scoped_preferences ?? []).filter(
      (scope) => scope.normalized_terminal !== normalizedExcludedTerminal
    );
  }

  if (intents.has("exclude_up")) {
    nextParsed.filters = nextParsed.filters.filter((filter) => {
      if (
        filter.field === "job_direction" &&
        (filter.operator === "=" ||
          filter.operator === "!=" ||
          filter.operator === "in" ||
          filter.operator === "not_in")
      ) {
        return false;
      }

      if (
        filter.field === "terminal" &&
        filter.operator === "not_in" &&
        Array.isArray(filter.value)
      ) {
        const normalizedValues = filter.value.map((value) =>
          normalizeTerminalName(String(value))
        );

        if (
          normalizedValues.length === 1 &&
          normalizedValues[0] === "willowbrook"
        ) {
          return false;
        }
      }

      return true;
    });

    nextParsed.filters.push({
      field: "exclude_up_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
  }

  if (intents.has("only_spareboard")) {
    nextParsed.filters.push({
      field: "include_only_spareboard_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
  }

  if (intents.has("only_standby")) {
    nextParsed.filters.push({
      field: "include_only_standby_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
    nextParsed.filters = nextParsed.filters.filter(
      (filter) =>
        !(
          filter.field === "terminal" &&
          (
            (filter.operator === "not_in" &&
              Array.isArray(filter.value) &&
              filter.value.some(
                (value) => normalizeTerminalName(String(value)) === "standby"
              )) ||
            (filter.operator === "=" &&
              normalizeTerminalName(String(filter.value)) === "standby")
          )
        )
    );
  }

  if (intents.has("exclude_spareboard")) {
    nextParsed.filters.push({
      field: "exclude_spareboard_crews",
      operator: "=",
      value: true,
      strength: "hard",
    });
  }

  if (
    intents.has("three_day_off_prefer") ||
    intents.has("three_day_off_first") ||
    intents.has("three_day_off_last")
  ) {
    nextParsed.filters = nextParsed.filters.filter((filter) => {
      if (
        filter.field === "include_only_three_day_off_jobs" &&
        filter.operator === "=" &&
        filter.value === true
      ) {
        return false;
      }

      if (
        (filter.field === "days_off_count" || filter.field === "days_off") &&
        filter.operator === ">=" &&
        Number(filter.value) === 3
      ) {
        return false;
      }

      return true;
    });
  }

  if (!explicitTerminalOnlyLanguage) {
    nextParsed.filters = nextParsed.filters.filter(
      (filter) =>
        !(
          filter.field === "terminal" &&
          filter.operator === "in" &&
          Array.isArray(filter.value) &&
          filter.value.length === 1
        )
    );
  }

  const explicitlyPrioritizedTerminals = new Set(
    [
      ...(nextParsed.priority_groups ?? []).flatMap((group) =>
        group.conditions
          .filter((condition) => condition.field === "terminal")
          .map((condition) => normalizeTerminalName(String(condition.value)))
      ),
      ...(nextParsed.scoped_preferences ?? []).map((scope) =>
        normalizeTerminalName(scope.normalized_terminal || scope.terminal)
      ),
    ].filter(Boolean)
  );

  if (explicitlyPrioritizedTerminals.size > 0) {
    nextParsed.filters = nextParsed.filters
      .map((filter) => {
        if (
          filter.field === "terminal" &&
          filter.operator === "not_in" &&
          Array.isArray(filter.value)
        ) {
          return {
            ...filter,
            value: filter.value.filter((value) => {
              const normalized = normalizeTerminalName(String(value));
              return !explicitlyPrioritizedTerminals.has(normalized);
            }),
          };
        }

        return filter;
      })
      .filter((filter) => {
        if (
          filter.field === "terminal" &&
          filter.operator === "not_in" &&
          Array.isArray(filter.value)
        ) {
          return filter.value.length > 0;
        }

        return true;
      });
  }

  return applyConflictResolutionRules(nextParsed, intents);
}

function buildReviewItems(parsed: ParsedPreferences): string[] {
  const items: string[] = [];
  const filters = parsed.filters ?? [];

  const hasSpareboardOnlyFilter = filters.some(
    (filter) =>
      filter.field === "include_only_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
  );

  const hasSpareboardExcludeFilter = filters.some(
    (filter) =>
      filter.field === "exclude_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
  );

  const getVisibleTerminalValues = (filter: ParsedPreferences["filters"][number]) => {
    if (!Array.isArray(filter.value)) return [];

    return filter.value.filter((value) => {
      const normalized = normalizeTerminalName(String(value));

      if (
        filter.field === "terminal" &&
        filter.operator === "in" &&
        hasSpareboardOnlyFilter &&
        normalized === "spareboard"
      ) {
        return false;
      }

      if (
        filter.field === "terminal" &&
        filter.operator === "not_in" &&
        hasSpareboardExcludeFilter &&
        normalized === "spareboard"
      ) {
        return false;
      }

      return true;
    });
  };

  parsed.priority_groups
    .sort((a, b) => a.rank - b.rank)
    .forEach((group, index) => {
      const terminalCondition = group.conditions.find((c) => c.field === "terminal");

      if (terminalCondition) {
        items.push(
          `${formatTerminalDisplayName(String(terminalCondition.value))} ${
            index === 0 ? "(Highest Priority)" : `(Priority ${index + 1})`
          }`
        );
      }
    });

  parsed.filters.forEach((filter) => {
    if (
      filter.field === "on_duty" &&
      filter.operator === ">=" &&
      typeof filter.value === "string"
    ) {
      items.push(`No jobs starting before ${filter.value}`);
    }

    if (
      filter.field === "on_duty" &&
      filter.operator === "<=" &&
      filter.value === TIME_BUCKETS.morning.end
    ) {
      items.push(`Morning jobs only`);
    }

    if (
      filter.field === "on_duty" &&
      filter.operator === ">=" &&
      filter.value === TIME_BUCKETS.evening.start
    ) {
      items.push(`Evening jobs only`);
    }

    if (
      filter.field === "on_duty" &&
      filter.operator === "<=" &&
      filter.value === TIME_BUCKETS.afternoon.end
    ) {
      items.push(`No night jobs`);
    }

    if (
      filter.field === "terminal" &&
      filter.operator === "in" &&
      Array.isArray(filter.value)
    ) {
      const visibleValues = getVisibleTerminalValues(filter);
      if (visibleValues.length === 0) return;

      items.push(
        `Only these terminals allowed: ${visibleValues
          .map((t) => formatTerminalDisplayName(String(t)))
          .join(", ")}`
      );
    }

    if (
      filter.field === "terminal" &&
      filter.operator === "not_in" &&
      Array.isArray(filter.value)
    ) {
      const visibleValues = getVisibleTerminalValues(filter);
      if (visibleValues.length === 0) return;

      items.push(
        `Excluded terminals: ${visibleValues
          .map((t) => formatTerminalDisplayName(String(t)))
          .join(", ")}`
      );
    }

    if (
      filter.field === "exclude_up_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      items.push("Hide UP crews");
    }

    if (
      filter.field === "job_direction" &&
      (filter.operator === "=" ||
        filter.operator === "!=" ||
        filter.operator === "in" ||
        filter.operator === "not_in")
    ) {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      const normalizedValues = values.map((value) =>
        String(value).toLowerCase().trim()
      );

      if (normalizedValues.includes("up")) {
        items.push("Hide UP crews");
      }
    }

    if (
      filter.field === "include_only_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      items.push("Spareboard only (4-digit 3xxx)");
    }

    if (
      filter.field === "exclude_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      items.push("Exclude spareboard crews (4-digit 3xxx)");
    }

    if (
      filter.field === "include_only_three_day_off_jobs" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      items.push("Only 3 day off jobs");
    }

    if (
      (filter.field === "days_off_count" || filter.field === "days_off") &&
      filter.operator === ">=" &&
      Number(filter.value) === 3
    ) {
      items.push("Only 3 day off jobs");
    }

    if (
      filter.field === "exclude_three_day_off_jobs" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      items.push("No 3 day off jobs");
    }

    if (
      (filter.field === "days_off_count" || filter.field === "days_off") &&
      (filter.operator === "<" || filter.operator === "<=" || filter.operator === "!=") &&
      Number(filter.value) === 3
    ) {
      items.push("No 3 day off jobs");
    }

    if (
      filter.field === "weekends_off_hard" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      items.push("Must have weekends off");
    }

    if (
      filter.field === "split_time" &&
      filter.operator === "=" &&
      filter.value === "none"
    ) {
      items.push("No split jobs");
    }
  });

  parsed.sort_preferences.forEach((sort) => {
    if (
      (sort.field === "operating_hours_daily" ||
        sort.field === "operating_hours_weekly") &&
      sort.direction === "asc"
    ) {
      items.push(`Sort by lowest operating time`);
    }

    if (sort.field === "van_hours_daily" && sort.direction === "asc") {
      items.push(`Sort by lowest van time`);
    }

    if (sort.field === "overtime_hours_weekly" && sort.direction === "desc") {
      items.push(`Prefer highest overtime`);
    }

    if (sort.field === "on_duty" && sort.direction === "asc") {
      items.push(`Prefer morning / earlier start jobs`);
    }

    if (sort.field === "on_duty" && sort.direction === "desc") {
      items.push(`Prefer evening / later start jobs`);
    }

    if (sort.field === "weekends_off") {
      items.push(`Prefer weekends off`);
    }

    if (sort.field === "three_day_off_jobs" && sort.direction === "desc") {
      items.push(`Prefer 3 day off jobs`);
    }

    if (sort.field === "three_day_off_jobs" && sort.direction === "asc") {
      items.push(`3 day off jobs last`);
    }
  });

  parsed.tradeoffs.forEach((tradeoff) => {
    if (tradeoff.type === "prefer_closeness_over_finish_time") {
      items.push(`Will accept later jobs to stay closer to home`);
    }

    if (tradeoff.type === "avoid_terminal" && tradeoff.value) {
      items.push(
        `Prefer to avoid terminal: ${formatTerminalDisplayName(tradeoff.value)}`
      );
    }
  });

  return Array.from(new Set(items));
}

const TIME_BUCKETS = {
  morning: { start: "00:00", end: "11:59" },
  afternoon: { start: "12:00", end: "15:59" },
  evening: { start: "16:00", end: "23:59" },
} as const;


function timeToMinutes(value?: string | null) {
  if (!value || typeof value !== "string" || !value.includes(":")) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getDayStartMinutes(day: any) {
  const { onDuty } = getDisplayedDayTimeRange(day);
  return timeToMinutes(onDuty);
}

function getDisplayedDayTimeRange(day: any) {
  const jobStart =
    typeof day?.job_detail?.on_duty === "string"
      ? day.job_detail.on_duty
      : null;
  const jobFinish =
    typeof day?.job_detail?.off_duty === "string"
      ? day.job_detail.off_duty
      : null;

  if (jobStart || jobFinish) {
    return {
      onDuty: jobStart,
      offDuty: jobFinish,
    };
  }

  return {
    onDuty:
      typeof day?.on_duty === "string"
        ? day.on_duty
        : null,
    offDuty:
      typeof day?.off_duty === "string"
        ? day.off_duty
        : null,
  };
}

function isOvernightDisplayedDay(day: any) {
  const { onDuty, offDuty } = getDisplayedDayTimeRange(day);
  const startMinutes = timeToMinutes(onDuty);
  const finishMinutes = timeToMinutes(offDuty);

  if (startMinutes == null || finishMinutes == null) {
    return false;
  }

  return finishMinutes < startMinutes;
}

function getDayFinishMinutes(day: any) {
  const { offDuty } = getDisplayedDayTimeRange(day);
  const startMinutes = getDayStartMinutes(day);
  let finishMinutes = timeToMinutes(offDuty);

  if (finishMinutes == null) return null;

  if (
    startMinutes != null &&
    finishMinutes < startMinutes
  ) {
    finishMinutes += 24 * 60;
  }

  return finishMinutes;
}

function evaluateFinishFilterForDay(
  day: any,
  filter: ParsedPreferences["filters"][number] | ScopedPreference["filters"][number]
) {
  if (filter.field !== "off_duty" || typeof filter.value !== "string") {
    return null;
  }

  const { offDuty } = getDisplayedDayTimeRange(day);
  const finish = getDayFinishMinutes(day);
  const rawFilterMinutes = timeToMinutes(filter.value);
  const isOvernight = isOvernightDisplayedDay(day);
  const isEarlyMorningCutoff =
    rawFilterMinutes != null && rawFilterMinutes < 12 * 60;

  if (finish == null || rawFilterMinutes == null) {
    return {
      passes: false,
      displayedFinish: offDuty,
      reason: "This crew is missing finish-time details needed for comparison",
    };
  }

  let comparableFilter = rawFilterMinutes;

  if (isEarlyMorningCutoff) {
    if (!isOvernight && (filter.operator === "<=" || filter.operator === "<")) {
      return {
        passes: true,
        displayedFinish: offDuty,
      };
    }

    if (isOvernight) {
      comparableFilter += 24 * 60;
    }
  }

  if (filter.operator === ">=" && finish < comparableFilter) {
    return {
      passes: false,
      displayedFinish: offDuty,
      reason: `finishes before ${filter.value}`,
    };
  }

  if (filter.operator === ">" && finish <= comparableFilter) {
    return {
      passes: false,
      displayedFinish: offDuty,
      reason: `finishes at or before ${filter.value}`,
    };
  }

  if (filter.operator === "<=" && finish > comparableFilter) {
    return {
      passes: false,
      displayedFinish: offDuty,
      reason: `finishes after ${filter.value}`,
    };
  }

  if (filter.operator === "<" && finish >= comparableFilter) {
    return {
      passes: false,
      displayedFinish: offDuty,
      reason: `finishes at or after ${filter.value}`,
    };
  }

  return {
    passes: true,
    displayedFinish: offDuty,
  };
}

function getAdjustedFinishFilterMinutes(
  filterValue: string,
  comparedFinishMinutes: number | null
) {
  let filterMinutes = timeToMinutes(filterValue);
  if (filterMinutes == null) return null;

  if (
    comparedFinishMinutes != null &&
    comparedFinishMinutes >= 24 * 60 &&
    filterMinutes < 12 * 60
  ) {
    filterMinutes += 24 * 60;
  }

  return filterMinutes;
}

function round1(num?: number) {
  return typeof num === "number" ? Number(num.toFixed(1)) : num;
}
function timeToHours(value?: string | null) {
  if (!value || typeof value !== "string" || !value.includes(":")) return undefined;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h + m / 60;
}

function hasSplitTimeValue(value?: string | null) {
  if (!value || typeof value !== "string") return false;

  const normalized = value.trim();
  if (!normalized || normalized === "-" || normalized === "00:00") {
    return false;
  }

  const hours = timeToHours(normalized);
  return typeof hours === "number" && hours > 0;
}

function hasShuttleBusValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return (
      /shuttle\s*bus/i.test(value) ||
      /^shuttle\b/im.test(value) ||
      /\bshuttle\b.*\b\d{1,2}:\d{2}\b/i.test(value)
    );
  }
  return false;
}

function crewHasShuttleBusComponent(crew: Crew) {
  for (const day of crew.daily ?? []) {
    if (day?.is_day_off) continue;
    if (
      hasShuttleBusValue(day?.job_detail?.has_shuttle_bus) ||
      hasShuttleBusValue(day?.job_detail?.raw_text)
    ) {
      return true;
    }
  }

  for (const detail of crew.job_details ?? []) {
    if (
      hasShuttleBusValue(detail?.has_shuttle_bus) ||
      hasShuttleBusValue(detail?.raw_text)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatExplanationReason(label: string, points: number): string {
  const lower = label.toLowerCase();
  const isPositive = points >= 0;

  if (lower.includes("matches terminal priority #1")) {
    const match = label.match(/\((.*?)\)/);
    const terminal = match?.[1] ?? "your top terminal";
    return `it matches your #1 terminal (${formatTerminalDisplayName(terminal)})`;
  }

  if (lower.includes("matches terminal priority #2")) {
    const match = label.match(/\((.*?)\)/);
    const terminal = match?.[1] ?? "your next terminal";
    return `it matches your #2 terminal (${formatTerminalDisplayName(terminal)})`;
  }

  if (lower.includes("matches terminal priority #")) {
    const rankMatch = label.match(/#(\d+)/);
    const terminalMatch = label.match(/\((.*?)\)/);
    const rank = rankMatch?.[1] ?? "?";
    const terminal = terminalMatch?.[1] ?? "a preferred terminal";
    return `it matches your #${rank} terminal (${formatTerminalDisplayName(
      terminal
    )})`;
  }

  if (lower.includes("on_duty preference (asc)")) {
    return isPositive ? `it has an earlier start time` : `it has a later start time`;
  }

  if (lower.includes("on_duty preference (desc)")) {
    return isPositive ? `it has a later start time` : `it has an earlier start time`;
  }

  if (lower.includes("starts before preferred minimum")) {
    return `it starts earlier than your preferred minimum`;
  }

  if (lower.includes("starts after preferred maximum")) {
    return `it starts later than your preferred maximum`;
  }

  if (lower.includes("finishes after preferred maximum")) {
    return `it finishes later than your preferred maximum`;
  }

  if (lower.includes("avoid terminal")) {
    const match = label.match(/\((.*?)\)/);
    const terminal = match?.[1];
    return terminal
      ? `it is at a terminal you wanted to avoid (${formatTerminalDisplayName(
          terminal
        )})`
      : `it is at a terminal you wanted to avoid`;
  }

  if (lower.includes("priority reduced due to avoidance")) {
    const match = label.match(/\((.*?)\)/);
    const terminal = match?.[1];
    return terminal
      ? `its terminal preference was reduced because you wanted to avoid ${formatTerminalDisplayName(
          terminal
        )}`
      : `its terminal preference was reduced by an avoid preference`;
  }

  if (
    lower.includes("operating_hours_daily preference (asc)") ||
    lower.includes("operating_hours_weekly preference (asc)")
  ) {
    return isPositive
      ? `it has lower operating time`
      : `it has higher operating time`;
  }

  if (lower.includes("van_hours_daily preference (asc)")) {
    return isPositive ? `it has lower daily van time` : `it has higher daily van time`;
  }

  if (lower.includes("overtime_hours_weekly preference (desc)")) {
    return isPositive
      ? `it has higher weekly overtime`
      : `it has lower weekly overtime`;
  }

  if (lower.includes("weekends_off")) {
    return isPositive
      ? `it better matches your weekends off preference`
      : `it is weaker for your weekends off preference`;
  }

  return label;
}

function buildCrewExplanation(scoreBreakdown: ScoreBreakdownItem[]): string {
  if (!scoreBreakdown?.length) return "";

  let terminalMatch = "";
  let startMatch = "";
  let finishMatch = "";
  let daysOffMatch = "";
  let overtimeMatch = "";
  let downside = "";

  for (const item of scoreBreakdown) {
    const label = item.label.toLowerCase();

    // TERMINAL (highest priority)
    if (!terminalMatch && label.includes("matches terminal priority")) {
      const match = item.label.match(/\((.*?)\)/);
      const terminal = match?.[1]
        ? formatTerminalDisplayName(match[1])
        : "your preferred terminal";

      const rankMatch = item.label.match(/#(\d+)/);
      const rank = rankMatch?.[1] ?? "top";

      terminalMatch = `Matches your #${rank} terminal (${terminal})`;
      continue;
    }

    // START TIME
    if (!startMatch && label.includes("on_duty preference")) {
      startMatch =
        label.includes("asc")
          ? "Leans toward earlier starts"
          : "Leans toward later starts";
      continue;
    }

    // FINISH TIME
    if (!finishMatch && label.includes("finishes")) {
      finishMatch = "Fits your finish time preference";
      continue;
    }

    // DAYS OFF
    if (!daysOffMatch && label.includes("weekends_off")) {
      daysOffMatch = "Includes preferred days off";
      continue;
    }

    // OVERTIME
    if (!overtimeMatch && label.includes("overtime")) {
      overtimeMatch =
        label.includes("desc")
          ? "Higher overtime potential"
          : "Lower overtime hours";
      continue;
    }

    // ONE downside max
    if (!downside && label.includes("avoid")) {
      downside = "Includes a less preferred element";
    }
  }

  const lines = [
    terminalMatch,
    startMatch,
    finishMatch,
    daysOffMatch,
    overtimeMatch,
    downside,
  ].filter(Boolean);

  return lines.slice(0, 3).map((l) => `â€¢ ${l}`).join("\n");
}

function getWeekdayDaysOffCount(crew: Crew): number {
  const daysOff = (crew.days_off ?? crew.days_off_list ?? []).map((day: unknown) =>
    String(day).trim().toLowerCase()
  );

  return daysOff.filter((day) =>
    ["mon", "monday", "tue", "tuesday", "wed", "wednesday", "thu", "thursday", "fri", "friday"].includes(day)
  ).length;
}

function hasWeekendDaysOff(crew: Crew): boolean {
  const daysOff = (crew.days_off ?? crew.days_off_list ?? []).map((day: unknown) =>
    String(day).trim().toLowerCase()
  );

  return daysOff.some((day) =>
    ["sat", "saturday", "sun", "sunday"].includes(day)
  );
}

function getCrewComparableTimes(
  crew: Crew,
  field: "on_duty" | "off_duty"
): number[] {
  const values: number[] = [];
  const seen = new Set<number>();

  const pushTime = (value: unknown) => {
    const minutes = timeToMinutes(typeof value === "string" ? value : null);

    if (minutes == null || seen.has(minutes)) return;
    seen.add(minutes);
    values.push(minutes);
  };

  for (const day of crew.daily ?? []) {
    if (day?.is_day_off) continue;
    if (field === "off_duty") {
      const finishMinutes = getDayFinishMinutes(day);
      if (finishMinutes != null && !seen.has(finishMinutes)) {
        seen.add(finishMinutes);
        values.push(finishMinutes);
      }
      continue;
    }

    pushTime(day?.[field]);
    pushTime(day?.job_detail?.[field]);
  }

  if (values.length === 0) {
    for (const detail of crew.job_details ?? []) {
      pushTime(detail?.[field]);
    }
  }

  if (values.length === 0) {
    const representativeJob = getRepresentativeJobForCrew(crew);
    pushTime(representativeJob?.[field]);
  }

  return values;
}

function getScopedPreferencesForCrew(
  crew: Crew,
  parsed: ParsedPreferences
): ScopedPreference | undefined {
  const normalized = normalizeTerminalName(crew.terminal);

  return parsed.scoped_preferences?.find(
    (s) => s.normalized_terminal === normalized
  );
}
function getCrewPriorityRank(
  crew: Crew,
  priorityGroups: ParsedPreferences["priority_groups"]
): number {
  const crewTerminal = normalizeTerminalName(crew.terminal);

  for (const group of priorityGroups) {
    const terminalCondition = group.conditions.find(
      (c) => c.field === "terminal" && c.operator === "="
    );

    if (
      terminalCondition &&
      normalizeTerminalName(String(terminalCondition.value)) === crewTerminal
    ) {
      return group.rank;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}
const { parseJobSheetText } = require("../lib/jobSheetParser");


function getNumericSortValue(crew: RankedCrew, field: SortField): number | null {
  if (field === "weekends_off") {
    return crew.works_weekends ? 0 : 1;
  }

  if (field === "three_day_off_jobs") {
    return crew.days_off_count === 3 ? 1 : 0;
  }

  const firstWorkedDay = crew.daily?.find((d: any) => !d.is_day_off);
  const repJob = firstWorkedDay?.job_detail ?? crew.job_details?.[0] ?? null;

  if (field === "on_duty") {
    return timeToMinutes(repJob?.on_duty ?? null);
  }

  if (field === "off_duty") {
    const startMinutes = timeToMinutes(repJob?.on_duty ?? null);
    let finishMinutes = timeToMinutes(repJob?.off_duty ?? null);
    if (finishMinutes == null) return null;
    if (startMinutes != null && finishMinutes < startMinutes) {
      finishMinutes += 24 * 60;
    }
    return finishMinutes;
  }

  if (field === "operating_hours_daily") {
    return normalizeNumber(repJob?.operating_hours_daily);
  }

  if (field === "van_hours_daily") {
    return normalizeNumber(repJob?.van_hours_daily);
  }

  if (field === "operating_hours_weekly") {
    const numericValue = normalizeNumber(crew.operating_hours_weekly);
    if (numericValue != null && numericValue > 0) {
      return numericValue;
    }

    const fallbackValue = timeToHours(crew.operating_time_weekly ?? null);
    return typeof fallbackValue === "number" ? fallbackValue : null;
  }

  if (field === "overtime_hours_weekly") {
    const numericValue = normalizeNumber(crew.overtime_hours_weekly);
    if (numericValue != null && numericValue >= 0) {
      return numericValue;
    }

    const fallbackValue = timeToHours(crew.overtime_weekly_text ?? null);
    return typeof fallbackValue === "number" ? fallbackValue : null;
  }

  if (field === "total_paid_hours_weekly") {
    const numericValue = normalizeNumber(crew.total_paid_hours_weekly);
    if (numericValue != null && numericValue > 0) {
      return numericValue;
    }

    const fallbackValue = timeToHours(crew.work_time_weekly ?? null);
    return typeof fallbackValue === "number" ? fallbackValue : null;
  }

  return null;
}

function compareCrewsByOrderedSorts(
  a: RankedCrew,
  b: RankedCrew,
  sorts: {
    field: SortField;
    direction: "asc" | "desc";
    strength: PreferenceStrength;
    weight?: number;
  }[]
) {
  for (const sort of sorts) {
    const aVal = getNumericSortValue(a, sort.field);
    const bVal = getNumericSortValue(b, sort.field);

    if (aVal == null && bVal == null) continue;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (aVal === bVal) continue;

    if (sort.direction === "asc") {
      return aVal - bVal;
    }

    return bVal - aVal;
  }

  return b.score - a.score;
}

function compareCrewsBySharedScopedAndGlobalSorts(
  a: RankedCrew,
  b: RankedCrew,
  parsed: ParsedPreferences
) {
  const aTerminal = normalizeTerminalName(a.terminal);
  const bTerminal = normalizeTerminalName(b.terminal);

  if (aTerminal !== bTerminal) {
    return b.score - a.score;
  }

  const scope = parsed.scoped_preferences?.find(
    (s) => s.normalized_terminal === aTerminal
  );

  const effectiveSorts =
    scope?.sort_preferences?.length
      ? mergeScopedAndGlobalSortPreferences(
          scope.sort_preferences,
          parsed.sort_preferences
        )
      : parsed.sort_preferences;

  return compareCrewsByOrderedSorts(a, b, effectiveSorts);
}

function findPriorityViolations(
  ranked: RankedCrew[],
  parsed: ParsedPreferences
): PromptDebugResult["priorityViolations"] {
  const violations: PromptDebugResult["priorityViolations"] = [];

  for (let i = 0; i < ranked.length; i += 1) {
    const currentCrew = ranked[i];
    const currentRank = getCrewPriorityRank(currentCrew, parsed.priority_groups);

    for (let j = i + 1; j < ranked.length; j += 1) {
      const laterCrew = ranked[j];
      const laterRank = getCrewPriorityRank(laterCrew, parsed.priority_groups);

      if (
        currentRank === Number.MAX_SAFE_INTEGER ||
        laterRank === Number.MAX_SAFE_INTEGER
      ) {
        continue;
      }

      if (currentRank > laterRank) {
        violations.push({
          higherPriorityCrew: {
            id: laterCrew.id,
            terminal: formatTerminalDisplayName(laterCrew.terminal),
            rank: laterRank,
          },
          lowerPriorityCrew: {
            id: currentCrew.id,
            terminal: formatTerminalDisplayName(currentCrew.terminal),
            rank: currentRank,
          },
          message: `Priority ${laterRank} terminal ${formatTerminalDisplayName(
            laterCrew.terminal
          )} appeared after Priority ${currentRank} terminal ${formatTerminalDisplayName(
            currentCrew.terminal
          )}`,
        });
      }
    }
  }

  return violations;
}

function passesScopedFilters(crew: Crew, scoped: ScopedPreference): boolean {
  const workedDays = (crew.daily ?? []).filter((d: any) => !d.is_day_off);

  if (workedDays.length === 0) return false;

  for (const filter of scoped.filters) {
    if (filter.field === "on_duty") {
      const filterTime =
        typeof filter.value === "string" ? timeToMinutes(filter.value) : null;

      if (filterTime == null) return false;

      const comparableStarts = getCrewComparableTimes(crew, "on_duty");

      if (comparableStarts.length === 0) {
        return false;
      }

      for (const start of comparableStarts) {
        if (filter.operator === ">=" && start < filterTime) return false;
        if (filter.operator === ">" && start <= filterTime) return false;
        if (filter.operator === "<=" && start > filterTime) return false;
        if (filter.operator === "<" && start >= filterTime) return false;
      }
    }

    if (filter.field === "off_duty") {
      if (typeof filter.value !== "string") return false;

      if (workedDays.length === 0) {
        return false;
      }

      for (const day of workedDays) {
        const evaluation = evaluateFinishFilterForDay(day, filter);
        if (!evaluation) {
          return false;
        }
        if (!evaluation.passes) return false;
      }
    }

    if (
      filter.field === "weekday_days_off_count" &&
      filter.operator === "=" &&
      typeof filter.value === "number"
    ) {
      if (getWeekdayDaysOffCount(crew) !== filter.value) {
        return false;
      }
    }

    if (
      filter.field === "weekend_days_off" &&
      filter.operator === "=" &&
      filter.value === false
    ) {
      if (hasWeekendDaysOff(crew)) {
        return false;
      }
    }
  }

  return true;
}

function getScopedFilterFailureReason(
  crew: Crew,
  scoped: ScopedPreference
): string | null {
  const workedDays = (crew.daily ?? []).filter((d: any) => !d.is_day_off);

  if (workedDays.length === 0) {
    return "This crew has no worked days to compare against your preferences";
  }

  for (const filter of scoped.filters) {
    if (filter.field === "on_duty") {
      const filterTime =
        typeof filter.value === "string" ? timeToMinutes(filter.value) : null;

      if (filterTime == null) continue;

      const comparableStarts = getCrewComparableTimes(crew, "on_duty");

      if (comparableStarts.length === 0) {
        return "This crew is missing start-time details needed for comparison";
      }

      for (const start of comparableStarts) {
        if (filter.operator === ">=" && start < filterTime) {
          return `At least one worked day starts before ${filter.value}`;
        }

        if (filter.operator === ">" && start <= filterTime) {
          return `At least one worked day starts at or before ${filter.value}`;
        }

        if (filter.operator === "<=" && start > filterTime) {
          return `At least one worked day starts after ${filter.value}`;
        }

        if (filter.operator === "<" && start >= filterTime) {
          return `At least one worked day starts at or after ${filter.value}`;
        }
      }
    }

    if (filter.field === "off_duty") {
      if (typeof filter.value !== "string") continue;

      if (workedDays.length === 0) {
        return "This crew is missing finish-time details needed for comparison";
      }

      for (const day of workedDays) {
        const evaluation = evaluateFinishFilterForDay(day, filter);
        if (!evaluation) {
          return "This crew is missing finish-time details needed for comparison";
        }
        const dayLabel = day?.day ?? "One worked day";

        if (!evaluation.passes) {
          return `${dayLabel} ${evaluation.reason}${
            evaluation.displayedFinish ? ` (${evaluation.displayedFinish})` : ""
          }`;
        }
      }
    }

    if (
      filter.field === "weekday_days_off_count" &&
      filter.operator === "=" &&
      typeof filter.value === "number" &&
      getWeekdayDaysOffCount(crew) !== filter.value
    ) {
      return `This crew does not have exactly ${filter.value} weekdays off`;
    }

    if (
      filter.field === "weekend_days_off" &&
      filter.operator === "=" &&
      filter.value === false &&
      hasWeekendDaysOff(crew)
    ) {
      return "This crew has weekend days off";
    }

    if (
      filter.field === "include_only_three_day_off_jobs" &&
      filter.operator === "=" &&
      filter.value === true &&
      crew.days_off_count !== 3
    ) {
      return "This is not a 3 day off job";
    }

    if (
      filter.field === "exclude_three_day_off_jobs" &&
      filter.operator === "=" &&
      filter.value === true &&
      crew.days_off_count === 3
    ) {
      return "This is a 3 day off job, which you asked to exclude";
    }

    if (
      filter.field === "split_time" &&
      filter.operator === "=" &&
      filter.value === "none" &&
      hasSplitTimeValue(crew.split_time_weekly)
    ) {
      return "This crew has split time";
    }

    if (
      filter.field === "weekends_off_hard" &&
      filter.operator === "=" &&
      filter.value === true &&
      crew.works_weekends
    ) {
      return "This crew works weekends";
    }
  }

  return null;
}

function getHardTimeFilterFailureReason(
  crew: Crew,
  filter: ParsedPreferences["filters"][number]
): string | null {
  const workedDays = (crew.daily ?? []).filter((d: any) => !d.is_day_off);

  if (workedDays.length === 0) {
    return null;
  }

  if (filter.field === "on_duty" && typeof filter.value === "string") {
    const filterTime = timeToMinutes(filter.value);
    if (filterTime == null) return null;

    for (const day of workedDays) {
      const { onDuty: displayedStart } = getDisplayedDayTimeRange(day);
      const start = timeToMinutes(displayedStart);
      const dayLabel = day?.day ?? "One worked day";

      if (start == null) {
        return "This crew is missing start-time details needed for comparison";
      }

      if (filter.operator === ">=" && start < filterTime) {
        return `${dayLabel} starts before ${filter.value}${
          displayedStart ? ` (${displayedStart})` : ""
        }`;
      }

      if (filter.operator === ">" && start <= filterTime) {
        return `${dayLabel} starts at or before ${filter.value}${
          displayedStart ? ` (${displayedStart})` : ""
        }`;
      }

      if (filter.operator === "<=" && start > filterTime) {
        return `${dayLabel} starts after ${filter.value}${
          displayedStart ? ` (${displayedStart})` : ""
        }`;
      }

      if (filter.operator === "<" && start >= filterTime) {
        return `${dayLabel} starts at or after ${filter.value}${
          displayedStart ? ` (${displayedStart})` : ""
        }`;
      }
    }
  }

  if (filter.field === "off_duty" && typeof filter.value === "string") {
    for (const day of workedDays) {
      const evaluation = evaluateFinishFilterForDay(day, filter);
      const dayLabel = day?.day ?? "One worked day";

      if (!evaluation) {
        return "This crew is missing finish-time details needed for comparison";
      }

      if (!evaluation.passes) {
        return `${dayLabel} ${evaluation.reason}${
          evaluation.displayedFinish ? ` (${evaluation.displayedFinish})` : ""
        }`;
      }
    }
  }

  return null;
}

function rankCrews(
  crews: Crew[],
  parsed: ParsedPreferences,
  crewScheduleMap: Map<string, any>,
  jobLookupMap: Map<string, any>,
  overrides: string[] = []
) {
  const ranked: RankedCrew[] = [];
  const excluded: {
    id: string;
    terminal: string;
    reason: string;
  }[] = [];

  const priorityGroups = [...parsed.priority_groups].sort((a, b) => a.rank - b.rank);

 for (const crew of crews) {
  const crewTerminal = normalizeTerminalName(crew.terminal);

  const scoped = parsed.scoped_preferences?.find(
    (s) =>
      s.normalized_terminal === crewTerminal ||
      normalizeTerminalName(s.terminal) === crewTerminal
  );



  // Match schedule by terminal from parsed cycle-image data
  let schedule =
    Array.from(crewScheduleMap.values()).find(
      (s: any) =>
        normalizeTerminalName(s.terminal) === normalizeTerminalName(crew.terminal)
    ) || undefined;

  // Temporary fallback for WRMF proof-of-pipeline
  if (!schedule && normalizeTerminalName(crew.terminal) === "wrmf") {
    schedule = Array.from(crewScheduleMap.values())[0];
  }

  const scheduleJobs = (schedule?.jobs || []) as string[];

  const jobDetails = scheduleJobs
    .map((jobNo: string) => jobLookupMap.get(String(jobNo)))
    .filter(Boolean) as any[];


const crewDaily =
  Array.isArray(crew.daily) && crew.daily.length > 0
    ? crew.daily
    : schedule?.daily ?? [];

const crewJobs =
  Array.isArray(crew.jobs) && crew.jobs.length > 0
    ? crew.jobs
    : schedule?.jobs ?? [];

const crewDaysOff =
  Array.isArray(crew.days_off) && crew.days_off.length > 0
    ? crew.days_off
    : schedule?.days_off ?? [];

const crewWithSchedule = {
  ...crew,
  works_weekends:
    typeof crew.works_weekends === "boolean"
      ? crew.works_weekends
      : schedule?.works_weekends,
  days_off: crewDaysOff,
  jobs: crewJobs,
  daily: crewDaily,
  job_details:
    jobDetails.length > 0
      ? jobDetails
      : (crew.job_details ?? []),

  operating_hours_weekly:
    schedule?.operating_time
      ? round1(timeToHours(schedule.operating_time))
      : crew.operating_hours_weekly,

  overtime_hours_weekly:
    schedule?.overtime
      ? round1(timeToHours(schedule.overtime))
      : crew.overtime_hours_weekly,

  total_paid_hours_weekly:
    schedule?.work_time
      ? round1(timeToHours(schedule.work_time))
      : crew.total_paid_hours_weekly,
};

if (crewTerminal === "lewis road") {
  debugLog("LR DAILY USED FOR FILTERS", {
    crewId: crew.id,
    daily: crewWithSchedule.daily,
  });
}

if (scoped && !passesScopedFilters(crewWithSchedule, scoped)) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason:
      getScopedFilterFailureReason(crewWithSchedule, scoped) ??
      "This crew did not match one of your terminal-specific preferences",
  });
  continue;
}

const representativeWorkedDay = (crewWithSchedule.daily || []).find(
  (d: any) => !d.is_day_off && d.job_no
);

const representativeJob: any =
  representativeWorkedDay?.job_detail ??
  (crewWithSchedule.job_details || [])[0] ??
  null;

  const effectiveSortPreferences: ParsedPreferences["sort_preferences"] =
    scoped?.sort_preferences && scoped.sort_preferences.length > 0
      ? mergeScopedAndGlobalSortPreferences(
          scoped.sort_preferences.map((sort) => ({
            field: sort.field,
            direction: sort.direction,
            strength: sort.strength,
            weight: sort.weight,
          })),
          parsed.sort_preferences
        )
      : parsed.sort_preferences;

  const scopedHasOnDutyFilter =
    scoped?.filters?.some((f) => f.field === "on_duty") ?? false;

  const scopedHasOffDutyFilter =
    scoped?.filters?.some((f) => f.field === "off_duty") ?? false;

  const effectiveFilters: ParsedPreferences["filters"] =
    scoped?.filters && scoped.filters.length > 0
      ? [
          ...parsed.filters.filter((f) => {
            if (scopedHasOnDutyFilter && f.field === "on_duty") return false;
            if (scopedHasOffDutyFilter && f.field === "off_duty") return false;
            return true;
          }),
          ...scoped.filters,
        ]
      : parsed.filters;
    const scoreBreakdown: ScoreBreakdownItem[] = [];
    let score = 0;

    const overridden = overrides.includes(crew.id);

    const startFilter = effectiveFilters.find(
      (f) => f.field === "on_duty" && f.operator === ">="
    );

    const maxStartFilter = effectiveFilters.find(
      (f) => f.field === "on_duty" && f.operator === "<="
    );
const minStartMinutes =
  startFilter && typeof startFilter.value === "string"
    ? timeToMinutes(startFilter.value)
    : null;

const maxStartMinutes =
  maxStartFilter && typeof maxStartFilter.value === "string"
    ? timeToMinutes(maxStartFilter.value)
    : null;

const crewStartMinutes = timeToMinutes(representativeJob?.on_duty);
const startFilterFailureReason = startFilter
  ? getHardTimeFilterFailureReason(crewWithSchedule, startFilter)
  : null;
const maxStartFilterFailureReason = maxStartFilter
  ? getHardTimeFilterFailureReason(crewWithSchedule, maxStartFilter)
  : null;

const startsTooEarly =
  Boolean(startFilterFailureReason);

const startsTooLate =
  Boolean(maxStartFilterFailureReason);

if (startsTooEarly && !overridden) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason:
      startFilterFailureReason ??
      `Excluded because this crew starts before ${startFilter?.value}`,
  });
  continue;
}

if (startsTooEarly && overridden) {
  score -= 40;
  scoreBreakdown.push({
    label: `Starts before preferred minimum (${startFilter?.value})`,
    points: -40,
  });
}

if (startsTooLate && !overridden) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason:
      maxStartFilterFailureReason ??
      `Excluded because this crew starts after ${maxStartFilter?.value}`,
  });
  continue;
}

if (startsTooLate && overridden) {
  score -= 40;
  scoreBreakdown.push({
    label: `Starts after preferred maximum (${maxStartFilter?.value})`,
    points: -40,
  });
}

// âœ… Positive start-time match signals
if (
  !startsTooEarly &&
  minStartMinutes !== null &&
  crewStartMinutes !== null
) {
  scoreBreakdown.push({
    label: `Starts after preferred minimum (${startFilter?.value})`,
    points: 0,
  });
}

if (
  !startsTooLate &&
  maxStartMinutes !== null &&
  crewStartMinutes !== null
) {
  scoreBreakdown.push({
    label: `Starts before preferred maximum (${maxStartFilter?.value})`,
    points: 0,
  });
}

const terminalOnlyFilter = effectiveFilters.find(
  (f) => f.field === "terminal" && f.operator === "in" && Array.isArray(f.value)
);

const terminalExcludeFilter = effectiveFilters.find(
  (f) => f.field === "terminal" && f.operator === "not_in" && Array.isArray(f.value)
);

const excludeUpCrewsFilter = effectiveFilters.find(
  (f) => f.field === "exclude_up_crews" && f.operator === "=" && f.value === true
);

const includeOnlySpareboardCrewsFilter = effectiveFilters.find(
  (f) =>
    f.field === "include_only_spareboard_crews" &&
    f.operator === "=" &&
    f.value === true
);

const includeOnlyStandbyCrewsFilter = effectiveFilters.find(
  (f) =>
    f.field === "include_only_standby_crews" &&
    f.operator === "=" &&
    f.value === true
);

const excludeSpareboardCrewsFilter = effectiveFilters.find(
  (f) =>
    f.field === "exclude_spareboard_crews" &&
    f.operator === "=" &&
    f.value === true
);

const includeOnlyThreeDayOffJobsFilter = effectiveFilters.find(
  (f) =>
    f.field === "include_only_three_day_off_jobs" &&
    f.operator === "=" &&
    f.value === true
);

const excludeThreeDayOffJobsFilter = effectiveFilters.find(
  (f) =>
    f.field === "exclude_three_day_off_jobs" &&
    f.operator === "=" &&
    f.value === true
);

const hardWeekendsOffFilter = effectiveFilters.find(
  (f) =>
    f.field === "weekends_off_hard" &&
    f.operator === "=" &&
    f.value === true
);

const weekdayDaysOffCountFilter = effectiveFilters.find(
  (f) =>
    f.field === "weekday_days_off_count" &&
    f.operator === "=" &&
    typeof f.value === "number"
);

const weekendDaysOffFilter = effectiveFilters.find(
  (f) =>
    f.field === "weekend_days_off" &&
    f.operator === "=" &&
    f.value === false
);

const noSplitsFilter = effectiveFilters.find(
  (f) =>
    f.field === "split_time" &&
    f.operator === "=" &&
    f.value === "none"
);

const shuttleBusRequiredFilter = effectiveFilters.find(
  (f) =>
    f.field === "shuttle_bus" &&
    f.operator === "=" &&
    f.value === true
);

const shuttleBusExcludedFilter = effectiveFilters.find(
  (f) =>
    f.field === "shuttle_bus" &&
    f.operator === "=" &&
    f.value === false
);

const crewNumber = String(crew.crew_number ?? crew.id ?? "").trim();
const isSpareboardCrew = /^3\d{3}$/.test(crewNumber);
const isStandbyCrew =
  crewTerminal === "standby" || crewWithSchedule.is_two_week_stby === true;
const crewHasSplitTime = hasSplitTimeValue(crewWithSchedule.split_time_weekly);
const crewHasShuttleBus = crewHasShuttleBusComponent(crewWithSchedule);
const isThreeDayOffCrew = crewWithSchedule.days_off_count === 3;

if (
  terminalOnlyFilter &&
  Array.isArray(terminalOnlyFilter.value) &&
  !terminalOnlyFilter.value.some((terminal) => {
    const normalizedTerminal = normalizeTerminalName(String(terminal));
    if (normalizedTerminal === crewTerminal) return true;
    if (normalizedTerminal === "spareboard" && isSpareboardCrew) return true;
    if (normalizedTerminal === "standby" && isStandbyCrew) return true;
    return false;
  }) &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: `Excluded because only these terminals were allowed: ${terminalOnlyFilter.value
      .map((t) => formatTerminalDisplayName(String(t)))
      .join(", ")}`,
  });
  continue;
}

if (
  terminalExcludeFilter &&
  Array.isArray(terminalExcludeFilter.value) &&
  terminalExcludeFilter.value.some((terminal) => {
    const normalizedTerminal = normalizeTerminalName(String(terminal));
    if (normalizedTerminal === crewTerminal) return true;
    if (normalizedTerminal === "spareboard" && isSpareboardCrew) return true;
    if (normalizedTerminal === "standby" && isStandbyCrew) return true;
    return false;
  }) &&
  !overridden
) {
  const uniqueTerminals = Array.from(
    new Set(
      terminalExcludeFilter.value.map((t) => normalizeTerminalName(String(t)))
    )
  );

  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: isStandbyCrew && uniqueTerminals.includes("standby")
      ? "Excluded because you asked to hide standby crews"
      : `Excluded because terminal ${formatTerminalDisplayName(
          crew.terminal
        )} was excluded by your preferences (${uniqueTerminals
          .map((t) => formatTerminalDisplayName(t))
          .join(", ")})`,
  });
  continue;
}

if (
  includeOnlySpareboardCrewsFilter &&
  !isSpareboardCrew &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because only spareboard crews (4-digit 3xxx) were allowed",
  });
  continue;
}

if (
  includeOnlyStandbyCrewsFilter &&
  !isStandbyCrew &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because only standby crews were allowed",
  });
  continue;
}

if (
  excludeSpareboardCrewsFilter &&
  isSpareboardCrew &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because spareboard crews (4-digit 3xxx) were excluded by your preferences",
  });
  continue;
}

if (
  excludeUpCrewsFilter &&
  crewNumber.startsWith("5") &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because UP crews (5xxx) were excluded by your preferences",
  });
  continue;
}

if (
  includeOnlyThreeDayOffJobsFilter &&
  !isThreeDayOffCrew &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because only 3 day off jobs were allowed",
  });
  continue;
}

if (
  excludeThreeDayOffJobsFilter &&
  isThreeDayOffCrew &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because 3 day off jobs were excluded by your preferences",
  });
  continue;
}

if (
  weekdayDaysOffCountFilter &&
  getWeekdayDaysOffCount(crewWithSchedule) !== weekdayDaysOffCountFilter.value &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: `Excluded because this crew does not have exactly ${weekdayDaysOffCountFilter.value} weekdays off`,
  });
  continue;
}

if (
  weekendDaysOffFilter &&
  hasWeekendDaysOff(crewWithSchedule) &&
  !overridden
) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because this crew has weekend days off",
  });
  continue;
}

const hasHardWeekendsOffRule = Boolean(hardWeekendsOffFilter);
const hasNoSplitsRule = Boolean(noSplitsFilter);
const hasShuttleBusOnlyRule = Boolean(shuttleBusRequiredFilter);
const hasNoShuttleBusRule = Boolean(shuttleBusExcludedFilter);

if (hasNoSplitsRule && crewHasSplitTime && !overridden) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because this crew has split time",
  });
  continue;
}

if (hasShuttleBusOnlyRule && !crewHasShuttleBus && !overridden) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because only jobs with shuttle bus were allowed",
  });
  continue;
}

if (hasNoShuttleBusRule && crewHasShuttleBus && !overridden) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason: "Excluded because shuttle bus jobs were excluded by your preferences",
  });
  continue;
}

// Schedule filters
if (hasHardWeekendsOffRule) {
  if (crewWithSchedule.works_weekends && !overridden) {
    excluded.push({
      id: crew.id,
      terminal: formatTerminalDisplayName(crew.terminal),
      reason: `Excluded because this crew works weekends`,
    });
    continue;
  }

  // âœ… Positive weekends-off match signal
  if (!crewWithSchedule.works_weekends) {
    scoreBreakdown.push({
      label: "Matches weekends_off preference",
      points: 0,
    });
  }
}

if (scoped?.required_days_off?.length) {
  const crewDaysOff = (crewWithSchedule.days_off ?? []).map((d: any) =>
    d.toLowerCase()
  );

  const hasAllRequiredDays = scoped.required_days_off.every((day) =>
    crewDaysOff.includes(day)
  );

  if (!hasAllRequiredDays && !overridden) {
    excluded.push({
      id: crew.id,
      terminal: formatTerminalDisplayName(crew.terminal),
      reason: `Excluded because it does not include required days off (${scoped.required_days_off.join(", ")})`,
    });
    continue;
  }

  // âœ… Positive required-days-off match signal
  if (hasAllRequiredDays) {
    scoreBreakdown.push({
      label: `Matches required days off (${scoped.required_days_off.join(", ")})`,
      points: 0,
    });
  }
}

for (const group of priorityGroups) {
  const terminalCondition = group.conditions.find(
    (c) => c.field === "terminal" && c.operator === "="
  );

  if (
    terminalCondition &&
    crewTerminal === normalizeTerminalName(String(terminalCondition.value))
  ) {
    const dominanceBonus = 1000 - (group.rank - 1) * 200;

    score += dominanceBonus;

    scoreBreakdown.push({
      label: `Terminal dominance #${group.rank} (${formatTerminalDisplayName(
        crew.terminal
      )})`,
      points: dominanceBonus,
    });

    let bonus = Math.max(0, 120 - (group.rank - 1) * 30);

    const avoid = parsed.tradeoffs.find(
      (t) =>
        t.type === "avoid_terminal" &&
        normalizeTerminalName(String(t.value)) === crewTerminal
    );

    if (avoid) {
      const penalty = avoid.weight ?? 25;
      bonus -= penalty * 0.8;

      scoreBreakdown.push({
        label: `Priority reduced due to avoidance (${formatTerminalDisplayName(
          crew.terminal
        )})`,
        points: -penalty * 0.8,
      });
    }

    score += bonus;

    scoreBreakdown.push({
      label: `Matches terminal priority #${group.rank} (${formatTerminalDisplayName(
        crew.terminal
      )})`,
      points: Math.round(bonus),
    });

    break;
  }
}

const maxFinishFilter = effectiveFilters.find(
  (f) => f.field === "off_duty" && f.operator === "<="
);

const representativeStartMinutes = timeToMinutes(representativeJob?.on_duty ?? null);
let crewFinishMinutes = timeToMinutes(representativeJob?.off_duty ?? null);

if (
  crewFinishMinutes !== null &&
  representativeStartMinutes !== null &&
  crewFinishMinutes < representativeStartMinutes
) {
  crewFinishMinutes += 24 * 60;
}

const maxFinishMinutes =
  maxFinishFilter && typeof maxFinishFilter.value === "string"
    ? getAdjustedFinishFilterMinutes(
        maxFinishFilter.value,
        crewFinishMinutes
      )
    : null;
const maxFinishFilterFailureReason = maxFinishFilter
  ? getHardTimeFilterFailureReason(crewWithSchedule, maxFinishFilter)
  : null;

const finishesTooLate =
  Boolean(maxFinishFilterFailureReason);

if (finishesTooLate && !overridden) {
  excluded.push({
    id: crew.id,
    terminal: formatTerminalDisplayName(crew.terminal),
    reason:
      maxFinishFilterFailureReason ??
      `Excluded because this crew finishes after ${maxFinishFilter?.value}`,
  });
  continue;
}

if (finishesTooLate && overridden) {
  score -= 40;
  scoreBreakdown.push({
    label: `Finishes after preferred maximum (${maxFinishFilter?.value})`,
    points: -40,
  });
}

// âœ… Positive finish-time match signal
if (
  !finishesTooLate &&
  maxFinishMinutes !== null &&
  crewFinishMinutes !== null
) {
  scoreBreakdown.push({
    label: `Finishes before preferred maximum (${maxFinishFilter?.value})`,
    points: 0,
  });
}

for (const tradeoff of parsed.tradeoffs) {
  if (
    tradeoff.type === "avoid_terminal" &&
    tradeoff.value &&
    normalizeTerminalName(String(tradeoff.value)) === crewTerminal
  ) {
    const penalty = tradeoff.weight ?? 25;

    score -= penalty;
    scoreBreakdown.push({
      label: `Avoid terminal (${formatTerminalDisplayName(crew.terminal)})`,
      points: -penalty,
    });
  }
}

for (const sort of effectiveSortPreferences) {
  if (sort.field === "three_day_off_jobs") {
    const points =
      (crewWithSchedule.days_off_count === 3 ? 1 : 0) * (sort.weight ?? 8);

    score += sort.direction === "desc" ? points : -points;
    scoreBreakdown.push({
      label: `${sort.field} preference (${sort.direction})`,
      points: Number((sort.direction === "desc" ? points : -points).toFixed(1)),
    });
    continue;
  }

  if (sort.field === "on_duty") {
    const minutes = getNumericSortValue(
      crewWithSchedule as RankedCrew,
      sort.field
    );
    if (minutes !== null) {
      const weight = sort.weight ?? 4;
      const hours = minutes / 60;
      const midpoint = 12;

      const points =
        sort.direction === "asc"
          ? (midpoint - hours) * weight
          : (hours - midpoint) * weight;

      score += points;
      scoreBreakdown.push({
        label: `${sort.field} preference (${sort.direction})`,
        points: Number(points.toFixed(1)),
      });
    }
    continue;
  }

  const value = getNumericSortValue(
    crewWithSchedule as RankedCrew,
    sort.field
  );
  if (value === null) continue;

  const weight = sort.weight ?? 5;
  const base = value / 10;
  const points = sort.direction === "asc" ? -base * weight : base * weight;

  score += points;
  scoreBreakdown.push({
    label: `${sort.field} preference (${sort.direction})`,
    points: Number(points.toFixed(1)),
  });
}
debugLog(
  "SCORE BREAKDOWN DEBUG",
  ranked.length,
  crewWithSchedule?.crew_number,
  crewWithSchedule?.terminal,
  scoreBreakdown
);

const explanation = buildCrewExplanation(scoreBreakdown);
    ranked.push({
      ...crewWithSchedule,
      score: Number(score.toFixed(1)),
      scoreBreakdown,
      included_override: overridden,
      override_reason: overridden
        ? `Included anyway even though it starts outside your preferred time window`
        : undefined,
      explanation,
    });
  }

  ranked.sort((a, b) => {
  const aTerminal = normalizeTerminalName(a.terminal);
  const bTerminal = normalizeTerminalName(b.terminal);

  const aPriority = getCrewPriorityRank(a, priorityGroups);
  const bPriority = getCrewPriorityRank(b, priorityGroups);

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const globalThreeDayOffSort = parsed.sort_preferences.find(
    (sort) => sort.field === "three_day_off_jobs"
  );

  const sharedScopedSorts =
    aTerminal === bTerminal
      ? parsed.scoped_preferences?.find(
          (scope) =>
            scope.normalized_terminal === aTerminal &&
            (scope.sort_preferences?.length ?? 0) > 0
        )?.sort_preferences ?? []
      : [];

  if (globalThreeDayOffSort && sharedScopedSorts.length === 0) {
    const aThreeDayOff = a.days_off_count === 3 ? 1 : 0;
    const bThreeDayOff = b.days_off_count === 3 ? 1 : 0;

    if (aThreeDayOff !== bThreeDayOff) {
      return globalThreeDayOffSort.direction === "desc"
        ? bThreeDayOff - aThreeDayOff
        : aThreeDayOff - bThreeDayOff;
    }
  }

  return compareCrewsBySharedScopedAndGlobalSorts(a, b, parsed);
});

return { ranked, excluded };
}

function formatNaturalList(values: string[]): string {
  const cleaned = Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;

  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function getNormalizedFilterValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map((entry) =>
    String(entry).toLowerCase().trim()
  );
}

function filterValuesInclude(values: string[], token: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(token)}\\b`, "i");
  return values.some((value) => pattern.test(value));
}

function humanizePreferenceField(field: string): string {
  switch (field) {
    case "on_duty":
      return "start time";
    case "off_duty":
      return "finish time";
    case "job_type":
      return "job type";
    case "job_subtype":
      return "job subtype";
    case "job_direction":
      return "job direction";
    case "split_time":
      return "split jobs";
    case "shuttle_bus":
      return "shuttle bus jobs";
    case "weekday_days_off_count":
      return "weekday days off";
    case "weekend_days_off":
      return "weekend days off";
    case "days_off_count":
      return "days off";
    default:
      return field.replace(/_/g, " ");
  }
}

function humanizePreferenceOperator(operator: string): string {
  switch (operator) {
    case "in":
      return "allows";
    case "not_in":
      return "excludes";
    case "=":
      return "is";
    case "!=":
      return "is not";
    case ">=":
      return "is at least";
    case "<=":
      return "is at most";
    case ">":
      return "is after";
    case "<":
      return "is before";
    default:
      return operator;
  }
}

function formatTerminalRuleLabel(
  values: string[],
  mode: "include" | "exclude"
): string | null {
  const terminalTargets: string[] = [];
  const crewGroupTargets: string[] = [];

  for (const value of values) {
    const normalized = normalizeTerminalName(String(value));

    if (normalized === "standby") {
      crewGroupTargets.push("standby crews");
      continue;
    }

    if (normalized === "spareboard") {
      crewGroupTargets.push("spareboard crews");
      continue;
    }

    terminalTargets.push(formatTerminalDisplayName(String(value)));
  }

  const parts: string[] = [];

  if (terminalTargets.length > 0) {
    parts.push(`crews from ${formatNaturalList(terminalTargets)}`);
  }

  parts.push(...crewGroupTargets);

  if (parts.length === 0) return null;

  return mode === "include"
    ? `Only show ${formatNaturalList(parts)}`
    : `Hide ${formatNaturalList(parts)}`;
}

function formatFilterLabel(
  f: any,
  allFilters: ParsedPreferences["filters"] = []
): string | null {
  const hasSpareboardOnlyFilter = allFilters.some(
    (filter) =>
      filter.field === "include_only_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
  );

  const hasSpareboardExcludeFilter = allFilters.some(
    (filter) =>
      filter.field === "exclude_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
  );

  const getVisibleTerminalValues = () => {
    if (!Array.isArray(f.value)) return [];

    return f.value.filter((value: string) => {
      const normalized = normalizeTerminalName(String(value));

      if (
        f.field === "terminal" &&
        f.operator === "in" &&
        hasSpareboardOnlyFilter &&
        normalized === "spareboard"
      ) {
        return false;
      }

      if (
        f.field === "terminal" &&
        f.operator === "not_in" &&
        hasSpareboardExcludeFilter &&
        normalized === "spareboard"
      ) {
        return false;
      }

      return true;
    });
  };

  const normalizedValues = getNormalizedFilterValues(f.value);

  const referencesSplitJobs =
    (f.field === "job_type" || f.field === "job_subtype" || f.field === "split_time") &&
    filterValuesInclude(normalizedValues, "split");

  const referencesUpJobs =
    (f.field === "job_direction" || f.field === "job_type" || f.field === "job_subtype") &&
    filterValuesInclude(normalizedValues, "up");

  const referencesStandby =
    (f.field === "terminal" || f.field === "job_type" || f.field === "job_subtype") &&
    filterValuesInclude(normalizedValues, "standby");

  if (
    referencesSplitJobs &&
    (f.operator === "not_in" || f.operator === "!=" || f.operator === "=") &&
    (f.operator !== "=" || normalizedValues.includes("none"))
  ) {
    return "No split jobs";
  }

  if (
    referencesUpJobs &&
    (f.operator === "not_in" || f.operator === "!=" || f.operator === "=" || f.operator === "in")
  ) {
    return "Hide UP crews";
  }

  if (
    referencesStandby &&
    (f.operator === "not_in" || f.operator === "!=" || f.operator === "=" || f.operator === "in")
  ) {
    return "Hide standby crews";
  }

  if (
    f.field === "include_only_spareboard_crews" &&
    f.operator === "=" &&
    f.value === true
  ) {
    return "Only show spareboard crews";
  }

  if (
    f.field === "include_only_standby_crews" &&
    f.operator === "=" &&
    f.value === true
  ) {
    return "Only show standby crews";
  }

  if (
    f.field === "exclude_spareboard_crews" &&
    f.operator === "=" &&
    f.value === true
  ) {
    return "Hide spareboard crews";
  }

  if (
    f.field === "include_only_three_day_off_jobs" &&
    f.operator === "=" &&
    f.value === true
  ) {
    return "Only show 3-day-off jobs";
  }

  if (
    (f.field === "days_off_count" || f.field === "days_off") &&
    f.operator === ">=" &&
    Number(f.value) === 3
  ) {
    return "Only show 3-day-off jobs";
  }

  if (
    f.field === "exclude_three_day_off_jobs" &&
    f.operator === "=" &&
    f.value === true
  ) {
    return "Hide 3-day-off jobs";
  }

  if (
    (f.field === "days_off_count" || f.field === "days_off") &&
    (f.operator === "<" || f.operator === "<=" || f.operator === "!=") &&
    Number(f.value) === 3
  ) {
    return "Hide 3-day-off jobs";
  }

  if (f.field === "weekends_off_hard" && f.operator === "=" && f.value === true) {
    return "Weekends off required";
  }

  if (
    f.field === "weekday_days_off_count" &&
    f.operator === "=" &&
    typeof f.value === "number"
  ) {
    return `Exactly ${f.value} weekdays off`;
  }

  if (
    f.field === "weekend_days_off" &&
    f.operator === "=" &&
    f.value === false
  ) {
    return "Weekdays off only";
  }

  if (f.field === "split_time" && f.operator === "=" && f.value === "none") {
    return "No split jobs";
  }

  if (f.field === "shuttle_bus" && f.operator === "=" && f.value === false) {
    return "No shuttle bus jobs";
  }

  if (f.field === "shuttle_bus" && f.operator === "=" && f.value === true) {
    return "Only shuttle bus jobs";
  }

  if (f.field === "exclude_up_crews" && f.operator === "=" && f.value === true) {
    return "Hide UP crews";
  }

  if (
    f.field === "job_direction" &&
    (f.operator === "=" ||
      f.operator === "!=" ||
      f.operator === "in" ||
      f.operator === "not_in")
  ) {
    if (filterValuesInclude(normalizedValues, "up")) {
      return "Hide UP crews";
    }
  }

  if (f.field === "on_duty" && (f.operator === ">=" || f.operator === ">")) {
    return `Only show jobs starting after ${f.value}`;
  }

  if (f.field === "on_duty" && (f.operator === "<=" || f.operator === "<")) {
    return `Only show jobs starting before ${f.value}`;
  }

  if (f.field === "off_duty" && (f.operator === "<=" || f.operator === "<")) {
    return `Only show jobs finishing by ${f.value}`;
  }

  if (f.field === "off_duty" && (f.operator === ">=" || f.operator === ">")) {
    return `Only show jobs finishing after ${f.value}`;
  }

  if (f.field === "terminal" && f.operator === "in" && Array.isArray(f.value)) {
    const visibleValues = getVisibleTerminalValues();
    if (visibleValues.length === 0) return null;

    return formatTerminalRuleLabel(
      visibleValues.map((value: string) => String(value)),
      "include"
    );
  }

  if (f.field === "terminal" && f.operator === "not_in" && Array.isArray(f.value)) {
    const visibleValues = getVisibleTerminalValues();
    if (visibleValues.length === 0) return null;

    return formatTerminalRuleLabel(
      visibleValues.map((value: string) => String(value)),
      "exclude"
    );
  }

  const humanizedValue = Array.isArray(f.value)
    ? formatNaturalList(f.value.map((value: unknown) => String(value)))
    : String(f.value);

  return `${humanizePreferenceField(f.field)} ${humanizePreferenceOperator(
    f.operator
  )} ${humanizedValue}`;
}

function formatSortLabel(s: any): string {
  if (s.field === "on_duty" && s.direction === "asc") {
    return "Earlier starts first";
  }

  if (s.field === "on_duty" && s.direction === "desc") {
    return "Later starts first";
  }

  if (s.field === "off_duty" && s.direction === "asc") {
    return "Earlier finishes first";
  }

  if (s.field === "off_duty" && s.direction === "desc") {
    return "Later finishes first";
  }

  if (s.field === "overtime_hours_weekly" && s.direction === "desc") {
    return "Highest overtime first";
  }

  if (s.field === "overtime_hours_weekly" && s.direction === "asc") {
    return "Lowest overtime first";
  }

  if (
    (s.field === "operating_hours_daily" ||
      s.field === "operating_hours_weekly") &&
    s.direction === "asc"
  ) {
    return "Lowest operating time first";
  }

  if (
    (s.field === "operating_hours_daily" ||
      s.field === "operating_hours_weekly") &&
    s.direction === "desc"
  ) {
    return "Highest operating time first";
  }

  if (s.field === "van_hours_daily" && s.direction === "asc") {
    return "Lowest van time first";
  }

  if (s.field === "van_hours_daily" && s.direction === "desc") {
    return "Highest van time first";
  }

  if (s.field === "weekends_off") {
    return "Weekends off first";
  }

  if (s.field === "three_day_off_jobs" && s.direction === "desc") {
    return "3-day-off jobs first";
  }

  if (s.field === "three_day_off_jobs" && s.direction === "asc") {
    return "3-day-off jobs last";
  }

  return `Sort by ${humanizePreferenceField(s.field)} ${
    s.direction === "asc" ? "(low to high)" : "(high to low)"
  }`;
}

function buildMatchBadges(scoreBreakdown: ScoreBreakdownItem[]): string[] {
  if (!scoreBreakdown?.length) return [];

  const badges: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    if (!text || seen.has(text)) return;
    seen.add(text);
    badges.push(text);
  };

  for (const item of scoreBreakdown) {
    const label = item.label.toLowerCase();

    if (label.includes("matches terminal priority")) {
      const match = item.label.match(/\((.*?)\)/);
      const terminal = match?.[1]
        ? formatTerminalDisplayName(match[1])
        : "Preferred terminal";

      const rankMatch = item.label.match(/#(\d+)/);
      const rank = rankMatch?.[1] ?? "1";

      push(`Priority #${rank} terminal (${terminal})`);
      continue;
    }

    if (label.includes("starts after preferred minimum")) {
      const match = item.label.match(/\((.*?)\)/);
      push(`Starts after ${match?.[1] ?? "minimum"}`);
      continue;
    }

    if (label.includes("starts before preferred maximum")) {
      const match = item.label.match(/\((.*?)\)/);
      push(`Starts before ${match?.[1] ?? "maximum"}`);
      continue;
    }

    if (label.includes("finishes before preferred maximum")) {
      const match = item.label.match(/\((.*?)\)/);
      push(`Finishes before ${match?.[1] ?? "maximum"}`);
      continue;
    }

    if (label.includes("matches weekends_off preference")) {
      push(`Weekends off`);
      continue;
    }

    if (label.includes("matches required days off")) {
      const match = item.label.match(/\((.*?)\)/);
      push(`Days off: ${match?.[1] ?? "matched"}`);
      continue;
    }

    if (label.includes("on_duty preference (asc)")) {
      push(`Earlier starts preferred`);
      continue;
    }

    if (label.includes("on_duty preference (desc)")) {
      push(`Later starts preferred`);
      continue;
    }

    if (label.includes("overtime_hours_weekly preference (desc)")) {
      push(`Higher overtime`);
      continue;
    }

    if (
      label.includes("operating_hours_daily preference (asc)") ||
      label.includes("operating_hours_weekly preference (asc)")
    ) {
      push(`Lower operating time`);
      continue;
    }

    if (label.includes("van_hours_daily preference (asc)")) {
      push(`Lower van time`);
      continue;
    }
  }

  return badges.slice(0, 4);
}

export default function CrewBidClient({
  crews,
  errorMessage,
}: {
  crews: Crew[];
  errorMessage: string | null;
}) {
  
  const router = useRouter();

  const [myBids, setMyBids] = useState<any[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [manualCrewOrder, setManualCrewOrder] = useState<string[]>([]);
  const [draggedCrewId, setDraggedCrewId] = useState<string | null>(null);
  const [manuallyExcludedCrewIds, setManuallyExcludedCrewIds] = useState<string[]>([]);
  const [fullIncludedCount, setFullIncludedCount] = useState(0);
  const [fullExcludedCount, setFullExcludedCount] = useState(0);
  const [showSignInPanel, setShowSignInPanel] = useState(false);
const [showExcluded, setShowExcluded] = useState(false);
const [expandedExcludedTerminals, setExpandedExcludedTerminals] = useState<string[]>([]);
const [prompt, setPrompt] = useState("");
  const [reviewItems, setReviewItems] = useState<string[]>([]);
  const [rankedCrews, setRankedCrews] = useState<RankedCrew[]>([]);
  const [excludedCrews, setExcludedCrews] = useState<
    { id: string; terminal: string; reason: string }[]
  >([]);

const [overriddenCrewIds, setOverriddenCrewIds] = useState<string[]>([]);
const lastSavedRunKeyRef = useRef<string | null>(null);
const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null);
const [expandedExcludedCrewId, setExpandedExcludedCrewId] = useState<string | null>(null);
const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success">("idle");
const [uploadProgress, setUploadProgress] = useState(0);
const [pdfPages, setPdfPages] = useState<string[]>([]);
const [pdfUrl, setPdfUrl] = useState<string | null>(null);
const [authUser, setAuthUser] = useState<any>(null);
const bidPackageInputRef = useRef<HTMLInputElement | null>(null);
const [uploadDiagnosticTarget, setUploadDiagnosticTarget] = useState<string | null>(null);
const [uploadDiagnosticStatus, setUploadDiagnosticStatus] = useState<string | null>(null);
const [uploadDiagnosticError, setUploadDiagnosticError] = useState<string | null>(null);
const [uploadDiagnosticLines, setUploadDiagnosticLines] = useState<string[]>([]);
const uploadDiagnosticSnapshotRef = useRef<string>("");
const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
const [userProfile, setUserProfile] = useState<any>(null);
const [hasFullAccess, setHasFullAccess] = useState(false);
const [currentPackageId, setCurrentPackageId] = useState<string | null>(null);
const [currentFileHash, setCurrentFileHash] = useState<string | null>(null);
const [savedRuns, setSavedRuns] = useState<any[]>([]);
const [parsedPreferences, setParsedPreferences] =
  useState<ParsedPreferences | null>(null);
const [viewportWidth, setViewportWidth] = useState(1280);

const preferenceSummary = parsedPreferences
  ? summarizePreferencesForDisplay(parsedPreferences)
  : null;

const isMobile = viewportWidth < 768;
const isTablet = viewportWidth < 1100;
const isCompact = viewportWidth < 480;
const pageHorizontalPadding = isMobile ? 16 : 32;
const heroBottomPadding = isMobile ? 56 : 120;
const contentTopPull = isMobile ? -28 : -72;
const primaryCardColumns = isMobile
  ? "1fr"
  : isTablet
    ? "180px minmax(0, 1fr)"
    : "220px minmax(0, 1fr) 150px";
const excludedCardColumns = isMobile
  ? "1fr"
  : isTablet
    ? "180px minmax(0, 1fr)"
    : "220px minmax(0, 1fr) 180px";
const expandedDayColumns = isMobile
  ? "1fr"
  : isTablet
    ? "140px minmax(0, 1fr)"
    : "160px minmax(0, 1fr) auto";
const mobileActionRowStyle = isMobile
  ? {
      width: "100%",
      flexDirection: "row" as const,
      alignItems: "stretch" as const,
      justifyContent: "stretch",
      flexWrap: "wrap" as const,
    }
  : {};


const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "#6b7280",
  marginBottom: 4,
};

function appendUploadDiagnostic(line: string) {
  const stampedLine = `${new Date().toLocaleTimeString()}: ${line}`;
  console.log("[CrewBid upload debug]", stampedLine);
  setUploadDiagnosticLines((prev) => [...prev.slice(-11), stampedLine]);
}

useEffect(() => {
  if (typeof window === "undefined") return;

  const updateViewportWidth = () => {
    setViewportWidth(window.innerWidth);
  };

  updateViewportWidth();
  window.addEventListener("resize", updateViewportWidth);

  return () => {
    window.removeEventListener("resize", updateViewportWidth);
  };
}, []);

// disabled old bulk saved-runs loader
useEffect(() => {
  return;
}, [hasFullAccess, authUser?.id, currentPackageId]);


const hasRestoredRef = useRef<string | null>(null);
useEffect(() => {
  if (!authUser?.id || !currentPackageId) return;

  const key = `${authUser.id}-${currentPackageId}`;

  if (hasRestoredRef.current === key) return;

  hasRestoredRef.current = key;

  const restoreRun = async () => {
    debugLog("Restoring latest run ONCE", {
      userId: authUser.id,
      currentPackageId,
      hasFullAccess,
    });

    await restoreLatestRunForPackage(
      authUser.id,
      currentPackageId,
      hasFullAccess
    );
  };

  restoreRun();
}, [authUser?.id, currentPackageId]);




async function restoreStoredPdf(
  storagePath: string,
  fileName?: string | null
) {
  const signedUrl = await getSignedBidPackageUrl(storagePath);
  if (!signedUrl) return false;

  const response = await fetch(signedUrl);
  if (!response.ok) {
    console.error("Failed to fetch stored PDF:", response.status);
    return false;
  }

  const blob = await response.blob();

  const restoredFile = new File(
    [blob],
    fileName || "restored-package.pdf",
    { type: "application/pdf" }
  );

  setPdfUrl(signedUrl);
  await processPdfFile(restoredFile);
  setUploadProgress(100);
  setUploadState("success");
  return true;
}


useEffect(() => {
  if (!currentPackageId) return;

  const restorePackageFile = async () => {
    const pkg = await getBidPackageById(currentPackageId);
    if (!pkg) return;

    if (pkg.file_name) {
      setPdfFileName(pkg.file_name);
    }

    if (pkg.storage_path) {
      await restoreStoredPdf(pkg.storage_path, pkg.file_name);
    }
  };

  restorePackageFile();
}, [currentPackageId]);


useEffect(() => {
  if (!authUser?.id) return;

  const params = new URLSearchParams(window.location.search);
  const checkoutStatus = params.get("checkout");
  const returnPackageId = params.get("packageId");
  const sessionId = params.get("session_id");

  if (checkoutStatus !== "success" || !returnPackageId) return;

  const handleStripeReturn = async () => {
    debugLog("Stripe return detected", {
      returnPackageId,
      userId: authUser.id,
      sessionId,
    });

    setCurrentPackageId(returnPackageId);
    localStorage.setItem("crewbids_last_package_id", returnPackageId);

    if (sessionId) {
      try {
        const confirmResponse = await fetch(
          "/api/stripe/confirm-checkout-session",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId,
              userId: authUser.id,
              packageId: returnPackageId,
            }),
          }
        );

        const confirmData = await confirmResponse.json();

        if (!confirmResponse.ok) {
          console.error("Checkout confirmation failed:", confirmData);
        } else {
          debugLog("Checkout confirmation succeeded:", confirmData);
        }
      } catch (error) {
        console.error("Checkout confirmation request failed:", error);
      }
    }

    const unlocked = await checkPackageUnlock(returnPackageId, authUser.id);
    setHasFullAccess(unlocked);

    await restoreLatestRunForPackage(
      authUser.id,
      returnPackageId,
      unlocked
    );

    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
  };

  handleStripeReturn();
}, [authUser?.id]);

useEffect(() => {
  const savedPackageId = localStorage.getItem("crewbids_last_package_id");

  if (savedPackageId) {
    debugLog("Restoring package id from storage:", savedPackageId);
    setCurrentPackageId(savedPackageId);
  }
}, []);
  useEffect(() => {
  let mounted = true;

async function restoreLatestRunForPackage(
  userId: string,
  packageId: string,
  hasFullAccess: boolean
) {
  const run = await loadLatestRunForPackage(userId, packageId);

  if (!run) return false;

  const ranked = run.ranked_results ?? [];
  const excluded = run.excluded_results ?? [];

  const {
    visibleRanked,
    visibleExcluded,
    fullIncludedCount,
    fullExcludedCount,
  } = applyAccessPreview(ranked, excluded, hasFullAccess);

  setPrompt(run.prompt ?? "");
  setParsedPreferences(run.parsed_preferences ?? null);
  setRankedCrews(visibleRanked);
  setExcludedCrews(visibleExcluded);
  setFullIncludedCount(fullIncludedCount);
  setFullExcludedCount(fullExcludedCount);
  

  return true;
}

  async function loadProfile() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Failed to get auth session:", sessionError);
      return;
    }

    const user = session?.user ?? null;

    if (!mounted) return;
    setAuthUser(user);

    if (!user) {
      setUserProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, is_admin, email_bid_results, support_access_enabled")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Failed to load profile:", JSON.stringify(error, null, 2));
      return;
    }

    if (!mounted) return;
    setUserProfile(data);
  }

  loadProfile();

  return () => {
    mounted = false;
  };
}, []);

const isAdmin = userProfile?.is_admin === true;
async function handleUnlockCheckout() {
  try {
    if (!authUser?.id || !currentPackageId) {
      alert("You must be signed in and have a package loaded.");
      return;
    }

    const response = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: authUser.id,
        packageId: currentPackageId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.url) {
      console.error("Failed to create checkout session:", data);
      alert("Unable to start checkout.");
      return;
    }
if (currentPackageId) {
  localStorage.setItem("crewbids_last_package_id", currentPackageId);
}
    window.location.href = data.url;
  } catch (error) {
    console.error("Checkout error:", error);
    alert("Something went wrong starting checkout.");
  }
}

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const packageIdFromUrl = params.get("packageId");
  const packageIdFromStorage = localStorage.getItem("crewbids_last_package_id");

  const restoredPackageId = packageIdFromUrl || packageIdFromStorage;

  if (!restoredPackageId) return;

  setCurrentPackageId(restoredPackageId);
}, []);

useEffect(() => {
  let cancelled = false;

  

  async function syncAccess() {
    if (isAdmin) {
      if (!cancelled) setHasFullAccess(true);
      return;
    }

    if (!authUser?.id) {
      if (!cancelled) setHasFullAccess(false);
      return;
    }

    if (!currentPackageId) {
      return;
    }

    const unlocked = await checkPackageUnlock(currentPackageId, authUser.id);

    if (!cancelled) {
      setHasFullAccess(unlocked);
    }
  }

  syncAccess();

  return () => {
    cancelled = true;
  };
}, [authUser?.id, currentPackageId, isAdmin]);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  if (params.get("checkout") !== "success") return;
  if (!authUser?.id) return;

  const packageIdFromUrl =
    params.get("packageId") ||
    localStorage.getItem("crewbids_last_package_id");

  if (!packageIdFromUrl) return;

  let cancelled = false;

  async function syncAfterCheckout() {
    setCurrentPackageId(packageIdFromUrl);

   const unlocked = await checkPackageUnlock(packageIdFromUrl!, authUser.id);

    if (!cancelled) {
      setHasFullAccess(unlocked);
    }
  }

  syncAfterCheckout();

  return () => {
    cancelled = true;
  };
}, [authUser?.id]);

async function handleUnlockPackage() {
  if (!authUser?.id) {
    alert("Please sign in to unlock this package.");
    return;
  }

  if (!currentPackageId) {
    alert("No bid package is loaded yet.");
    return;
  }

  const success = await unlockPackage(currentPackageId, authUser.id);

  if (!success) {
    alert("Could not unlock this package.");
    return;
  }

  setHasFullAccess(true);
}
async function handleSignIn() {
  if (!email.trim() || !password.trim()) {
    alert("Please enter your email and password.");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Sign in failed:", error);
    alert("Sign in failed. Check your credentials.");
    return;
  }

  window.location.reload();
}
async function handleSignUp() {
  if (!email.trim() || !password.trim()) {
    alert("Please enter your email and password.");
    return;
  }

  if (password.trim().length < 6) {
    alert("Please use a password with at least 6 characters.");
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error("Sign up failed:", error);
    alert(error.message || "Could not create your account.");
    return;
  }

  if (data.session) {
    window.location.reload();
    return;
  }

  alert("Account created. Check your email to confirm your account, then sign in.");
  setAuthMode("signin");
}
async function handleForgotPassword() {
  if (!email.trim()) {
    alert("Enter your email address first, then click Forgot password.");
    return;
  }

  const redirectTo = `${window.location.origin}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    console.error("Password reset email failed:", error);
    alert(error.message || "Could not send password reset email.");
    return;
  }

  alert("Password reset email sent. Check your inbox for the recovery link.");
}
async function handleSignOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Sign out failed:", error);
    return;
  }

  window.location.reload();
}

const [hasUsedFreePreview, setHasUsedFreePreview] = useState(false);

useEffect(() => {
  if (!authUser?.id || !currentPackageId) return;

  const loadPreviewStatus = async () => {
    const used = await hasUsedPreview(authUser.id, currentPackageId);
    setHasUsedFreePreview(used);
  };

  loadPreviewStatus();
}, [authUser?.id, currentPackageId]);

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

const [pdfFileName, setPdfFileName] = useState<string>("");
const [parsedCycle, setParsedCycle] = useState<any[]>([]);
const [cycleImages, setCycleImages] = useState<string[]>([]);
const [cycleTextPages, setCycleTextPages] = useState<any[]>([]);
const [cycleRowOverlays, setCycleRowOverlays] = useState<
  { top: number; height: number }[][]
>([]);
const cyclePages = useMemo(() => {
  if (!pdfPages.length) return [];
  return pdfPages.filter((pageText) => {
    const lower = pageText.toLowerCase();

    const looksLikeCyclePage =
      lower.includes("days off") &&
      lower.includes("effective sunday") &&
      lower.includes("job #");

    const looksLikeJobSheet =
      lower.includes("job no.:") ||
      lower.includes("job start") ||
      lower.includes("operating time");

    const looksLikeStandbyJobDescriptions =
      lower.includes("standby job descriptions");



    return (
      looksLikeCyclePage &&
      !looksLikeJobSheet &&
      !looksLikeStandbyJobDescriptions
    );
  });
}, [pdfPages]);

const jobPages = useMemo(() => {
  if (!pdfPages.length) return [];

  return pdfPages.filter((pageText) => {
    const lower = pageText.toLowerCase();

    const looksLikeStandbyJobDescriptions =
      lower.includes("standby job descriptions");

    return (
      lower.includes("job no.:") &&
      lower.includes("job start") &&
      lower.includes("operating time") &&
      !looksLikeStandbyJobDescriptions
    );
  });
}, [pdfPages]);

const standbyPages = useMemo(() => {
  if (!pdfPages.length) return [];

  return pdfPages.filter((pageText) => {
    const lower = pageText.toLowerCase();
    return lower.includes("standby job descriptions");
  });
}, [pdfPages]);

const spareboardPages = useMemo(() => {
  if (!pdfPages.length) return [];

  return pdfPages.filter((pageText) => {
    const lower = pageText.toLowerCase();
    return lower.includes("qcto / cto / csa spareboard");
  });
}, [pdfPages]);

const parsedJobs = useMemo(() => {
  if (!jobPages.length) return [];
  return jobPages.flatMap((pageText, index) =>
    parseJobSheetText(pageText, index + 1)
  );
}, [jobPages]);

const parsedStandbyJobs = useMemo(() => {
  if (!standbyPages.length) return [];
  return parseStandbyJobDescriptions(standbyPages);
}, [standbyPages]);

const parsedSpareboardJobs = useMemo(() => {
  if (!spareboardPages.length) return [];
  return parseSpareboardDescriptions(spareboardPages);
}, [spareboardPages]);
debugLog("SPAREBOARD PAGES", spareboardPages.length);
debugLog("PARSED SPAREBOARD JOBS", parsedSpareboardJobs);

const jobLookupMap = useMemo(() => {
  return new Map(parsedJobs.map((j: any) => [String(j.job_no), j]));
}, [parsedJobs]);

const standbyJobLookupMap = useMemo(() => {
  return new Map(parsedStandbyJobs.map((j: any) => [String(j.job_no), j]));
}, [parsedStandbyJobs]);

const spareboardLookupMap = useMemo(() => {
  return new Map(parsedSpareboardJobs.map((j: any) => [String(j.crew_id), j]));
}, [parsedSpareboardJobs]);

const crewScheduleMap = useMemo(() => {
  return new Map(parsedCycle.map((c: any) => [String(c.crew_id), c]));
}, [parsedCycle]);

useEffect(() => {
  let cancelled = false;

 async function buildParsedCycle() {
  if (cycleTextPages.length) {
    try {

      debugLog("CYCLE PAGES COUNT", cyclePages.length);
debugLog(
  "CYCLE PAGES PREVIEW",
  cyclePages.map((p, i) => ({
    index: i,
    hasBD: /BD_D/i.test(p),
    hasCycle: /CYCLE/i.test(p),
    preview: p.slice(0, 200),
  }))
);
debugLog("CYCLE TEXT PAGES COUNT", cycleTextPages.length);

      let result = parseCrewCycleFromTextPages(cycleTextPages);
        debugLog(
  "ALL PARSED CREW CODES",
  Array.from(
    new Set(
      result.map((row: any) => String(row.crew_code || "").trim()).filter(Boolean)
    )
  )
);
debugLog(
  "UNKNOWN / SUSPICIOUS ROWS",
  result
    .filter((row: any) => {
      const code = String(row.crew_code || "").trim();
      return !code || code === "UNKNOWN" || code.startsWith("B");
    })
    .map((row: any) => ({
      crew_code: row.crew_code,
      crew_id: row.crew_id,
      raw_cells: row.raw_cells,
    }))
);
        debugLog(
  "BD_D PARSED ROWS",
  result.filter((row: any) => String(row.crew_code || "").trim() === "BD_D")
);
        const enrichedRows = result.map((row) =>
          attachJobDetailsToRow(
            row,
            jobLookupMap,
            standbyJobLookupMap,
            spareboardLookupMap
          )
        );

        // ---- COVERAGE REPORT ----
        const cycleJobSet = new Set<string>();

        enrichedRows.forEach((row) => {
          row.daily?.forEach((day: any) => {
            if (day?.job_no) {
              const normalized = String(day.job_no).replace(/[^\d]/g, "");
              if (normalized.length === 5) {
                cycleJobSet.add(normalized);
              }
            }
          });
        });

        const lookupKeys = new Set<string>(
          Array.from(jobLookupMap.keys()).map((k) =>
            String(k).replace(/[^\d]/g, "")
          )
        );

        const matchedJobs: string[] = [];
        const missingJobs: string[] = [];

        cycleJobSet.forEach((job) => {
          if (lookupKeys.has(job)) {
            matchedJobs.push(job);
          } else {
            missingJobs.push(job);
          }
        });

        if (!cancelled) {
          setParsedCycle(enrichedRows);
        }

        return;
      } catch (err) {
        console.error("Cycle text parsing failed:", err);
      }
    }

    if (!cycleImages.length) {
      setParsedCycle([]);
      return;
    }

    try {
      const result = await parseCrewCycleFromImages(cycleImages);

      if (!cancelled) {
        setParsedCycle(result);
      }
    } catch (err) {
      console.error("Cycle image parsing failed:", err);
      if (!cancelled) {
        setParsedCycle([]);
      }
    }
  }

  buildParsedCycle();

  return () => {
    cancelled = true;
  };
}, [
  cycleImages,
  cycleTextPages,
  jobLookupMap,
  standbyJobLookupMap,
  spareboardLookupMap,
]);

const cycleCandidateLines = cyclePages.flatMap((pageText) =>
  pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^\d{4,6}\b/.test(line) || /^[A-Z]{2,5}_?[A-Z]?\b/.test(line))
);

const resultsSummary = useMemo(() => {
  if (hasFullAccess) {
    return {
      included: rankedCrews.length,
      excluded: excludedCrews.length,
    };
  }

  return {
    included: fullIncludedCount,
    excluded: 0,
  };
}, [rankedCrews, excludedCrews, hasFullAccess, fullIncludedCount]);
useEffect(() => {
  if (!parsedPreferences) return;

  // ðŸ”’ BLOCK if preview already used
  if (!hasFullAccess && hasUsedFreePreview) {
    console.log("Preview already used â€” blocking ranking");
    return;
  }

  const runRanking = async () => {
    const { ranked, excluded } = rankCrews(
      realCrews,
      parsedPreferences,
      crewScheduleMap,
      jobLookupMap,
      overriddenCrewIds
    );

    const results = rankCrews(
  realCrews,
  parsedPreferences,
  crewScheduleMap,
  jobLookupMap,
  overriddenCrewIds
);
    
    const {
  visibleRanked,
  visibleExcluded,
  fullIncludedCount,
  fullExcludedCount,
} = applyAccessPreview(results.ranked, results.excluded, hasFullAccess);

setRankedCrews(visibleRanked);
setExcludedCrews(visibleExcluded);
setFullIncludedCount(fullIncludedCount);
setFullExcludedCount(fullExcludedCount);

    // ðŸ”’ Mark preview used AFTER first run
 if (!hasFullAccess && !hasUsedFreePreview) {
  await markPreviewUsed(authUser?.id, currentPackageId);
  setHasUsedFreePreview(true);
}

const saveKey = JSON.stringify({
  userId: authUser?.id ?? null,
  packageId: currentPackageId ?? null,
  prompt: prompt.trim(),
  parsedPreferences,
  overriddenCrewIds,
  hasFullAccess,
  hasUsedFreePreview,
});

if (lastSavedRunKeyRef.current === saveKey) {
  return;
}

lastSavedRunKeyRef.current = saveKey;

await saveAnalysisRun({
  userId: authUser?.id,
  packageId: currentPackageId,
  prompt,
  parsedPreferences,
  rankedCrews: results.ranked,
  excludedCrews: results.excluded,
});
  };

  runRanking();
}, [
  crews,
  parsedPreferences,
  overriddenCrewIds,
  crewScheduleMap,
  jobLookupMap,
  hasUsedFreePreview,
  hasFullAccess,
  authUser?.id,
  currentPackageId,
  prompt,
]);
function applyAccessPreview(
  ranked: RankedCrew[],
  excluded: { id: string; terminal: string; reason: string }[],
  hasFullAccess: boolean
) {
  if (hasFullAccess) {
    return {
      visibleRanked: ranked,
      visibleExcluded: excluded,
      fullIncludedCount: ranked.length,
      fullExcludedCount: excluded.length,
    };
  }

  return {
    visibleRanked: ranked.slice(0, 3),
    visibleExcluded: [],
    fullIncludedCount: ranked.length,
    fullExcludedCount: excluded.length,
  };
}
async function handleReviewPreferences() {
  if (!hasFullAccess && hasUsedFreePreview) {
    alert("Your free preview has already been used for this package. Unlock to continue.");

    if (authUser?.id && currentPackageId) {
      await restoreLatestRunForPackage(
        authUser.id,
        currentPackageId,
        false
      );
    }

    return;
  }

  let parsed = null;
  const fallbackParsed = parsePreferences(prompt, realCrews);

  const aiResult = await interpretPromptWithAI(prompt);
  debugLog("AI RAW RESULT:", aiResult);

  if (
    aiResult &&
    typeof aiResult === "object" &&
    Array.isArray(aiResult.filters) &&
    Array.isArray(aiResult.priority_groups) &&
    Array.isArray(aiResult.sort_preferences)
  ) {
    parsed = mergeParsedPreferences(aiResult, fallbackParsed);
    debugLog("AI parsed preferences:", parsed);
    debugLog("INTERPRETATION SOURCE: AI+FALLBACK");
  } else {
    parsed = fallbackParsed;
    debugLog("Fallback parser used");
    debugLog("INTERPRETATION SOURCE: FALLBACK");
  }

  parsed = applyDeterministicPreferenceRulesV2(parsed, prompt);

  setParsedPreferences(parsed);
  setReviewItems(buildReviewItems(parsed));
}


function isCrewStart(line: string) {
  return /^[A-Z_]+\s+\d{3,6}/.test(line);
}

function hhmmToHours(value?: string): number | undefined {
  if (!value || typeof value !== "string") return undefined;

  const parts = value.split(":");
  if (parts.length !== 2) return undefined;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return undefined;

  return hours + minutes / 60;
}
function parseBradfordFallbackRowsFromCycleTextPages(cycleTextPages: any[]) {
  const rows: any[] = [];
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const page of cycleTextPages) {
    const pageText = Array.isArray(page?.items)
      ? page.items.map((item: any) => String(item.str || "")).join(" ")
      : String(page || "");

    if (!/\bBD_D\b/i.test(pageText)) continue;

    const matches = Array.from(
      pageText.matchAll(
        /BD_D\s+(\d{4})\s+([\s\S]*?)(?=BD_D\s+\d{4}|V1\s+\d{2}-\d{2}-\d{4}|$)/g
      )
    ) as RegExpMatchArray[];

    for (const match of matches) {
      const crew_id = match[1];
      const body = match[2] || "";

      const dayCells = Array.from(
        body.matchAll(
          /\bOff\b|\b\d{5}\s*\(\d{1,2}:\d{2}\)\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/gi
        )
      ).map((m) => m[0]);

      if (dayCells.length < 7) continue;

      const first7 = dayCells.slice(0, 7);

      const daily = first7.map((cell, index) => {
        const is_day_off = /^off$/i.test(cell.trim());

        if (is_day_off) {
          return {
            day: DAY_LABELS[index],
            day_index: index,
            job_no: null,
            is_day_off: true,
            on_duty: null,
            off_duty: null,
            duration: null,
          };
        }

        const jobMatch = cell.match(/(\d{5})/);
        const timeMatch = cell.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        const durationMatch = cell.match(/\((\d{1,2}:\d{2})\)/);

        return {
          day: DAY_LABELS[index],
          day_index: index,
          job_no: jobMatch?.[1] ?? null,
          is_day_off: false,
          on_duty: timeMatch?.[1] ?? null,
          off_duty: timeMatch?.[2] ?? null,
          duration: durationMatch?.[1] ?? null,
        };
      });

      const jobs = daily
        .filter((d) => !d.is_day_off && d.job_no)
        .map((d) => d.job_no);

      const days_off_list = daily
        .filter((d) => d.is_day_off)
        .map((d) => d.day);

      const summaryTail = body.replace(first7.join(" "), " ");
      const summaryTimes = summaryTail.match(/\b\d{1,2}:\d{2}\b/g) ?? [];

      rows.push({
        crew_code: "BD_D",
        crew_id,
        terminal: "Bradford",
        daily,
        jobs,
        days_off: days_off_list,
        days_off_list,
        days_off_count: days_off_list.length,
        works_weekends:
          !days_off_list.includes("Sat") || !days_off_list.includes("Sun"),
        raw_cells: {
          work_time_weekly: summaryTimes[0] ?? "",
          overtime_weekly: summaryTimes[1] ?? "",
          topup_weekly: summaryTimes[2] ?? "",
          topup_day: summaryTimes[3] ?? "",
          split_time_weekly: summaryTimes[4] ?? "",
          operating_time_weekly: summaryTimes[5] ?? "",
        },
      });
    }
  }

  const deduped = new Map<string, any>();

  for (const row of rows) {
    if (!deduped.has(row.crew_id)) {
      deduped.set(row.crew_id, row);
    }
  }

  return Array.from(deduped.values());
}

function buildRealCrews() {
  if (!cycleTextPages?.length) return [];
  let parsedRows = parseCrewCycleFromTextPages(cycleTextPages);

if (!parsedRows.some((row: any) => String(row.crew_code || "").trim() === "BD_D")) {
  console.log("âš ï¸ BD_D NOT FOUND â€” USING BRADFORD FALLBACK");

  const bradfordFallbackRows =
    parseBradfordFallbackRowsFromCycleTextPages(cycleTextPages);

  debugLog("BRADFORD FALLBACK ROWS", bradfordFallbackRows);

  parsedRows = [...parsedRows, ...bradfordFallbackRows];
}

debugLog(
  "BD_D REAL CREWS SOURCE",
  parsedRows.filter((row: any) => String(row.crew_code || "").trim() === "BD_D")
);

//console.log("PARSED ROW COUNT", parsedRows.length, parsedRows);

const enriched = parsedRows.map((row: any) =>
  attachJobDetailsToRow(
    row,
    jobLookupMap,
    standbyJobLookupMap,
    spareboardLookupMap
  )
);
  const stbyRow = enriched.find((r: any) => r.crew_code === "STBY");

  debugLog(
    "STBY DAILY DEBUG",
    JSON.stringify(stbyRow?.daily ?? [], null, 2)
  );
  debugLog("REAL CREWS COUNT", enriched.length);
  //console.log("SAMPLE CREW RAW", JSON.stringify(enriched[0] ?? null, null, 2));
  debugLog(
    "FIRST 5 CREWS RAW",
    JSON.stringify(enriched.slice(0, 5), null, 2)
  );

  // ðŸ”¥ THIS IS THE FIX â€” map to Crew shape
const crews = enriched.map((row: any, index: number) => {
const summedWeeklyOperating =
  (row.daily || []).reduce((sum: number, day: any) => {
    if (!day) return sum;

    const rawValue = Number(
      day?.job_detail?.operating_hours_daily ??
      day?.operating_hours_daily ??
      null
    );

    const value = Number.isFinite(rawValue) ? rawValue : 0;

    return sum + value;
  }, 0);

   const summedWeeklySplit =
    (row.daily || []).reduce((sum: number, day: any) => {
      if (!day) return sum;

      const rawValue = hhmmToHours(
        day?.job_detail?.split_time ?? null
      );

      const value =
        typeof rawValue === "number" && Number.isFinite(rawValue)
          ? rawValue
          : 0;

      return sum + value;
    }, 0);

  const formatHoursToHHMM = (hoursValue: number) => {
    const totalMinutes = Math.round(hoursValue * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };



  return {
    id: row.crew_id || `${row.crew_code}-${index}`,

    crew_number: row.crew_id,
    terminal:
      row.is_two_week_stby === true || row.crew_code === "STBY"
        ? "Standby"
        : row.terminal || "Unknown",

    daily: row.daily || [],
    jobs: row.jobs || [],

    days_off: row.days_off || [],
    days_off_list: row.days_off_list || [],
    days_off_count: row.days_off_count ?? 0,
    works_weekends: row.works_weekends ?? false,

    // âœ… STBY 2-week structure
    is_two_week_stby: row.is_two_week_stby ?? false,
    week1: row.week1,
    week2: row.week2,

    // âœ… WEEKLY numeric (used by ranking engine)
    operating_hours_weekly: hhmmToHours(
      row.raw_cells?.operating_time_weekly
    ),
    overtime_hours_weekly: hhmmToHours(
      row.raw_cells?.overtime_weekly
    ),

            // âœ… WEEKLY display values (used by UI)
    work_time_weekly: row.raw_cells?.work_time_weekly || "-",
    overtime_weekly_text: row.raw_cells?.overtime_weekly || "-",
    topup_weekly: row.raw_cells?.topup_weekly || "-",
    split_time_weekly:
      summedWeeklySplit > 0
        ? formatHoursToHHMM(summedWeeklySplit)
        : "-",
    operating_time_weekly:
      summedWeeklyOperating > 0
        ? (() => {
            const totalMinutes = Math.round(summedWeeklyOperating * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
          })()
        : row.raw_cells?.operating_time_weekly || "-",

    // âœ… fallback text
    notes: [
      `Days Off: ${(row.days_off_list || []).join(", ") || "-"}`,
      `Work Time: ${row.raw_cells?.work_time_weekly || "-"}`,
      `Overtime: ${row.raw_cells?.overtime_weekly || "-"}`,
      `Topup Week: ${row.raw_cells?.topup_weekly || "-"}`,
      `Split Time: ${row.raw_cells?.split_time_weekly || "-"}`,
      `Operating Time: ${row.raw_cells?.operating_time_weekly || "-"}`,
    ].join(" | "),
  };
});
debugLog(
  "BRADFORD CREWS IN FINAL LIST",
  crews.filter((crew: any) => crew.terminal === "Bradford")
);
const existingCrewIds = new Set(
  crews.map((crew: any) => String(crew.crew_number || "").trim())
);

const spareboardDayLabels = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

const spareboardDayMap: Record<string, string> = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

const spareboardCrews = parsedSpareboardJobs
  .filter((job: any) => {
    const crewId = String(job?.crew_id || "").trim();
    return /^3\d{3}$/.test(crewId) && !existingCrewIds.has(crewId);
  })
  .map((job: any) => {
    const crewId = String(job.crew_id).trim();
    const offDaysShort = (job.days_off_list || [])
      .map((day: string) => spareboardDayMap[day] || day)
      .filter(Boolean);

    const offDaySet = new Set(offDaysShort);

    const duration = calculateDurationFromTimes(
      job.on_duty ?? null,
      job.off_duty ?? null
    );

    const daily = spareboardDayLabels.map((dayLabel, dayIndex) => {
      const is_day_off = offDaySet.has(dayLabel);

      return {
        day: dayLabel,
        day_index: dayIndex,
        job_no: is_day_off ? null : crewId,
        is_day_off,
        on_duty: is_day_off ? null : job.on_duty ?? null,
        off_duty: is_day_off ? null : job.off_duty ?? null,
        duration: is_day_off ? null : duration,
        operating_hours_daily: null,
        van_hours_daily: null,
        split_time: null, // ðŸ‘ˆ ADD THIS LINE
        pdf_page_number: null,
        job_detail: is_day_off
          ? null
          : {
              crew_id: crewId,
              job_no: crewId,
              on_duty: job.on_duty ?? null,
              off_duty: job.off_duty ?? null,
            },
      };
    });

    const works_weekends =
      !offDaySet.has("Sat") || !offDaySet.has("Sun");

    return {
      id: `SPARE-${crewId}`,
      crew_number: crewId,
      terminal: "Willowbrook",

      daily,
      jobs: daily
        .filter((d: any) => !d.is_day_off && d.job_no)
        .map((d: any) => d.job_no),

      days_off: offDaysShort,
      days_off_list: offDaysShort,
      days_off_count: job.days_off_count ?? offDaysShort.length,
      works_weekends,

      is_two_week_stby: false,
      week1: undefined,
      week2: undefined,

      operating_hours_weekly: undefined,
      overtime_hours_weekly: undefined,

      work_time_weekly: "-",
      overtime_weekly_text: "-",
      topup_weekly: "-",
      split_time_weekly: "-",
      operating_time_weekly: "-",

      notes: [
        `Spareboard Crew`,
        `Days Off: ${offDaysShort.join(", ") || "-"}`,
        `On Duty: ${job.on_duty || "-"}`,
        `Off Duty: ${job.off_duty || "-"}`,
        `Duration: ${duration || "-"}`,
      ].join(" | "),
    };
  });

return [...crews, ...spareboardCrews];
}

const realCrews = useMemo(
  () => buildRealCrews(),
  [
    cycleTextPages,
    jobLookupMap,
    standbyJobLookupMap,
    spareboardLookupMap,
    parsedSpareboardJobs,
  ]
);

useEffect(() => {
  if (uploadDiagnosticTarget?.toLowerCase() !== "e1644.pdf") return;

  const snapshot = JSON.stringify({
    pdfPages: pdfPages.length,
    jobPages: jobPages.length,
    cycleTextPages: cycleTextPages.length,
    realCrews: realCrews.length,
  });

  if (uploadDiagnosticSnapshotRef.current === snapshot) return;
  uploadDiagnosticSnapshotRef.current = snapshot;

  appendUploadDiagnostic(
    `state snapshot -> pdfPages=${pdfPages.length}, jobPages=${jobPages.length}, cycleTextPages=${cycleTextPages.length}, realCrews=${realCrews.length}`
  );
}, [
  uploadDiagnosticTarget,
  pdfPages.length,
  jobPages.length,
  cycleTextPages.length,
  realCrews.length,
]);

const getRealCrews = () => realCrews;

async function resolvePromptPreferences(promptText: string) {
  const trimmedPrompt = promptText.trim();

  if (!trimmedPrompt || realCrews.length === 0) {
    return null;
  }

  const normalizedPrompt = trimmedPrompt;
  let parsed: ParsedPreferences;
  const fallbackParsed = parsePreferences(trimmedPrompt, realCrews);

  try {
    const aiResult = await interpretPromptWithAI(trimmedPrompt);

    if (
      aiResult &&
      typeof aiResult === "object" &&
      Array.isArray(aiResult.filters) &&
      Array.isArray(aiResult.priority_groups) &&
      Array.isArray(aiResult.sort_preferences) &&
      Array.isArray(aiResult.tradeoffs) &&
      Array.isArray(aiResult.unknown_clauses) &&
      Array.isArray(aiResult.scoped_preferences)
    ) {
      parsed = mergeParsedPreferences(aiResult, fallbackParsed);
    } else {
      parsed = fallbackParsed;
    }
  } catch {
    parsed = fallbackParsed;
  }

  parsed = applyDeterministicPreferenceRulesV2(parsed, trimmedPrompt);

  return {
    rawPrompt: trimmedPrompt,
    normalizedPrompt,
    promptNormalizationRules: [],
    parsedPreferences: parsed,
  };
}

async function buildPromptDebugResult(
  promptOverride: string
): Promise<PromptDebugResult | null> {
  const resolvedPrompt = await resolvePromptPreferences(promptOverride);

  if (!resolvedPrompt) {
    return null;
  }

  const results = rankCrews(
    realCrews,
    resolvedPrompt.parsedPreferences,
    crewScheduleMap,
    jobLookupMap,
    overriddenCrewIds
  );
  const promptAnalysis = analyzeParsedPreferences(
    resolvedPrompt.parsedPreferences,
    formatTerminalDisplayName
  );

  return {
    prompt: resolvedPrompt.rawPrompt,
    normalizedPrompt: resolvedPrompt.normalizedPrompt,
    promptNormalizationRules: resolvedPrompt.promptNormalizationRules,
    parsedPreferences: resolvedPrompt.parsedPreferences,
    ranked: results.ranked,
    excluded: results.excluded,
    interpretationIssues: promptAnalysis.issues,
    priorityViolations: findPriorityViolations(
      results.ranked,
      resolvedPrompt.parsedPreferences
    ),
  };
}

useEffect(() => {
  if (typeof window === "undefined") return;

  window.__crewbidsDebug = {
    runPrompt: async (promptToRun: string) => {
      const result = await buildPromptDebugResult(promptToRun);

      console.log("CrewBids debug prompt result", result);
      return result;
    },
    summarizePrompt: async (promptToRun: string) => {
      const result = await buildPromptDebugResult(promptToRun);

      if (!result) {
        return null;
      }

      const summary = summarizePromptDebugResult(
        result,
        realCrews.length,
        formatTerminalDisplayName
      );
      logPromptDebugSummary(summary);
      return summary;
    },
    summarizePrompts: async (promptsToRun: string[]) => {
      const summaries: PromptDebugSummary[] = [];

      for (const promptToRun of promptsToRun) {
        const result = await buildPromptDebugResult(promptToRun);

        if (!result) continue;

        summaries.push(
          summarizePromptDebugResult(
            result,
            realCrews.length,
            formatTerminalDisplayName
          )
        );
      }

      if (summaries.length === 0) {
        return null;
      }

      const batchSummary = summarizePromptDebugBatch(summaries);
      logPromptDebugBatchSummary(batchSummary);
      return batchSummary;
    },
    listRegressionSuite: () => DEFAULT_PROMPT_REGRESSION_SUITE,
    runRegressionSuite: async () => {
      const summaries: PromptDebugSummary[] = [];

      for (const regressionCase of DEFAULT_PROMPT_REGRESSION_SUITE) {
        const result = await buildPromptDebugResult(regressionCase.prompt);

        if (!result) continue;

        const baseSummary = summarizePromptDebugResult(
          result,
          realCrews.length,
          formatTerminalDisplayName
        );
        const assertionFailures = evaluatePromptRegressionAssertions(
          regressionCase,
          result,
          baseSummary
        );

        summaries.push(
          summarizePromptDebugResult(
            {
              ...result,
              prompt: `${regressionCase.label}: ${result.prompt}`,
              assertionFailures,
            },
            realCrews.length,
            formatTerminalDisplayName
          )
        );
      }

      if (summaries.length === 0) {
        return null;
      }

      const batchSummary = summarizePromptDebugBatch(summaries);
      logPromptDebugBatchSummary(batchSummary);
      return batchSummary;
    },
    inspectCurrent: () => {
      if (!prompt.trim() || !parsedPreferences) {
        return null;
      }

      return {
        prompt,
        parsedPreferences,
        ranked: rankedCrews,
        excluded: excludedCrews,
        priorityViolations: findPriorityViolations(rankedCrews, parsedPreferences),
      };
    },
    summarizeCurrent: () => {
      if (!prompt.trim() || !parsedPreferences) {
        return null;
      }

      const result = {
        prompt,
        parsedPreferences,
        ranked: rankedCrews,
        excluded: excludedCrews,
        priorityViolations: findPriorityViolations(rankedCrews, parsedPreferences),
      };

      const summary = summarizePromptDebugResult(
        result,
        realCrews.length,
        formatTerminalDisplayName
      );
      logPromptDebugSummary(summary);
      return summary;
    },
    getLoadedCrewCount: () => realCrews.length,
  };

  return () => {
    delete window.__crewbidsDebug;
  };
}, [
  prompt,
  parsedPreferences,
  rankedCrews,
  excludedCrews,
  realCrews,
  crewScheduleMap,
  jobLookupMap,
  overriddenCrewIds,
]);

useEffect(() => {
  if (typeof window === "undefined") return;
  if (realCrews.length === 0) return;

  let cancelled = false;
  let lastHandledCommandId: string | null = null;

  const pollBridge = async () => {
    try {
      const response = await fetch("/api/dev/prompt-bridge", {
        cache: "no-store",
      });

      if (!response.ok) return;

      const state = await response.json();
      const command = state?.command;

      if (!command?.id || command.id === lastHandledCommandId) {
        return;
      }

      lastHandledCommandId = command.id;

      let payload: unknown = null;

      try {
        if (command.action === "runPrompt") {
          payload = await buildPromptDebugResult(String(command.payload ?? ""));
        } else if (command.action === "summarizePrompt") {
          const result = await buildPromptDebugResult(String(command.payload ?? ""));
          payload = result
            ? summarizePromptDebugResult(
                result,
                realCrews.length,
                formatTerminalDisplayName
              )
            : null;
        } else if (command.action === "summarizePrompts") {
          const promptsToRun = Array.isArray(command.payload)
            ? command.payload
            : [];

          const summaries: PromptDebugSummary[] = [];

          for (const promptToRun of promptsToRun) {
            const result = await buildPromptDebugResult(String(promptToRun ?? ""));
            if (!result) continue;

            summaries.push(
              summarizePromptDebugResult(
                result,
                realCrews.length,
                formatTerminalDisplayName
              )
            );
          }

          payload =
            summaries.length > 0 ? summarizePromptDebugBatch(summaries) : null;
        } else if (command.action === "runRegressionSuite") {
          const summaries: PromptDebugSummary[] = [];

          for (const regressionCase of DEFAULT_PROMPT_REGRESSION_SUITE) {
            const result = await buildPromptDebugResult(regressionCase.prompt);
            if (!result) continue;

            const baseSummary = summarizePromptDebugResult(
              result,
              realCrews.length,
              formatTerminalDisplayName
            );
            const assertionFailures = evaluatePromptRegressionAssertions(
              regressionCase,
              result,
              baseSummary
            );

            summaries.push(
              summarizePromptDebugResult(
                {
                  ...result,
                  prompt: `${regressionCase.label}: ${result.prompt}`,
                  assertionFailures,
                },
                realCrews.length,
                formatTerminalDisplayName
              )
            );
          }

          payload =
            summaries.length > 0 ? summarizePromptDebugBatch(summaries) : null;
        }

        await fetch("/api/dev/prompt-bridge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "result",
            result: {
              commandId: command.id,
              action: command.action,
              status: "completed",
              completedAt: new Date().toISOString(),
              payload,
            },
          }),
        });
      } catch (error) {
        await fetch("/api/dev/prompt-bridge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "result",
            result: {
              commandId: command.id,
              action: command.action,
              status: "failed",
              completedAt: new Date().toISOString(),
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown prompt bridge error",
            },
          }),
        });
      }
    } catch {
      // Ignore bridge polling errors in normal UI usage.
    }
  };

  const intervalId = window.setInterval(() => {
    if (!cancelled) {
      void pollBridge();
    }
  }, 2000);

  void pollBridge();

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}, [realCrews, crewScheduleMap, jobLookupMap, overriddenCrewIds]);

function detectCyclePageIndexesFromExtractedPages(pages: string[]): number[] {
  return pages
    .map((pageText, index) => {
      const text = (pageText || "").toUpperCase();

      const hasWeekHeader =
        text.includes("SUN") &&
        text.includes("MON") &&
        text.includes("TUE") &&
        text.includes("WED") &&
        text.includes("THU") &&
        text.includes("FRI") &&
        text.includes("SAT");

      const hasCycleHeader =
        text.includes("CYCLE") &&
        text.includes("CREW #");

      const hasKnownCycleCode =
        text.includes("STBY") ||
        text.includes("LR_D") ||
        text.includes("ML_D") ||
        text.includes("AE_D") ||
        text.includes("BD_D") || // ðŸ‘ˆ IMPORTANT
        text.includes("SH_D") ||
        text.includes("RH_D") ||
        text.includes("LI_D") ||
        text.includes("WH_D") ||
        text.includes("WB_D") ||
        text.includes("WB_UP");

      // ðŸ”¥ Bradford fallback (this is key)
      const isExplicitBradfordCyclePage =
        text.includes("CYCLE") &&
        text.includes("BD_D");

      const isCyclePage =
        (hasCycleHeader && hasWeekHeader && hasKnownCycleCode) ||
        isExplicitBradfordCyclePage;

      return isCyclePage ? index : -1;
    })
    .filter((index) => index !== -1);
}

async function loadLatestRunForPackage(userId: string, packageId: string) {
  const { data, error } = await supabase
    .from("saved_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("bid_package_id", packageId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error loading latest run:", error);
    return null;
  }

  return data?.[0] ?? null;
}
async function restoreLatestRunForPackage(
  userId: string,
  packageId: string,
  hasFullAccess: boolean
) {
  const run = await loadLatestRunForPackage(userId, packageId);

  if (!run) return false;

  const ranked = run.ranked_results ?? [];
  const excluded = run.excluded_results ?? [];

  const {
    visibleRanked,
    visibleExcluded,
    fullIncludedCount,
    fullExcludedCount,
  } = applyAccessPreview(ranked, excluded, hasFullAccess);

  setPrompt(run.prompt ?? "");
  setParsedPreferences(run.parsed_preferences ?? null);
  setRankedCrews(visibleRanked);
  setExcludedCrews(visibleExcluded);
  setFullIncludedCount(fullIncludedCount);
  setFullExcludedCount(fullExcludedCount);


  return true;
}

async function processPdfFile(file: File) {
  const isTargetDebugFile = file.name.toLowerCase() === "e1644.pdf";
  if (isTargetDebugFile) {
    setUploadDiagnosticStatus("Starting PDF extraction...");
    appendUploadDiagnostic(`entered processPdfFile(${file.name})`);
  }

  let pages: string[] = [];

  try {
    pages = await extractPdfPagesFromFile(file);
    if (isTargetDebugFile) {
      setUploadDiagnosticStatus(`PDF extracted successfully (${pages.length} pages)`);
      appendUploadDiagnostic(
        `extractPdfPagesFromFile succeeded -> extractedPageCount=${pages.length}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isTargetDebugFile) {
      setUploadDiagnosticStatus("PDF extraction failed");
      setUploadDiagnosticError(message);
      appendUploadDiagnostic(`extractPdfPagesFromFile failed -> ${message}`);
    }
    throw error;
  }

  setPdfPages(pages);
  setPdfFileName(file.name);

  const provisionalJobPages = pages.filter((pageText) => {
    const lower = pageText.toLowerCase();
    const looksLikeStandbyJobDescriptions =
      lower.includes("standby job descriptions");

    return (
      lower.includes("job no.:") &&
      lower.includes("job start") &&
      lower.includes("operating time") &&
      !looksLikeStandbyJobDescriptions
    );
  });

  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer } as any);
    const pdf = await loadingTask.promise;

    const detectedCyclePageIndexes =
      detectCyclePageIndexesFromExtractedPages(pages);

    if (isTargetDebugFile) {
      appendUploadDiagnostic(
        `classification snapshot -> jobPages=${provisionalJobPages.length}, detectedCyclePageIndexes=${detectedCyclePageIndexes.length}`
      );
    }

    if (!detectedCyclePageIndexes.length) {
      console.warn("No cycle pages detected from extracted text.");
    }

    debugLog("DETECTED CYCLE PAGES", detectedCyclePageIndexes);

    const renderedCycleImages: string[] = [];
    const extractedCycleTextPages: any[] = [];

    for (const pageIndex of detectedCyclePageIndexes) {
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const normalizedItems = (textContent.items as any[])
        .filter((item) => typeof item.str === "string" && item.str.trim())
        .map((item) => ({
          str: item.str,
          x: item.transform?.[5] ?? 0,
          y: item.transform?.[4] ?? 0,
          width: item.height ?? 0,
          height: item.width ?? 0,
        }));

      extractedCycleTextPages.push({
        pageNumber: pageIndex + 1,
        width: viewport.width,
        height: viewport.height,
        items: normalizedItems,
      });

      const imageUrl = await renderPageToImage(pdf, pageIndex + 1);
      renderedCycleImages.push(imageUrl);
    }

    setCycleImages(renderedCycleImages);
    setCycleTextPages(extractedCycleTextPages);

    if (isTargetDebugFile) {
      if (
        provisionalJobPages.length === 0 &&
        detectedCyclePageIndexes.length === 0
      ) {
        setUploadDiagnosticStatus(
          "Upload finished, but no usable job or cycle pages were recognized."
        );
        setUploadDiagnosticError(
          "Extraction completed, but CrewBid did not recognize any job-sheet or cycle-chart pages in e1644.pdf."
        );
      } else {
        setUploadDiagnosticStatus(
          `Classification finished: jobPages=${provisionalJobPages.length}, cyclePages=${detectedCyclePageIndexes.length}`
        );
      }
    }
  } catch (imageErr) {
    console.warn("Error rendering cycle pages / parsing cycle text", imageErr);
    setCycleImages([]);
    setCycleTextPages([]);
    if (isTargetDebugFile) {
      const message =
        imageErr instanceof Error ? imageErr.message : String(imageErr);
      setUploadDiagnosticStatus("Cycle rendering/classification failed");
      setUploadDiagnosticError(message);
      appendUploadDiagnostic(`cycle render/classification failed -> ${message}`);
    }
  }
}
async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];

  appendUploadDiagnostic(
    `entered handlePdfUpload -> hasFile=${Boolean(file)}${file ? `, fileName=${file.name}` : ""}`
  );

  if (!file) return;

  const isTargetDebugFile = file.name.toLowerCase() === "e1644.pdf";

  if (isTargetDebugFile) {
    setUploadDiagnosticTarget(file.name);
    setUploadDiagnosticStatus("File selected");
    setUploadDiagnosticError(null);
    setUploadDiagnosticLines([
      `${new Date().toLocaleTimeString()}: selected ${file.name}`,
    ]);
    uploadDiagnosticSnapshotRef.current = "";
  } else {
    setUploadDiagnosticTarget(null);
    setUploadDiagnosticStatus(null);
    setUploadDiagnosticError(null);
    setUploadDiagnosticLines([]);
    uploadDiagnosticSnapshotRef.current = "";
  }

  if (!authUser) {
    alert("Please sign in before uploading a bid package.");
    if (isTargetDebugFile) {
      setUploadDiagnosticStatus("Upload stopped: user not signed in");
      appendUploadDiagnostic("upload blocked by authUser guard");
    }
    return;
  }

  try {
    setUploadState("uploading");
    setUploadProgress(10);
    if (isTargetDebugFile) {
      setUploadDiagnosticStatus("Upload handler started");
      appendUploadDiagnostic("upload handler started");
    }

    setTimeout(() => setUploadProgress(40), 200);
    setTimeout(() => setUploadProgress(70), 400);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { packageId, fileHash, storagePath: existingStoragePath } =
      await findOrCreateBidPackage(file, user?.id ?? null);

    setCurrentPackageId(packageId);
    if (packageId) {
      localStorage.setItem("crewbids_last_package_id", packageId);
    }

    setCurrentFileHash(fileHash);

    let restoredPdfUrl: string | null = null;
    let resolvedStoragePath: string | null = existingStoragePath ?? null;

    // âœ… Only upload if this package does NOT already have a stored PDF path
    if (!resolvedStoragePath && user?.id && packageId) {
      const { storagePath } = await uploadBidPackagePdf(
        file,
        user.id,
        packageId
      );

      if (storagePath) {
        resolvedStoragePath = storagePath;
        await saveBidPackageStoragePath(packageId, storagePath);
      }
    }

    // âœ… Reuse existing stored PDF if we already have it
    if (resolvedStoragePath) {
      restoredPdfUrl = await getSignedBidPackageUrl(resolvedStoragePath);
    }

    if (!restoredPdfUrl) {
      restoredPdfUrl = URL.createObjectURL(file);
    }

    setPdfUrl(restoredPdfUrl);

    // âœ… THIS is the ONLY parsing call now
    await processPdfFile(file);

    setUploadProgress(100);
    setUploadState("success");
    if (isTargetDebugFile) {
      setUploadDiagnosticStatus("Upload flow completed");
      appendUploadDiagnostic("handlePdfUpload completed successfully");
    }
  } catch (err) {
    console.error("Error processing PDF", err);
    setUploadState("idle");
    setUploadProgress(0);
    if (isTargetDebugFile) {
      const message = err instanceof Error ? err.message : String(err);
      setUploadDiagnosticStatus("Upload flow failed");
      setUploadDiagnosticError(message);
      appendUploadDiagnostic(`handlePdfUpload threw -> ${message}`);
    }
  } finally {
    e.target.value = "";
  }
}

function openBidPackagePicker() {
  const input = bidPackageInputRef.current;
  if (!input) return;
  input.value = "";
  input.click();
}
function summarizePreferencesForDisplay(parsed: ParsedPreferences) {
  const terminals = parsed.priority_groups
    .sort((a, b) => a.rank - b.rank)
    .map((group) => {
      const terminalCondition = group.conditions.find((c) => c.field === "terminal");
      return terminalCondition
        ? formatTerminalDisplayName(String(terminalCondition.value))
        : null;
    })
    .filter(Boolean) as string[];

  const hardRules: string[] = [];
  const preferences: string[] = [];
  const tradeoffs: string[] = [];
  const notes: string[] = [];
  const filters = parsed.filters ?? [];

  const hasSpareboardOnlyFilter = filters.some(
    (filter) =>
      filter.field === "include_only_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
  );

  const hasSpareboardExcludeFilter = filters.some(
    (filter) =>
      filter.field === "exclude_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
  );

  parsed.filters.forEach((filter) => {
    if (
      filter.field === "terminal" &&
      filter.operator === "in" &&
      Array.isArray(filter.value)
    ) {
      const visibleValues = filter.value.filter((value) => {
        const normalized = normalizeTerminalName(String(value));
        return !(
          hasSpareboardOnlyFilter &&
          normalized === "spareboard"
        );
      });

      if (visibleValues.length === 0) return;

      hardRules.push(
        `Show only: ${visibleValues
          .map((t) => formatTerminalDisplayName(String(t)))
          .join(", ")}`
      );
    }

    if (
      filter.field === "terminal" &&
      filter.operator === "not_in" &&
      Array.isArray(filter.value)
    ) {
      const visibleValues = filter.value.filter((value) => {
        const normalized = normalizeTerminalName(String(value));
        return !(
          hasSpareboardExcludeFilter &&
          normalized === "spareboard"
        );
      });

      if (visibleValues.length === 0) return;

      hardRules.push(
        `Hide: ${visibleValues
          .map((t) => formatTerminalDisplayName(String(t)))
          .join(", ")}`
      );
    }

    if (
      filter.field === "exclude_up_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("Hide UP crews");
    }

    if (
      filter.field === "job_direction" &&
      (filter.operator === "=" ||
        filter.operator === "!=" ||
        filter.operator === "in" ||
        filter.operator === "not_in")
    ) {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      const normalizedValues = values.map((value) =>
        String(value).toLowerCase().trim()
      );

      if (normalizedValues.includes("up")) {
        hardRules.push("Hide UP crews");
      }
    }

    if (
      (filter.field === "job_type" || filter.field === "job_subtype") &&
      (filter.operator === "=" ||
        filter.operator === "!=" ||
        filter.operator === "in" ||
        filter.operator === "not_in")
    ) {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      const normalizedValues = values.map((value) =>
        String(value).toLowerCase().trim()
      );

      if (normalizedValues.includes("split")) {
        hardRules.push("No split jobs");
      }

      if (normalizedValues.includes("up")) {
        hardRules.push("Hide UP crews");
      }

      if (normalizedValues.includes("standby")) {
        hardRules.push("Hide standby crews");
      }
    }

    if (
      filter.field === "include_only_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("Show only spareboard crews");
    }

    if (
      filter.field === "include_only_standby_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("Show only standby crews");
    }

    if (
      filter.field === "exclude_spareboard_crews" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("Hide spareboard crews");
    }

    if (
      filter.field === "include_only_three_day_off_jobs" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("Only 3 day off jobs");
    }

    if (
      (filter.field === "days_off_count" || filter.field === "days_off") &&
      filter.operator === ">=" &&
      Number(filter.value) === 3
    ) {
      hardRules.push("Only 3 day off jobs");
    }

    if (
      filter.field === "exclude_three_day_off_jobs" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("No 3 day off jobs");
    }

    if (
      (filter.field === "days_off_count" || filter.field === "days_off") &&
      (filter.operator === "<" || filter.operator === "<=" || filter.operator === "!=") &&
      Number(filter.value) === 3
    ) {
      hardRules.push("No 3 day off jobs");
    }

    if (
      filter.field === "weekends_off_hard" &&
      filter.operator === "=" &&
      filter.value === true
    ) {
      hardRules.push("Weekends off required");
    }

    if (
      filter.field === "weekday_days_off_count" &&
      filter.operator === "=" &&
      typeof filter.value === "number"
    ) {
      hardRules.push(`Exactly ${filter.value} weekdays off`);
    }

    if (
      filter.field === "weekend_days_off" &&
      filter.operator === "=" &&
      filter.value === false
    ) {
      hardRules.push("Weekdays off only");
    }

    if (
      filter.field === "split_time" &&
      filter.operator === "=" &&
      filter.value === "none"
    ) {
      hardRules.push("No split jobs");
    }

    if (filter.field === "on_duty" && (filter.operator === ">=" || filter.operator === ">")) {
      hardRules.push(`No jobs starting before ${String(filter.value)}`);
    }

    if (
      filter.field === "on_duty" &&
      filter.operator === "<=" &&
      filter.value === TIME_BUCKETS.morning.end
    ) {
      hardRules.push("Morning jobs only");
    }

    if (
      filter.field === "on_duty" &&
      filter.operator === ">=" &&
      filter.value === TIME_BUCKETS.evening.start
    ) {
      hardRules.push("Evening jobs only");
    }

    if (
      filter.field === "on_duty" &&
      filter.operator === "<=" &&
      filter.value === TIME_BUCKETS.afternoon.end
    ) {
      hardRules.push("No night jobs");
    }

    if (filter.field === "off_duty" && (filter.operator === "<=" || filter.operator === "<")) {
      hardRules.push(`Only jobs finishing by ${String(filter.value)}`);
    }
  });

  parsed.sort_preferences.forEach((sort) => {
    if (
      (sort.field === "operating_hours_daily" ||
        sort.field === "operating_hours_weekly") &&
      sort.direction === "asc"
    ) {
      preferences.push("Least operating time first");
    }

    if (
      (sort.field === "operating_hours_daily" ||
        sort.field === "operating_hours_weekly") &&
      sort.direction === "desc"
    ) {
      preferences.push("Most operating time first");
    }

    if (sort.field === "van_hours_daily" && sort.direction === "asc") {
      preferences.push("Least van time first");
    }

    if (sort.field === "van_hours_daily" && sort.direction === "desc") {
      preferences.push("Most van time first");
    }

    if (sort.field === "overtime_hours_weekly" && sort.direction === "desc") {
      preferences.push("Most overtime first");
    }

    if (sort.field === "overtime_hours_weekly" && sort.direction === "asc") {
      preferences.push("Least overtime first");
    }

    if (sort.field === "on_duty" && sort.direction === "asc") {
      preferences.push("Prefer earlier starts");
    }

    if (sort.field === "on_duty" && sort.direction === "desc") {
      preferences.push("Prefer later starts");
    }

    if (sort.field === "weekends_off") {
      preferences.push("Prefer weekends off");
    }

    if (sort.field === "three_day_off_jobs" && sort.direction === "desc") {
      preferences.push("Prefer 3 day off jobs");
    }

    if (sort.field === "three_day_off_jobs" && sort.direction === "asc") {
      preferences.push("3 day off jobs last");
    }
  });

  parsed.tradeoffs.forEach((tradeoff) => {
    if (tradeoff.type === "prefer_closeness_over_finish_time") {
      tradeoffs.push("Will accept later jobs to stay closer to home");
    }

    if (tradeoff.type === "avoid_terminal" && tradeoff.value) {
      tradeoffs.push(
        `Avoid ${formatTerminalDisplayName(String(tradeoff.value))} if possible`
      );
    }
  });

  parsed.unknown_clauses.forEach((c) => {
    notes.push(c.text);
  });

  return {
    terminals,
    hardRules: Array.from(new Set(hardRules)),
    preferences: Array.from(new Set(preferences)),
    tradeoffs: Array.from(new Set(tradeoffs)),
    notes: Array.from(new Set(notes)),
  };
}

function PreferenceSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: string;
  items: string[];
}) {
  if (!items.length) return null;

  return (
    <div
      style={{
        border: "1px solid #e8e8e8",
        borderRadius: 12,
        padding: 14,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>{icon}</span>
        <span>{title}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((item, index) => (
          <span
            key={`${title}-${index}`}
            style={{
              display: "inline-block",
              padding: "8px 10px",
              borderRadius: 999,
              background: "#fff",
              border: "1px solid #ddd",
              fontSize: 13,
              lineHeight: 1.2,
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}


  function handleIncludeAnyway(crewId: string) {
  if (!parsedPreferences) return;

  const nextOverrides = [...overriddenCrewIds, crewId];
  setOverriddenCrewIds(nextOverrides);

  const results = rankCrews(
    getRealCrews(), // âœ… switched from crews â†’ real parsed crews
    parsedPreferences,
    crewScheduleMap,
    jobLookupMap,
    nextOverrides
  );

  const {
  visibleRanked,
  visibleExcluded,
  fullIncludedCount,
  fullExcludedCount,
} = applyAccessPreview(results.ranked, results.excluded, hasFullAccess);

setRankedCrews(visibleRanked);
setExcludedCrews(visibleExcluded);
setFullIncludedCount(fullIncludedCount);
setFullExcludedCount(fullExcludedCount);
}

debugLog("FILE LOADED");

async function handleApplyAndRank() {
  debugLog("CLICK DETECTED");

  if (!prompt.trim()) return;

  debugLog("HANDLE APPLY RUNNING");
  debugLog("RANK GUARD STATE", {
    hasFullAccess,
    hasUsedFreePreview,
    authUserId: authUser?.id,
    currentPackageId,
  });

  if (!hasFullAccess && hasUsedFreePreview) {
    alert("Your free preview has already been used for this package. Unlock to continue.");

    if (authUser?.id && currentPackageId) {
      await restoreLatestRunForPackage(
        authUser.id,
        currentPackageId,
        false
      );
    }

    return;
  }

  const resolvedPrompt = await resolvePromptPreferences(prompt);

  if (!resolvedPrompt) {
    return;
  }

  const parsed = resolvedPrompt.parsedPreferences;

  setParsedPreferences(parsed);

  const results = rankCrews(
    realCrews,
    parsed,
    crewScheduleMap,
    jobLookupMap,
    overriddenCrewIds
  );

  const {
    visibleRanked,
    visibleExcluded,
    fullIncludedCount,
    fullExcludedCount,
  } = applyAccessPreview(results.ranked, results.excluded, hasFullAccess);

  setRankedCrews(visibleRanked);
  setExcludedCrews(visibleExcluded);
  setFullIncludedCount(fullIncludedCount);
  setFullExcludedCount(fullExcludedCount);

  if (!hasFullAccess && !hasUsedFreePreview) {
    await markPreviewUsed(authUser?.id, currentPackageId);
    setHasUsedFreePreview(true);
  }

  try {
    await saveAnalysisRun({
      userId: authUser?.id,
      packageId: currentPackageId,
      prompt,
      parsedPreferences: parsed,
      rankedCrews: results.ranked,
      excludedCrews: results.excluded,
    });
  } catch (err) {
    console.warn("saveAnalysisRun failed (non-blocking):", err);
  }

}

function handleManualExclude(crewId: string) {
  setManuallyExcludedCrewIds((prev) =>
    prev.includes(crewId) ? prev : [...prev, crewId]
  );
}

function handleManualRestore(crewId: string) {
  setManuallyExcludedCrewIds((prev) => prev.filter((id) => id !== crewId));
}



function handleReset() {
  setPrompt("");
  setParsedPreferences(null);
  setReviewItems([]);
  setRankedCrews([]);
  setExcludedCrews([]);
  setOverriddenCrewIds([]);
  setManuallyExcludedCrewIds([]);
  setManualCrewOrder([]);
  setDraggedCrewId(null);
}

function handleViewJob(job: any) {
  if (!job?.pdf_page_number) {
    console.warn("No page number for job", job?.job_no);
    return;
  }

  if (!pdfUrl) {
    console.warn("No PDF loaded");
    return;
  }

  const page = String(job.pdf_page_number);
  const jobNo =
    typeof job?.job_no === "string" && job.job_no.trim()
      ? encodeURIComponent(job.job_no.trim())
      : "";

  const fragment = jobNo
    ? `#page=${page}&search=${jobNo}&zoom=page-width`
    : `#page=${page}&zoom=page-width`;

  const url = `${pdfUrl}${fragment}`;
  window.open(
    url,
    "_blank",
    "popup=yes,width=1200,height=900,resizable=yes,scrollbars=yes"
  );
}

function handleDragStart(crewId: string) {
  setDraggedCrewId(crewId);
}

function handleDragEnd() {
  setDraggedCrewId(null);
}

function handleDropOnCrew(targetCrewId: string) {
  if (!draggedCrewId || draggedCrewId === targetCrewId) return;

  setManualCrewOrder((prev) => {
    const working =
      prev.length > 0
        ? [...prev]
        : visibleRankedCrews.map((crew) => crew.id);

    const fromIndex = working.indexOf(draggedCrewId);
    const toIndex = working.indexOf(targetCrewId);

    if (fromIndex === -1 || toIndex === -1) return working;

    const updated = [...working];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    return updated;
  });

  setDraggedCrewId(null);
}


async function handleGenerateList() {
  if (!authUser?.id) {
    alert("Please sign in first.");
    return;
  }

  const finalCrews = orderedVisibleRankedCrews;

  if (!finalCrews.length) {
    alert("No crews to save.");
    return;
  }

  const crewNumbers = finalCrews.map((crew) => crew.crew_number ?? crew.id);
  const crewIds = finalCrews.map((crew) => crew.id);

  const title = "Saved Bid List";

  const { error } = await supabase.from("my_bids").insert({
    user_id: authUser.id,
    bid_package_id: currentPackageId ?? null,
    title,
    prompt,
    crew_numbers: crewNumbers,
    crew_ids: crewIds,
    ranked_snapshot: finalCrews,
  });

  if (error) {
    console.error("Error saving to my_bids:", error);
    alert("Could not save bid list.");
    return;
  }

  alert("Saved to My Bids");
}

function handleResetOrder() {
  setManualCrewOrder([]);
  setDraggedCrewId(null);
}

const visibleRankedCrews = rankedCrews.filter(
  (crew) => !manuallyExcludedCrewIds.includes(crew.id)
);

const orderedVisibleRankedCrews =
  manualCrewOrder.length > 0
    ? [
        ...manualCrewOrder
          .map((id) => visibleRankedCrews.find((crew) => crew.id === id))
          .filter(
            (crew): crew is (typeof visibleRankedCrews)[number] =>
              Boolean(crew)
          ),
        ...visibleRankedCrews.filter(
          (crew) => !manualCrewOrder.includes(crew.id)
        ),
      ]
    : visibleRankedCrews;

const groupedExcludedCrews = useMemo(() => {
  const realCrewMap = new Map(
    realCrews.map((crew) => [String(crew.id), crew])
  );

  const groups = new Map<
    string,
    {
      terminal: string;
      crews: Array<
        { id: string; terminal: string; reason: string } & Partial<RankedCrew>
      >;
    }
  >();

  const sortedExcluded = [...excludedCrews].sort((a, b) => {
    const terminalCompare = a.terminal.localeCompare(b.terminal);
    if (terminalCompare !== 0) return terminalCompare;

    const aId = String(a.id ?? "");
    const bId = String(b.id ?? "");
    return aId.localeCompare(bId);
  });

  for (const crew of sortedExcluded) {
    const terminalKey = crew.terminal || "Other";

    if (!groups.has(terminalKey)) {
      groups.set(terminalKey, {
        terminal: terminalKey,
        crews: [],
      });
    }

    groups.get(terminalKey)!.crews.push({
      ...realCrewMap.get(String(crew.id)),
      ...crew,
    });
  }

  return Array.from(groups.values());
}, [
  excludedCrews,
  realCrews,
]);

function toggleExcludedTerminalGroup(terminal: string) {
  setExpandedExcludedTerminals((prev) =>
    prev.includes(terminal)
      ? prev.filter((value) => value !== terminal)
      : [...prev, terminal]
  );
}

const preferenceChips = useMemo(
  () => buildPreferenceChips(parsedPreferences),
  [parsedPreferences]
);

const promptRuleAnalysis = useMemo(
  () =>
    parsedPreferences
      ? analyzeParsedPreferences(parsedPreferences, formatTerminalDisplayName)
      : null,
  [parsedPreferences]
);

const hasLoadedBidPackage =
  Boolean(currentPackageId) || Boolean(pdfFileName) || pdfPages.length > 0;

function buildPreferenceChips(parsed: ParsedPreferences | null): string[] {
  if (!parsed) return [];
  const chips: string[] = [];

  parsed.sort_preferences.forEach((sort) => {
    if (sort.field === "weekends_off") chips.push("Weekends Off");
    if (sort.field === "three_day_off_jobs" && sort.direction === "desc") {
      chips.push("3 Day Off First");
    }
    if (sort.field === "three_day_off_jobs" && sort.direction === "asc") {
      chips.push("3 Day Off Last");
    }
    if (sort.field === "on_duty" && sort.direction === "asc") chips.push("Morning Starts");
    if (sort.field === "on_duty" && sort.direction === "desc") chips.push("Evening Starts");
    if (sort.field === "overtime_hours_weekly" && sort.direction === "desc") chips.push("High OT");
    if (
      (sort.field === "operating_hours_daily" ||
        sort.field === "operating_hours_weekly") &&
      sort.direction === "asc"
    ) chips.push("Low Op Time");
    if (sort.field === "van_hours_daily" && sort.direction === "asc") chips.push("Low Van");
  });

  parsed.filters.forEach((filter) => {
    if (filter.field === "terminal" && filter.operator === "in") chips.push("Terminal Restricted");
    if (filter.field === "terminal" && filter.operator === "not_in") chips.push("Terminal Exclusions");
    if (filter.field === "include_only_three_day_off_jobs") chips.push("Only 3 Day Off");
    if (filter.field === "exclude_three_day_off_jobs") chips.push("No 3 Day Off");
  });

  return Array.from(new Set(chips)).slice(0, 4);
}

return (
<div
style={{
minHeight: "100vh",
background: "#f3f5f9",
color: "#0f172a",
fontFamily: "Inter, Arial, sans-serif",
overflowX: "hidden",
}}
>
<div
style={{
background:
"linear-gradient(135deg, #0b1f4d 0%, #0d2d6c 55%, #0a2357 100%)",
color: "#fff",
padding: `24px ${pageHorizontalPadding}px ${heroBottomPadding}px`,
}}
>
<div
style={{
maxWidth: 1320,
margin: "0 auto",
}}
>
<div
style={{
display: "flex",
alignItems: isMobile ? "stretch" : "center",
justifyContent: "space-between",
gap: 24,
marginBottom: 48,
flexDirection: isMobile ? "column" : "row",
}}
>
<div
style={{
display: "flex",
alignItems: "center",
gap: 10,
width: isMobile ? "100%" : undefined,
justifyContent: isMobile ? "center" : undefined,
}}
>
<a
href="/"
style={{
display: "flex",
alignItems: "center",
textDecoration: "none",
}}
>
<img
src="/crewbids-logo.png"
alt="CrewBids Logo"
style={{
width: isMobile ? 240 : isTablet ? 320 : 420,
height: "auto",
display: "block",
marginTop: 6,
maxWidth: "100%",
}}
/>

<div
style={{
fontSize: 40,
fontWeight: 800,
letterSpacing: "-0.03em",
lineHeight: 1,
display: "flex",
alignItems: "center",
gap: 2,
}}
>
<span style={{ color: "#ffffff" }}></span>
<span style={{ color: "#f97316" }}></span>
</div>
</a>
</div>

<div
style={{
display: "flex",
alignItems: "center",
gap: 28,
fontSize: isMobile ? 15 : 18,
fontWeight: 600,
flexWrap: "wrap",
width: isMobile ? "100%" : undefined,
justifyContent: isMobile ? "center" : "flex-end",
}}
>
<button
type="button"
onClick={() => router.push("/how-it-works")}
style={{
background: "transparent",
border: "none",
color: "#fff",
cursor: "pointer",
fontSize: isMobile ? 15 : 18,
fontWeight: 600,
padding: isMobile ? "6px 0" : 0,
}}
>
How It Works
</button>

<button
type="button"
onClick={() => router.push("/about")}
style={{
background: "transparent",
border: "none",
color: "#fff",
cursor: "pointer",
fontSize: isMobile ? 15 : 18,
fontWeight: 600,
padding: isMobile ? "6px 0" : 0,
}}
>
About & Contact
</button>

{authUser && (
  <button
    type="button"
    onClick={() => router.push("/my-bids")}
    style={{
      background: "transparent",
      border: "none",
      color: "#fff",
      cursor: "pointer",
      fontSize: isMobile ? 15 : 18,
      fontWeight: 600,
      padding: isMobile ? "6px 0" : 0,
    }}
  >
    My Bids
  </button>
)}

<div style={{ position: "relative" }}>
{!authUser ? (
<>
<button
type="button"
onClick={() => setShowSignInPanel((prev) => !prev)}
style={{
background: "rgba(255,255,255,0.12)",
color: "#fff",
border: "1px solid rgba(255,255,255,0.16)",
borderRadius: 14,
padding: isMobile ? "12px 18px" : "14px 22px",
fontSize: isMobile ? 16 : 18,
fontWeight: 700,
cursor: "pointer",
}}
>
Sign In
</button>

{showSignInPanel && (
<div
onClick={() => setShowSignInPanel(false)}
style={{
position: isMobile ? "fixed" : "absolute",
top: isMobile ? 0 : "calc(100% + 14px)",
right: isMobile ? 0 : 0,
bottom: isMobile ? 0 : "auto",
left: isMobile ? 0 : "auto",
transform: "none",
display: isMobile ? "flex" : "block",
alignItems: isMobile ? "flex-start" : undefined,
justifyContent: isMobile ? "center" : undefined,
padding: isMobile
  ? "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))"
  : 20,
background: isMobile ? "rgba(15, 23, 42, 0.45)" : "#ffffff",
color: "#0f172a",
borderRadius: isMobile ? 0 : 20,
border: isMobile ? "none" : "1px solid #e5e7eb",
boxShadow: isMobile ? "none" : "0 20px 50px rgba(0,0,0,0.18)",
zIndex: isMobile ? 1000 : 50,
width: isMobile ? "100vw" : 380,
overflowY: isMobile ? "auto" : "visible",
}}
>
<div
onClick={(e) => e.stopPropagation()}
style={{
width: isMobile ? "min(92vw, 380px)" : "100%",
maxHeight: isMobile ? "calc(100vh - 32px)" : undefined,
overflowY: isMobile ? "auto" : "visible",
background: "#ffffff",
borderRadius: 20,
border: "1px solid #e5e7eb",
boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
padding: isMobile ? 18 : 0,
margin: isMobile ? "auto" : 0,
}}
>
<div
style={{
fontSize: 20,
fontWeight: 800,
marginBottom: 6,
}}
>
{authMode === "signin" ? "Sign in to CrewBids" : "Create your CrewBids account"}
</div>

<div
style={{
fontSize: 13,
lineHeight: 1.45,
color: "#64748b",
marginBottom: 14,
}}
>
{authMode === "signin"
  ? "Use your account to save bid lists and email them to yourself."
  : "Create an account so your saved bids and email delivery stay tied to your address."}
</div>

<div
style={{
display: "grid",
gridTemplateColumns: "1fr 1fr",
gap: 8,
marginBottom: 14,
}}
>
<button
type="button"
onClick={() => setAuthMode("signin")}
style={{
background: authMode === "signin" ? "#f97316" : "#fff",
color: authMode === "signin" ? "#fff" : "#334155",
border: authMode === "signin" ? "none" : "1px solid #cbd5e1",
borderRadius: 12,
padding: "11px 12px",
fontSize: 13,
fontWeight: 800,
cursor: "pointer",
}}
>
Existing User
</button>

<button
type="button"
onClick={() => setAuthMode("signup")}
style={{
background: authMode === "signup" ? "#f97316" : "#fff",
color: authMode === "signup" ? "#fff" : "#334155",
border: authMode === "signup" ? "none" : "1px solid #cbd5e1",
borderRadius: 12,
padding: "11px 12px",
fontSize: 13,
fontWeight: 800,
cursor: "pointer",
}}
>
New Account
</button>
</div>

<div style={{ display: "grid", gap: 12 }}>
<input
type="email"
placeholder="Email address"
value={email}
onChange={(e) => setEmail(e.target.value)}
style={{
width: "100%",
padding: "12px 14px",
borderRadius: 12,
border: "1px solid #cbd5e1",
fontSize: 16,
outline: "none",
boxSizing: "border-box",
}}
/>

<input
type="password"
placeholder={authMode === "signin" ? "Password" : "Create a password"}
value={password}
onChange={(e) => setPassword(e.target.value)}
style={{
width: "100%",
padding: "12px 14px",
borderRadius: 12,
border: "1px solid #cbd5e1",
fontSize: 16,
outline: "none",
boxSizing: "border-box",
}}
/>

{authMode === "signin" && (
<button
type="button"
onClick={handleForgotPassword}
style={{
justifySelf: "start",
background: "transparent",
border: "none",
padding: 0,
marginTop: -2,
color: "#2563eb",
fontSize: 13,
fontWeight: 700,
cursor: "pointer",
}}
>
Forgot password?
</button>
)}

<div
style={{
display: "flex",
gap: 10,
flexDirection: isMobile ? "column" : "row",
}}
>
<button
type="button"
onClick={async () => {
if (authMode === "signin") {
await handleSignIn();
setShowSignInPanel(false);
} else {
await handleSignUp();
}
}}
style={{
flex: 1,
background: "#f97316",
color: "#fff",
border: "none",
borderRadius: 12,
padding: "12px 16px",
fontSize: 16,
fontWeight: 700,
cursor: "pointer",
width: isMobile ? "100%" : undefined,
}}
>
{authMode === "signin" ? "Sign In" : "Create Account"}
</button>

<button
type="button"
onClick={() => setShowSignInPanel(false)}
style={{
background: "#fff",
color: "#334155",
border: "1px solid #cbd5e1",
borderRadius: 12,
padding: "12px 16px",
fontSize: 16,
fontWeight: 700,
cursor: "pointer",
flex: isMobile ? 1 : undefined,
width: isMobile ? "100%" : undefined,
}}
>
Cancel
</button>
</div>

<div
style={{
fontSize: 12,
lineHeight: 1.45,
color: "#64748b",
paddingTop: 2,
}}
>
{authMode === "signin"
  ? "Your account email will be used for saved bid lists and email delivery."
  : "After you create your account, your email will be tied to My Bids and delivery."}
</div>
</div>
</div>
</div>
)}
</>
) : (
<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
<div
style={{
fontSize: 14,
color: "rgba(255,255,255,0.8)",
maxWidth: isMobile ? 160 : 260,
whiteSpace: "nowrap",
overflow: "hidden",
textOverflow: "ellipsis",
}}
>
{authUser.email}
</div>

<button
type="button"
onClick={handleSignOut}
style={{
background: "rgba(255,255,255,0.12)",
color: "#fff",
border: "1px solid rgba(255,255,255,0.16)",
borderRadius: 14,
padding: isMobile ? "12px 18px" : "14px 22px",
fontSize: isMobile ? 16 : 18,
fontWeight: 700,
cursor: "pointer",
}}
>
Sign Out
</button>
</div>
)}
</div>
</div>
</div>

<div
style={{
display: "grid",
gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.5fr) minmax(320px, 420px)",
gap: isMobile ? 24 : 40,
alignItems: "start",
}}
>
<div>
<h1
style={{
margin: 0,
fontSize: isMobile ? 40 : isTablet ? 52 : 64,
lineHeight: 1.05,
fontWeight: 800,
letterSpacing: "-0.04em",
maxWidth: 780,
}}
>
Your Best Crew Picks
<br />
<span style={{ color: "#f97316", fontStyle: "italic" }}>
Ranked for You
</span>
</h1>

<p
style={{
marginTop: 24,
marginBottom: 28,
fontSize: isMobile ? 18 : isTablet ? 22 : 28,
lineHeight: 1.35,
color: "rgba(255,255,255,0.9)",
maxWidth: 760,
}}
>
Upload your bid package, tell us what matters, and get ranked crew
options with clear explanations.
</p>

<div
style={{
background: "#ffffff",
borderRadius: 22,
boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
overflow: "hidden",
border: "1px solid rgba(255,255,255,0.18)",
maxWidth: 920,
}}
>
<div
style={{
display: "flex",
alignItems: "stretch",
gap: isMobile ? 12 : 0,
flexDirection: isMobile ? "column" : "row",
borderBottom: "1px solid #e5e7eb",
}}
>
<div
style={{
flex: 1,
display: "flex",
alignItems: "center",
gap: 14,
padding: isMobile ? "18px 16px" : "22px 24px",
flexDirection: isMobile ? "column" : "row",
}}
>
<div style={{ fontSize: 16, fontWeight: 800 }}>AI</div>
<input
value={prompt}
onChange={(e) => setPrompt(e.target.value)}
placeholder="Ask CrewBids anything about your bids..."
style={{
flex: 1,
border: "none",
outline: "none",
fontSize: isMobile ? 18 : isTablet ? 22 : 28,
color: "#0f172a",
background: "transparent",
width: "100%",
minWidth: 0,
}}
/>

<button
  type="button"
  disabled={!hasLoadedBidPackage}
  onClick={() => {
  if (!hasLoadedBidPackage) return;
  debugLog("ANALYZE BUTTON CLICKED");
  handleApplyAndRank();
}}

  style={{
    background: hasLoadedBidPackage ? "#f97316" : "#cbd5e1",
    color: hasLoadedBidPackage ? "#fff" : "#64748b",
    border: "none",
    borderRadius: 14,
    padding: isMobile ? "14px 18px" : "18px 28px",
    fontSize: isMobile ? 18 : isTablet ? 22 : 26,
    fontWeight: 800,
    cursor: hasLoadedBidPackage ? "pointer" : "not-allowed",
    boxShadow: hasLoadedBidPackage
      ? "0 8px 20px rgba(249,115,22,0.3)"
      : "none",
    opacity: hasLoadedBidPackage ? 1 : 0.9,
    width: isMobile ? "100%" : "auto",
  }}
>
  Analyze
</button>

</div>
</div>

<div
style={{
padding: isMobile ? "18px 16px 20px" : "20px 24px 24px",
background: "#f8fafc",
display: "grid",
gap: 16,
}}
>
<div
style={{
color: "#64748b",
fontSize: 16,
fontWeight: 500,
}}
>
e.g. &quot;Weekends off, no early starts, prefer Lewis Rd&quot;
</div>

<div
style={{
border: "2px dashed #e2e8f0",
borderRadius: 16,
background: "#ffffff",
padding: "18px 18px",
display: "flex",
alignItems: isMobile ? "flex-start" : "center",
justifyContent: "space-between",
flexWrap: "wrap",
gap: 14,
transition: "all 0.2s ease",
flexDirection: isMobile ? "column" : "row",
}}
>
<input
ref={bidPackageInputRef}
id="bid-package-upload"
type="file"
accept="application/pdf"
onChange={handlePdfUpload}
style={{ display: "none" }}
/>
{uploadState === "idle" && (
<>
<div
style={{
fontSize: 18,
fontWeight: 800,
color: "#0f172a",
}}
>
Upload Your Bid Package
</div>

<div
style={{
color: "#64748b",
fontSize: 14,
}}
>
Select your bid package PDF to begin analysis
</div>

<button
type="button"
onClick={openBidPackagePicker}
style={{
display: "inline-flex",
alignItems: "center",
justifyContent: "center",
padding: "13px 20px",
background: "#f97316",
color: "#fff",
borderRadius: 12,
border: "none",
fontSize: 15,
fontWeight: 800,
cursor: "pointer",
boxShadow: "0 8px 22px rgba(249, 115, 22, 0.28)",
}}
>
Choose PDF
</button>

<div
style={{
color: "#64748b",
fontSize: 13,
fontWeight: 500,
}}
>
{pdfFileName || "No file selected"}
</div>
</>
)}

{uploadState === "uploading" && (
<>
<div
style={{
fontSize: 18,
fontWeight: 800,
color: "#0f172a",
}}
>
Uploading your bid package...
</div>

<div
style={{
width: "100%",
maxWidth: 340,
height: 10,
background: "#e2e8f0",
borderRadius: 999,
overflow: "hidden",
}}
>
<div
style={{
width: `${uploadProgress}%`,
height: "100%",
background: "#f97316",
transition: "width 0.25s ease",
}}
/>
</div>

<div
style={{
color: "#64748b",
fontSize: 14,
fontWeight: 700,
}}
>
{uploadProgress}%
</div>
</>
)}

{uploadState === "success" && (
<>
<div
style={{
fontSize: 20,
fontWeight: 900,
color: "#166534",
}}
>
Upload Complete
</div>

<div
style={{
fontSize: 14,
color: "#64748b",
fontWeight: 500,
}}
>
{pdfFileName}
</div>

<button
type="button"
onClick={openBidPackagePicker}
style={{
marginTop: 6,
display: "inline-flex",
alignItems: "center",
justifyContent: "center",
padding: "11px 16px",
background: "#fff",
color: "#334155",
borderRadius: 10,
fontSize: 14,
fontWeight: 700,
cursor: "pointer",
border: "1px solid #e2e8f0",
}}
>
Upload a different file
</button>
</>
)}

{uploadDiagnosticTarget?.toLowerCase() === "e1644.pdf" && (
<div
style={{
width: "100%",
borderRadius: 14,
border: `1px solid ${uploadDiagnosticError ? "#fecaca" : "#cbd5e1"}`,
background: uploadDiagnosticError ? "#fff1f2" : "#f8fafc",
padding: "12px 14px",
display: "grid",
gap: 8,
}}
>
<div
style={{
fontSize: 13,
fontWeight: 800,
color: uploadDiagnosticError ? "#9f1239" : "#334155",
}}
>
Debug trace for e1644.pdf
</div>

{uploadDiagnosticStatus && (
  <div
    style={{
      fontSize: 13,
      color: uploadDiagnosticError ? "#9f1239" : "#475569",
      fontWeight: 700,
      lineHeight: 1.4,
    }}
  >
    Status: {uploadDiagnosticStatus}
  </div>
)}

{uploadDiagnosticError && (
  <div
    style={{
      fontSize: 13,
      color: "#be123c",
      fontWeight: 700,
      lineHeight: 1.4,
    }}
  >
    Error: {uploadDiagnosticError}
  </div>
)}

{uploadDiagnosticLines.length > 0 && (
  <div
    style={{
      display: "grid",
      gap: 4,
      maxHeight: 180,
      overflowY: "auto",
      fontSize: 12,
      color: "#475569",
      lineHeight: 1.45,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    }}
  >
    {uploadDiagnosticLines.map((line, index) => (
      <div key={`upload-diagnostic-${index}`}>{line}</div>
    ))}
  </div>
)}
</div>
)}
</div>
</div>
</div>
</div>

<div
style={{
background: "rgba(14, 35, 89, 0.78)",
border: "1px solid rgba(255,255,255,0.14)",
borderRadius: 24,
padding: isMobile ? 20 : 28,
boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
backdropFilter: "blur(8px)",
}}
>
<div
style={{
display: "flex",
alignItems: "center",
justifyContent: "space-between",
gap: 12,
marginBottom: 24,
flexWrap: "wrap",
}}
>
<div
style={{
fontSize: 20,
fontWeight: 800,
color: "#fff",
}}
>
Spring 2026 Bid Cycle
</div>

<div
style={{
background: "rgba(134, 239, 172, 0.16)",
color: "#dcfce7",
border: "1px solid rgba(134, 239, 172, 0.24)",
borderRadius: 999,
padding: "8px 14px",
fontSize: 15,
fontWeight: 700,
}}
>
Active
</div>
</div>

<div
style={{
display: "grid",
gridTemplateColumns: "1fr 1fr",
gap: isMobile ? 14 : 20,
marginBottom: 24,
}}
>
<div>
<div
style={{
fontSize: isMobile ? 34 : 42,
fontWeight: 800,
color: "#fff",
lineHeight: 1,
}}
>
{pdfPages.length > 0 ? jobPages.length : 0}
</div>
<div
style={{
marginTop: 8,
fontSize: 17,
color: "rgba(255,255,255,0.78)",
}}
>
Job pages detected
</div>
</div>

<div>
<div
style={{
fontSize: 42,
fontWeight: 800,
color: "#fff",
lineHeight: 1,
}}
>
{pdfPages.length > 0 ? realCrews.length : 0}
</div>
<div
style={{
marginTop: 8,
fontSize: 17,
color: "rgba(255,255,255,0.78)",
}}
>
Crews detected
</div>
</div>
</div>

<div
style={{
height: 1,
background: "rgba(255,255,255,0.14)",
marginBottom: 22,
}}
/>

<div
style={{
fontSize: 18,
lineHeight: 1.5,
color: "rgba(255,255,255,0.92)",
fontWeight: 500,
}}
>
{pdfFileName
? "Your package has been loaded and processed for ranking."
: "Upload a bid package to detect all crews and jobs in this cycle."}
</div>

{authUser && (
<div
style={{
marginTop: 18,
fontSize: 15,
color: "rgba(255,255,255,0.68)",
}}
>
Signed in as {authUser.email}
</div>
)}
</div>
</div>
</div>
</div>

<div
style={{
maxWidth: 1320,
margin: `${contentTopPull}px auto 0`,
padding: `0 ${pageHorizontalPadding}px 40px`,
}}
>
{parsedPreferences && (
<div
style={{
marginTop: 20,
background: "#ffffff",
borderRadius: 16,
padding: 20,
boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
border: "1px solid #e5e7eb",
}}
>
<div style={{ marginBottom: 10 }}>
<h2 style={{ margin: 0, fontSize: 22 }}>Your Preferences (AI Interpreted)</h2>
<div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
Grouped by terminal and prioritized in the order you requested
</div>
</div>

{promptRuleAnalysis?.issues && promptRuleAnalysis.issues.length > 0 && (
<div
style={{
marginTop: 14,
padding: 14,
borderRadius: 12,
background: "#fffbeb",
border: "1px solid #fcd34d",
}}
>
<div style={{ fontWeight: 800, marginBottom: 8, color: "#92400e" }}>
Interpretation Notes
</div>

<div style={{ display: "grid", gap: 6 }}>
{promptRuleAnalysis.issues.map((issue, index) => (
<div
key={`${issue.code}-${issue.terminal ?? "global"}-${index}`}
style={{
fontSize: 14,
color: issue.severity === "error" ? "#991b1b" : "#7c2d12",
fontWeight: issue.severity === "error" ? 700 : 600,
}}
>
{issue.terminal ? `${issue.terminal}: ` : ""}
{issue.message}
</div>
))}
</div>
</div>
)}

{parsedPreferences.filters?.length > 0 && (
<div
style={{
marginTop: 16,
padding: 14,
borderRadius: 12,
background: "#fff7ed",
border: "1px solid #fed7aa",
}}
>
<div style={{ fontWeight: 700, marginBottom: 6 }}>Applies Everywhere</div>

{Array.from(
  new Set(
    parsedPreferences.filters
      .map((f: any) => formatFilterLabel(f, parsedPreferences.filters))
      .filter(Boolean)
  )
).map((label, i) => (
  <div key={i} style={{ fontSize: 14, marginBottom: 4 }}>
    {label}
  </div>
))}
</div>
)}

<div
style={{
marginTop: 18,
display: "flex",
gap: 14,
overflowX: "auto",
paddingBottom: 6,
alignItems: "stretch",
scrollbarWidth: "thin",
}}
>
{parsedPreferences.scoped_preferences?.map((scope: any) => (
<div
key={scope.normalized_terminal}
style={{
padding: 16,
borderRadius: 14,
border: "1px solid #e5e7eb",
background: "#f9fafb",
minWidth: isMobile ? 240 : 290,
maxWidth: isMobile ? 280 : 340,
flex: isMobile ? "0 0 82vw" : "0 0 310px",
display: "flex",
flexDirection: "column",
boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
}}
>
<div
style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
marginBottom: 10,
gap: 10,
}}
>
<div style={{ fontWeight: 800, fontSize: 18 }}>
{scope.terminal}
</div>

<div
style={{
fontSize: 12,
background: "#e0f2fe",
color: "#0369a1",
padding: "4px 8px",
borderRadius: 999,
fontWeight: 600,
}}
>
Priority {scope.priority_rank}
</div>
</div>

{scope.filters?.some((f: any) => f.field === "on_duty") && (
<div style={{ marginBottom: 8 }}>
<div style={labelStyle}>Start Time</div>
{scope.filters
.filter((f: any) => f.field === "on_duty")
.map((f: any, i: number) => (
<div key={i}>{formatFilterLabel(f)}</div>
))}
</div>
)}

{scope.filters?.some((f: any) => f.field === "off_duty") && (
<div style={{ marginBottom: 8 }}>
<div style={labelStyle}>Finish Time</div>
{scope.filters
.filter((f: any) => f.field === "off_duty")
.map((f: any, i: number) => (
<div key={i}>{formatFilterLabel(f)}</div>
))}
</div>
)}

{scope.sort_preferences?.length > 0 && (
<div style={{ marginBottom: 8 }}>
<div style={labelStyle}>Preferences</div>
{scope.sort_preferences.map((s: any, i: number) => (
<div key={i}>{formatSortLabel(s)}</div>
))}
</div>
)}

{(scope.filters?.some(
  (f: any) =>
    f.field === "weekends_off_hard" &&
    f.operator === "=" &&
    f.value === true
) ||
(scope.required_days_off && scope.required_days_off.length > 0)) && (
<div>
<div style={labelStyle}>Days Off</div>

{scope.filters?.some(
  (f: any) =>
    f.field === "weekends_off_hard" &&
    f.operator === "=" &&
    f.value === true
) && (
<div style={{ marginBottom: 4 }}>Must have weekends off</div>
)}

{scope.required_days_off?.length > 0 && (
<div>
Must include:{" "}
{scope.required_days_off
.map((day: string) => day.charAt(0).toUpperCase() + day.slice(1))
.join(", ")}
</div>
)}
</div>
)}
</div>
))}
</div>
</div>
)}

{(rankedCrews.length > 0 || excludedCrews.length > 0) && (
  <div style={{ marginTop: 28 }}>
    {/* HEADER PANEL */}
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
        display: "grid",
        gap: 14,
      }}
    >
      <div
style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* LEFT TEXT AREA */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            minWidth: 0,
            flex: "1 1 420px",
            width: isMobile ? "100%" : undefined,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: manualCrewOrder.length > 0 ? "#fff7ed" : "#eff6ff",
              border:
                manualCrewOrder.length > 0
                  ? "1px solid #fed7aa"
                  : "1px solid #bfdbfe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isMobile ? 13 : 18,
              flexShrink: 0,
              padding: isMobile ? 4 : 0,
              textAlign: "center",
            }}
          >
            {manualCrewOrder.length > 0 ? "Reorder" : "Top"}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: manualCrewOrder.length > 0 ? "#ea580c" : "#2563eb",
                marginBottom: 6,
              }}
            >
              {manualCrewOrder.length > 0
                ? "Custom Ranking Active"
                : "Ranked Results"}
            </div>

            <div
              style={{
                fontSize: isMobile ? 22 : 26,
                fontWeight: 850,
                color: "#0f172a",
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
              }}
            >
              {manualCrewOrder.length > 0
                ? "Your Custom Crew Order"
                : "Top Picks for Your Preferences"}
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                color: manualCrewOrder.length > 0 ? "#64748b" : "#9a3412",
                fontWeight: manualCrewOrder.length > 0 ? 600 : 800,
                lineHeight: 1.5,
                maxWidth: 560,
                background: manualCrewOrder.length > 0 ? "transparent" : "#fff7ed",
                border: manualCrewOrder.length > 0 ? "none" : "1px solid #fed7aa",
                borderRadius: manualCrewOrder.length > 0 ? 0 : 12,
                padding: manualCrewOrder.length > 0 ? 0 : "10px 12px",
                display: manualCrewOrder.length > 0 ? "block" : "inline-flex",
                alignItems: manualCrewOrder.length > 0 ? undefined : "center",
                gap: manualCrewOrder.length > 0 ? undefined : 8,
              }}
            >
              {manualCrewOrder.length > 0
                ? "Custom order active - this list has been manually rearranged and no longer reflects the default ranking."
                : "Drag crew cards to reorder your list and build your final bid order."}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div
  style={{
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: isMobile ? "flex-start" : "flex-end",
    flex: "1 1 360px",
    width: isMobile ? "100%" : undefined,
  }}
>
  {manualCrewOrder.length > 0 && (
    <div
      style={{
        background: "#fff7ed",
        color: "#ea580c",
        border: "1px solid #fed7aa",
        borderRadius: 999,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      Custom Order Active
    </div>
  )}

  {preferenceChips.map((chip) => (
    <div
      key={chip}
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        background: "#e9eef5",
        color: "#334155",
        fontSize: 15,
        fontWeight: 700,
      }}
    >
      {chip}
    </div>
  ))}

  {manualCrewOrder.length > 0 && (
    <button
      type="button"
      onClick={handleResetOrder}
      style={{
        background: "#fff",
        color: "#334155",
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: "10px 14px",
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      Reset to Default Ranking
    </button>
  )}

  <div
    style={{
      marginTop: 4,
      padding: 14,
      borderRadius: 14,
      background: manualCrewOrder.length > 0 ? "#fff7ed" : "#eff6ff",
      border:
        manualCrewOrder.length > 0
          ? "1px solid #fed7aa"
          : "1px solid #bfdbfe",
      minWidth: isMobile ? 0 : 280,
      maxWidth: isMobile ? "100%" : 340,
      width: isMobile ? "100%" : undefined,
      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
    }}
  >
    <div
      style={{
        fontSize: 13,
        fontWeight: 800,
        color: manualCrewOrder.length > 0 ? "#9a3412" : "#1d4ed8",
        marginBottom: 6,
      }}
    >
      {manualCrewOrder.length > 0
        ? "Finished with your custom order?"
        : "Finished with your order?"}
    </div>

    <div
      style={{
        fontSize: 13,
        lineHeight: 1.45,
        color: manualCrewOrder.length > 0 ? "#7c2d12" : "#334155",
        marginBottom: 10,
      }}
    >
      {manualCrewOrder.length > 0
        ? "Save this final custom crew order to My Bids and email yourself a copy."
        : "Save your current ranked crew list to My Bids and email yourself a copy."}
    </div>

    <button
      type="button"
      onClick={handleGenerateList}
      style={{
        background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
        color: "#fff",
        border: "none",
        borderRadius: 12,
        padding: "13px 18px",
        fontWeight: 800,
        fontSize: 14,
        cursor: "pointer",
        boxShadow: "0 10px 24px rgba(249, 115, 22, 0.28)",
        whiteSpace: "nowrap",
        width: "100%",
      }}
    >
      Save to My Bids
    </button>
  </div>
</div>
      </div>

      {rankedCrews.length === 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 16,
            padding: 18,
            color: "#666",
          }}
        >
          No crews match your strict preferences. Try &quot;Include Anyway&quot; or adjust
          your filters.
        </div>
      )}
    </div>


    {/* CREW LIST */}
    <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
      {orderedVisibleRankedCrews.map((crew, index) => {
        const matchBadges = buildMatchBadges(crew.scoreBreakdown || []);
        const isExpanded = expandedCrewId === crew.id;

        return (
          <div
            key={`${crew.crew_number ?? crew.id ?? "crew"}-${index}`}
            draggable
            onDragStart={() => handleDragStart(crew.id)}
            onDragEnd={handleDragEnd}
          onDragOver={(e) => {
  e.preventDefault();
  setDragOverIndex(index);
}}
onDragLeave={() => setDragOverIndex(null)}
onDrop={() => {
  handleDropOnCrew(crew.id);
  setDragOverIndex(null);
}}
           style={{
  opacity: draggedCrewId === crew.id ? 0.55 : 1,
  transform: draggedCrewId === crew.id ? "scale(0.98)" : "scale(1)",
  boxShadow:
    draggedCrewId === crew.id
      ? "0 20px 40px rgba(0,0,0,0.15)"
      : "0 10px 26px rgba(15, 23, 42, 0.08)",
  
  transition: "all 0.15s ease",
}}
          >
            <div
              onClick={() => setExpandedCrewId(isExpanded ? null : crew.id)}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 18,
                background: "#fff",
                boxShadow: "0 10px 26px rgba(15, 23, 42, 0.08)",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: primaryCardColumns,
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#64748b",
                      letterSpacing: "0.04em",
                      marginBottom: 6,
                    }}
                  >
                    #{index + 1}
                  </div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 12px",
                      borderRadius: 10,
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      color: "#ea580c",
                      fontSize: isMobile ? 18 : 22,
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                  >
                    {crew.crew_number || "Unknown"}
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      color: "#64748b",
                      fontWeight: 600,
                      marginTop: 6,
                    }}
                  >
                    {formatTerminalDisplayName(crew.terminal)}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "stretch",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 132,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 4,
                        }}
                      >
                        Days Off
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#0f172a",
                          lineHeight: 1.35,
                        }}
                      >
                        {crew.is_two_week_stby
                          ? `${crew.week1?.days_off_list?.join(", ") || "-"} / ${
                              crew.week2?.days_off_list?.join(", ") || "-"
                            }`
                          : crew.days_off_list?.join(", ") || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: 96,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 4,
                        }}
                      >
                        Work
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {crew.work_time_weekly || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: 96,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 4,
                        }}
                      >
                        Operating
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {crew.operating_time_weekly || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: 84,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 4,
                        }}
                      >
                        OT
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {crew.overtime_weekly_text || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: 96,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 4,
                        }}
                      >
                        Split
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {crew.split_time_weekly || "-"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    {matchBadges.length > 0 ? (
                      matchBadges.map((badge, i) => (
                        <div
                          key={i}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "#ecfdf5",
                            border: "1px solid #a7f3d0",
                            color: "#166534",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {badge}
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No match notes
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMobile ? "stretch" : "flex-end",
                    gap: 10,
                    ...mobileActionRowStyle,
                  }}
                >
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
                    Score {Math.round(crew.score || 0)}
                  </div>

                  <button
                    type="button"
                    style={{
                      background: isExpanded ? "#ea580c" : "#f97316",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: "pointer",
                      minWidth: 110,
                      width: isMobile ? "calc(50% - 5px)" : undefined,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCrewId(isExpanded ? null : crew.id);
                    }}
                  >
                    {isExpanded ? "Hide Jobs" : "View Jobs"}
                  </button>

                  <button
                    type="button"
                    style={{
                      background: "#fff1f2",
                      color: "#be123c",
                      border: "1px solid #fecdd3",
                      borderRadius: 10,
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: "pointer",
                      minWidth: 110,
                      width: isMobile ? "calc(50% - 5px)" : undefined,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleManualExclude(crew.id);
                    }}
                  >
                    Exclude
                  </button>
                </div>
              </div>

              {expandedCrewId === crew.id && crew.daily?.length ? (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 14,
                    borderTop: "1px solid #e5e7eb",
                    display: "grid",
                    gap: 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <strong>
                    {crew.is_two_week_stby ? "2-Week Schedule" : "Daily Schedule"}
                  </strong>

                  {crew.daily.map((dayEntry: any, dayIndex: number) => {
                    const job = dayEntry.job_detail;
                    const displayedTimes = getDisplayedDayTimeRange(dayEntry);

                    return (
                      <div
                        key={`${dayEntry.day}-${dayIndex}`}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: "12px 14px",
                          background: "#f8fafc",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: expandedDayColumns,
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 800,
                                color: "#0f172a",
                                fontSize: 15,
                              }}
                            >
                              {dayEntry.day}
                            </div>

                            <div
                              style={{
                                marginTop: 4,
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "#eff6ff",
                                border: "1px solid #bfdbfe",
                                color: "#1d4ed8",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {dayEntry.job_no ? `Job ${dayEntry.job_no}` : "No Job"}
                            </div>
                          </div>

                          {dayEntry.is_day_off ? (
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#6b7280",
                              }}
                            >
                              Off
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                                alignItems: "stretch",
                              }}
                            >
                              <div
                                style={{
                                  minWidth: 120,
                                  background: "#fff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "#64748b",
                                    textTransform: "uppercase",
                                    marginBottom: 4,
                                  }}
                                >
                                  Time
                                </div>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#0f172a",
                                  }}
                                >
                                  {displayedTimes.onDuty ?? "?"} -{" "}
                                  {displayedTimes.offDuty ?? "?"}
                                </div>
                              </div>

                              <div
                                style={{
                                  minWidth: 88,
                                  background: "#fff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "#64748b",
                                    textTransform: "uppercase",
                                    marginBottom: 4,
                                  }}
                                >
                                  Duration
                                </div>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#0f172a",
                                  }}
                                >
                                  {job?.duration ?? dayEntry?.duration ?? "-"}
                                </div>
                              </div>

                              <div
                                style={{
                                  minWidth: 92,
                                  background: "#fff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "#64748b",
                                    textTransform: "uppercase",
                                    marginBottom: 4,
                                  }}
                                >
                                  Operating
                                </div>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#0f172a",
                                  }}
                                >
                                  {job?.operating_hours_daily ??
                                    dayEntry?.operating_hours_daily ??
                                    "-"}
                                </div>
                              </div>

                              <div
                                style={{
                                  minWidth: 78,
                                  background: "#fff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "#64748b",
                                    textTransform: "uppercase",
                                    marginBottom: 4,
                                  }}
                                >
                                  Van
                                </div>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#0f172a",
                                  }}
                                >
                                  {job?.van_hours_daily ?? dayEntry?.van_hours_daily ?? "-"}
                                </div>
                              </div>

                              <div
                                style={{
                                  minWidth: 78,
                                  background: "#fff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "#64748b",
                                    textTransform: "uppercase",
                                    marginBottom: 4,
                                  }}
                                >
                                  Split
                                </div>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: "#0f172a",
                                  }}
                                >
                                  {job?.split_time ?? dayEntry?.split_time ?? "-"}
                                </div>
                              </div>
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              justifyContent: isMobile ? "stretch" : "flex-end",
                              width: isMobile ? "100%" : undefined,
                            }}
                          >
                            {!dayEntry.is_day_off && job?.pdf_page_number != null ? (
                              <button
                                type="button"
                                style={{
                                  background: "#fff",
                                  color: "#334155",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: 10,
                                  padding: "9px 12px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                  width: isMobile ? "100%" : undefined,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewJob(job);
                                }}
                              >
                                View Job
                              </button>
                            ) : (
                              <div />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {crew.included_override && (
                <p style={{ marginTop: 10, color: "#9c6b00" }}>
                  Included (Override) - {crew.override_reason}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {hasFullAccess && excludedCrews.length > 0 && (
      <div style={{ marginTop: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 22,
                color: "#0f172a",
              }}
            >
              Excluded Crews
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 14,
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Grouped by terminal so you can quickly include specific crews back into the ranking.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowExcluded((prev) => !prev)}
            style={{
              background: "#fff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              padding: "10px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showExcluded
              ? `Hide Excluded (${excludedCrews.length})`
              : `Show Excluded (${excludedCrews.length})`}
          </button>
        </div>

        {showExcluded && (
          <div style={{ display: "grid", gap: 16 }}>
            {groupedExcludedCrews.map((group) => (
              (() => {
                const isExpanded = expandedExcludedTerminals.includes(group.terminal);

                return (
                  <div
                    key={group.terminal}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 16,
                      background: "#fff",
                      overflow: "hidden",
                      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExcludedTerminalGroup(group.terminal)}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        background: "#f8fafc",
                        border: "none",
                        borderBottom: isExpanded ? "1px solid #e5e7eb" : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 18,
                            color: "#0f172a",
                          }}
                        >
                          {group.terminal}
                        </div>
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                        >
                          {isExpanded ? "Hide" : "Show"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
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
                          {group.crews.length} excluded
                        </div>

                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 900,
                            color: "#334155",
                            minWidth: 18,
                            textAlign: "center",
                          }}
                        >
                          {isExpanded ? "âˆ’" : "+"}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div style={{ display: "grid", gap: 10, padding: 14 }}>
                        {group.crews.map((crew) => {
                          const isCrewExpanded = expandedExcludedCrewId === String(crew.id);

                          return (
                            <div
                              key={`excluded-grouped-${crew.id}`}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 18,
                                padding: 18,
                                background: "#fff",
                                boxShadow: "0 10px 26px rgba(15, 23, 42, 0.08)",
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: excludedCardColumns,
                                  gap: 16,
                                  alignItems: "start",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: "#64748b",
                                      letterSpacing: "0.04em",
                                      marginBottom: 6,
                                    }}
                                  >
                                    Excluded
                                  </div>

                                  <div
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      padding: "6px 12px",
                                      borderRadius: 10,
                                      background: "#fff7ed",
                                      border: "1px solid #fed7aa",
                                      color: "#ea580c",
                                      fontSize: isMobile ? 18 : 22,
                                      fontWeight: 900,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {crew.crew_number || crew.id || "Unknown"}
                                  </div>

                                  <div
                                    style={{
                                      fontSize: 14,
                                      color: "#64748b",
                                      fontWeight: 600,
                                      marginTop: 6,
                                    }}
                                  >
                                    {formatTerminalDisplayName(crew.terminal)}
                                  </div>
                                </div>

                                <div style={{ display: "grid", gap: 12 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      flexWrap: "wrap",
                                      alignItems: "stretch",
                                    }}
                                  >
                                    <div
                                      style={{
                                        minWidth: 132,
                                        background: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 12,
                                        padding: "10px 12px",
                                      }}
                                    >
                                      <div style={labelStyle}>Days Off</div>
                                      <div
                                        style={{
                                          fontSize: 14,
                                          fontWeight: 700,
                                          color: "#0f172a",
                                          lineHeight: 1.35,
                                        }}
                                      >
                                        {crew.is_two_week_stby
                                          ? `${crew.week1?.days_off_list?.join(", ") || "-"} / ${
                                              crew.week2?.days_off_list?.join(", ") || "-"
                                            }`
                                          : crew.days_off_list?.join(", ") || "-"}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        minWidth: 96,
                                        background: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 12,
                                        padding: "10px 12px",
                                      }}
                                    >
                                      <div style={labelStyle}>Work</div>
                                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                                        {crew.work_time_weekly || "-"}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        minWidth: 96,
                                        background: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 12,
                                        padding: "10px 12px",
                                      }}
                                    >
                                      <div style={labelStyle}>Operating</div>
                                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                                        {crew.operating_time_weekly || "-"}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        minWidth: 84,
                                        background: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 12,
                                        padding: "10px 12px",
                                      }}
                                    >
                                      <div style={labelStyle}>OT</div>
                                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                                        {crew.overtime_weekly_text || "-"}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        minWidth: 96,
                                        background: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 12,
                                        padding: "10px 12px",
                                      }}
                                    >
                                      <div style={labelStyle}>Split</div>
                                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                                        {crew.split_time_weekly || "-"}
                                      </div>
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      padding: "10px 12px",
                                      borderRadius: 12,
                                      background: "#fff1f2",
                                      border: "1px solid #fecdd3",
                                      color: "#9f1239",
                                      fontSize: 14,
                                      fontWeight: 700,
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    {crew.reason}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: isMobile ? "stretch" : "flex-end",
                                    gap: 10,
                                    ...mobileActionRowStyle,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedExcludedCrewId(
                                        isCrewExpanded ? null : String(crew.id)
                                      )
                                    }
                                    style={{
                                      background: isCrewExpanded ? "#ea580c" : "#f97316",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 10,
                                      padding: "10px 16px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      minWidth: 130,
                                      width: isMobile ? "calc(50% - 5px)" : undefined,
                                    }}
                                  >
                                    {isCrewExpanded ? "Hide Jobs" : "View Jobs"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleIncludeAnyway(String(crew.id))}
                                    style={{
                                      background: "#f0fdf4",
                                      color: "#166534",
                                      border: "1px solid #bbf7d0",
                                      borderRadius: 10,
                                      padding: "10px 16px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      whiteSpace: "nowrap",
                                      minWidth: 130,
                                      width: isMobile ? "calc(50% - 5px)" : undefined,
                                    }}
                                  >
                                    Include Anyway
                                  </button>
                                </div>
                              </div>

                              {isCrewExpanded && crew.daily?.length ? (
                                <div
                                  style={{
                                    marginTop: 16,
                                    paddingTop: 14,
                                    borderTop: "1px solid #e5e7eb",
                                    display: "grid",
                                    gap: 10,
                                  }}
                                >
                                  <strong>
                                    {crew.is_two_week_stby ? "2-Week Schedule" : "Daily Schedule"}
                                  </strong>

                                  {crew.daily.map((dayEntry: any, dayIndex: number) => {
                                    const job = dayEntry.job_detail;
                                    const displayedTimes = getDisplayedDayTimeRange(dayEntry);

                                    return (
                                      <div
                                        key={`${crew.id}-${dayEntry.day}-${dayIndex}`}
                                        style={{
                                          border: "1px solid #e5e7eb",
                                          borderRadius: 12,
                                          padding: "12px 14px",
                                          background: "#f8fafc",
                                          display: "grid",
                                          gap: 10,
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns: expandedDayColumns,
                                            gap: 12,
                                            alignItems: "center",
                                          }}
                                        >
                                          <div>
                                            <div
                                              style={{
                                                fontWeight: 800,
                                                color: "#0f172a",
                                                fontSize: 15,
                                              }}
                                            >
                                              {dayEntry.day}
                                            </div>

                                            <div
                                              style={{
                                                marginTop: 4,
                                                display: "inline-flex",
                                                alignItems: "center",
                                                padding: "4px 10px",
                                                borderRadius: 999,
                                                background: "#eff6ff",
                                                border: "1px solid #bfdbfe",
                                                color: "#1d4ed8",
                                                fontSize: 12,
                                                fontWeight: 800,
                                              }}
                                            >
                                              {dayEntry.job_no ? `Job ${dayEntry.job_no}` : "No Job"}
                                            </div>
                                          </div>

                                          {dayEntry.is_day_off ? (
                                            <div
                                              style={{
                                                fontSize: 14,
                                                fontWeight: 700,
                                                color: "#6b7280",
                                              }}
                                            >
                                              Off
                                            </div>
                                          ) : (
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: 10,
                                                flexWrap: "wrap",
                                                alignItems: "stretch",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  minWidth: 120,
                                                  background: "#fff",
                                                  border: "1px solid #e2e8f0",
                                                  borderRadius: 10,
                                                  padding: "8px 10px",
                                                }}
                                              >
                                                <div style={labelStyle}>Time</div>
                                                <div
                                                  style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {displayedTimes.onDuty ?? "?"} -{" "}
                                                  {displayedTimes.offDuty ?? "?"}
                                                </div>
                                              </div>

                                              <div
                                                style={{
                                                  minWidth: 88,
                                                  background: "#fff",
                                                  border: "1px solid #e2e8f0",
                                                  borderRadius: 10,
                                                  padding: "8px 10px",
                                                }}
                                              >
                                                <div style={labelStyle}>Duration</div>
                                                <div
                                                  style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {job?.duration ?? dayEntry?.duration ?? "-"}
                                                </div>
                                              </div>

                                              <div
                                                style={{
                                                  minWidth: 92,
                                                  background: "#fff",
                                                  border: "1px solid #e2e8f0",
                                                  borderRadius: 10,
                                                  padding: "8px 10px",
                                                }}
                                              >
                                                <div style={labelStyle}>Operating</div>
                                                <div
                                                  style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {job?.operating_hours_daily ??
                                                    dayEntry?.operating_hours_daily ??
                                                    "-"}
                                                </div>
                                              </div>

                                              <div
                                                style={{
                                                  minWidth: 78,
                                                  background: "#fff",
                                                  border: "1px solid #e2e8f0",
                                                  borderRadius: 10,
                                                  padding: "8px 10px",
                                                }}
                                              >
                                                <div style={labelStyle}>Van</div>
                                                <div
                                                  style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {job?.van_hours_daily ?? dayEntry?.van_hours_daily ?? "-"}
                                                </div>
                                              </div>

                                              <div
                                                style={{
                                                  minWidth: 78,
                                                  background: "#fff",
                                                  border: "1px solid #e2e8f0",
                                                  borderRadius: 10,
                                                  padding: "8px 10px",
                                                }}
                                              >
                                                <div style={labelStyle}>Split</div>
                                                <div
                                                  style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {job?.split_time ?? dayEntry?.split_time ?? "-"}
                                                </div>
                                              </div>
                                            </div>
                                          )}

                                          <div
                                            style={{
                                              display: "flex",
                                              justifyContent: isMobile ? "stretch" : "flex-end",
                                              width: isMobile ? "100%" : undefined,
                                            }}
                                          >
                                            {!dayEntry.is_day_off && job?.pdf_page_number != null ? (
                                              <button
                                                type="button"
                                                style={{
                                                  background: "#fff",
                                                  color: "#334155",
                                                  border: "1px solid #cbd5e1",
                                                  borderRadius: 10,
                                                  padding: "9px 12px",
                                                  fontWeight: 700,
                                                  cursor: "pointer",
                                                  whiteSpace: "nowrap",
                                                  width: isMobile ? "100%" : undefined,
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleViewJob(job);
                                                }}
                                              >
                                                View Job
                                              </button>
                                            ) : (
                                              <div />
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            ))}
          </div>
        )}
      </div>
    )}
  </div>
)}

{manuallyExcludedCrewIds.length > 0 && (
<div style={{ marginTop: 24 }}>
<div
style={{
fontWeight: 800,
fontSize: 18,
marginBottom: 12,
color: "#0f172a",
}}
>
Manually Excluded Crews
</div>

<div style={{ display: "grid", gap: 12 }}>
{rankedCrews
.filter((crew) => manuallyExcludedCrewIds.includes(crew.id))
.map((crew) => (
<div
key={`excluded-${crew.id}`}
style={{
border: "1px solid #e5e7eb",
borderRadius: 14,
padding: 16,
background: "#fff",
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: 12,
flexWrap: "wrap",
}}
>
<div>
<div
style={{
fontWeight: 800,
fontSize: 16,
color: "#0f172a",
}}
>
Crew {crew.crew_number || "Unknown"}
</div>
<div
style={{
marginTop: 4,
fontSize: 14,
color: "#64748b",
}}
>
{formatTerminalDisplayName(crew.terminal)} - manually excluded
</div>
</div>

<button
type="button"
style={{
background: "#f0fdf4",
color: "#166534",
border: "1px solid #bbf7d0",
borderRadius: 10,
padding: "10px 16px",
fontWeight: 700,
cursor: "pointer",
}}
onClick={() => handleManualRestore(crew.id)}
>
Restore
</button>
</div>
))}
</div>
</div>
)}

{!hasFullAccess &&
rankedCrews.length > 0 &&
fullIncludedCount > rankedCrews.length && (
<div style={{ marginTop: 30 }}>
<div style={{ fontWeight: 800, fontSize: isMobile ? 16 : 18, marginBottom: 12 }}>
Locked Results ({fullIncludedCount - rankedCrews.length} more crews)
</div>

<div style={{ display: "grid", gap: 12 }}>
  {Array.from({
    length: Math.min(3, fullIncludedCount - rankedCrews.length),
  }).map((_, i) => (
    <div
      key={i}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 18,
        background: "#f8fafc",
        opacity: 0.7,
        filter: "blur(2px)",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700 }}>Crew ####</div>
      <div style={{ fontSize: 13, color: "#64748b" }}>
        Hidden Terminal
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          marginTop: 14,
          fontSize: 14,
          color: "#334155",
        }}
      >
        <div>
          <strong>Days Off:</strong> -- / --
        </div>
        <div>
          <strong>Work Time:</strong> --:--
        </div>
        <div>
          <strong>Operating:</strong> --:--
        </div>
        <div>
          <strong>OT:</strong> --:--
        </div>
        <div>
          <strong>Split:</strong> --:--
        </div>
      </div>
    </div>
  ))}
</div>

<div
  style={{
    marginTop: 20,
    padding: isMobile ? 16 : 20,
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    background: "#fff",
    textAlign: "center",
  }}
>
  <div style={{ fontWeight: 800, fontSize: isMobile ? 16 : 18 }}>
    See your full ranking, excluded crews, and why
  </div>

  <div style={{ marginTop: 6, color: "#555" }}>
    Get the edge before bidding closes
  </div>

  <button
    type="button"
    style={{
      marginTop: 16,
      background: "#f97316",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "12px 20px",
      fontWeight: 800,
      cursor: "pointer",
      width: isMobile ? "100%" : undefined,
    }}
    onClick={handleUnlockCheckout}
  >
    Unlock Full Analysis - $9.99
  </button>

  <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
    Risk-Free First Unlock - refund within 24 hours
  </div>
</div>
</div>
)}

</div>
</div>

);
}

