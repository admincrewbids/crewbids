function timeToHours(value) {
  if (!value || typeof value !== "string" || !value.includes(":")) return undefined;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h + m / 60;
}

function round1(n) {
  return typeof n === "number" ? Math.round(n * 10) / 10 : undefined;
}

function lineIndicatesShuttle(line) {
  if (typeof line !== "string") return false;

  return (
    /shuttle\s*bus/i.test(line) ||
    /^shuttle\b/i.test(line) ||
    /\bshuttle\b.*\b\d{1,2}:\d{2}\b/i.test(line)
  );
}

const DAY_ALIASES = {
  sunday: "Sun",
  sun: "Sun",
  monday: "Mon",
  mon: "Mon",
  tuesday: "Tue",
  tue: "Tue",
  tues: "Tue",
  wednesday: "Wed",
  wed: "Wed",
  thursday: "Thu",
  thu: "Thu",
  thur: "Thu",
  thurs: "Thu",
  friday: "Fri",
  fri: "Fri",
  saturday: "Sat",
  sat: "Sat",
};

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeOnlyText(text) {
  return text.replace(/\bO\s*N\s*L\s*Y\b/gi, "ONLY");
}

function normalizeDayName(value) {
  if (!value || typeof value !== "string") return null;
  return DAY_ALIASES[value.trim().toLowerCase()] || null;
}

function expandDayRange(start, end) {
  const startIndex = DAY_ORDER.indexOf(start);
  const endIndex = DAY_ORDER.indexOf(end);

  if (startIndex === -1 || endIndex === -1) return [];

  const days = [];
  let index = startIndex;

  while (true) {
    days.push(DAY_ORDER[index]);
    if (index === endIndex) break;
    index = (index + 1) % DAY_ORDER.length;
  }

  return days;
}

function parseDayTokenList(value) {
  const dayNamePattern =
    /sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat/gi;

  return Array.from(value.matchAll(dayNamePattern))
    .map((match) => normalizeDayName(match[0]))
    .filter(Boolean);
}

function parseDayScopeFromText(text) {
  if (!text || typeof text !== "string") return null;

  const normalized = normalizeOnlyText(text).replace(/[\u2013\u2014]/g, "-");

  if (!/\bonly\b/i.test(normalized)) return null;

  const beforeOnly = normalized.split(/\bonly\b/i)[0].toLowerCase();
  const scopes = [];

  if (/\bweekdays?\b/.test(beforeOnly)) {
    scopes.push(...["Mon", "Tue", "Wed", "Thu", "Fri"]);
  }

  if (/\bweekends?\b/.test(beforeOnly)) {
    scopes.push(...["Sat", "Sun"]);
  }

  const dayNamePattern =
    "(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)";

  const rangeRegex = new RegExp(
    "\\b" + dayNamePattern + "\\b\\s*(?:-|to|through|thru)\\s*\\b" + dayNamePattern + "\\b",
    "gi"
  );

  let rangeMatch;
  while ((rangeMatch = rangeRegex.exec(beforeOnly)) !== null) {
    const start = normalizeDayName(rangeMatch[1]);
    const end = normalizeDayName(rangeMatch[2]);
    scopes.push(...expandDayRange(start, end));
  }

  const listDays = parseDayTokenList(beforeOnly);
  scopes.push(...listDays);

  if (!scopes.length) return null;

  return Array.from(new Set(scopes));
}

function parseJobSheetText(text, pageNumber) {
  const jobs = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let currentJob = null;
  let pendingDayScope = null;

  for (const line of lines) {
    const lineDayScope = parseDayScopeFromText(line);

    if (lineDayScope && !currentJob) {
      pendingDayScope = lineDayScope;
    }

    const jobNoMatch = line.match(/job\s*no\.?\s*:\s*(\d{4,6})/i);
    if (jobNoMatch) {
      if (currentJob) jobs.push(currentJob);

      currentJob = {
        job_no: jobNoMatch[1],
        pdf_page_number: pageNumber,
        split_time: null,
        has_shuttle_bus: false,
        applicable_days: pendingDayScope,
        day_scope_label: pendingDayScope ? pendingDayScope.join(", ") : null,
        raw_text: "",
      };

      pendingDayScope = null;
    }

    if (!currentJob) continue;

    currentJob.raw_text = currentJob.raw_text
      ? currentJob.raw_text + "\n" + line
      : line;

    if (lineDayScope && currentJob) {
      const merged = new Set([
        ...(currentJob.applicable_days || []),
        ...lineDayScope,
      ]);
      currentJob.applicable_days = Array.from(merged);
      currentJob.day_scope_label = currentJob.applicable_days.join(", ");
    }

    const startMatch = line.match(/job\s*start\s*:\s*(\d{1,2}:\d{2})/i);
    if (startMatch) {
      currentJob.on_duty = startMatch[1];
    }

    const endMatch = line.match(/job\s*end\s*:\s*(\d{1,2}:\d{2})/i);
    if (endMatch) {
      currentJob.off_duty = endMatch[1];
    }

    const durationMatch = line.match(/duration\s*:\s*(\d{1,2}:\d{2})/i);
    if (durationMatch) {
      currentJob.duration = durationMatch[1];
    }

    const operatingMatch = line.match(
      /operating\s*time\s*:\s*(\d{1,2}:\d{2})/i
    );
    if (operatingMatch) {
      currentJob.operating_hours_daily = round1(
        timeToHours(operatingMatch[1])
      );
    }

    const vanDirectMatch = line.match(
      /van(?:\s*time)?\s*:\s*(\d{1,2}:\d{2})/i
    );
    if (vanDirectMatch) {
      currentJob.van_hours_daily = round1(timeToHours(vanDirectMatch[1]));
    }

    const vanRowMatch = line.match(/^VAN\b.*?(\d{1,2}:\d{2})$/i);
    if (vanRowMatch && currentJob.van_hours_daily == null) {
      currentJob.van_hours_daily = round1(timeToHours(vanRowMatch[1]));
    }

    const splitTimeMatch =
      line.match(/split\s*time\s*:\s*(\d{1,2}:\d{2})/i) ||
      line.match(/split\s*time\s+(\d{1,2}:\d{2})/i) ||
      line.match(/^split\s*time\b.*?(\d{1,2}:\d{2})$/i);

    if (splitTimeMatch) {
      currentJob.split_time = splitTimeMatch[1];
    }

    if (lineIndicatesShuttle(line)) {
      currentJob.has_shuttle_bus = true;
    }

    const timeRangeMatch = line.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (timeRangeMatch) {
      if (!currentJob.on_duty) currentJob.on_duty = timeRangeMatch[1];
      if (!currentJob.off_duty) currentJob.off_duty = timeRangeMatch[2];
    }
  }

  if (currentJob) jobs.push(currentJob);

  return jobs;
}

module.exports = { parseJobSheetText, parseDayScopeFromText };
