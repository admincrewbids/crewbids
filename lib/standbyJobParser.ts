export type ParsedStandbyJob = {
  job_no: string;
  on_duty: string | null;
  off_duty: string | null;
};

export function parseStandbyJobDescriptions(
  pages: string[]
): ParsedStandbyJob[] {
  const jobs: ParsedStandbyJob[] = [];

  let inStandbySection = false;

  for (const pageText of pages) {
    const text = pageText || "";

    if (/STANDBY Job Descriptions/i.test(text)) {
      inStandbySection = true;
    }

    if (!inStandbySection) continue;

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let currentJob: ParsedStandbyJob | null = null;

    for (const line of lines) {
      const jobNoMatch = line.match(/job\s*no\.?\s*:\s*(\d{4,6})/i);
      if (jobNoMatch) {
        if (currentJob) {
          jobs.push(currentJob);
        }

        currentJob = {
          job_no: jobNoMatch[1],
          on_duty: null,
          off_duty: null,
        };
      }

      if (!currentJob) continue;

      const startMatch = line.match(/job\s*start\s*:\s*(\d{1,2}:\d{2})/i);
      if (startMatch) {
        currentJob.on_duty = startMatch[1];
      }

      const endMatch = line.match(/job\s*end\s*:\s*(\d{1,2}:\d{2})/i);
      if (endMatch) {
        currentJob.off_duty = endMatch[1];
      }
    }

    if (currentJob) {
      jobs.push(currentJob);
    }
  }

  const deduped = new Map<string, ParsedStandbyJob>();

  for (const job of jobs) {
    if (!job.job_no) continue;

    const existing = deduped.get(job.job_no);

    if (!existing) {
      deduped.set(job.job_no, job);
      continue;
    }

    deduped.set(job.job_no, {
      job_no: job.job_no,
      on_duty: existing.on_duty ?? job.on_duty,
      off_duty: existing.off_duty ?? job.off_duty,
    });
  }

  return Array.from(deduped.values());
}