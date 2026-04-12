import type {
  PromptDebugRankedCrewLike,
  PromptDebugResult,
  PromptDebugSummary,
} from "./promptDebug";
import type {
  PromptRegressionAssertion,
  PromptRegressionCase,
  PromptRegressionFilterExpectation,
  PromptRegressionSortExpectation,
} from "./promptRegressionSuite";
import type {
  ParsedPreferenceFilterLike,
  ParsedPreferenceSortLike,
  ParsedPreferencesLike,
} from "./promptRuleAnalysis";

export type PromptRegressionAssertionFailure = {
  type: PromptRegressionAssertion["type"] | "mechanical_verification";
  message: string;
};

type JobDetailLike = {
  on_duty?: string | null;
  off_duty?: string | null;
  operating_hours_daily?: unknown;
  van_hours_daily?: unknown;
  has_shuttle_bus?: unknown;
  raw_text?: unknown;
};

type DayLike = {
  day?: string;
  is_day_off?: boolean;
  on_duty?: string | null;
  off_duty?: string | null;
  job_detail?: JobDetailLike | null;
};

type RankedCrewLike = PromptDebugRankedCrewLike & {
  daily?: DayLike[];
  job_details?: JobDetailLike[];
  days_off_count?: number;
  works_weekends?: boolean;
  split_time_weekly?: string;
  overtime_hours_weekly?: unknown;
  total_paid_hours_weekly?: unknown;
};

function normalizeTerminalLabel(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isParsedPreferenceFilterLike(value: unknown): value is ParsedPreferenceFilterLike {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    typeof value.operator === "string" &&
    typeof value.strength === "string" &&
    "value" in value
  );
}

function isParsedPreferenceSortLike(value: unknown): value is ParsedPreferenceSortLike {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    (value.direction === "asc" || value.direction === "desc") &&
    typeof value.strength === "string"
  );
}

function isParsedPreferencesLike(value: unknown): value is ParsedPreferencesLike {
  return (
    isRecord(value) &&
    Array.isArray(value.filters) &&
    value.filters.every(isParsedPreferenceFilterLike) &&
    Array.isArray(value.priority_groups) &&
    Array.isArray(value.sort_preferences) &&
    value.sort_preferences.every(isParsedPreferenceSortLike) &&
    Array.isArray(value.tradeoffs) &&
    Array.isArray(value.unknown_clauses) &&
    (value.scoped_preferences === undefined || Array.isArray(value.scoped_preferences))
  );
}

function toRankedCrewLike(crew: PromptDebugRankedCrewLike): RankedCrewLike {
  return crew as RankedCrewLike;
}

function valuesEqual(
  left: string | number | boolean | string[] | undefined,
  right: string | number | boolean | string[] | undefined
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesFilterExpectation(
  filter: ParsedPreferenceFilterLike,
  expected: PromptRegressionFilterExpectation
) {
  if (filter.field !== expected.field) return false;
  if (expected.operator != null && filter.operator !== expected.operator) return false;
  if (expected.strength != null && filter.strength !== expected.strength) return false;
  if (expected.value !== undefined && !valuesEqual(filter.value, expected.value)) {
    return false;
  }
  return true;
}

function matchesSortExpectation(
  sort: ParsedPreferenceSortLike,
  expected: PromptRegressionSortExpectation
) {
  if (sort.field !== expected.field) return false;
  if (sort.direction !== expected.direction) return false;
  if (expected.strength != null && sort.strength !== expected.strength) return false;
  return true;
}

function getScopedPreference(
  parsed: ParsedPreferencesLike,
  terminal: string
) {
  const normalized = normalizeTerminalLabel(terminal);
  return (parsed.scoped_preferences ?? []).find(
    (scope) =>
      normalizeTerminalLabel(scope.normalized_terminal) === normalized ||
      normalizeTerminalLabel(scope.terminal) === normalized
  );
}

function hhmmToMinutes(value?: string | null) {
  if (!value || !value.includes(":")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getDisplayedDayTimeRange(day: DayLike) {
  const jobStart =
    typeof day?.job_detail?.on_duty === "string" ? day.job_detail.on_duty : null;
  const jobFinish =
    typeof day?.job_detail?.off_duty === "string" ? day.job_detail.off_duty : null;

  if (jobStart || jobFinish) {
    return {
      onDuty: jobStart,
      offDuty: jobFinish,
    };
  }

  return {
    onDuty: typeof day?.on_duty === "string" ? day.on_duty : null,
    offDuty: typeof day?.off_duty === "string" ? day.off_duty : null,
  };
}

function isOvernightDisplayedDay(day: DayLike) {
  const { onDuty, offDuty } = getDisplayedDayTimeRange(day);
  const startMinutes = hhmmToMinutes(onDuty);
  const finishMinutes = hhmmToMinutes(offDuty);

  if (startMinutes == null || finishMinutes == null) return false;
  return finishMinutes < startMinutes;
}

function getDayFinishMinutes(day: DayLike) {
  const { onDuty, offDuty } = getDisplayedDayTimeRange(day);
  const startMinutes = hhmmToMinutes(onDuty);
  let finishMinutes = hhmmToMinutes(offDuty);

  if (finishMinutes == null) return null;
  if (startMinutes != null && finishMinutes < startMinutes) {
    finishMinutes += 24 * 60;
  }

  return finishMinutes;
}

function getRepresentativeWorkedDay(crew: RankedCrewLike) {
  return getWorkedDays(crew)[0] ?? null;
}

function getSortableFieldValue(
  crew: RankedCrewLike,
  field:
    | "on_duty"
    | "off_duty"
    | "operating_hours_daily"
    | "van_hours_daily"
    | "overtime_hours_weekly"
    | "total_paid_hours_weekly"
    | "three_day_off_jobs"
) {
  const representativeDay = getRepresentativeWorkedDay(crew);
  const representativeDetail =
    representativeDay?.job_detail ??
    crew.job_details?.[0] ??
    null;

  if (field === "on_duty") {
    return hhmmToMinutes(getDisplayedDayTimeRange(representativeDay ?? {}).onDuty);
  }

  if (field === "off_duty") {
    return representativeDay ? getDayFinishMinutes(representativeDay) : null;
  }

  if (field === "operating_hours_daily") {
    const value = Number(representativeDetail?.operating_hours_daily);
    return Number.isFinite(value) ? value : null;
  }

  if (field === "van_hours_daily") {
    const value = Number(representativeDetail?.van_hours_daily);
    return Number.isFinite(value) ? value : null;
  }

  if (field === "overtime_hours_weekly") {
    const value = Number(crew.overtime_hours_weekly);
    return Number.isFinite(value) ? value : null;
  }

  if (field === "total_paid_hours_weekly") {
    const value = Number(crew.total_paid_hours_weekly);
    return Number.isFinite(value) ? value : null;
  }

  if (field === "three_day_off_jobs") {
    return getDaysOffCount(crew) === 3 ? 1 : 0;
  }

  return null;
}

function evaluateFinishFilterForDay(
  day: DayLike,
  filter: ParsedPreferenceFilterLike
) {
  if (filter.field !== "off_duty" || typeof filter.value !== "string") {
    return null;
  }

  const { offDuty } = getDisplayedDayTimeRange(day);
  const finish = getDayFinishMinutes(day);
  const rawFilterMinutes = hhmmToMinutes(filter.value);
  const isOvernight = isOvernightDisplayedDay(day);
  const isEarlyMorningCutoff =
    rawFilterMinutes != null && rawFilterMinutes < 12 * 60;

  if (finish == null || rawFilterMinutes == null) {
    return {
      passes: false,
      displayedFinish: offDuty,
      reason: "missing finish-time details",
    };
  }

  let comparableFilter = rawFilterMinutes;

  if (isEarlyMorningCutoff) {
    if (!isOvernight && (filter.operator === "<=" || filter.operator === "<")) {
      return {
        passes: true,
        displayedFinish: offDuty,
      };
    }

    if (isOvernight) {
      comparableFilter += 24 * 60;
    }
  } else if (isOvernight && comparableFilter < finish) {
    comparableFilter += 24 * 60;
  }

  if (filter.operator === ">=" && finish < comparableFilter) {
    return { passes: false, displayedFinish: offDuty, reason: `finishes before ${filter.value}` };
  }

  if (filter.operator === ">" && finish <= comparableFilter) {
    return { passes: false, displayedFinish: offDuty, reason: `finishes at or before ${filter.value}` };
  }

  if (filter.operator === "<=" && finish > comparableFilter) {
    return { passes: false, displayedFinish: offDuty, reason: `finishes after ${filter.value}` };
  }

  if (filter.operator === "<" && finish >= comparableFilter) {
    return { passes: false, displayedFinish: offDuty, reason: `finishes at or after ${filter.value}` };
  }

  return { passes: true, displayedFinish: offDuty };
}

function getWorkedDays(crew: RankedCrewLike) {
  return (crew.daily ?? []).filter((day) => !day?.is_day_off);
}

function hasSplitTimeValue(value: unknown) {
  if (typeof value !== "string") return false;
  const cleaned = value.trim();
  if (!cleaned || cleaned === "-" || cleaned === "00:00") return false;
  return cleaned !== "0:00";
}

function hasShuttleBusValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return (
      /shuttle\s*bus/i.test(value) ||
      /^shuttle\b/im.test(value) ||
      /\bshuttle\b.*\b\d{1,2}:\d{2}\b/i.test(value)
    );
  }
  return false;
}

function crewHasShuttleBus(crew: RankedCrewLike) {
  for (const day of crew.daily ?? []) {
    if (day?.is_day_off) continue;
    if (
      hasShuttleBusValue(day?.job_detail?.has_shuttle_bus) ||
      hasShuttleBusValue(day?.job_detail?.raw_text)
    ) {
      return true;
    }
  }

  for (const detail of crew.job_details ?? []) {
    if (
      hasShuttleBusValue(detail?.has_shuttle_bus) ||
      hasShuttleBusValue(detail?.raw_text)
    ) {
      return true;
    }
  }

  return false;
}

function getCrewNumber(crew: RankedCrewLike) {
  return String(crew.crew_number ?? crew.id ?? "").trim();
}

function isStandbyCrew(crew: RankedCrewLike) {
  return normalizeTerminalLabel(crew.terminal) === "standby" || crew.is_two_week_stby === true;
}

function isSpareboardCrew(crew: RankedCrewLike) {
  return /^3\d{3}$/.test(getCrewNumber(crew));
}

function isUpCrew(crew: RankedCrewLike) {
  return getCrewNumber(crew).startsWith("5");
}

function getCrewDaysOffList(crew: RankedCrewLike) {
  if (crew.is_two_week_stby) {
    return [
      ...(crew.week1?.days_off_list ?? []),
      ...(crew.week2?.days_off_list ?? []),
    ];
  }

  return crew.days_off_list ?? [];
}

function getWeekdayDaysOffCount(crew: RankedCrewLike) {
  return getCrewDaysOffList(crew).filter((day) => {
    const normalized = day.trim().toLowerCase();
    return !["sat", "saturday", "sun", "sunday"].includes(normalized);
  }).length;
}

function hasWeekendDaysOff(crew: RankedCrewLike) {
  return getCrewDaysOffList(crew).some((day) => {
    const normalized = day.trim().toLowerCase();
    return ["sat", "saturday", "sun", "sunday"].includes(normalized);
  });
}

function getDaysOffCount(crew: RankedCrewLike) {
  if (typeof crew.days_off_count === "number") return crew.days_off_count;
  if (crew.is_two_week_stby) {
    return getCrewDaysOffList(crew).length;
  }
  return crew.days_off_list?.length ?? 0;
}

function evaluateHardFilterOnCrew(
  crew: RankedCrewLike,
  filter: ParsedPreferenceFilterLike
) {
  const workedDays = getWorkedDays(crew);

  if (filter.field === "terminal") {
    if (!Array.isArray(filter.value)) {
      return { supported: false, passes: false, reason: `terminal filter has unsupported value` };
    }

    const normalizedCrewTerminal = normalizeTerminalLabel(crew.terminal);
    const normalizedValues = filter.value.map((value) => normalizeTerminalLabel(String(value)));

    const matchesSpecialValue = normalizedValues.some((value) => {
      if (value === "standby") return isStandbyCrew(crew);
      if (value === "spareboard") return isSpareboardCrew(crew);
      return value === normalizedCrewTerminal;
    });

    if (filter.operator === "in") {
      return {
        supported: true,
        passes: matchesSpecialValue,
        reason: `terminal ${crew.terminal} is outside allowed set`,
      };
    }

    if (filter.operator === "not_in") {
      return {
        supported: true,
        passes: !matchesSpecialValue,
        reason: `terminal ${crew.terminal} is explicitly excluded`,
      };
    }
  }

  if (filter.field === "include_only_spareboard_crews" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: isSpareboardCrew(crew),
      reason: "crew is not spareboard",
    };
  }

  if (filter.field === "include_only_standby_crews" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: isStandbyCrew(crew),
      reason: "crew is not standby",
    };
  }

  if (filter.field === "exclude_spareboard_crews" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: !isSpareboardCrew(crew),
      reason: "crew is spareboard",
    };
  }

  if (filter.field === "exclude_up_crews" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: !isUpCrew(crew),
      reason: "crew is UP",
    };
  }

  if (filter.field === "on_duty" && typeof filter.value === "string") {
    const filterTime = hhmmToMinutes(filter.value);
    if (filterTime == null) {
      return { supported: false, passes: false, reason: "invalid on_duty filter value" };
    }

    for (const day of workedDays) {
      const start = hhmmToMinutes(getDisplayedDayTimeRange(day).onDuty);
      if (start == null) {
        return { supported: false, passes: false, reason: "missing start-time details" };
      }

      if (filter.operator === ">=" && start < filterTime) {
        return { supported: true, passes: false, reason: `${day.day} starts before ${filter.value}` };
      }
      if (filter.operator === ">" && start <= filterTime) {
        return { supported: true, passes: false, reason: `${day.day} starts at or before ${filter.value}` };
      }
      if (filter.operator === "<=" && start > filterTime) {
        return { supported: true, passes: false, reason: `${day.day} starts after ${filter.value}` };
      }
      if (filter.operator === "<" && start >= filterTime) {
        return { supported: true, passes: false, reason: `${day.day} starts at or after ${filter.value}` };
      }
    }

    return { supported: true, passes: true, reason: "" };
  }

  if (filter.field === "off_duty" && typeof filter.value === "string") {
    for (const day of workedDays) {
      const evaluation = evaluateFinishFilterForDay(day, filter);
      if (!evaluation) {
        return { supported: false, passes: false, reason: "finish filter could not be evaluated" };
      }

      if (!evaluation.passes) {
        return {
          supported: true,
          passes: false,
          reason: `${day.day} ${evaluation.reason}${evaluation.displayedFinish ? ` (${evaluation.displayedFinish})` : ""}`,
        };
      }
    }

    return { supported: true, passes: true, reason: "" };
  }

  if (filter.field === "split_time" && filter.operator === "=" && filter.value === "none") {
    return {
      supported: true,
      passes: !hasSplitTimeValue(crew.split_time_weekly),
      reason: "crew has split time",
    };
  }

  if (filter.field === "shuttle_bus" && filter.operator === "=") {
    const hasShuttle = crewHasShuttleBus(crew);
    if (filter.value === false) {
      return {
        supported: true,
        passes: !hasShuttle,
        reason: "crew contains shuttle work",
      };
    }

    if (filter.value === true) {
      return {
        supported: true,
        passes: hasShuttle,
        reason: "crew does not contain shuttle work",
      };
    }
  }

  if (filter.field === "weekday_days_off_count" && filter.operator === "=" && typeof filter.value === "number") {
    return {
      supported: true,
      passes: getWeekdayDaysOffCount(crew) === filter.value,
      reason: `crew has ${getWeekdayDaysOffCount(crew)} weekdays off instead of ${filter.value}`,
    };
  }

  if (filter.field === "weekend_days_off" && filter.operator === "=" && filter.value === false) {
    return {
      supported: true,
      passes: !hasWeekendDaysOff(crew),
      reason: "crew has weekend days off",
    };
  }

  if (filter.field === "weekends_off_hard" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: crew.works_weekends === false,
      reason: "crew works weekends",
    };
  }

  if (filter.field === "include_only_three_day_off_jobs" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: getDaysOffCount(crew) === 3,
      reason: `crew has ${getDaysOffCount(crew)} days off instead of 3`,
    };
  }

  if (filter.field === "exclude_three_day_off_jobs" && filter.operator === "=" && filter.value === true) {
    return {
      supported: true,
      passes: getDaysOffCount(crew) !== 3,
      reason: "crew is a 3-day-off job",
    };
  }

  return {
    supported: false,
    passes: false,
    reason: `unsupported hard filter field ${filter.field}`,
  };
}

function collectVisibleContradictionFailures(
  result: PromptDebugResult,
  parsed: ParsedPreferencesLike
) {
  const failures: PromptRegressionAssertionFailure[] = [];

  for (const crew of result.ranked) {
    const inspectableCrew = toRankedCrewLike(crew);

    for (const filter of parsed.filters ?? []) {
      if (filter.strength !== "hard") continue;

      const evaluation = evaluateHardFilterOnCrew(inspectableCrew, filter);
      if (!evaluation.supported) {
        failures.push({
          type: "mechanical_verification",
          message: `Cannot mechanically verify hard global filter ${filter.field} ${filter.operator}.`,
        });
        continue;
      }

      if (!evaluation.passes) {
        failures.push({
          type: "mechanical_verification",
          message: `Ranked crew ${inspectableCrew.crew_number ?? inspectableCrew.id} violates hard global filter ${filter.field}: ${evaluation.reason}.`,
        });
      }
    }

    const scoped = getScopedPreference(parsed, inspectableCrew.terminal);
    if (!scoped) continue;

    for (const filter of scoped.filters ?? []) {
      if (filter.strength !== "hard") continue;

      const evaluation = evaluateHardFilterOnCrew(inspectableCrew, filter);
      if (!evaluation.supported) {
        failures.push({
          type: "mechanical_verification",
          message: `Cannot mechanically verify hard scoped filter ${filter.field} ${filter.operator} for ${scoped.terminal}.`,
        });
        continue;
      }

      if (!evaluation.passes) {
        failures.push({
          type: "mechanical_verification",
          message: `Ranked crew ${inspectableCrew.crew_number ?? inspectableCrew.id} at ${inspectableCrew.terminal} violates hard scoped filter ${filter.field}: ${evaluation.reason}.`,
        });
      }
    }

    if (scoped.requires_weekends_off && inspectableCrew.works_weekends) {
      failures.push({
        type: "mechanical_verification",
        message: `Ranked crew ${inspectableCrew.crew_number ?? inspectableCrew.id} at ${inspectableCrew.terminal} violates weekends-off-only scoped rule.`,
      });
    }

    if ((scoped.required_days_off ?? []).length > 0) {
      const daysOff = new Set(getCrewDaysOffList(inspectableCrew).map((day) => day.trim().toLowerCase()));
      const missing = scoped.required_days_off.filter((day) => !daysOff.has(day.trim().toLowerCase()));
      if (missing.length > 0) {
        failures.push({
          type: "mechanical_verification",
          message: `Ranked crew ${inspectableCrew.crew_number ?? inspectableCrew.id} at ${inspectableCrew.terminal} is missing required days off: ${missing.join(", ")}.`,
        });
      }
    }
  }

  return failures;
}

function evaluateConditionalTerminalFallbackAssertion(
  result: PromptDebugResult,
  primaryTerminal: string,
  requiredFilters: PromptRegressionFilterExpectation[],
  fallbackTerminal: string
): PromptRegressionAssertionFailure | null {
  const normalizedPrimaryTerminal = normalizeTerminalLabel(primaryTerminal);
  const normalizedFallbackTerminal = normalizeTerminalLabel(fallbackTerminal);

  const rankedCrews = result.ranked.map((crew) => toRankedCrewLike(crew));
  const primaryCrews = rankedCrews.filter(
    (crew) => normalizeTerminalLabel(crew.terminal) === normalizedPrimaryTerminal
  );
  const fallbackCrews = rankedCrews.filter(
    (crew) => normalizeTerminalLabel(crew.terminal) === normalizedFallbackTerminal
  );

  const qualifyingPrimaryCrews = primaryCrews.filter((crew) =>
    requiredFilters.every((expectedFilter) => {
      const syntheticFilter: ParsedPreferenceFilterLike = {
        field: expectedFilter.field,
        operator: expectedFilter.operator ?? "=",
        value: expectedFilter.value ?? true,
        strength: expectedFilter.strength ?? "hard",
      };

      const evaluation = evaluateHardFilterOnCrew(crew, syntheticFilter);
      return evaluation.supported && evaluation.passes;
    })
  );

  if (qualifyingPrimaryCrews.length > 0) {
    const rankedIds = rankedCrews.map((crew) => String(crew.id));
    const qualifyingPrimaryIndexes = qualifyingPrimaryCrews
      .map((crew) => rankedIds.indexOf(String(crew.id)))
      .filter((index) => index >= 0);

    const lastQualifyingPrimaryIndex = Math.max(...qualifyingPrimaryIndexes);
    const violatingFallbackCrew = fallbackCrews.find((crew) => {
      const index = rankedIds.indexOf(String(crew.id));
      return index !== -1 && index < lastQualifyingPrimaryIndex;
    });

    return violatingFallbackCrew
      ? {
          type: "conditional_terminal_fallback",
          message: `Fallback terminal ${fallbackTerminal} appeared before all qualifying ${primaryTerminal} crews were exhausted.`,
        }
      : null;
  }

  return fallbackCrews.length > 0
      ? null
      : {
          type: "conditional_terminal_fallback",
          message: `No qualifying ${primaryTerminal} crews were ranked, and no ${fallbackTerminal} fallback crew was ranked.`,
        };
}

function evaluateScopedRankOrderRespectsSortAssertion(
  result: PromptDebugResult,
  terminal: string,
  field:
    | "on_duty"
    | "off_duty"
    | "operating_hours_daily"
    | "van_hours_daily"
    | "overtime_hours_weekly"
    | "total_paid_hours_weekly",
  direction: "asc" | "desc",
  mode: "pairwise_consecutive_distinct",
  requireAtLeastComparablePairs: number
): PromptRegressionAssertionFailure | null {
  if (mode !== "pairwise_consecutive_distinct") {
    return {
      type: "scoped_rank_order_respects_sort",
      message: `Unsupported scoped rank-order mode ${mode}.`,
    };
  }

  const scopedCrews = result.ranked
    .map((crew) => toRankedCrewLike(crew))
    .filter((crew) => normalizeTerminalLabel(crew.terminal) === normalizeTerminalLabel(terminal));

  let comparablePairs = 0;

  for (let index = 0; index < scopedCrews.length - 1; index += 1) {
    const currentCrew = scopedCrews[index];
    const nextCrew = scopedCrews[index + 1];
    const currentValue = getSortableFieldValue(currentCrew, field);
    const nextValue = getSortableFieldValue(nextCrew, field);

    if (currentValue == null || nextValue == null) continue;
    if (currentValue === nextValue) continue;

    comparablePairs += 1;

    const respectsOrder =
      direction === "asc"
        ? currentValue <= nextValue
        : currentValue >= nextValue;

    if (!respectsOrder) {
      return {
        type: "scoped_rank_order_respects_sort",
        message: `Within ${terminal}, ranked order violates ${field} ${direction} between crews ${currentCrew.crew_number ?? currentCrew.id} and ${nextCrew.crew_number ?? nextCrew.id}.`,
      };
    }
  }

  if (comparablePairs < requireAtLeastComparablePairs) {
    return {
      type: "scoped_rank_order_respects_sort",
      message: `Within ${terminal}, only ${comparablePairs} comparable ranked pair(s) were available for ${field} ${direction}; expected at least ${requireAtLeastComparablePairs}.`,
    };
  }

  return null;
}

function evaluateScopedTerminalSuppressesGlobalSortAssertion(
  result: PromptDebugResult,
  terminal: string,
  suppressedGlobalSort: {
    field:
      | "on_duty"
      | "off_duty"
      | "operating_hours_daily"
      | "van_hours_daily"
      | "overtime_hours_weekly"
      | "total_paid_hours_weekly"
      | "three_day_off_jobs";
    direction: "asc" | "desc";
  },
  enforcedScopedSorts: Array<{
    field:
      | "on_duty"
      | "off_duty"
      | "operating_hours_daily"
      | "van_hours_daily"
      | "overtime_hours_weekly"
      | "total_paid_hours_weekly";
    direction: "asc" | "desc";
  }>,
  mode: "consecutive_pair_evidence",
  requireAtLeastComparablePairs: number
): PromptRegressionAssertionFailure | null {
  if (mode !== "consecutive_pair_evidence") {
    return {
      type: "scoped_terminal_suppresses_global_sort",
      message: `Unsupported scoped override mode ${mode}.`,
    };
  }

  const scopedCrews = result.ranked
    .map((crew) => toRankedCrewLike(crew))
    .filter((crew) => normalizeTerminalLabel(crew.terminal) === normalizeTerminalLabel(terminal));

  let overrideEvidencePairs = 0;

  for (let index = 0; index < scopedCrews.length - 1; index += 1) {
    const currentCrew = scopedCrews[index];
    const nextCrew = scopedCrews[index + 1];
    const currentSuppressedValue = getSortableFieldValue(
      currentCrew,
      suppressedGlobalSort.field
    );
    const nextSuppressedValue = getSortableFieldValue(
      nextCrew,
      suppressedGlobalSort.field
    );

    if (currentSuppressedValue == null || nextSuppressedValue == null) continue;
    if (currentSuppressedValue === nextSuppressedValue) continue;

    const respectsSuppressedGlobalSort =
      suppressedGlobalSort.direction === "asc"
        ? currentSuppressedValue <= nextSuppressedValue
        : currentSuppressedValue >= nextSuppressedValue;

    let respectsAtLeastOneScopedSort = false;
    let hasComparableScopedSort = false;

    for (const scopedSort of enforcedScopedSorts) {
      const currentScopedValue = getSortableFieldValue(currentCrew, scopedSort.field);
      const nextScopedValue = getSortableFieldValue(nextCrew, scopedSort.field);

      if (currentScopedValue == null || nextScopedValue == null) continue;
      if (currentScopedValue === nextScopedValue) continue;

      hasComparableScopedSort = true;

      const respectsScopedSort =
        scopedSort.direction === "asc"
          ? currentScopedValue <= nextScopedValue
          : currentScopedValue >= nextScopedValue;

      if (respectsScopedSort) {
        respectsAtLeastOneScopedSort = true;
        break;
      }
    }

    if (!hasComparableScopedSort) continue;

    if (!respectsSuppressedGlobalSort && respectsAtLeastOneScopedSort) {
      overrideEvidencePairs += 1;
    }
  }

  if (overrideEvidencePairs < requireAtLeastComparablePairs) {
    return {
      type: "scoped_terminal_suppresses_global_sort",
      message: `Within ${terminal}, only ${overrideEvidencePairs} override-evidence pair(s) were found showing scoped sorts suppressing global ${suppressedGlobalSort.field} ${suppressedGlobalSort.direction}; expected at least ${requireAtLeastComparablePairs}.`,
    };
  }

  return null;
}

function evaluateAssertion(
  assertion: PromptRegressionAssertion,
  result: PromptDebugResult,
  summary: PromptDebugSummary,
  parsed: ParsedPreferencesLike
): PromptRegressionAssertionFailure | null {
  if (assertion.type === "no_priority_violations") {
    return summary.priorityViolationsCount === 0
      ? null
      : {
          type: assertion.type,
          message: `Expected no priority violations but found ${summary.priorityViolationsCount}.`,
        };
  }

  if (assertion.type === "no_visible_contradictions") {
    const failures = collectVisibleContradictionFailures(result, parsed);
    return failures.length === 0
      ? null
      : {
          type: assertion.type,
          message: failures.map((failure) => failure.message).join(" "),
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

  if (assertion.type === "parsed_priority_order_exact") {
    const actual = (parsed.priority_groups ?? [])
      .sort((left, right) => left.rank - right.rank)
      .map((group) => {
        const terminalCondition = group.conditions.find(
          (condition) => condition.field === "terminal"
        );
        return normalizeTerminalLabel(String(terminalCondition?.value ?? ""));
      })
      .filter(Boolean);
    const expected = assertion.value.map(normalizeTerminalLabel);

    return valuesEqual(actual, expected)
      ? null
      : {
          type: assertion.type,
          message: `Expected parsed terminal priority order ${assertion.value.join(", ")} but found ${actual.join(", ")}.`,
        };
  }

  if (assertion.type === "parsed_priority_terminal_absent") {
    const normalizedExpectedTerminal = normalizeTerminalLabel(assertion.value.terminal);
    const found = (parsed.priority_groups ?? []).some((group) =>
      group.conditions.some(
        (condition) =>
          condition.field === "terminal" &&
          normalizeTerminalLabel(String(condition.value ?? "")) === normalizedExpectedTerminal
      )
    );

    return !found
      ? null
      : {
          type: assertion.type,
          message: `Expected terminal ${assertion.value.terminal} to be absent from parsed positive priority groups.`,
        };
  }

  if (assertion.type === "parsed_global_filter_present") {
    const found = (parsed.filters ?? []).some((filter) =>
      matchesFilterExpectation(filter, assertion.value)
    );
    return found
      ? null
      : {
          type: assertion.type,
          message: `Expected global filter ${assertion.value.field} to be present.`,
        };
  }

  if (assertion.type === "parsed_global_filter_absent") {
    const found = (parsed.filters ?? []).some((filter) =>
      matchesFilterExpectation(filter, assertion.value)
    );
    return !found
      ? null
      : {
          type: assertion.type,
          message: `Expected global filter ${assertion.value.field} to be absent.`,
        };
  }

  if (assertion.type === "parsed_scoped_filter_present") {
    const scoped = getScopedPreference(parsed, assertion.value.terminal);
    const found = (scoped?.filters ?? []).some((filter) =>
      matchesFilterExpectation(filter, assertion.value.filter)
    );
    return found
      ? null
      : {
          type: assertion.type,
          message: `Expected scoped filter ${assertion.value.filter.field} to be present for ${assertion.value.terminal}.`,
        };
  }

  if (assertion.type === "parsed_scoped_filter_absent") {
    const scoped = getScopedPreference(parsed, assertion.value.terminal);
    const found = (scoped?.filters ?? []).some((filter) =>
      matchesFilterExpectation(filter, assertion.value.filter)
    );
    return !found
      ? null
      : {
          type: assertion.type,
          message: `Expected scoped filter ${assertion.value.filter.field} to be absent for ${assertion.value.terminal}.`,
        };
  }

  if (assertion.type === "parsed_global_sort_present") {
    const found = (parsed.sort_preferences ?? []).some((sort) =>
      matchesSortExpectation(sort, assertion.value)
    );
    return found
      ? null
      : {
          type: assertion.type,
          message: `Expected global sort ${assertion.value.field} ${assertion.value.direction} to be present.`,
        };
  }

  if (assertion.type === "parsed_scoped_sort_present") {
    const scoped = getScopedPreference(parsed, assertion.value.terminal);
    const found = (scoped?.sort_preferences ?? []).some((sort) =>
      matchesSortExpectation(sort, assertion.value.sort)
    );
    return found
      ? null
      : {
          type: assertion.type,
          message: `Expected scoped sort ${assertion.value.sort.field} ${assertion.value.sort.direction} for ${assertion.value.terminal}.`,
        };
  }

  if (assertion.type === "ranked_terminals_only") {
    const allowed = new Set(assertion.value.map(normalizeTerminalLabel));
    const disallowed = result.ranked
      .map((crew) => crew.terminal)
      .filter((terminal) => !allowed.has(normalizeTerminalLabel(terminal)));

    return disallowed.length === 0
      ? null
      : {
          type: assertion.type,
          message: `Found ranked crews outside the allowed terminals: ${Array.from(new Set(disallowed)).join(", ")}.`,
        };
  }

  if (assertion.type === "crew_ranked") {
    const match = result.ranked.find(
      (crew) => String(crew.id).trim() === assertion.value.crewId.trim()
    );
    if (!match) {
      return {
        type: assertion.type,
        message: `Expected crew ${assertion.value.crewId} to be ranked, but it was not found.`,
      };
    }

    if (
      assertion.value.terminal &&
      normalizeTerminalLabel(match.terminal) !== normalizeTerminalLabel(assertion.value.terminal)
    ) {
      return {
        type: assertion.type,
        message: `Expected ranked crew ${assertion.value.crewId} to be at ${assertion.value.terminal}, but found ${match.terminal}.`,
      };
    }

    return null;
  }

  if (assertion.type === "crew_excluded") {
    const match = result.excluded.find(
      (crew) => String(crew.id).trim() === assertion.value.crewId.trim()
    );
    if (!match) {
      return {
        type: assertion.type,
        message: `Expected crew ${assertion.value.crewId} to be excluded, but it was not found.`,
      };
    }

    if (
      assertion.value.reasonIncludes &&
      !match.reason.toLowerCase().includes(assertion.value.reasonIncludes.toLowerCase())
    ) {
      return {
        type: assertion.type,
        message: `Expected excluded crew ${assertion.value.crewId} reason to include "${assertion.value.reasonIncludes}" but found "${match.reason}".`,
      };
    }

    return null;
  }

  if (assertion.type === "tradeoff_present") {
    const found = (parsed.tradeoffs ?? []).some(
      (tradeoff) =>
        tradeoff.type === assertion.value.type &&
        (assertion.value.value == null || String(tradeoff.value) === assertion.value.value)
    );

    return found
      ? null
      : {
          type: assertion.type,
          message: `Expected tradeoff ${assertion.value.type} to be present.`,
        };
  }

  if (assertion.type === "avoid_is_not_hard") {
    const normalizedTerminal = normalizeTerminalLabel(assertion.value.terminal);
    const disallowFilters = assertion.value.disallowFilters ?? [];

    const disallowedMatches = (parsed.filters ?? []).filter((filter) => {
      if (disallowFilters.some((expected) => matchesFilterExpectation(filter, expected))) {
        return true;
      }

      if (
        normalizedTerminal &&
        filter.field === "terminal" &&
        filter.operator === "not_in" &&
        Array.isArray(filter.value)
      ) {
        return filter.value.some(
          (value) => normalizeTerminalLabel(String(value)) === normalizedTerminal
        );
      }

      return false;
    });

    return disallowedMatches.length === 0
      ? null
      : {
          type: assertion.type,
          message: `Avoid rule became hard via filters: ${disallowedMatches
            .map((filter) => `${filter.field} ${filter.operator}`)
            .join(", ")}.`,
        };
  }

  if (assertion.type === "conditional_terminal_fallback") {
    return evaluateConditionalTerminalFallbackAssertion(
      result,
      assertion.value.primary.terminal,
      assertion.value.primary.requires,
      assertion.value.fallback.terminal
    );
  }

  if (assertion.type === "scoped_rank_order_respects_sort") {
    return evaluateScopedRankOrderRespectsSortAssertion(
      result,
      assertion.value.terminal,
      assertion.value.field,
      assertion.value.direction,
      assertion.value.mode ?? "pairwise_consecutive_distinct",
      assertion.value.requireAtLeastComparablePairs ?? 1
    );
  }

  if (assertion.type === "scoped_terminal_suppresses_global_sort") {
    return evaluateScopedTerminalSuppressesGlobalSortAssertion(
      result,
      assertion.value.terminal,
      assertion.value.suppressedGlobalSort,
      assertion.value.enforcedScopedSorts,
      assertion.value.mode ?? "consecutive_pair_evidence",
      assertion.value.requireAtLeastComparablePairs ?? 1
    );
  }

  if (assertion.type === "interpretation_issue_absent") {
    const matchingIssue = (result.interpretationIssues ?? []).find((issue) => {
      if (assertion.value.code && issue.code !== assertion.value.code) return false;
      if (assertion.value.scope && issue.scope !== assertion.value.scope) return false;
      if (
        assertion.value.messageIncludes &&
        !String(issue.message ?? "")
          .toLowerCase()
          .includes(assertion.value.messageIncludes.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    return !matchingIssue
      ? null
      : {
          type: assertion.type,
          message: `Found unexpected interpretation issue${matchingIssue.code ? ` ${matchingIssue.code}` : ""}: ${matchingIssue.message}`,
        };
  }

  return null;
}

export function evaluatePromptRegressionAssertions(
  regressionCase: PromptRegressionCase,
  result: PromptDebugResult,
  summary: PromptDebugSummary
): PromptRegressionAssertionFailure[] {
  if (!isParsedPreferencesLike(result.parsedPreferences)) {
    return [
      {
        type: "mechanical_verification",
        message:
          "Regression assertions could not run because parsedPreferences did not match the inspectable debug shape.",
      },
    ];
  }

  const parsed = result.parsedPreferences;
  const failures: PromptRegressionAssertionFailure[] = [
    ...collectVisibleContradictionFailures(result, parsed),
  ];

  for (const assertion of regressionCase.assertions ?? []) {
    const failure = evaluateAssertion(assertion, result, summary, parsed);
    if (failure) {
      failures.push(failure);
    }
  }

  return failures;
}
