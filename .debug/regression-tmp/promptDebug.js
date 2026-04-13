"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizePromptDebugResult = summarizePromptDebugResult;
exports.logPromptDebugSummary = logPromptDebugSummary;
exports.summarizePromptDebugBatch = summarizePromptDebugBatch;
exports.logPromptDebugBatchSummary = logPromptDebugBatchSummary;
function summarizePromptDebugResult(result, loadedCrewCount, formatTerminalDisplayName) {
    return {
        prompt: result.prompt,
        normalizedPrompt: result.normalizedPrompt && result.normalizedPrompt !== result.prompt
            ? result.normalizedPrompt
            : undefined,
        promptNormalizationRules: result.promptNormalizationRules && result.promptNormalizationRules.length > 0
            ? result.promptNormalizationRules
            : undefined,
        loadedCrewCount,
        rankedCount: result.ranked.length,
        excludedCount: result.excluded.length,
        priorityViolationsCount: result.priorityViolations.length,
        interpretationIssueCount: result.interpretationIssues?.length ?? 0,
        interpretationIssues: result.interpretationIssues && result.interpretationIssues.length > 0
            ? result.interpretationIssues
            : undefined,
        assertionFailureCount: result.assertionFailures?.length ?? 0,
        assertionFailures: result.assertionFailures && result.assertionFailures.length > 0
            ? result.assertionFailures
            : undefined,
        topRanked: result.ranked.slice(0, 10).map((crew, index) => ({
            rank: index + 1,
            crewNumber: String(crew.crew_number ?? crew.id ?? ""),
            terminal: formatTerminalDisplayName(crew.terminal),
            score: Number((crew.score ?? 0).toFixed(1)),
            daysOff: crew.is_two_week_stby
                ? `${crew.week1?.days_off_list?.join(", ") || "-"} / ${crew.week2?.days_off_list?.join(", ") || "-"}`
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
function logPromptDebugSummary(summary) {
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
function summarizePromptDebugBatch(summaries) {
    return {
        totalPrompts: summaries.length,
        promptsWithViolations: summaries.filter((summary) => summary.priorityViolationsCount > 0).length,
        promptsWithNoResults: summaries.filter((summary) => summary.rankedCount === 0).length,
        promptsWithInterpretationErrors: summaries.filter((summary) => summary.interpretationIssueCount > 0).length,
        promptsWithAssertionFailures: summaries.filter((summary) => summary.assertionFailureCount > 0).length,
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
function logPromptDebugBatchSummary(batchSummary) {
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
