export type ParsedSpareboardJob = {
  crew_id: string;
  job_no: string;
  on_duty: string | null;
  off_duty: string | null;
  days_off_count: number | null;
  days_off_list: string[];
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function normalizeDaysOff(text: string): string[] {
  const lower = text.toLowerCase();

  const map: Record<string, string> = {
    sun: "Sunday",
    sunday: "Sunday",
    mon: "Monday",
    monday: "Monday",
    tue: "Tuesday",
    tues: "Tuesday",
    tuesday: "Tuesday",
    wed: "Wednesday",
    weds: "Wednesday",
    wednesday: "Wednesday",
    thu: "Thursday",
    thur: "Thursday",
    thurs: "Thursday",
    thursday: "Thursday",
    fri: "Friday",
    friday: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
  };

  const found: string[] = [];

  for (const [key, full] of Object.entries(map)) {
    const re = new RegExp(`\\b${key}\\b`, "i");
    if (re.test(lower) && !found.includes(full)) {
      found.push(full);
    }
  }

  return DAY_NAMES.filter((d) => found.includes(d));
}

function extractTimesNearIndex(lines: string[], startIndex: number) {
  const window = lines.slice(startIndex, Math.min(startIndex + 8, lines.length)).join(" ");
  const times = window.match(/\b\d{1,2}:\d{2}\b/g) ?? [];

  return {
    on_duty: times[0] ?? null,
    off_duty: times[1] ?? null,
  };
}

function extractDaysOffNearIndex(lines: string[], startIndex: number) {
  const windowLines = lines.slice(startIndex, Math.min(startIndex + 8, lines.length));
  const joined = windowLines.join(" ");

  const parsedDays = normalizeDaysOff(joined);

  const countMatch =
    joined.match(/days\s*off\s*:?\s*(\d{1,2})/i) ||
    joined.match(/\b(\d)\s+days?\s+off\b/i);

  return {
    days_off_list: parsedDays,
    days_off_count: countMatch ? Number(countMatch[1]) : parsedDays.length || null,
  };
}

export function parseSpareboardDescriptions(
  pages: string[]
): ParsedSpareboardJob[] {
  const jobs: ParsedSpareboardJob[] = [];

  for (const pageText of pages) {
    const text = pageText || "";
    if (!/QCTO\s*\/\s*CTO\s*\/\s*CSA\s*SPAREBOARD/i.test(text)) continue;

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const jobLine = lines.find((line) => /^JOB\s*#/i.test(line));
    const onDutyLabelIndex = lines.findIndex((line) => /^On Duty$/i.test(line));
    const offDutyLabelIndex = lines.findIndex((line) => /^Off Duty$/i.test(line));
    const daysOffLine = lines.find((line) => /^Days Off\b/i.test(line));

    if (!jobLine || onDutyLabelIndex === -1 || offDutyLabelIndex === -1 || !daysOffLine) {
      continue;
    }

    const jobNumbers = (jobLine.match(/\b3\d{3}\b/g) ?? []).map(String);

    const onDutyLine =
      onDutyLabelIndex > 0 ? lines[onDutyLabelIndex - 1] : "";
    const offDutyLine =
      offDutyLabelIndex > 0 ? lines[offDutyLabelIndex - 1] : "";

    const onDutyValues = onDutyLine.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
    const offDutyValues = offDutyLine.match(/\b\d{1,2}:\d{2}\b/g) ?? [];

    const daysOffRaw = daysOffLine.replace(/^Days Off\s*/i, "").trim();
    const daysOffValues =
      daysOffRaw.match(
        /\b(?:Sat\/Sun|Mon\/Tues|Wed\/Thurs|Sun\/Mon|Tue\/Wed|Thu\/Fri|Fri\/Sat)\b/gi
      ) ?? [];

    const maxLen = Math.max(
      jobNumbers.length,
      onDutyValues.length,
      offDutyValues.length,
      daysOffValues.length
    );

    for (let i = 0; i < maxLen; i++) {
      const crewId = jobNumbers[i];
      if (!crewId) continue;

      const rawDaysOff = daysOffValues[i] ?? "";
      const days_off_list = normalizeDaysOff(rawDaysOff);

      jobs.push({
        crew_id: crewId,
        job_no: crewId,
        on_duty: onDutyValues[i] ?? null,
        off_duty: offDutyValues[i] ?? null,
        days_off_count: days_off_list.length || null,
        days_off_list,
      });
    }
  }

  const deduped = new Map<string, ParsedSpareboardJob>();

  for (const job of jobs) {
    if (!job.crew_id) continue;

    const existing = deduped.get(job.crew_id);

    if (!existing) {
      deduped.set(job.crew_id, job);
      continue;
    }

    deduped.set(job.crew_id, {
      crew_id: job.crew_id,
      job_no: job.job_no,
      on_duty: existing.on_duty ?? job.on_duty,
      off_duty: existing.off_duty ?? job.off_duty,
      days_off_count: existing.days_off_count ?? job.days_off_count,
      days_off_list:
        existing.days_off_list.length > 0
          ? existing.days_off_list
          : job.days_off_list,
    });
  }

  return Array.from(deduped.values());
}