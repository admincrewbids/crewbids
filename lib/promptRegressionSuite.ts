export type PromptRegressionAssertion =
  | {
      type: "no_priority_violations";
    }
  | {
      type: "ranked_count_at_least";
      value: number;
    }
  | {
      type: "normalized_prompt_includes";
      value: string[];
    }
  | {
      type: "top_ranked_terminal";
      value: string;
    }
  | {
      type: "allowed_terminals_only";
      value: string[];
    }
  | {
      type: "terminal_sorted_by_operating";
      value: {
        terminal: string;
        direction: "asc" | "desc";
        sampleCount?: number;
      };
    }
  | {
      type: "crew_excluded_with_reason";
      value: {
        crewId: string;
        includes: string;
      };
    };

export type PromptRegressionCase = {
  id: string;
  label: string;
  prompt: string;
  notes?: string;
  assertions?: PromptRegressionAssertion[];
};

export const DEFAULT_PROMPT_REGRESSION_SUITE: PromptRegressionCase[] = [
  {
    id: "richmond-kitchener-barrie",
    label: "Richmond/Kitchener/Barrie scoped mix",
    prompt:
      "Richmond Hill first, but only if the jobs start after 08:15. Kitchener second, but weekdays off only. Barrie third, weekends off first but not required. Across everything, rank least operating time first, then highest overtime, and hide standby, spareboard, UP, and any split jobs.",
    notes:
      "Good stress test for scoped hard starts, human-friendly weekdays-off phrasing, global sorts, and exclusion rules.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "ranked_count_at_least", value: 20 },
      { type: "normalized_prompt_includes", value: ["weekdays off only"] },
    ],
  },
  {
    id: "barrie-lr-wb-mixed",
    label: "Barrie / Lewis / Willowbrook mixed rules",
    prompt:
      "3 day off jobs first, except at Willowbrook. Willowbrook should instead rank by highest overtime to lowest and later starts first. Barrie must finish by 18:00. Lewis Road no splits. No UP jobs, and hide any 3 day off jobs at Lewis Road.",
    notes:
      "Exercises scoped overrides, terminal ordering, finish-time hard rules, split exclusions, and scoped 3-day-off behavior.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "normalized_prompt_includes", value: ["prefer later starts"] },
    ],
  },
  {
    id: "global-no-morning-barrie-night",
    label: "Global start rules plus terminal-specific night rule",
    prompt:
      "No morning jobs anywhere, no night jobs at Barrie, Lewis Road first, highest OT first, Willowbrook second for least van time, Barrie third for 3 day off jobs first. No UP, no spareboard, no standby. Include weekday-off jobs if needed.",
    notes:
      "Covers global hard filters, scoped hard filters, priority ordering, and mixed terminal preferences.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "normalized_prompt_includes", value: ["highest overtime first"] },
    ],
  },
  {
    id: "weekday-weekend-language",
    label: "Human weekday/weekend phrasing",
    prompt:
      "Kitchener first, weekdays off only. Barrie second, weekends off first. Lewis Road third, no splits. Rank highest overtime to lowest globally. No standby, no spareboard, no UP.",
    notes:
      "Specifically meant to validate the natural-language day-off phrasing and its display labels.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "top_ranked_terminal", value: "Kitchener" },
    ],
  },
  {
    id: "finish-time-barrie",
    label: "Barrie finish-time safeguard",
    prompt:
      "Barrie first, only jobs finishing by 18:00. Weekends off first if possible. No standby, no spareboard, no UP.",
    notes:
      "Regression case for finish-time comparisons and early-morning finish handling.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "top_ranked_terminal", value: "Barrie" },
    ],
  },
  {
    id: "normalization-weekday-off-jobs",
    label: "Normalization for weekday-off jobs phrasing",
    prompt:
      "Kitchener first, only weekday-off jobs, and no jobs before 06:30. Lewis Road second, highest OT first. Hide every other terminal. No standby, no spareboard, no UP, no split jobs.",
    notes:
      "Validates that weekday-off shorthand, OT shorthand, and hide-every-other-terminal language normalize into the expected parser input.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "top_ranked_terminal", value: "Kitchener" },
      {
        type: "normalized_prompt_includes",
        value: [
          "weekdays off only",
          "highest overtime first",
          "exclude all other terminals",
        ],
      },
      { type: "allowed_terminals_only", value: ["Kitchener", "Lewis Road"] },
    ],
  },
  {
    id: "normalization-finish-and-hide-language",
    label: "Normalization for finish cutoff and hidden-terminal phrasing",
    prompt:
      "Richmond Hill first, nothing starting before 09:00. Barrie second, no finishes after 18:00. Hide all other terminals, hide standby, hide spareboard, and hide UP crews.",
    notes:
      "Covers normalized start/finish cutoffs and common hide-language phrasing that users naturally type.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "top_ranked_terminal", value: "Richmond Hill" },
      {
        type: "normalized_prompt_includes",
        value: [
          "no jobs starting before 09:00",
          "must finish by 18:00",
          "exclude all other terminals",
        ],
      },
      { type: "allowed_terminals_only", value: ["Richmond Hill", "Barrie"] },
    ],
  },
  {
    id: "lewis-willowbrook-afternoon-window",
    label: "Lewis/WB afternoon window with operating sort",
    prompt:
      "Lewis road first , Least Operating time first and doesnt start before 1200. Willowbrook second, nothing before 1200 - must start before 1630. exclude all other terminals.",
    notes:
      "Covers scoped start windows, priority ordering, weekly operating-time sorting, and exclusion reasons tied to the crew's actual displayed schedule.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "top_ranked_terminal", value: "Lewis Road" },
      { type: "ranked_count_at_least", value: 30 },
      { type: "allowed_terminals_only", value: ["Lewis Road", "Willowbrook"] },
      {
        type: "terminal_sorted_by_operating",
        value: {
          terminal: "Lewis Road",
          direction: "asc",
          sampleCount: 7,
        },
      },
      {
        type: "crew_excluded_with_reason",
        value: {
          crewId: "2135",
          includes: "after 16:30",
        },
      },
    ],
  },
  {
    id: "willowbrook-afternoon-window-only",
    label: "Willowbrook-only afternoon window",
    prompt:
      "Willowbrook only, nothing before 1200 - must start before 1630.",
    notes:
      "Validates that Willowbrook crews in the afternoon window rank, and that a crew like 2135 is excluded for the true upper-bound reason rather than a fake lower-bound failure.",
    assertions: [
      { type: "no_priority_violations" },
      { type: "top_ranked_terminal", value: "Willowbrook" },
      { type: "ranked_count_at_least", value: 20 },
      { type: "allowed_terminals_only", value: ["Willowbrook"] },
      {
        type: "crew_excluded_with_reason",
        value: {
          crewId: "2135",
          includes: "after 16:30",
        },
      },
    ],
  },
];
