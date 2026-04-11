export function parseCrewCycleChartText(text) {
  if (!text) return [];

  // 🔥 STEP 1: Only keep text AFTER the legend
  const startIndex = text.search(/Days Off/i);
  if (startIndex === -1) {
    console.log("❌ Could not find cycle table start");
    return [];
  }

  let trimmed = text.slice(startIndex);

  // 🔥 STEP 2: Cut off before job package section
  trimmed = trimmed.split(/FIRST JOB PACKAGE/i)[0];

  // 🔥 STEP 3: Normalize
  const clean = trimmed.replace(/\s+/g, " ").trim();

  console.log("CYCLE TABLE CLEAN:", clean.slice(0, 1000));

  const crews = [];

  // 🔥 STEP 4: Match REAL crew rows
  // Example pattern:
  // WH_D 1001 Off 10001 10001 10001 10001 10001 Off Off
  const rowRegex =
    /\b([A-Z]{2,5}_[A-Z])\s+(\d{3,5})\s+(Off|\d{4,5})\s+(Off|\d{4,5})\s+(Off|\d{4,5})\s+(Off|\d{4,5})\s+(Off|\d{4,5})\s+(Off|\d{4,5})\s+(Off|\d{4,5})\b/g;

  let match;

  while ((match = rowRegex.exec(clean)) !== null) {
    const terminal = match[1];
    const crew_id = match[2];
    const days = match.slice(3, 10);

    const daily = days.map((d, i) => ({
      day_index: i,
      job_no: d.toLowerCase() === "off" ? null : d,
      is_day_off: d.toLowerCase() === "off",
    }));

    crews.push({
      crew_id,
      terminal,
      daily,
      jobs: daily.filter(d => !d.is_day_off).map(d => d.job_no),
    });
  }

  console.log("🔥 PARSED CREWS FINAL:", crews);

  return crews;
}