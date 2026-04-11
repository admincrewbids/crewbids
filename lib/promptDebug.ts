export type PromptDebugPriorityViolation = {
  higherPriorityCrew: { id: string; terminal: string; rank: number };
  lowerPriorityCrew: { id: string; terminal: string; rank: number };
  message: string;
};

export type PromptDebugInterpretationIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
  scope: "global" | "terminal";
  terminal?: string;
};

export type PromptDebugAssertionFailure = {
  type: string;
  message: string;
};

export type PromptDebugRankedCrewLike = {
  id: string;
  crew_number?: string;
  terminal: string;
  score: number;
  is_two_week_stby?: boolean;
  week1?: { days_off_list?: string[] };
  week2?: { days_off_list?: string[] };
  days_off_list?: string[];
  overtime_weekly_text?: string;
  operating_time_weekly?: string;
};

export type PromptDebugExcludedCrewLike = {
  id: string;
  terminal: string;
  reason: string;
};

export type PromptDebugResult<
  TParsedPreferences = unknown,
  TRankedCrew extends PromptDebugRankedCrewLike = PromptDebugRankedCrewLike,
  TExcludedCrew extends PromptDebugExcludedCrewLike = PromptDebugExcludedCrewLike,
> = {
  prompt: string;
  normalizedPrompt?: string;
  promptNormalizationRules?: string[];
  parsedPreferences: TParsedPreferences;
  ranked: TRankedCrew[];
  excluded: TExcludedCrew[];
  priorityViolations: PromptDebugPriorityViolation[];
  interpretationIssues?: PromptDebugInterpretationIssue[];
  assertionFailures?: PromptDebugAssertionFailure[];
};

export type PromptDebugSummary = {
  prompt: string;
  normalizedPrompt?: string;
  promptNormalizationRules?: string[];
  loadedCrewCount: number;
  rankedCount: number;
  excludedCount: number;
  priorityViolationsCount: number;
  interpretationIssueCount: number;
  interpretationIssues?: PromptDebugInterpretationIssue[];
  assertionFailureCount: number;
  assertionFailures?: PromptDebugAssertionFailure[];
  topRanked: Array<{
    rank: number;
    crewNumber: string;
    terminal: string;
    score: number;
    daysOff: string;
    overtime: string;
    operating: string;
  }>;
  topExcluded: Array<{
    crewId: string;
    terminal: string;
    reason: string;
  }>;
  priorityViolations: Array<{
    higherPriorityCrewId: string;
    higherPriorityTerminal: string;
    higherPriorityRank: number;
    lowerPriorityCrewId: string;
    lowerPriorityTerminal: string;
    lowerPriorityRank: number;
    message: string;
  }>;
};

export type PromptDebugBatchSummary = {
  totalPrompts: number;
  promptsWithViolations: number;
  promptsWithNoResults: number;
  promptsWithInterpretationErrors: number;
  promptsWithAssertionFailures: number;
  results: Array<{
    prompt: string;
    normalizedPrompt?: string;
    rankedCount: number;
    excludedCount: number;
    priorityViolationsCount: number;
    interpretationIssueCount: number;
    assertionFailureCount: number;
  }>;
};

export function summarizePromptDebugResult(
  result: PromptDebugResult,
  loadedCrewCount: number,
  formatTerminalDisplayName: (terminal: string | undefined) => string
): PromptDebugSummary {
  return {
    prompt: result.prompt,
    normalizedPrompt:
      result.normalizedPrompt && result.normalizedPrompt !== result.prompt
        ? result.normalizedPrompt
        : undefined,
    promptNormalizationRules:
      result.promptNormalizationRules && result.promptNormalizationRules.length > 0
        ? result.promptNormalizationRules
        : undefined,
    loadedCrewCount,
    rankedCount: result.ranked.length,
    excludedCount: result.excluded.length,
    priorityViolationsCount: result.priorityViolations.length,
    interpretationIssueCount: result.interpretationIssues?.length ?? 0,
    interpretationIssues:
      result.interpretationIssues && result.interpretationIssues.length > 0
        ? result.interpretationIssues
        : undefined,
    assertionFailureCount: result.assertionFailures?.length ?? 0,
    assertionFailures:
      result.assertionFailures && result.assertionFailures.length > 0
        ? result.assertionFailures
        : undefined,
    topRanked: result.ranked.slice(0, 10).map((crew, index) => ({
      rank: index + 1,
      crewNumber: String(crew.crew_number ?? crew.id ?? ""),
      terminal: formatTerminalDisplayName(crew.terminal),
      score: Number((crew.score ?? 0).toFixed(1)),
      daysOff: crew.is_two_week_stby
        ? `${crew.week1?.days_off_list?.join(", ") || "-"} / ${
            crew.week2?.days_off_list?.join(", ") || "-"
          }`
        : crew.days_off_list?.join(", ") || "-",
      overtime: crew.overtime_weekly_text || "-",
      operating: crew.operating_time_weekly || "-",
    })),
    topExcluded: result.excluded.slice(0, 10).map((crew) => ({
      crewId: crew.id,
      terminal: crew.terminal,
      reason: crew.reason,
    })),
    priorityViolations: result.priorityViolations.map((violation) => ({
      higherPriorityCrewId: violation.higherPriorityCrew.id,
      higherPriorityTerminal: violation.higherPriorityCrew.terminal,
      higherPriorityRank: violation.higherPriorityCrew.rank,
      lowerPriorityCrewId: violation.lowerPriorityCrew.id,
      lowerPriorityTerminal: violation.lowerPriorityCrew.terminal,
      lowerPriorityRank: violation.lowerPriorityCrew.rank,
      message: violation.message,
    })),
  };
}

export function logPromptDebugSummary(summary: PromptDebugSummary) {
  console.log("CrewBids prompt summary", {
    prompt: summary.prompt,
    normalizedPrompt: summary.normalizedPrompt,
    promptNormalizationRules: summary.promptNormalizationRules,
    loadedCrewCount: summary.loadedCrewCount,
    rankedCount: summary.rankedCount,
    excludedCount: summary.excludedCount,
    priorityViolationsCount: summary.priorityViolationsCount,
    interpretationIssueCount: summary.interpretationIssueCount,
    assertionFailureCount: summary.assertionFailureCount,
  });

  if (summary.topRanked.length > 0) {
    console.table(summary.topRanked);
  }

  if (summary.topExcluded.length > 0) {
    console.table(summary.topExcluded);
  }

  if (summary.priorityViolations.length > 0) {
    console.table(summary.priorityViolations);
  }

  if (summary.interpretationIssues && summary.interpretationIssues.length > 0) {
    console.table(summary.interpretationIssues);
  }

  if (summary.assertionFailures && summary.assertionFailures.length > 0) {
    console.table(summary.assertionFailures);
  }
}

export function summarizePromptDebugBatch(
  summaries: PromptDebugSummary[]
): PromptDebugBatchSummary {
  return {
    totalPrompts: summaries.length,
    promptsWithViolations: summaries.filter(
      (summary) => summary.priorityViolationsCount > 0
    ).length,
    promptsWithNoResults: summaries.filter(
      (summary) => summary.rankedCount === 0
    ).length,
    promptsWithInterpretationErrors: summaries.filter(
      (summary) => summary.interpretationIssueCount > 0
    ).length,
    promptsWithAssertionFailures: summaries.filter(
      (summary) => summary.assertionFailureCount > 0
    ).length,
    results: summaries.map((summary) => ({
      prompt: summary.prompt,
      normalizedPrompt: summary.normalizedPrompt,
      rankedCount: summary.rankedCount,
      excludedCount: summary.excludedCount,
      priorityViolationsCount: summary.priorityViolationsCount,
      interpretationIssueCount: summary.interpretationIssueCount,
      assertionFailureCount: summary.assertionFailureCount,
    })),
  };
}

export function logPromptDebugBatchSummary(batchSummary: PromptDebugBatchSummary) {
  console.log("CrewBids prompt batch summary", {
    totalPrompts: batchSummary.totalPrompts,
    promptsWithViolations: batchSummary.promptsWithViolations,
    promptsWithNoResults: batchSummary.promptsWithNoResults,
    promptsWithInterpretationErrors: batchSummary.promptsWithInterpretationErrors,
    promptsWithAssertionFailures: batchSummary.promptsWithAssertionFailures,
  });

  if (batchSummary.results.length > 0) {
    console.table(batchSummary.results);
  }
}
