import type {
  PromptDebugResult,
  PromptDebugSummary,
} from "./promptDebug";
import type {
  PromptRegressionAssertion,
  PromptRegressionCase,
} from "./promptRegressionSuite";

export type PromptRegressionAssertionFailure = {
  type: PromptRegressionAssertion["type"];
  message: string;
};

function normalizeTerminalLabel(value: string) {
  return value.trim().toLowerCase();
}

function hhmmToMinutes(value?: string) {
  if (!value || !value.includes(":")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function evaluateAssertion(
  assertion: PromptRegressionAssertion,
  result: PromptDebugResult,
  summary: PromptDebugSummary
): PromptRegressionAssertionFailure | null {
  if (assertion.type === "no_priority_violations") {
    return summary.priorityViolationsCount === 0
      ? null
      : {
          type: assertion.type,
          message: `Expected no priority violations but found ${summary.priorityViolationsCount}.`,
        };
  }

  if (assertion.type === "ranked_count_at_least") {
    return summary.rankedCount >= assertion.value
      ? null
      : {
          type: assertion.type,
          message: `Expected at least ${assertion.value} ranked crews but found ${summary.rankedCount}.`,
        };
  }

  if (assertion.type === "normalized_prompt_includes") {
    const normalizedPrompt = (
      result.normalizedPrompt ?? result.prompt
    ).toLowerCase();
    const missing = assertion.value.filter(
      (fragment) => !normalizedPrompt.includes(fragment.toLowerCase())
    );

    return missing.length === 0
      ? null
      : {
          type: assertion.type,
          message: `Normalized prompt is missing: ${missing.join(", ")}.`,
        };
  }

  if (assertion.type === "top_ranked_terminal") {
    const actualTerminal = summary.topRanked[0]?.terminal;
    return actualTerminal &&
      normalizeTerminalLabel(actualTerminal) ===
        normalizeTerminalLabel(assertion.value)
      ? null
      : {
          type: assertion.type,
          message: `Expected top ranked terminal ${assertion.value} but found ${actualTerminal ?? "none"}.`,
        };
  }

  if (assertion.type === "allowed_terminals_only") {
    const allowed = new Set(assertion.value.map(normalizeTerminalLabel));
    const disallowed = result.ranked
      .map((crew) => crew.terminal)
      .filter((terminal) => !allowed.has(normalizeTerminalLabel(terminal)));

    return disallowed.length === 0
      ? null
      : {
          type: assertion.type,
          message: `Found ranked crews outside the allowed terminals: ${Array.from(
            new Set(disallowed)
          ).join(", ")}.`,
        };
  }

  if (assertion.type === "terminal_sorted_by_operating") {
    const matchingCrews = result.ranked.filter(
      (crew) =>
        normalizeTerminalLabel(crew.terminal) ===
        normalizeTerminalLabel(assertion.value.terminal)
    );

    const sample = matchingCrews.slice(
      0,
      assertion.value.sampleCount ?? matchingCrews.length
    );

    if (sample.length < 2) {
      return {
        type: assertion.type,
        message: `Expected at least 2 ranked crews for ${assertion.value.terminal} but found ${sample.length}.`,
      };
    }

    for (let index = 1; index < sample.length; index += 1) {
      const previous = hhmmToMinutes(sample[index - 1].operating_time_weekly);
      const current = hhmmToMinutes(sample[index].operating_time_weekly);

      if (previous == null || current == null) {
        return {
          type: assertion.type,
          message: `Missing operating-time data while checking ${assertion.value.terminal} sorting.`,
        };
      }

      const outOfOrder =
        assertion.value.direction === "asc"
          ? current < previous
          : current > previous;

      if (outOfOrder) {
        return {
          type: assertion.type,
          message: `${assertion.value.terminal} operating order broke between crews ${
            sample[index - 1].crew_number ?? sample[index - 1].id
          } (${sample[index - 1].operating_time_weekly}) and ${
            sample[index].crew_number ?? sample[index].id
          } (${sample[index].operating_time_weekly}).`,
        };
      }
    }

    return null;
  }

  if (assertion.type === "crew_excluded_with_reason") {
    const match = result.excluded.find(
      (crew) => String(crew.id).trim() === assertion.value.crewId.trim()
    );

    if (!match) {
      return {
        type: assertion.type,
        message: `Expected crew ${assertion.value.crewId} to be excluded, but it was not found in the excluded list.`,
      };
    }

    return match.reason
      .toLowerCase()
      .includes(assertion.value.includes.toLowerCase())
      ? null
      : {
          type: assertion.type,
          message: `Expected excluded crew ${assertion.value.crewId} reason to include "${assertion.value.includes}" but found "${match.reason}".`,
        };
  }

  return null;
}

export function evaluatePromptRegressionAssertions(
  regressionCase: PromptRegressionCase,
  result: PromptDebugResult,
  summary: PromptDebugSummary
): PromptRegressionAssertionFailure[] {
  const failures: PromptRegressionAssertionFailure[] = [];

  for (const assertion of regressionCase.assertions ?? []) {
    const failure = evaluateAssertion(assertion, result, summary);
    if (failure) {
      failures.push(failure);
    }
  }

  return failures;
}
