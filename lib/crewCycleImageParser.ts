
import { createWorker, PSM } from "tesseract.js";


type ParsedCycleDay = {
  day: string;
  day_index: number;
  job_no: string | null;
  is_day_off: boolean;
  on_duty?: string | null;
  off_duty?: string | null;
  duration?: string | null;
};
type ParsedCycleWeek = {
  label: "Week 1" | "Week 2";
  daily: ParsedCycleDay[];
  jobs: string[];
  days_off: string[];
  days_off_list: string[];
};
type ParsedCycleRow = {
  crew_id: string;
  crew_code: string;
  terminal: string;

  // existing shape stays
  daily: ParsedCycleDay[];
  jobs: string[];
  days_off: string[];
  days_off_list: string[];
  days_off_count: number;
  works_weekends: boolean;

  // STBY-only extension
  week1?: ParsedCycleWeek;
  week2?: ParsedCycleWeek;
  is_two_week_stby?: boolean;

  raw_cells?: Record<string, string>;
};



const COLUMN_MAP = {
  code: { left: 0.051, width: 0.035 },
  crew: { left: 0.086, width: 0.045 },
  sun: { left: 0.131, width: 0.090 },
  mon: { left: 0.221, width: 0.095 },
  tue: { left: 0.316, width: 0.095 },
  wed: { left: 0.411, width: 0.0901 },
  thu: { left: 0.5011, width: 0.090 },
  fri: { left: 0.5911, width: 0.100 },
  sat: { left: 0.6911, width: 0.085 },
};
type CycleTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CycleTextPage = {
  pageNumber: number;
  width: number;
  height: number;
  items: CycleTextItem[];
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function parseCrewCycleFromTextPages(
  pages: CycleTextPage[]
): ParsedCycleRow[] {
  const parsedRows: ParsedCycleRow[] = [];
 
 for (const page of pages) {
  const pageTextPreview = Array.isArray((page as any)?.items)
    ? (page as any).items.map((item: any) => String(item.str || "")).join(" ")
    : "";

  if (/BD_D/i.test(pageTextPreview)) {
    console.log("BRADFORD PAGE FOUND IN parseCrewCycleFromTextPages", {
      pageNumber: (page as any).pageNumber,
      itemCount: (page as any).items?.length,
      preview: pageTextPreview.slice(0, 1000),
    });
  }

  const pageRows = parseSingleCycleTextPage(page);

  if (/BD_D/i.test(pageTextPreview)) {
    console.log("BRADFORD PAGE PARSED ROWS", pageRows);
  }

  parsedRows.push(...pageRows);
}

 

  return dedupeRowsByCrewId(parsedRows);
}
function isKnownCrewCodeToken(text: string): boolean {
  const upper = text.trim().toUpperCase();

  return (
    /^[A-Z]{2,}(?:_[A-Z0-9]+)+$/.test(upper) ||
    /^(STBY|LR_D|ML_D|AE_D|BD_D|SH_D|RH_D|LI_D|WH_D|WB_D|WB_UP_D)$/.test(upper)
  );
}

function isLikelyCrewCycleTextPage(page: CycleTextPage): boolean {
  const cleanedItems = page.items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      ...item,
      str: item.str.trim(),
    }));

  if (!cleanedItems.length) return false;

  const leftBandItems = cleanedItems.filter(
    (item) =>
      item.x >= page.width * 0.03 &&
      item.x <= page.width * 0.26
  );

  const crewCodeCount = leftBandItems.filter((item) =>
    isKnownCrewCodeToken(item.str)
  ).length;

  const crewNumberCount = leftBandItems.filter((item) =>
    /^\d{4}$/.test(item.str)
  ).length;

  const rowAnchorCandidates = leftBandItems.filter((item) => {
    const text = item.str.toUpperCase();

    return (
      /^\d{4}$/.test(text) ||
      isKnownCrewCodeToken(text) ||
      /\b\d{4}\b/.test(text)
    );
  });

  const rowAnchorCount = clusterYPositions(
    rowAnchorCandidates.map((item) => item.y),
    3.5
  ).length;

  // Require multiple row-like signals so random pages do not slip through.
  const hasEnoughCrewCodes = crewCodeCount >= 3;
  const hasEnoughCrewNumbers = crewNumberCount >= 3;
  const hasEnoughRowAnchors = rowAnchorCount >= 5;

  return (
    hasEnoughRowAnchors &&
    (hasEnoughCrewCodes || hasEnoughCrewNumbers)
  );
}
function parseSingleCycleTextPage(page: CycleTextPage): ParsedCycleRow[] {
  if (!isLikelyCrewCycleTextPage(page)) {
    console.log("REJECTED NON-CYCLE PAGE", page.pageNumber);
    return [];
  }

  console.log("ACCEPTED CYCLE PAGE", page.pageNumber);

  const cleanedItems = page.items
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .map((item) => ({
      ...item,
      str: item.str.trim(),
    }));
const bdItems = cleanedItems.filter((item) =>
  /BD|_D|Bradford/i.test(String(item.str || ""))
);

if (bdItems.length) {
  console.log(
    "BRADFORD PAGE RAW ITEMS",
    bdItems.map((item) => ({
      text: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    }))
  );
}
  // Widen the left-side anchor band slightly so we don't miss real rows
  // when crew ids / crew codes drift or merge in the PDF text layer.
  const leftBandItems = cleanedItems.filter(
    (item) => item.x >= page.width * 0.03 && item.x <= page.width * 0.24
  );

  const anchorCandidates = leftBandItems.filter((item) => {
    const text = item.str.trim().toUpperCase();

    // Standalone crew numbers
    if (/^\d{4,5}$/.test(text)) return true;

    // Crew numbers embedded in merged tokens
    if (/\b\d{4,5}\b/.test(text)) return true;

    // Cycle / crew code tokens on the left side
    if (/^[A-Z]{2,}(?:_[A-Z0-9]+)+$/.test(text)) return true;

    // Exact known cycle-code style anchors
    if (/^(STBY|LR_D|ML_D|AE_D|BD_D|SH_D|RH_D|LI_D|WH_D|WB_D|WB_UP_D)$/.test(text)) {
      return true;
    }

    return false;
  });

  const rowAnchors = clusterYPositions(
    anchorCandidates.map((item) => item.y),
    3.5
  ).sort((a, b) => b - a);

  const rows: ParsedCycleRow[] = [];

  function mergeAdjacentRowItems<
    T extends { str: string; x: number; y: number; width?: number; height?: number }
  >(items: T[]): T[] {
    if (!items.length) return items;

    const sorted = [...items].sort((a, b) => a.x - b.x);
    const merged: T[] = [];

    for (const item of sorted) {
      const current = { ...item };
      const prev = merged[merged.length - 1];

      if (!prev) {
        merged.push(current);
        continue;
      }

      const prevRight = prev.x + (prev.width ?? 0);
      const gap = current.x - prevRight;

      const stbyMergeContext =
        prev.str?.toUpperCase().includes("STBY") ||
        current.str?.toUpperCase().includes("STBY");

      const sameRow = Math.abs(current.y - prev.y) <= (stbyMergeContext ? 8 : 2.5);

      const prevStr = (prev.str || "").trim();
      const currStr = (current.str || "").trim();

      const prevLooksMergeable = /^[A-Za-z0-9_():\-]+$/.test(prevStr);
      const currLooksMergeable = /^[A-Za-z0-9_():\-]+$/.test(currStr);

      const closeEnough = gap >= -1 && gap <= 6;

      if (sameRow && closeEnough && prevLooksMergeable && currLooksMergeable) {
        prev.str = `${prevStr}${currStr}` as T["str"];
        prev.width = (current.x + (current.width ?? 0)) - prev.x;
        prev.height = Math.max(prev.height ?? 0, current.height ?? 0) as T["height"];
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  for (const anchorY of rowAnchors) {
    const isPotentialSTBYBand = leftBandItems.some(
      (left) =>
        Math.abs(left.y - anchorY) <= 2.8 &&
        left.str.trim().toUpperCase() === "STBY"
    );

    const tolerance = isPotentialSTBYBand ? 8 : 2.8;

    const rowItems = cleanedItems
      .filter((item) => Math.abs(item.y - anchorY) <= tolerance)
      .sort((a, b) => a.x - b.x);

    if (!rowItems.length) continue;

  const mergedItems = mergeAdjacentRowItems(rowItems);

console.log(
  "LEFT BAND MERGED ROW",
  mergedItems.map((item: any) => item.str)
);

if (
  mergedItems.some((item: any) =>
    /B|D|BD|_D/.test(String(item.str || "").toUpperCase())
  )
) {
  console.log(
    "BRADFORD CANDIDATE ROW DEBUG",
    mergedItems.map((item: any) => ({
      text: item.str,
      x: item.x,
      y: item.y,
    }))
  );
}

const parsed = parseSingleRowFromSortedItems(mergedItems);

if (parsed) {
  const finalParsed =
    parsed.crew_code === "STBY"
      ? enrichStandbyRowFromNearbyItems(parsed, cleanedItems, anchorY)
      : parsed;

  rows.push(finalParsed);
}
  }

  return rows;
}
function attachJobDetailsToRow(
  row: any,
  jobLookupMap: Record<string, any>
) {
  if (!row || !row.jobs || !row.daily) return row;

  const enrichedDaily = row.daily.map((day: any, index: number) => {
    const jobNo = row.jobs[index];

    if (!jobNo || jobNo === "OFF") {
      return {
        ...day,
        job_no: null,
        job_detail: null,
      };
    }

    const jobDetail = jobLookupMap[jobNo] || null;

    return {
      ...day,
      job_no: jobNo,
      job_detail: jobDetail,
    };
  });

  return {
  ...row,
  daily: enrichedDaily,

  // 🔥 PRESERVE STBY STRUCTURE
  is_two_week_stby: row.is_two_week_stby,
  week1: row.week1,
  week2: row.week2,
};
}
function extractSummaryTokens(tokens: string[]): string[] {
  return tokens
    .map((t) => (t || "").trim())
    .filter(Boolean)
    .filter((t) => {
      // drop obvious day-cell job tokens like 22204 (08:09)
      if (/^\d{4,5}\s*\(\d{1,2}:\d{2}\)$/.test(t)) return false;

      // drop plain 5-digit job numbers
      if (/^\d{5}$/.test(t)) return false;

      // keep real summary values
      if (/^\d{1,2}$/.test(t)) return true;        // days off count
      if (/^\d{1,2}:\d{2}$/.test(t)) return true;  // weekly totals
      if (/^\d{4}$/.test(t)) return true;          // compressed totals like 3116

      return false;
    });
}
function enrichStandbyRowFromNearbyItems(
  parsed: ParsedCycleRow,
  cleanedItems: CycleTextItem[],
  anchorY: number
): ParsedCycleRow {
  if (parsed.crew_code !== "STBY") return parsed;

  const nearbyItems = cleanedItems
    .filter((item) => {
      const dy = item.y - anchorY;
      return dy >= -2 && dy <= 12;
    })
    .map((item) => ({
      text: item.str.trim(),
      x: item.x,
      y: item.y,
    }))
    .filter((item) => item.text)
    .sort((a, b) => a.x - b.x);

  if (!nearbyItems.length) return parsed;

  const minX = Math.min(...nearbyItems.map((i) => i.x));
  const maxX = Math.max(...nearbyItems.map((i) => i.x));
  const span = Math.max(1, maxX - minX);

  const codeBandEnd = minX + span * 0.18;
  const crewBandEnd = minX + span * 0.32;

  const payloadItems = nearbyItems.filter((item) => item.x > crewBandEnd);
  if (!payloadItems.length) return parsed;

  const payloadMinX = Math.min(...payloadItems.map((i) => i.x));
  const payloadMaxX = Math.max(...payloadItems.map((i) => i.x));
  const payloadSpan = Math.max(1, payloadMaxX - payloadMinX);

  // Build 14 approximate day anchors across the payload band
  const dayAnchors = Array.from({ length: 14 }, (_, index) => {
    return payloadMinX + (index + 0.5) * (payloadSpan / 14);
  });

  // Only keep likely STBY timing tokens
  const timeLikeItems = payloadItems.filter((item) => {
    const text = item.text.trim();

    if (/^\(\d{1,2}:\d{2}\)$/.test(text)) {
      return true;
    }

    if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(text)) {
      return true;
    }

    if (/^\d{1,2}:\d{2}$/.test(text)) {
      const [hh, mm] = text.split(":").map(Number);

      // keep only real clock times, not weekly totals like 84:00 or 31:16
      if (
        Number.isFinite(hh) &&
        Number.isFinite(mm) &&
        hh >= 0 &&
        hh <= 23 &&
        mm >= 0 &&
        mm <= 59
      ) {
        return true;
      }
    }

    return false;
  });

  const dayBuckets: string[][] = Array.from({ length: 14 }, () => []);

  for (const item of timeLikeItems) {
    let closestDay = 0;
    let closestDist = Infinity;

    for (let i = 0; i < dayAnchors.length; i++) {
      const dist = Math.abs(item.x - dayAnchors[i]);
      if (dist < closestDist) {
        closestDist = dist;
        closestDay = i;
      }
    }

       // Keep threshold reasonably tight so text doesn't bleed into the wrong day
    if (closestDist <= payloadSpan / 16) {
      dayBuckets[closestDay].push(item.text);
      console.log("STBY ASSIGNED", {
  text: item.text,
  assignedDay: closestDay,
  closestDist,
});
    } else {
      console.log("STBY MISSED TIME TOKEN", {
        text: item.text,
        x: item.x,
        closestDay,
        closestDist,
        threshold: payloadSpan / 16,
      });
    }
  }

   const enrichDay = (day: ParsedCycleDay, index: number): ParsedCycleDay => {
  const tokens = dayBuckets[index] ?? [];
  if (!tokens.length) return day;

  const joined = tokens.join(" ");
  const timeRangeMatch = joined.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const plainTimes = joined.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  const durationMatch = joined.match(/\((\d{1,2}:\d{2})\)/);

  let on_duty: string | null = day.on_duty ?? null;
  let off_duty: string | null = day.off_duty ?? null;

  if (timeRangeMatch) {
    on_duty = timeRangeMatch[1] ?? null;
    off_duty = timeRangeMatch[2] ?? null;
  } else if (plainTimes.length >= 2) {
    on_duty = plainTimes[0] ?? null;
    off_duty = plainTimes[1] ?? null;
  }

  return {
    ...day,
    on_duty,
    off_duty,
    duration: durationMatch?.[1] ?? day.duration ?? null,
  };
};
const enrichedDailyInitial = parsed.daily.map((day, index) => enrichDay(day, index));

const buildJobMap = (days: ParsedCycleDay[]) => {
  const map = new Map<
    string,
    { on_duty: string | null; off_duty: string | null; duration: string | null }
  >();

  for (const d of days) {
    if (d.job_no && (d.on_duty || d.off_duty || d.duration)) {
      map.set(d.job_no, {
        on_duty: d.on_duty ?? null,
        off_duty: d.off_duty ?? null,
        duration: d.duration ?? null,
      });
    }
  }

  return map;
};

const week1Map = buildJobMap(enrichedDailyInitial.slice(0, 7));
const week2Map = buildJobMap(enrichedDailyInitial.slice(7, 14));

const enrichedDaily = enrichedDailyInitial.map((day, index) => {
  if (!day.job_no) return day;

  const hasBothTimes = day.on_duty && day.off_duty;
  if (hasBothTimes) return day;

  const map = index < 7 ? week1Map : week2Map;
  const fallback = map.get(day.job_no);
  if (!fallback) return day;

  return {
    ...day,
    on_duty: day.on_duty ?? fallback.on_duty,
    off_duty: day.off_duty ?? fallback.off_duty,
    duration: day.duration ?? fallback.duration,
  };
});
const enrichedWeek1 = parsed.week1
  ? {
      ...parsed.week1,
      daily: enrichedDaily.slice(0, 7),
    }
  : parsed.week1;

const enrichedWeek2 = parsed.week2
  ? {
      ...parsed.week2,
      daily: enrichedDaily.slice(7, 14),
    }
  : parsed.week2;

return {
  ...parsed,
  daily: enrichedDaily,
  week1: enrichedWeek1,
  week2: enrichedWeek2,
};
}
function parseSingleRowFromSortedItems(
  rowItems: CycleTextItem[]
): ParsedCycleRow | null {
  const normalizedItems = rowItems
    .map((i) => ({
      text: i.str.trim(),
      x: i.x,
      y: i.y,
    }))
    .filter((i) => i.text)
    .sort((a, b) => a.x - b.x);

  if (!normalizedItems.length) return null;

  const normalizedStrings = normalizedItems.map((i) => i.text);

  const minX = Math.min(...normalizedItems.map((i) => i.x));
  const maxX = Math.max(...normalizedItems.map((i) => i.x));
  const span = Math.max(1, maxX - minX);

  // Approximate row bands based on horizontal span.
  // Left band = crew code area
  // Next band = crew number area
  const codeBandEnd = minX + span * 0.18;
  const crewBandEnd = minX + span * 0.32;

  const isKnownCrewCodeToken = (text: string) => {
    const upper = text.trim().toUpperCase();

    return (
      /^[A-Z]{2,}(?:_[A-Z0-9]+)+$/.test(upper) ||
      /^(STBY|LR_D|ML_D|AE_D|BD_D|SH_D|RH_D|LI_D|WH_D|WB_D|WB_UP_D)$/.test(upper)
    );
  };

  // Find crew code from the far-left/code area first, then fallback to anywhere in row.
  const crewCodeItem =
    normalizedItems.find(
      (item) => item.x <= codeBandEnd && isKnownCrewCodeToken(item.text)
    ) ||
    normalizedItems.find((item) => isKnownCrewCodeToken(item.text));

  const rawCrewCode = crewCodeItem?.text || "";
  const crew_code = normalizeCrewCode(rawCrewCode) || "UNKNOWN";

  if (crew_code === "CREW" || crew_code === "CODE") return null;

  // Crew number must be a 4-digit token, not a 5-digit job number.
  // Prefer the token in the crew-number band and to the right of crew code.
  const crewIdCandidates = normalizedItems.filter((item) => {
    if (!/^\d{4}$/.test(item.text)) return false;
    if (crewCodeItem && item.x <= crewCodeItem.x) return false;
    return item.x <= crewBandEnd;
  });

  const crewIdItem =
    crewIdCandidates[0] ||
    normalizedItems.find((item, idx) => {
      // fallback: exact 4-digit token among the left-most few row tokens
      return idx <= 5 && /^\d{4}$/.test(item.text);
    });

  if (!crewIdItem) return null;

  const crew_id = crewIdItem.text;

  // Everything to the right of crew number is the usable row payload
  const afterCrew = normalizedItems
    .filter((item) => item.x > crewIdItem.x)
    .map((i) => i.text);

   const isSTBY = crew_code === "STBY";

  const dayTexts = isSTBY
    ? extractFourteenDayCells(afterCrew)
    : extractSevenDayCells(afterCrew);

  const consumedDayCount = isSTBY
    ? countConsumedDayTokens(afterCrew, 14)
    : countConsumedDayTokens(afterCrew, 7);

  const summaryStartIndex = isSTBY ? 14 : 7;
  const summaryTokens = extractSummaryTokens(afterCrew.slice(summaryStartIndex));

  const raw_cells: Record<string, string> = {
    code: rawCrewCode,
    crew: crew_id,

    // Week 1
    sun: dayTexts[0] ?? "",
    mon: dayTexts[1] ?? "",
    tue: dayTexts[2] ?? "",
    wed: dayTexts[3] ?? "",
    thu: dayTexts[4] ?? "",
    fri: dayTexts[5] ?? "",
    sat: dayTexts[6] ?? "",

    // Week 2 (STBY only)
    sun2: dayTexts[7] ?? "",
    mon2: dayTexts[8] ?? "",
    tue2: dayTexts[9] ?? "",
    wed2: dayTexts[10] ?? "",
    thu2: dayTexts[11] ?? "",
    fri2: dayTexts[12] ?? "",
    sat2: dayTexts[13] ?? "",

    days_off_count: summaryTokens[0] ?? "",
    work_time_weekly: summaryTokens[1] ?? "",
    overtime_weekly: summaryTokens[2] ?? "",
    topup_weekly: summaryTokens[3] ?? "",
    split_time_weekly: summaryTokens[4] ?? "",
    operating_time_weekly: normalizeSummaryTime(summaryTokens[5] ?? ""),
  };

  if (crew_id === "2225" || crew_id === "1804" || crew_id === "2924") {
    console.log("SUMMARY DEBUG", {
      crew_id,
      crew_code,
      afterCrew,
      summaryTokens,
      raw_cells,
    });
  }

  const buildDay = (
    label: string,
    index: number,
    raw: string
  ): ParsedCycleDay => {
    const normalized = normalizeTextDayCell(raw);

    let on_duty: string | null = null;
    let off_duty: string | null = null;
    let duration: string | null = null;

    if (isSTBY && raw) {
      const timeRangeMatch = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (timeRangeMatch) {
        on_duty = timeRangeMatch[1];
        off_duty = timeRangeMatch[2];
      }

      const durationMatch = raw.match(/\((\d{1,2}:\d{2})\)/);
      if (durationMatch) {
        duration = durationMatch[1];
      }
    }

    return {
      day: label,
      day_index: index,
      job_no: normalized.job_no,
      is_day_off: normalized.is_day_off,
      on_duty,
      off_duty,
      duration,
    };
  };

  const week1Daily: ParsedCycleDay[] = DAY_KEYS.map((dayKey, index) =>
    buildDay(
      dayKey.charAt(0).toUpperCase() + dayKey.slice(1),
      index,
      raw_cells[dayKey] ?? ""
    )
  );

  const week2Keys = ["sun2", "mon2", "tue2", "wed2", "thu2", "fri2", "sat2"] as const;
  const week2Labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const week2Daily: ParsedCycleDay[] = isSTBY
    ? week2Keys.map((dayKey, index) =>
        buildDay(week2Labels[index], index + 7, raw_cells[dayKey] ?? "")
      )
    : [];

  const daily: ParsedCycleDay[] = isSTBY ? [...week1Daily, ...week2Daily] : week1Daily;
if (crew_code !== "STBY") {
  console.log("NON STBY DAILY LENGTH", crew_id, daily.length);
}

if (crew_code === "STBY") {
  console.log("STBY DAILY LENGTH", crew_id, daily.length);
}
  if (crew_code === "STBY") {
    console.log("STBY DAILY FINAL", daily);
    console.log("STBY RAW CELLS", raw_cells);
  }

  const jobs = daily
    .map((d) => d.job_no)
    .filter((v): v is string => Boolean(v));

  const days_off = daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day.toLowerCase());

  const days_off_list = daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day);

  const week1Jobs = week1Daily
    .map((d) => d.job_no)
    .filter((v): v is string => Boolean(v));

  const week1DaysOff = week1Daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day.toLowerCase());

  const week1DaysOffList = week1Daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day);

  const week2Jobs = week2Daily
    .map((d) => d.job_no)
    .filter((v): v is string => Boolean(v));

  const week2DaysOff = week2Daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day.toLowerCase());

  const week2DaysOffList = week2Daily
    .filter((d) => d.is_day_off)
    .map((d) => d.day);

  const parsedDaysOffCount = Number(summaryTokens[0]);
  const days_off_count = Number.isFinite(parsedDaysOffCount)
    ? parsedDaysOffCount
    : days_off_list.length;
if (crew_code === "STBY") {
  console.log("STBY WEEK 1 RAW", {
    sun: raw_cells.sun,
    mon: raw_cells.mon,
    tue: raw_cells.tue,
    wed: raw_cells.wed,
    thu: raw_cells.thu,
    fri: raw_cells.fri,
    sat: raw_cells.sat,
  });

  console.log("STBY WEEK 2 RAW", {
    sun2: raw_cells.sun2,
    mon2: raw_cells.mon2,
    tue2: raw_cells.tue2,
    wed2: raw_cells.wed2,
    thu2: raw_cells.thu2,
    fri2: raw_cells.fri2,
    sat2: raw_cells.sat2,
  });

  console.log("STBY WEEK 1 DAYS OFF", week1DaysOffList);
  console.log("STBY WEEK 2 DAYS OFF", week2DaysOffList);
}
  return {
    crew_id,
    crew_code,
    terminal: inferTerminalFromCode(crew_code),
    daily,
    jobs,
    days_off,
    days_off_list,
    days_off_count,
    works_weekends: !(days_off.includes("sat") && days_off.includes("sun")),
    raw_cells,

    is_two_week_stby: isSTBY,
    week1: {
      label: "Week 1",
      daily: week1Daily,
      jobs: week1Jobs,
      days_off: week1DaysOff,
      days_off_list: week1DaysOffList,
    },
    week2: isSTBY
      ? {
          label: "Week 2",
          daily: week2Daily,
          jobs: week2Jobs,
          days_off: week2DaysOff,
          days_off_list: week2DaysOffList,
        }
      : undefined,
  };
}

function extractFourteenDayCells(tokens: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < tokens.length && result.length < 14) {
    const current = tokens[i]?.trim() ?? "";
    const next = tokens[i + 1]?.trim() ?? "";
    const next2 = tokens[i + 2]?.trim() ?? "";

    if (!current) {
      i++;
      continue;
    }

    if (current.toUpperCase() === "OFF") {
      result.push("OFF");
      i++;
      continue;
    }

    if (
      /^\d{4,6}$/.test(current) &&
      /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(next) &&
      /^\(\d{1,2}:\d{2}\)$/.test(next2)
    ) {
      result.push(`${current} ${next} ${next2}`);
      i += 3;
      continue;
    }

    if (/^\d{3,6}\s*\(\d{1,2}:\d{2}\)$/.test(current)) {
      result.push(current);
      i++;
      continue;
    }

    if (/^\d{3,6}$/.test(current) && /^\(\d{1,2}:\d{2}\)$/.test(next)) {
      result.push(`${current} ${next}`);
      i += 2;
      continue;
    }

    if (/^\d{3,6}$/.test(current)) {
      if (current.length < 4) {
        i++;
        continue;
      }

      result.push(current);
      i++;
      continue;
    }

    const embeddedJob = current.match(/\b\d{3,6}\b/);
    if (embeddedJob) {
      result.push(current);
      i++;
      continue;
    }

    i++;
  }

  while (result.length < 14) {
    result.push("");
  }

  return result.slice(0, 14);
}

function countConsumedDayTokens(tokens: string[], dayLimit = 7): number {
  let consumed = 0;
  let daysFound = 0;
  let i = 0;

  while (i < tokens.length && daysFound < dayLimit) {
    const current = tokens[i]?.trim() ?? "";
    const next = tokens[i + 1]?.trim() ?? "";
    const next2 = tokens[i + 2]?.trim() ?? "";

    if (!current) {
      i++;
      consumed++;
      continue;
    }

    if (current.toUpperCase() === "OFF") {
      i++;
      consumed++;
      daysFound++;
      continue;
    }

    if (
      /^\d{4,6}$/.test(current) &&
      /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(next) &&
      /^\(\d{1,2}:\d{2}\)$/.test(next2)
    ) {
      i += 3;
      consumed += 3;
      daysFound++;
      continue;
    }

    if (/^\d{3,6}\s*\(\d{1,2}:\d{2}\)$/.test(current)) {
      i++;
      consumed++;
      daysFound++;
      continue;
    }

    if (/^\d{3,6}$/.test(current) && /^\(\d{1,2}:\d{2}\)$/.test(next)) {
      i += 2;
      consumed += 2;
      daysFound++;
      continue;
    }

    if (/^\d{3,6}$/.test(current)) {
      i++;
      consumed++;
      daysFound++;
      continue;
    }

    if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(current)) {
      i++;
      consumed++;
      continue;
    }

    if (/^\d{1,2}:\d{2}$/.test(current)) {
      i++;
      consumed++;
      continue;
    }

    const embeddedJob = current.match(/\b\d{3,6}\b/);
    if (embeddedJob) {
      i++;
      consumed++;
      daysFound++;
      continue;
    }

    i++;
    consumed++;
  }

  return consumed;
}

function normalizeSummaryTime(raw: string): string {
  const text = raw.trim();

  if (!text) return "";

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return text;
  }

  // Handles values like 3116 -> 31:16
  if (/^\d{4}$/.test(text)) {
    return `${text.slice(0, 2)}:${text.slice(2)}`;
  }

  return text;
}

function extractSevenDayCells(tokens: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < tokens.length && result.length < 7) {
    const current = tokens[i]?.trim() ?? "";
    const next = tokens[i + 1]?.trim() ?? "";
    const next2 = tokens[i + 2]?.trim() ?? "";

    if (!current) {
      i++;
      continue;
    }

    // OFF is a complete cell
    if (current.toUpperCase() === "OFF") {
      result.push("OFF");
      i++;
      continue;
    }

    // STBY-style full cell split across 3 tokens:
    // 19240 | 07:00 - 15:00 | (08:00)
    if (
      /^\d{4,6}$/.test(current) &&
      /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(next) &&
      /^\(\d{1,2}:\d{2}\)$/.test(next2)
    ) {
      result.push(`${current} ${next} ${next2}`);
      i += 3;
      continue;
    }

    // Job number with duration as one token like 5006 (10:10)
    if (/^\d{3,6}\s*\(\d{1,2}:\d{2}\)$/.test(current)) {
      result.push(current);
      i++;
      continue;
    }

    // Sometimes split into ["5006", "(10:10)"]
    if (/^\d{3,6}$/.test(current) && /^\(\d{1,2}:\d{2}\)$/.test(next)) {
      result.push(`${current} ${next}`);
      i += 2;
      continue;
    }

    // Standalone job number
    if (/^\d{3,6}$/.test(current)) {
      // HARD RULE: jobs are always 4+ digits
      if (current.length < 4) {
        i++;
        continue;
      }

      result.push(current);
      i++;
      continue;
    }

    // Ignore obvious time ranges and summary numbers
    if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(current)) {
      i++;
      continue;
    }

    if (/^\d{1,2}:\d{2}$/.test(current)) {
      i++;
      continue;
    }

    // If token contains a job number anywhere, take the whole token
    // so we preserve possible STBY timing info if present inline
    const embeddedJob = current.match(/\b\d{3,6}\b/);
    if (embeddedJob) {
      result.push(current);
      i++;
      continue;
    }

    i++;
  }

  while (result.length < 7) {
    result.push("");
  }

  return result.slice(0, 7);
}
function clusterYPositions(values: number[], tolerance: number): number[] {
  if (!values.length) return [];

  const sorted = [...values].sort((a, b) => b - a);
  const clusters: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const value = sorted[i];
    const currentCluster = clusters[clusters.length - 1];
    const avg =
      currentCluster.reduce((sum, v) => sum + v, 0) / currentCluster.length;

    if (Math.abs(value - avg) <= tolerance) {
      currentCluster.push(value);
    } else {
      clusters.push([value]);
    }
  }

  return clusters.map(
    (cluster) => cluster.reduce((sum, v) => sum + v, 0) / cluster.length
  );
}

function normalizeTextDayCell(raw: string): {
  job_no: string | null;
  is_day_off: boolean;
} {
  const text = (raw || "").trim();

  if (!text) {
    return { job_no: null, is_day_off: true };
  }

  const upper = text.toUpperCase();

  // Only explicit OFF counts as off
  if (upper === "OFF") {
    return { job_no: null, is_day_off: true };
  }

  // Prefer real job numbers first
  // GO jobs = 5 digits
  // UP jobs = 5 digits starting with 5
  const jobMatch = text.match(/\b\d{5}\b/);
  if (jobMatch) {
    return { job_no: jobMatch[0], is_day_off: false };
  }

  // If cell has content but no clean 5-digit job number,
  // do NOT call it OFF. It is safer to treat as worked/unknown.
  return { job_no: null, is_day_off: false };
}
export async function parseCrewCycleFromImages(
  images: string[]
): Promise<ParsedCycleRow[]> {


  const parsedRows: ParsedCycleRow[] = [];

  for (const imageSrc of images) {
    const canvas = await loadImageToCanvasForDebug(imageSrc);
    const rows = detectCycleRows(canvas);
    const overlayRows = buildOverlayRows(rows);

    for (const row of overlayRows) {
      const rowCanvas = cropCanvas(
        canvas,
        0,
        Math.max(0, Math.floor(row.top)),
        canvas.width,
        Math.max(1, Math.floor(row.height))
      );

      const rawCells = await extractRowCells(rowCanvas);

      const crew_id = normalizeCrewId(rawCells.crew);
      const crew_code = normalizeCrewCode(rawCells.code);

      if (!crew_id) {
        continue;
      }

      const isSTBY = crew_code === "STBY";

const daily: ParsedCycleDay[] = DAY_KEYS.map((dayKey, index) => {
  const raw = rawCells[dayKey] ?? "";
  const normalized = normalizeDayCell(raw);

  let on_duty: string | null = null;
  let off_duty: string | null = null;
  let duration: string | null = null;

  // 🔥 STBY ONLY: extract times from raw cell text
  if (isSTBY && raw) {
    const timeMatch = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (timeMatch) {
      on_duty = timeMatch[1];
      off_duty = timeMatch[2];
    }

    const durationMatch = raw.match(/\((\d{1,2}:\d{2})\)/);
    if (durationMatch) {
      duration = durationMatch[1];
    }
  }

  return {
    day: dayKey.charAt(0).toUpperCase() + dayKey.slice(1),
    day_index: index,
    job_no: normalized.job_no,
    is_day_off: normalized.is_day_off,

    // 🔽 added safely (won’t affect non-STBY)
    on_duty,
    off_duty,
    duration,
  };
});

      const jobs = daily
        .map((d) => d.job_no)
        .filter((v): v is string => Boolean(v));

      const days_off = daily
        .filter((d) => d.is_day_off)
        .map((d) => d.day.toLowerCase());

      parsedRows.push({
        crew_id,
        crew_code: crew_code || "UNKNOWN",
        terminal: inferTerminalFromCode(crew_code || ""),
        daily,
        jobs,
        days_off,
        works_weekends: !(days_off.includes("sat") && days_off.includes("sun")),
        raw_cells: rawCells,
        days_off_list: [],
        days_off_count: 0,
      });
    }
  }



  if (!parsedRows.length) {
    return [
      {
        crew_id: "1001",
        crew_code: "WH_D",
        terminal: "WRMF",
        daily: [],
        jobs: [],
        days_off: [],
        works_weekends: false,
        days_off_list: [],
        days_off_count: 0,
      },
    ];
  }

  return dedupeRowsByCrewId(parsedRows);
}

export async function loadImageToCanvasForDebug(
  src: string
): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = src;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context failed");
  }

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  return canvas;
}

export function detectCycleRows(
  canvas: HTMLCanvasElement
): { top: number; height: number }[] {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const scanXStart = Math.floor(width * 0.03);
  const scanXEnd = Math.floor(width * 0.97);

  const darkRatios: number[] = [];

  for (let y = 0; y < height; y++) {
    let darkPixels = 0;
    let totalPixels = 0;

    for (let x = scanXStart; x < scanXEnd; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const brightness = (r + g + b) / 3;

      if (brightness < 170) {
        darkPixels++;
      }

      totalPixels++;
    }

    darkRatios.push(totalPixels ? darkPixels / totalPixels : 0);
  }

  const smoothed: number[] = [];
  const radius = 2;

  for (let y = 0; y < darkRatios.length; y++) {
    let sum = 0;
    let count = 0;

    for (let k = -radius; k <= radius; k++) {
      const yy = y + k;
      if (yy >= 0 && yy < darkRatios.length) {
        sum += darkRatios[yy];
        count++;
      }
    }

    smoothed.push(count ? sum / count : 0);
  }

  const lineThreshold = 0.08;
  const rawLines: number[] = [];

  for (let y = 0; y < smoothed.length; y++) {
    if (smoothed[y] >= lineThreshold) {
      rawLines.push(y);
    }
  }

  const collapsedLines: number[] = [];
  const mergeGap = 4;

  for (const y of rawLines) {
    const last = collapsedLines[collapsedLines.length - 1];
    if (last === undefined || y - last > mergeGap) {
      collapsedLines.push(y);
    }
  }

  const rows: { top: number; height: number }[] = [];

  for (let i = 0; i < collapsedLines.length - 1; i++) {
    const topLine = collapsedLines[i];
    const bottomLine = collapsedLines[i + 1];

    const bandTop = topLine + 4;
    const bandHeight = bottomLine - topLine - 1;

    if (bandHeight >= 18 && bandHeight <= 80) {
      rows.push({
        top: bandTop,
        height: bandHeight,
      });
    }
  }

  if (!rows.length) {
    
    return [];
  }

  const heights = rows.map((r) => r.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];

  const filteredRows = rows.filter(
    (r) => Math.abs(r.height - medianHeight) <= 12
  );



  return filteredRows;
}

function buildOverlayRows(
  rows: { top: number; height: number }[]
): { top: number; height: number }[] {
  const overlayRows: { top: number; height: number }[] = [];

  if (!rows.length) {
   
    return overlayRows;
  }

  const sorted = [...rows].sort((a, b) => a.top - b.top);

  const heights = sorted.map((r) => r.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    let top = current.top;
    let height = current.height;

    if (next) {
      const gap = next.top - current.top;

      if (gap > 10 && gap < 120) {
        height = gap - 2;
      }
    }

    if (Math.abs(height - medianHeight) > 12) {
      height = medianHeight;
    }

    overlayRows.push({
      top,
      height,
    });
  }

  const last = overlayRows[overlayRows.length - 1];

  if (last) {
    for (let i = 0; i < 8; i++) {
      overlayRows.push({
        top: last.top + last.height * (i + 1),
        height: last.height,
      });
    }
  }

 

  return overlayRows;
}

let ocrWorkerPromise: Promise<any> | null = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789():- ",
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }

  return ocrWorkerPromise;
}

async function extractRowCells(rowCanvas: HTMLCanvasElement): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const [key, col] of Object.entries(COLUMN_MAP)) {
    const cellCanvas = cropCanvas(
      rowCanvas,
      Math.floor(rowCanvas.width * col.left),
      0,
      Math.max(1, Math.floor(rowCanvas.width * col.width)),
      rowCanvas.height
    );

    result[key] = await readCellText(cellCanvas, key);
  }

  
 return result;
}

async function readCellText(
  canvas: HTMLCanvasElement,
  key: string
): Promise<string> {
  const worker = await getOcrWorker();

  const prepped = preprocessCellForOcr(canvas, key);

  const {
    data: { text },
  } = await worker.recognize(prepped);

  return normalizeOcrText(text, key);
}

function preprocessCellForOcr(
  source: HTMLCanvasElement,
  key: string
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get OCR preprocess canvas context");
  }

  const scale = 3;
  canvas.width = source.width * scale;
  canvas.height = source.height * scale;

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const value = brightness < 200 ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);

  // For day cells, crop upper part where the job number usually lives.
  if (
    key === "sun" ||
    key === "mon" ||
    key === "tue" ||
    key === "wed" ||
    key === "thu" ||
    key === "fri" ||
    key === "sat"
  ) {
    const dayCanvas = document.createElement("canvas");
    const dayCtx = dayCanvas.getContext("2d");

    if (!dayCtx) {
      throw new Error("Could not get day OCR canvas context");
    }

    dayCanvas.width = canvas.width;
    // Only grab TOP 35% of the cell (job number area)
dayCanvas.height = Math.floor(canvas.height * 0.5);

dayCtx.drawImage(
  canvas,
  0,
  0,
  canvas.width,
  dayCanvas.height,
  0,
  0,
  canvas.width,
  dayCanvas.height
);

    return dayCanvas;
  }

  return canvas;
}

function normalizeOcrText(text: string, key: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (!cleaned) return "";

  if (
    key === "sun" ||
    key === "mon" ||
    key === "tue" ||
    key === "wed" ||
    key === "thu" ||
    key === "fri" ||
    key === "sat"
  ) {
    const upper = cleaned.toUpperCase();

    if (
      upper.includes("OFF") ||
      upper === "OF" ||
      upper === "OFE" ||
      upper === "0FF"
    ) {
      return "OFF";
    }

    const numberMatch = cleaned.match(/\b\d{3,6}\b/);
    if (numberMatch) {
      return numberMatch[0];
    }

    return "";
  }

  if (key === "crew") {
    const numberMatch = cleaned.match(/\b\d{3,6}\b/);
    return numberMatch ? numberMatch[0] : "";
  }

  if (key === "code") {
    const codeMatch = cleaned
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "")
      .match(/[A-Z]{2,5}_?[A-Z]?/);

    return codeMatch ? codeMatch[0] : "";
  }

  return "";
}
function normalizeCrewId(raw: string): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

function normalizeCrewCode(raw: string): string | null {
  if (!raw) return null;

  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .trim();

  if (!cleaned) return null;

  // Preserve full cycle codes like:
  // WB_UP_D, LR_D, ML_D, AE_D, BD_D, SH_D, RH_D, LI_D, WH_D, STBY
  const match = cleaned.match(/[A-Z0-9]+(?:_[A-Z0-9]+)*/);
  return match ? match[0] : null;
}
function normalizeDayCell(raw: string): {
  job_no: string | null;
  is_day_off: boolean;
} {
  if (!raw) {
    return { job_no: null, is_day_off: true };
  }

  if (raw === "OFF") {
    return { job_no: null, is_day_off: true };
  }

  const numberMatch = raw.match(/\b\d{3,6}\b/);
  if (numberMatch) {
    return { job_no: numberMatch[0], is_day_off: false };
  }

  return { job_no: null, is_day_off: true };
}
const TERMINAL_MAP: Record<string, string> = {
    STBY: "Willowbrook",
    LR_D: "Lewis Road",
    ML_D: "Milton",
    AE_D: "Barrie",
    BD_D: "Bradford",
    SH_D: "Kitchener",
    RH_D: "Richmond Hill",
    LI_D: "Lincolnville",
    WH_D: "WRMF",
    WB_UP: "Willowbrook",
    WB_D: "Willowbrook",
    
};


function inferTerminalFromCode(code?: string): string {
  if (!code) return "Unknown";
  if (code?.toUpperCase().includes("WB")) {
  console.log("TERMINAL DEBUG", {
    original: code,
    upper: code?.toUpperCase().trim(),
  });
}

  const upper = code.toUpperCase().trim();

  for (const key in TERMINAL_MAP) {
    if (upper.startsWith(key)) return TERMINAL_MAP[key];
  }

  return "Unknown";
}

function cropCanvas(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Crop canvas failed");
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);

  return canvas;
}

function dedupeRowsByCrewId(rows: ParsedCycleRow[]): ParsedCycleRow[] {
  const map = new Map<string, ParsedCycleRow>();

  for (const row of rows) {
    if (!map.has(row.crew_id)) {
      map.set(row.crew_id, row);
    }
  }

  return Array.from(map.values());

  
}
