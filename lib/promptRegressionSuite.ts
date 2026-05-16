export type PromptRegressionFilterExpectation = {
  field: string;
  operator?: string;
  value?: string | number | boolean | string[];
  strength?: string;
};

export type PromptRegressionSortExpectation = {
  field: string;
  direction: "asc" | "desc";
  strength?: string;
};

export type PromptRegressionAssertion =
  | {
      type: "no_priority_violations";
    }
  | {
      type: "no_visible_contradictions";
    }
  | {
      type: "ranked_count_at_least";
      value: number;
    }
  | {
      type: "parsed_priority_order_exact";
      value: string[];
    }
  | {
      type: "parsed_priority_terminal_absent";
      value: {
        terminal: string;
      };
    }
  | {
      type: "parsed_global_filter_present";
      value: PromptRegressionFilterExpectation;
    }
  | {
      type: "parsed_global_filter_absent";
      value: PromptRegressionFilterExpectation;
    }
  | {
      type: "parsed_scoped_filter_present";
      value: {
        terminal: string;
        filter: PromptRegressionFilterExpectation;
      };
    }
  | {
      type: "parsed_scoped_filter_absent";
      value: {
        terminal: string;
        filter: PromptRegressionFilterExpectation;
      };
    }
  | {
      type: "parsed_global_sort_present";
      value: PromptRegressionSortExpectation;
    }
  | {
      type: "parsed_scoped_sort_present";
      value: {
        terminal: string;
        sort: PromptRegressionSortExpectation;
      };
    }
  | {
      type: "ranked_terminals_only";
      value: string[];
    }
  | {
      type: "crew_ranked";
      value: {
        crewId: string;
        terminal?: string;
      };
    }
  | {
      type: "crew_excluded";
      value: {
        crewId: string;
        reasonIncludes?: string;
      };
    }
  | {
      type: "tradeoff_present";
      value: {
        type: string;
        value?: string;
      };
    }
  | {
      type: "avoid_is_not_hard";
      value: {
        terminal?: string;
        disallowFilters?: PromptRegressionFilterExpectation[];
      };
    }
  | {
      type: "conditional_terminal_fallback";
      value: {
        primary: {
          terminal: string;
          requires: PromptRegressionFilterExpectation[];
        };
        fallback: {
          terminal: string;
        };
      };
    }
  | {
      type: "scoped_rank_order_respects_sort";
      value: {
        terminal: string;
        field:
          | "on_duty"
          | "off_duty"
          | "operating_hours_daily"
          | "operating_hours_weekly"
          | "van_hours_daily"
          | "overtime_hours_weekly"
          | "total_paid_hours_weekly";
        direction: "asc" | "desc";
        mode?: "pairwise_consecutive_distinct";
        requireAtLeastComparablePairs?: number;
      };
    }
  | {
      type: "scoped_terminal_suppresses_global_sort";
      value: {
        terminal: string;
        suppressedGlobalSort: {
          field:
            | "on_duty"
            | "off_duty"
            | "operating_hours_daily"
            | "operating_hours_weekly"
            | "van_hours_daily"
            | "overtime_hours_weekly"
            | "total_paid_hours_weekly"
            | "three_day_off_jobs";
          direction: "asc" | "desc";
        };
        enforcedScopedSorts: Array<{
          field:
            | "on_duty"
            | "off_duty"
            | "operating_hours_daily"
            | "operating_hours_weekly"
            | "van_hours_daily"
            | "overtime_hours_weekly"
            | "total_paid_hours_weekly";
          direction: "asc" | "desc";
        }>;
        requireAtLeastComparablePairs?: number;
        mode?: "consecutive_pair_evidence";
      };
    }
  | {
      type: "interpretation_issue_absent";
      value: {
        code?: string;
        scope?: "global" | "scoped";
        messageIncludes?: string;
      };
    };

export type PromptRegressionCase = {
  id: string;
  label: string;
  prompt: string;
  notes?: string;
  assertions: PromptRegressionAssertion[];
};

// Intentionally empty until canonical prompt cases and fail conditions are supplied.
// The framework is strict and data-driven, but the actual regression cases should come
// only from the user-provided canonical set.
export const DEFAULT_PROMPT_REGRESSION_SUITE: PromptRegressionCase[] = [
  {
    id: "canonical-weekends-off-global-no-terminal-scope",
    label: "Weekends off without terminal mention",
    prompt: "weekends off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: [],
      },
      {
        type: "parsed_priority_terminal_absent",
        value: {
          terminal: "Standby",
        },
      },
      {
        type: "parsed_global_sort_present",
        value: {
          field: "weekends_off",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "weekends_off_hard",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "include_only_standby_crews",
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
    id: "canonical-prefer-weekends-off-stays-soft",
    label: "Prefer weekends off stays soft",
    prompt: "prefer weekends off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: [],
      },
      {
        type: "parsed_global_sort_present",
        value: {
          field: "weekends_off",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "weekends_off_hard",
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
    id: "canonical-weekends-off-first-stays-soft",
    label: "Weekends off first stays soft",
    prompt: "weekends off first",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: [],
      },
      {
        type: "parsed_global_sort_present",
        value: {
          field: "weekends_off",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "weekends_off_hard",
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
    id: "canonical-lincolnville-lowest-work-time",
    label: "Lincolnville weekends off sorted by lowest work time",
    prompt:
      "Lincolnville jobs with Saturday and Sunday off, lowest work time first.",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Lincolnville"],
      },
      {
        type: "parsed_scoped_sort_present",
        value: {
          terminal: "Lincolnville",
          sort: {
            field: "total_paid_hours_weekly",
            direction: "asc",
            strength: "strong",
          },
        },
      },
      {
        type: "scoped_rank_order_respects_sort",
        value: {
          terminal: "Lincolnville",
          field: "total_paid_hours_weekly",
          direction: "asc",
          mode: "pairwise_consecutive_distinct",
          requireAtLeastComparablePairs: 1,
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-weekdays-off-global-no-warning",
    label: "Weekdays off without terminal mention",
    prompt: "weekdays off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: [],
      },
      {
        type: "parsed_global_sort_present",
        value: {
          field: "weekends_off",
          direction: "asc",
          strength: "strong",
        },
      },
      {
        type: "interpretation_issue_absent",
        value: {
          code: "unknown_clause",
          messageIncludes: "weekdays off",
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-mon-tues-off-global",
    label: "Mon/Tues off global required days",
    prompt: "Mon/Tues Off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: [],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "required_days_off",
          operator: "includes_all",
          value: ["mon", "tue"],
          strength: "hard",
        },
      },
      {
        type: "interpretation_issue_absent",
        value: {
          code: "unknown_clause",
          messageIncludes: "Mon/Tues",
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-tuesday-wednesday-off-global",
    label: "Tuesday and Wednesday off global required days",
    prompt: "Tuesday and Wednesday off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: [],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "required_days_off",
          operator: "includes_all",
          value: ["tue", "wed"],
          strength: "hard",
        },
      },
      {
        type: "interpretation_issue_absent",
        value: {
          code: "unknown_clause",
          messageIncludes: "Tuesday and Wednesday off",
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
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
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lewis Road",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
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
    id: "canonical-no-long-split-shifts",
    label: "No long split shifts",
    prompt: "No long split shifts",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "split_time_weekly",
          operator: "<=",
          value: "10:00",
          strength: "hard",
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-no-up-no-barrie-no-splits-terminal-priority",
    label: "No UP, no Barrie, no split jobs with terminal priorities and weekends off",
    prompt:
      "No UP, no Barrie, no split jobs. Willowbrook first, Lewis Road second, Milton third. Weekends off only, highest overtime first, lowest operating time as tiebreaker.",
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
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "not_in",
          value: ["barrie"],
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "terminal",
          operator: "in",
          value: ["lincolnville", "lewis road", "willowbrook", "barrie"],
          strength: "hard",
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
        type: "parsed_priority_order_exact",
        value: ["Willowbrook", "Lewis Road", "Milton"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "weekends_off_hard",
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
    id: "canonical-lewis-road-lowest-operating-scoped-order",
    label: "Lewis Road scoped lowest operating time order",
    prompt:
      "Only Willowbrook, Lewis Road, and Milton. Willowbrook no mornings and weekends off. Lewis Road starts after 12:30 and lowest operating time. Milton weekends off, highest OT first. No UP.",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook", "Lewis Road", "Milton"],
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lewis Road",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "12:30",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_sort_present",
        value: {
          terminal: "Lewis Road",
          sort: {
            field: "operating_hours_weekly",
            direction: "asc",
            strength: "strong",
          },
        },
      },
      {
        type: "scoped_rank_order_respects_sort",
        value: {
          terminal: "Lewis Road",
          field: "operating_hours_weekly",
          direction: "asc",
          mode: "pairwise_consecutive_distinct",
          requireAtLeastComparablePairs: 2,
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "prompt-builder-scoped-start-time-does-not-leak",
    label: "Prompt Builder terminal-specific start time stays scoped",
    prompt:
      "Only Lewis Road, Willowbrook, and Milton. Lewis Road first, starts after 12:00, lowest operating time first. Willowbrook second, weekends off, highest overtime first. Milton third, weekends off, no split jobs. No UP, no standby, no spareboard.",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Lewis Road", "Willowbrook", "Milton"],
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lewis Road",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "12:00",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_absent",
        value: {
          terminal: "Milton",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "12:00",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "on_duty",
          operator: ">=",
          value: "12:00",
          strength: "hard",
        },
      },
      {
        type: "parsed_scoped_sort_present",
        value: {
          terminal: "Lewis Road",
          sort: {
            field: "operating_hours_weekly",
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
            field: "overtime_hours_weekly",
            direction: "desc",
            strength: "strong",
          },
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-stouffville-lewis-wb-scoped-constraints",
    label: "Stouffville, Lewis Road, and WB scoped constraints",
    prompt:
      "Stouffville jobs with weekends off first, Lewis Road after 12:30 next, WB no split jobs and no starts before 13:00 last. No Barrie, no UP, most overtime first.",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Lincolnville", "Lewis Road", "Willowbrook"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "in",
          value: ["lincolnville", "lewis road", "willowbrook"],
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "not_in",
          value: ["barrie"],
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
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lincolnville",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lewis Road",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "12:30",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "split_time",
            operator: "=",
            value: "none",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "13:00",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "split_time",
          operator: "=",
          value: "none",
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "on_duty",
          operator: ">=",
          value: "13:00",
          strength: "hard",
        },
      },
      {
        type: "interpretation_issue_absent",
        value: {
          code: "unknown_clause",
          messageIncludes: "UP",
        },
      },
      {
        type: "ranked_terminals_only",
        value: ["Lincolnville", "Lewis Road", "Willowbrook"],
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
    id: "canonical-no-shuttles",
    label: "No shuttles",
    prompt: "No shuttles",
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
    id: "canonical-no-vans",
    label: "No vans",
    prompt: "No vans",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "van",
          operator: "=",
          value: false,
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "van_hours_daily",
          operator: "=",
          value: 0,
          strength: "hard",
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-only-vans",
    label: "Only vans",
    prompt: "Only vans",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "van",
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
    id: "canonical-morning-only-weekends-off-willowbrook-lewis",
    label:
      "I want Morning Jobs only, with weekends off. Starting out of Willowbrook and then lewis",
    prompt:
      "I want Morning Jobs only , with weekends off. Starting out of Willowbrook and then lewis",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook", "Lewis Road"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "on_duty",
          operator: "<=",
          value: "11:59",
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "weekends_off_hard",
          operator: "=",
          value: true,
          strength: "hard",
        },
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
    id: "canonical-willowbrook-weekends-off-only",
    label: "Willowbrook weekends off only",
    prompt: "Willowbrook weekends off only",
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
            field: "weekends_off_hard",
            operator: "=",
            value: true,
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
    id: "canonical-wb-alias-weekends-off-only",
    label: "WB weekends off only",
    prompt: "WB weekends off only",
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
            field: "weekends_off_hard",
            operator: "=",
            value: true,
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
    id: "canonical-willowbrook-barrie-weekends-off-only",
    label: "Willowbrook and Barrie weekends off only",
    prompt: "Willowbrook and Barrie weekends off only",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook", "Barrie"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "in",
          value: ["willowbrook", "barrie"],
          strength: "hard",
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Barrie",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "ranked_terminals_only",
        value: ["Willowbrook", "Barrie"],
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-willowbrook-first-is-priority-not-only",
    label: "Willowbrook first",
    prompt: "Willowbrook first",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook"],
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "terminal",
          operator: "in",
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
    id: "canonical-lewis-road-with-sorts-is-terminal-scope",
    label: "Lewis Road, mornings only, weekends off, most OT first",
    prompt: "Lewis road , Mornings only. Weekends off. most OT first",
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
    id: "canonical-multiple-terminal-scopes-exclude-unmentioned",
    label: "RH, Lincolnville, Willowbrook terminal-scoped criteria",
    prompt:
      "RH weekends off , mornings only.  Lincolnville jobs next, weekends off not before 0500. Willowbrook jobs weekends off , no late starts",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Richmond Hill", "Lincolnville", "Willowbrook"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "in",
          value: ["richmond hill", "lincolnville", "willowbrook"],
          strength: "hard",
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Richmond Hill",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lincolnville",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "ranked_terminals_only",
        value: ["Richmond Hill", "Lincolnville", "Willowbrook"],
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-terminal-scoped-weekends-off-is-hard",
    label: "Lewis Road start time and weekends off",
    prompt: "Lewis road jobs that start after 1230, weekends off",
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
            value: "12:30",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lewis Road",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
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
    id: "canonical-stouffville-alias-is-lincolnville",
    label: "Stouffville jobs weekends off",
    prompt: "Stouffville jobs weekends off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Lincolnville"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "in",
          value: ["lincolnville"],
          strength: "hard",
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Lincolnville",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "ranked_terminals_only",
        value: ["Lincolnville"],
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-barrie-saturday-sunday-off-normalized",
    label: "Barrie jobs with Saturday and Sunday off",
    prompt: "Barrie jobs with saturday and sunday off",
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
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "ranked_count_at_least",
        value: 1,
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
    id: "canonical-spareboard-does-not-inherit-willowbrook-scope",
    label: "Spareboard does not inherit Willowbrook start-time scope",
    prompt: "Willowbrook, weekends off, starts after 1300. add spareboard with weekends off last.",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook", "Spareboard"],
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "in",
          value: ["willowbrook", "spareboard"],
          strength: "hard",
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "13:00",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Spareboard",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_absent",
        value: {
          terminal: "Spareboard",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "13:00",
            strength: "hard",
          },
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "canonical-no-mornings-drops-weaker-start-filter",
    label: "Willowbrook no mornings removes weaker starts",
    prompt: "Willowbrook jobs, no mornings with weekends off",
    assertions: [
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook"],
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "12:00",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_absent",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "on_duty",
            operator: ">=",
            value: "07:30",
            strength: "hard",
          },
        },
      },
      {
        type: "parsed_scoped_filter_present",
        value: {
          terminal: "Willowbrook",
          filter: {
            field: "weekends_off_hard",
            operator: "=",
            value: true,
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
    id: "general-days-off-prefer-3",
    label: "3 days off",
    prompt: "3 days off",
    assertions: [
      {
        type: "parsed_global_sort_present",
        value: {
          field: "days_off_count",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "tradeoff_present",
        value: {
          type: "prefer_min_days_off",
          value: "3",
        },
      },
    ],
  },
  {
    id: "general-days-off-prefer-wording",
    label: "prefer 3 days off",
    prompt: "prefer 3 days off",
    assertions: [
      {
        type: "parsed_global_sort_present",
        value: {
          field: "days_off_count",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "tradeoff_present",
        value: {
          type: "prefer_min_days_off",
          value: "3",
        },
      },
    ],
  },
  {
    id: "general-days-off-at-least-3",
    label: "at least 3 days off",
    prompt: "at least 3 days off",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "days_off_count",
          operator: ">=",
          value: 3,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "general-days-off-need-3",
    label: "need 3 days off",
    prompt: "need 3 days off",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "days_off_count",
          operator: ">=",
          value: 3,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "general-days-off-must-have-3",
    label: "must have 3 days off",
    prompt: "must have 3 days off",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "days_off_count",
          operator: ">=",
          value: 3,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "general-days-off-exactly-3",
    label: "exactly 3 days off",
    prompt: "exactly 3 days off",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "days_off_count",
          operator: "=",
          value: 3,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "general-days-off-only-3-with-up",
    label: "UP Jobs, 3 days off only",
    prompt: "UP Jobs, 3 days off only.",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_present",
        value: {
          field: "days_off_count",
          operator: "=",
          value: 3,
          strength: "hard",
        },
      },
      {
        type: "interpretation_issue_absent",
        value: {
          code: "unknown_clause",
          messageIncludes: "UP Jobs",
        },
      },
    ],
  },
  {
    id: "general-days-off-more",
    label: "more days off",
    prompt: "more days off",
    assertions: [
      {
        type: "parsed_global_sort_present",
        value: {
          field: "days_off_count",
          direction: "desc",
          strength: "strong",
        },
      },
    ],
  },
  {
    id: "general-days-off-most",
    label: "most days off",
    prompt: "most days off",
    assertions: [
      {
        type: "parsed_global_sort_present",
        value: {
          field: "days_off_count",
          direction: "desc",
          strength: "strong",
        },
      },
    ],
  },
  {
    id: "general-days-off-5-not-up",
    label: "I want 5 days off if possible",
    prompt: "I want 5 days off if possible",
    assertions: [
      {
        type: "parsed_global_sort_present",
        value: {
          field: "days_off_count",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "tradeoff_present",
        value: {
          type: "prefer_min_days_off",
          value: "5",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "exclude_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "general-days-off-no-up-plus-5-days-off",
    label: "No UP, I want 5 days off if possible",
    prompt: "No UP, I want 5 days off if possible",
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
        type: "parsed_global_sort_present",
        value: {
          field: "days_off_count",
          direction: "desc",
          strength: "strong",
        },
      },
      {
        type: "tradeoff_present",
        value: {
          type: "prefer_min_days_off",
          value: "5",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "canonical-three-day-off-first-except-not-at-willowbrook",
    label:
      "3 day off jobs first, except not at Willowbrook. Willowbrook should instead rank by highest overtime to lowest and later starts first.",
    prompt:
      "3 day off jobs first, except not at Willowbrook. Willowbrook should instead rank by highest overtime to lowest and later starts first.",
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
  {
    id: "up-language-no-up-weekends-willowbrook",
    label: "No UP, weekends off, prefer Willowbrook",
    prompt: "No UP, weekends off, prefer Willowbrook",
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
        type: "parsed_priority_order_exact",
        value: ["Willowbrook"],
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "terminal",
          operator: "not_in",
        },
      },
    ],
  },
  {
    id: "terminal-exclusion-no-barrie-not-priority",
    label: "weekends off, No UP, No barrie",
    prompt: "weekends off, No UP, No barrie",
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
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "not_in",
          value: ["barrie"],
          strength: "hard",
        },
      },
      {
        type: "parsed_priority_terminal_absent",
        value: {
          terminal: "Barrie",
        },
      },
      {
        type: "no_visible_contradictions",
      },
    ],
  },
  {
    id: "up-language-no-up-no-wrmf-willowbrook",
    label: "No UP, no WRMF, prefer Willowbrook",
    prompt: "No UP, no WRMF, prefer Willowbrook",
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
        type: "parsed_global_filter_present",
        value: {
          field: "terminal",
          operator: "not_in",
          value: ["wrmf"],
          strength: "hard",
        },
      },
      {
        type: "parsed_priority_order_exact",
        value: ["Willowbrook"],
      },
    ],
  },
  {
    id: "up-language-no-upx-airport-jobs",
    label: "No UPX or airport jobs",
    prompt: "No UPX or airport jobs",
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
    ],
  },
  {
    id: "up-language-only-up-express-jobs",
    label: "Only UP Express jobs",
    prompt: "Only UP Express jobs",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "up-language-bare-ups-weekends-no-early",
    label: "Bare UPS means UP Express only",
    prompt: "UPS, weekends off no early starts",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
      {
        type: "interpretation_issue_absent",
        value: {
          code: "unknown_clause",
          messageIncludes: "UPS",
        },
      },
    ],
  },
  {
    id: "up-language-prefer-up-no-splits",
    label: "Prefer UP but no splits",
    prompt: "Prefer UP but no splits",
    assertions: [
      {
        type: "tradeoff_present",
        value: {
          type: "prefer_up",
          value: "up",
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
    ],
  },
  {
    id: "up-language-no-5-series-jobs",
    label: "No 5-series jobs",
    prompt: "No 5-series jobs",
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
    ],
  },
  {
    id: "up-language-5-days-off-not-up",
    label: "I want 5 days off if possible",
    prompt: "I want 5 days off if possible",
    assertions: [
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "exclude_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
      {
        type: "parsed_global_filter_absent",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
    ],
  },
  {
    id: "up-language-no-jobs-starting-with-5",
    label: "No jobs starting with 5",
    prompt: "No jobs starting with 5",
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
    ],
  },
  {
    id: "up-language-only-crews-starting-with-5",
    label: "Only crews starting with 5",
    prompt: "Only crews starting with 5",
    assertions: [
      {
        type: "parsed_global_filter_present",
        value: {
          field: "include_only_up_crews",
          operator: "=",
          value: true,
          strength: "hard",
        },
      },
    ],
  },

];
