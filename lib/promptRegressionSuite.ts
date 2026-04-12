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
        type: "no_priority_violations",
      },
    ],
  },
];
