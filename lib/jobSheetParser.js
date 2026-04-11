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

function parseJobSheetText(text, pageNumber) {
  const jobs = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let currentJob = null;

  for (const line of lines) {
    const jobNoMatch = line.match(/job\s*no\.?\s*:\s*(\d{4,6})/i);
    if (jobNoMatch) {
      if (currentJob) jobs.push(currentJob);

      currentJob = {
        job_no: jobNoMatch[1],
        pdf_page_number: pageNumber,
        split_time: null,
        has_shuttle_bus: false,
        raw_text: "",
      };
    }

    if (!currentJob) continue;

    currentJob.raw_text = currentJob.raw_text
      ? `${currentJob.raw_text}\n${line}`
      : line;

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

module.exports = { parseJobSheetText };
