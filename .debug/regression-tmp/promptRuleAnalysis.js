"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeParsedPreferences = analyzeParsedPreferences;
function normalizeDayName(day) {
    return String(day).trim().toLowerCase();
}
function isWeekendDay(day) {
    return ["sat", "saturday", "sun", "sunday"].includes(normalizeDayName(day));
}
function formatValue(value) {
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    if (typeof value === "boolean") {
        return value ? "yes" : "no";
    }
    return String(value);
}
function formatNaturalList(values) {
    const cleaned = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
    if (cleaned.length === 0)
        return "";
    if (cleaned.length === 1)
        return cleaned[0];
    if (cleaned.length === 2)
        return `${cleaned[0]} and ${cleaned[1]}`;
    return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}
function humanizeFieldName(field) {
    switch (field) {
        case "on_duty":
            return "start time";
        case "off_duty":
            return "finish time";
        case "job_type":
            return "job type";
        case "job_subtype":
            return "job subtype";
        case "job_direction":
            return "job direction";
        case "split_time":
            return "split jobs";
        case "shuttle_bus":
            return "shuttle bus jobs";
        case "weekday_days_off_count":
            return "weekday days off";
        case "weekend_days_off":
            return "weekend days off";
        case "days_off_count":
            return "days off";
        default:
            return field.replace(/_/g, " ");
    }
}
function humanizeOperator(operator) {
    switch (operator) {
        case "in":
            return "allows";
        case "not_in":
            return "excludes";
        case "=":
            return "is";
        case "!=":
            return "is not";
        case ">=":
            return "is at least";
        case "<=":
            return "is at most";
        case ">":
            return "is after";
        case "<":
            return "is before";
        default:
            return operator;
    }
}
function formatFilterRuleLabel(filter, formatTerminalDisplayName) {
    if (filter.field === "on_duty" && filter.operator === ">=") {
        return `Only show jobs starting after ${filter.value}`;
    }
    if (filter.field === "on_duty" && filter.operator === "<=") {
        return `Only show jobs starting before ${filter.value}`;
    }
    if (filter.field === "off_duty" && filter.operator === "<=") {
        return `Only show jobs finishing by ${filter.value}`;
    }
    if (filter.field === "off_duty" && filter.operator === ">=") {
        return `Only show jobs finishing after ${filter.value}`;
    }
    if (filter.field === "terminal" &&
        filter.operator === "in" &&
        Array.isArray(filter.value)) {
        return `Only show crews from ${formatNaturalList(filter.value.map((value) => formatTerminalDisplayName(String(value))))}`;
    }
    if (filter.field === "terminal" &&
        filter.operator === "not_in" &&
        Array.isArray(filter.value)) {
        return `Hide crews from ${formatNaturalList(filter.value.map((value) => formatTerminalDisplayName(String(value))))}`;
    }
    if (filter.field === "weekend_days_off" &&
        filter.operator === "=" &&
        filter.value === false) {
        return "Weekdays off only";
    }
    if (filter.field === "weekends_off_hard" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Weekends off only";
    }
    if (filter.field === "weekday_days_off_count" &&
        filter.operator === "=" &&
        typeof filter.value === "number") {
        return `Exactly ${filter.value} weekdays off`;
    }
    if (filter.field === "include_only_three_day_off_jobs" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Only show 3-day-off jobs";
    }
    if (filter.field === "exclude_three_day_off_jobs" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Hide 3-day-off jobs";
    }
    if (filter.field === "split_time" && filter.operator === "=" && filter.value === "none") {
        return "No split jobs";
    }
    if (filter.field === "shuttle_bus" &&
        filter.operator === "=" &&
        filter.value === false) {
        return "No shuttle bus jobs";
    }
    if (filter.field === "shuttle_bus" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Only shuttle bus jobs";
    }
    if (filter.field === "exclude_up_crews" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Hide UP crews";
    }
    if (filter.field === "include_only_spareboard_crews" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Only spareboard crews";
    }
    if (filter.field === "exclude_spareboard_crews" &&
        filter.operator === "=" &&
        filter.value === true) {
        return "Hide spareboard crews";
    }
    return `${humanizeFieldName(filter.field)} ${humanizeOperator(filter.operator)} ${formatValue(filter.value)}`;
}
function formatSortRuleLabel(sort) {
    if (sort.field === "on_duty" && sort.direction === "asc") {
        return "Earlier starts first";
    }
    if (sort.field === "on_duty" && sort.direction === "desc") {
        return "Later starts first";
    }
    if (sort.field === "off_duty" && sort.direction === "asc") {
        return "Earlier finishes first";
    }
    if (sort.field === "off_duty" && sort.direction === "desc") {
        return "Later finishes first";
    }
    if (sort.field === "overtime_hours_weekly" && sort.direction === "desc") {
        return "Highest overtime first";
    }
    if (sort.field === "overtime_hours_weekly" && sort.direction === "asc") {
        return "Lowest overtime first";
    }
    if (sort.field === "operating_hours_daily" && sort.direction === "asc") {
        return "Lowest operating time first";
    }
    if (sort.field === "operating_hours_daily" && sort.direction === "desc") {
        return "Highest operating time first";
    }
    if (sort.field === "van_hours_daily" && sort.direction === "asc") {
        return "Lowest van time first";
    }
    if (sort.field === "van_hours_daily" && sort.direction === "desc") {
        return "Highest van time first";
    }
    if (sort.field === "weekends_off" && sort.direction === "desc") {
        return "Weekends off first";
    }
    if (sort.field === "three_day_off_jobs" && sort.direction === "desc") {
        return "3-day-off jobs first";
    }
    if (sort.field === "three_day_off_jobs" && sort.direction === "asc") {
        return "3-day-off jobs last";
    }
    return `Sort by ${humanizeFieldName(sort.field)} ${sort.direction === "asc" ? "(low to high)" : "(high to low)"}`;
}
function pushScopeIssue(issues, issue) {
    const duplicate = issues.some((existing) => existing.code === issue.code &&
        existing.scope === issue.scope &&
        existing.terminal === issue.terminal &&
        existing.message === issue.message);
    if (!duplicate) {
        issues.push(issue);
    }
}
function analyzeScopeForIssues(filters, sorts, requiredDaysOff, requiresWeekendsOff, scope, terminal, issues) {
    const minStart = filters.find((filter) => filter.field === "on_duty" && filter.operator === ">=");
    const maxStart = filters.find((filter) => filter.field === "on_duty" && filter.operator === "<=");
    const minFinish = filters.find((filter) => filter.field === "off_duty" && filter.operator === ">=");
    const maxFinish = filters.find((filter) => filter.field === "off_duty" && filter.operator === "<=");
    const weekdaysOnly = filters.some((filter) => filter.field === "weekend_days_off" &&
        filter.operator === "=" &&
        filter.value === false);
    const weekendsOnly = requiresWeekendsOff || filters.some((filter) => filter.field === "weekends_off_hard" &&
        filter.operator === "=" &&
        filter.value === true);
    const onlyThreeDayOff = filters.some((filter) => filter.field === "include_only_three_day_off_jobs" &&
        filter.operator === "=" &&
        filter.value === true);
    const noThreeDayOff = filters.some((filter) => filter.field === "exclude_three_day_off_jobs" &&
        filter.operator === "=" &&
        filter.value === true);
    const onlySpareboard = filters.some((filter) => filter.field === "include_only_spareboard_crews" &&
        filter.operator === "=" &&
        filter.value === true);
    const noSpareboard = filters.some((filter) => filter.field === "exclude_spareboard_crews" &&
        filter.operator === "=" &&
        filter.value === true);
    if (minStart &&
        maxStart &&
        String(minStart.value) > String(maxStart.value)) {
        pushScopeIssue(issues, {
            severity: "error",
            code: "start_time_window_conflict",
            message: `Start-time rules conflict (${minStart.value} to ${maxStart.value}).`,
            scope,
            terminal,
        });
    }
    if (minFinish &&
        maxFinish &&
        String(minFinish.value) > String(maxFinish.value)) {
        pushScopeIssue(issues, {
            severity: "error",
            code: "finish_time_window_conflict",
            message: `Finish-time rules conflict (${minFinish.value} to ${maxFinish.value}).`,
            scope,
            terminal,
        });
    }
    if (weekdaysOnly && weekendsOnly) {
        pushScopeIssue(issues, {
            severity: "error",
            code: "weekday_weekend_conflict",
            message: "This scope asks for both weekdays off only and weekends off only.",
            scope,
            terminal,
        });
    }
    if (onlyThreeDayOff && noThreeDayOff) {
        pushScopeIssue(issues, {
            severity: "error",
            code: "three_day_off_conflict",
            message: "This scope asks to both require and exclude 3 day off jobs.",
            scope,
            terminal,
        });
    }
    if (onlySpareboard && noSpareboard) {
        pushScopeIssue(issues, {
            severity: "error",
            code: "spareboard_conflict",
            message: "This scope asks to both require and exclude spareboard crews.",
            scope,
            terminal,
        });
    }
    if (weekdaysOnly && requiredDaysOff.some(isWeekendDay)) {
        pushScopeIssue(issues, {
            severity: "error",
            code: "required_day_conflict",
            message: "This scope asks for weekdays off only but also requires a weekend day off.",
            scope,
            terminal,
        });
    }
    const sortDirectionsByField = new Map();
    for (const sort of sorts) {
        if (!sortDirectionsByField.has(sort.field)) {
            sortDirectionsByField.set(sort.field, new Set());
        }
        sortDirectionsByField.get(sort.field).add(sort.direction);
    }
    for (const [field, directions] of sortDirectionsByField.entries()) {
        if (directions.size > 1) {
            pushScopeIssue(issues, {
                severity: "warning",
                code: "sort_direction_conflict",
                message: `This scope contains competing sort directions for ${field}.`,
                scope,
                terminal,
            });
        }
    }
}
function analyzeParsedPreferences(parsed, formatTerminalDisplayName) {
    const rules = [];
    const issues = [];
    for (const group of parsed.priority_groups ?? []) {
        const terminalCondition = group.conditions.find((condition) => condition.field === "terminal");
        if (!terminalCondition)
            continue;
        rules.push({
            category: "priority",
            scope: "terminal",
            terminal: formatTerminalDisplayName(String(terminalCondition.value)),
            label: `Priority ${group.rank}: ${formatTerminalDisplayName(String(terminalCondition.value))}`,
            sourceField: "terminal",
            sourceOperator: "=",
        });
    }
    for (const filter of parsed.filters ?? []) {
        rules.push({
            category: "hard_filter",
            scope: "global",
            label: formatFilterRuleLabel(filter, formatTerminalDisplayName),
            sourceField: filter.field,
            sourceOperator: filter.operator,
        });
    }
    for (const sort of parsed.sort_preferences ?? []) {
        rules.push({
            category: "preference",
            scope: "global",
            label: formatSortRuleLabel(sort),
            sourceField: sort.field,
            sourceOperator: sort.direction,
        });
    }
    for (const scope of parsed.scoped_preferences ?? []) {
        const terminalLabel = formatTerminalDisplayName(scope.normalized_terminal || scope.terminal);
        for (const filter of scope.filters ?? []) {
            rules.push({
                category: "hard_filter",
                scope: "terminal",
                terminal: terminalLabel,
                label: formatFilterRuleLabel(filter, formatTerminalDisplayName),
                sourceField: filter.field,
                sourceOperator: filter.operator,
            });
        }
        for (const sort of scope.sort_preferences ?? []) {
            rules.push({
                category: "preference",
                scope: "terminal",
                terminal: terminalLabel,
                label: formatSortRuleLabel(sort),
                sourceField: sort.field,
                sourceOperator: sort.direction,
            });
        }
        if (scope.requires_weekends_off) {
            rules.push({
                category: "hard_filter",
                scope: "terminal",
                terminal: terminalLabel,
                label: "Weekends off only",
                sourceField: "weekends_off_hard",
                sourceOperator: "=",
            });
        }
        if ((scope.required_days_off ?? []).length > 0) {
            rules.push({
                category: "hard_filter",
                scope: "terminal",
                terminal: terminalLabel,
                label: `Must include: ${scope.required_days_off.join(", ")}`,
            });
        }
        analyzeScopeForIssues(scope.filters ?? [], scope.sort_preferences ?? [], scope.required_days_off ?? [], scope.requires_weekends_off, "terminal", terminalLabel, issues);
    }
    analyzeScopeForIssues(parsed.filters ?? [], parsed.sort_preferences ?? [], [], false, "global", undefined, issues);
    for (const tradeoff of parsed.tradeoffs ?? []) {
        rules.push({
            category: "tradeoff",
            scope: "global",
            label: tradeoff.value
                ? `${tradeoff.type}: ${tradeoff.value}`
                : tradeoff.type,
        });
    }
    for (const clause of parsed.unknown_clauses ?? []) {
        rules.push({
            category: "unknown",
            scope: "global",
            label: clause.text,
        });
        pushScopeIssue(issues, {
            severity: "warning",
            code: "unknown_clause",
            message: `This phrase may not have been fully interpreted: "${clause.text}"`,
            scope: "global",
        });
    }
    return {
        rules,
        issues,
    };
}
