const text = `
WH_D 1001 Off 10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
10001 (06:56)
03:58 - 10:54
Off 2 34:40 00:00 05:20 00:00 00:00 27:10

WH_D 1002 Off 10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
10002 (06:54)
04:28 - 11:22
Off 2 34:30 00:00 05:30 00:00 00:00 23:45
`;

function isCrewStart(line) {
  return /^[A-Z_]+\s+\d{3,6}/.test(line);
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseCrewBlock(blockLines) {
  const firstLine = blockLines[0];
  const lastLine = blockLines[blockLines.length - 1];

  const firstMatch = firstLine.match(/^([A-Z_]+)\s+(\d{3,6})\s+(.*)$/);
  if (!firstMatch) return null;

  const crew_code = firstMatch[1];
  const crew_id = firstMatch[2];
  // extract the 7 day tokens from first line
// grab all lines except the last summary line
const contentLines = blockLines;

// keep only lines that contain Off or a job(duration)
// ignore time lines like 03:58 - 10:54
const tokenLines = contentLines.filter(line =>
  line.includes("Off") || /\d+\s*\(\d{2}:\d{2}\)/.test(line)
);

// join them together, then extract all day tokens
const combinedTokenText = tokenLines.join(" ");
const dayTokens = combinedTokenText.match(/Off|\d+\s*\(\d{2}:\d{2}\)/g) || [];

console.log("DAY TOKENS:", dayTokens);

// only keep the first 7, because Sun-Mon-Tue-Wed-Thu-Fri-Sat
const sevenDayTokens = dayTokens.slice(0, 7);

const daily = sevenDayTokens.map((token, index) => {
  return {
    day: DAYS[index],
    is_day_off: token === "Off",
    job_no: token === "Off" ? null : token.match(/^(\d+)/)?.[1]
  };
});
const days_off = daily
  .filter(d => d.is_day_off)
  .map(d => d.day);

const works_weekends = daily.some(
  d => (d.day === "Sat" || d.day === "Sun") && !d.is_day_off
);
  // extract job tokens from first line
const firstLineJobs = firstLine.match(/Off|\d+\s*\(\d{2}:\d{2}\)/g) || [];

// extract job tokens from rest of block
const otherLines = blockLines.slice(1, -1);

let jobs = [];

for (const line of otherLines) {
  const match = line.match(/^(\d+)\s*\(\d{2}:\d{2}\)/);
  if (match) {
    jobs.push(match[1]);
  }
}
const is_up_express =
  crew_id.startsWith("5") ||
  jobs.some(j => j.startsWith("5"));
  const summaryMatch = lastLine.match(
    /(\d+)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})$/
  );

  if (!summaryMatch) return null;

  const days_off_count = Number(summaryMatch[1]);
  const work_time = summaryMatch[2];
  const overtime = summaryMatch[3];
  const topup_day = summaryMatch[4];
  const topup_week = summaryMatch[5];
  const split_time = summaryMatch[6];
  const operating_time = summaryMatch[7];

 return {
  crew_code,
  crew_id,
  jobs,
  daily,
  days_off,
  days_off_count,
  works_weekends,
  is_up_express,
  work_time,
  overtime,
  topup_day,
  topup_week,
  split_time,
  operating_time,
};
}

const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

let currentBlock = [];

for (const line of lines) {
  if (isCrewStart(line)) {
    if (currentBlock.length > 0) {
      const parsed = parseCrewBlock(currentBlock);
      console.log("PARSED ROW:");
      console.log(parsed);
      console.log("------------------");
    }

    currentBlock = [line];
  } else {
    currentBlock.push(line);
  }
}

if (currentBlock.length > 0) {
  const parsed = parseCrewBlock(currentBlock);
  console.log("PARSED ROW:");
  console.log(parsed);
}
