"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROMPT_REGRESSION_SUITE = void 0;
// Intentionally empty until canonical prompt cases and fail conditions are supplied.
// The framework is strict and data-driven, but the actual regression cases should come
// only from the user-provided canonical set.
exports.DEFAULT_PROMPT_REGRESSION_SUITE = [
    {
        id: "canonical-lewis-road-only",
        label: "Lewis Road only",
        prompt: "Lewis Road only",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Lewis Road"],
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "in",
                    value: ["lewis road"],
                    strength: "hard",
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Lewis Road"],
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-lewis-road-only-no-starts-before-0500",
        label: "Lewis Road only, no starts before 05:00",
        prompt: "Lewis Road only, no starts before 05:00",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Lewis Road"],
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "in",
                    value: ["lewis road"],
                    strength: "hard",
                },
            },
            {
                type: "parsed_scoped_filter_present",
                value: {
                    terminal: "Lewis Road",
                    filter: {
                        field: "on_duty",
                        operator: ">=",
                        value: "05:00",
                        strength: "hard",
                    },
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Lewis Road"],
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-no-up-jobs",
        label: "No UP jobs",
        prompt: "No UP jobs",
        assertions: [
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "exclude_up_crews",
                    operator: "=",
                    value: true,
                    strength: "hard",
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-willowbrook-only-no-finishes-after-0200",
        label: "Willowbrook only. No jobs finishing after 02:00.",
        prompt: "Willowbrook only. No jobs finishing after 02:00.",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Willowbrook"],
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "in",
                    value: ["willowbrook"],
                    strength: "hard",
                },
            },
            {
                type: "parsed_scoped_filter_present",
                value: {
                    terminal: "Willowbrook",
                    filter: {
                        field: "off_duty",
                        operator: "<=",
                        value: "02:00",
                        strength: "hard",
                    },
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Willowbrook"],
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-lewis-road-willowbrook-barrie-no-other-terminals",
        label: "Lewis Road first, then Willowbrook, then Barrie. No other terminals.",
        prompt: "Lewis Road first, then Willowbrook, then Barrie. No other terminals.",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Lewis Road", "Willowbrook", "Barrie"],
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "in",
                    value: ["lewis road", "willowbrook", "barrie"],
                    strength: "hard",
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Lewis Road", "Willowbrook", "Barrie"],
            },
            {
                type: "no_priority_violations",
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-avoid-willowbrook-but-do-not-exclude-it",
        label: "Avoid Willowbrook, but do not exclude it.",
        prompt: "Avoid Willowbrook, but do not exclude it.",
        assertions: [
            {
                type: "interpretation_issue_absent",
                value: {
                    code: "unknown_clause",
                    messageIncludes: "Avoid Willowbrook",
                },
            },
            {
                type: "tradeoff_present",
                value: {
                    type: "avoid_terminal",
                    value: "willowbrook",
                },
            },
            {
                type: "avoid_is_not_hard",
                value: {
                    terminal: "Willowbrook",
                },
            },
            {
                type: "parsed_priority_terminal_absent",
                value: {
                    terminal: "Willowbrook",
                },
            },
        ],
    },
    {
        id: "canonical-no-splits",
        label: "No splits",
        prompt: "No splits",
        assertions: [
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "split_time",
                    operator: "=",
                    value: "none",
                    strength: "hard",
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-standby-only",
        label: "Standby only",
        prompt: "Standby only",
        assertions: [
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "include_only_standby_crews",
                    operator: "=",
                    value: true,
                    strength: "hard",
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Standby"],
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-no-shuttle-bus",
        label: "No shuttle bus",
        prompt: "No shuttle bus",
        assertions: [
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "shuttle_bus",
                    operator: "=",
                    value: false,
                    strength: "hard",
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-lr-mornings-wb-evenings",
        label: "Lewis Road mornings first, Willowbrook evenings first",
        prompt: "Lewis Road mornings first, Willowbrook evenings first",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Lewis Road", "Willowbrook"],
            },
            {
                type: "parsed_scoped_sort_present",
                value: {
                    terminal: "Lewis Road",
                    sort: {
                        field: "on_duty",
                        direction: "asc",
                        strength: "strong",
                    },
                },
            },
            {
                type: "parsed_scoped_sort_present",
                value: {
                    terminal: "Willowbrook",
                    sort: {
                        field: "on_duty",
                        direction: "desc",
                        strength: "strong",
                    },
                },
            },
            {
                type: "scoped_rank_order_respects_sort",
                value: {
                    terminal: "Lewis Road",
                    field: "on_duty",
                    direction: "asc",
                },
            },
            {
                type: "scoped_rank_order_respects_sort",
                value: {
                    terminal: "Willowbrook",
                    field: "on_duty",
                    direction: "desc",
                },
            },
            {
                type: "no_priority_violations",
            },
        ],
    },
    {
        id: "canonical-barrie-only-finish-by-1800",
        label: "Barrie only if it finishes by 18:00",
        prompt: "Barrie only if it finishes by 18:00",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Barrie"],
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "in",
                    value: ["barrie"],
                    strength: "hard",
                },
            },
            {
                type: "parsed_scoped_filter_present",
                value: {
                    terminal: "Barrie",
                    filter: {
                        field: "off_duty",
                        operator: "<=",
                        value: "18:00",
                        strength: "hard",
                    },
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Barrie"],
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-exclude-willowbrook",
        label: "Exclude Willowbrook",
        prompt: "Exclude Willowbrook",
        assertions: [
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "not_in",
                    value: ["willowbrook"],
                    strength: "hard",
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-lewis-road-and-willowbrook-only-exclude-up",
        label: "Lewis Road and Willowbrook only, exclude UP jobs",
        prompt: "Lewis Road and Willowbrook only, exclude UP jobs",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Lewis Road", "Willowbrook"],
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "terminal",
                    operator: "in",
                    value: ["lewis road", "willowbrook"],
                    strength: "hard",
                },
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "exclude_up_crews",
                    operator: "=",
                    value: true,
                    strength: "hard",
                },
            },
            {
                type: "ranked_terminals_only",
                value: ["Lewis Road", "Willowbrook"],
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-three-day-off-first-no-splits",
        label: "3 day off jobs first, no splits",
        prompt: "3 day off jobs first, no splits",
        assertions: [
            {
                type: "parsed_global_sort_present",
                value: {
                    field: "three_day_off_jobs",
                    direction: "desc",
                    strength: "strong",
                },
            },
            {
                type: "parsed_global_filter_present",
                value: {
                    field: "split_time",
                    operator: "=",
                    value: "none",
                    strength: "hard",
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-three-day-off-first-except-not-at-willowbrook",
        label: "3 day off jobs first, except not at Willowbrook. Willowbrook should instead rank by highest overtime to lowest and later starts first.",
        prompt: "3 day off jobs first, except not at Willowbrook. Willowbrook should instead rank by highest overtime to lowest and later starts first.",
        assertions: [
            {
                type: "parsed_global_sort_present",
                value: {
                    field: "three_day_off_jobs",
                    direction: "desc",
                    strength: "strong",
                },
            },
            {
                type: "parsed_scoped_sort_present",
                value: {
                    terminal: "Willowbrook",
                    sort: {
                        field: "overtime_hours_weekly",
                        direction: "desc",
                        strength: "strong",
                    },
                },
            },
            {
                type: "parsed_scoped_sort_present",
                value: {
                    terminal: "Willowbrook",
                    sort: {
                        field: "on_duty",
                        direction: "desc",
                        strength: "strong",
                    },
                },
            },
            {
                type: "scoped_rank_order_respects_sort",
                value: {
                    terminal: "Willowbrook",
                    field: "overtime_hours_weekly",
                    direction: "desc",
                },
            },
            {
                type: "scoped_rank_order_respects_sort",
                value: {
                    terminal: "Willowbrook",
                    field: "on_duty",
                    direction: "desc",
                },
            },
            {
                type: "scoped_terminal_suppresses_global_sort",
                value: {
                    terminal: "Willowbrook",
                    suppressedGlobalSort: {
                        field: "three_day_off_jobs",
                        direction: "desc",
                    },
                    enforcedScopedSorts: [
                        {
                            field: "overtime_hours_weekly",
                            direction: "desc",
                        },
                        {
                            field: "on_duty",
                            direction: "desc",
                        },
                    ],
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
    {
        id: "canonical-barrie-finish-by-1800-otherwise-willowbrook",
        label: "Barrie if it finishes by 18:00, otherwise Willowbrook",
        prompt: "Barrie if it finishes by 18:00, otherwise Willowbrook",
        assertions: [
            {
                type: "parsed_priority_order_exact",
                value: ["Barrie", "Willowbrook"],
            },
            {
                type: "parsed_scoped_filter_present",
                value: {
                    terminal: "Barrie",
                    filter: {
                        field: "off_duty",
                        operator: "<=",
                        value: "18:00",
                        strength: "hard",
                    },
                },
            },
            {
                type: "conditional_terminal_fallback",
                value: {
                    primary: {
                        terminal: "Barrie",
                        requires: [
                            {
                                field: "off_duty",
                                operator: "<=",
                                value: "18:00",
                                strength: "hard",
                            },
                        ],
                    },
                    fallback: {
                        terminal: "Willowbrook",
                    },
                },
            },
            {
                type: "no_visible_contradictions",
            },
        ],
    },
];
