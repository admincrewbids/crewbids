export type PromptNormalizationResult = {
  rawPrompt: string;
  normalizedPrompt: string;
  appliedRules: string[];
};

type PromptNormalizationRule = {
  label: string;
  pattern: RegExp;
  replace: string;
};

const NORMALIZATION_RULES: PromptNormalizationRule[] = [
  {
    label: "Normalize hidden terminal phrasing",
    pattern: /\bhide every other terminal\b/gi,
    replace: "exclude all other terminals",
  },
  {
    label: "Normalize hidden all-other-terminals phrasing",
    pattern: /\bhide all other terminals\b/gi,
    replace: "exclude all other terminals",
  },
  {
    label: "Normalize weekday-off jobs phrasing",
    pattern: /\b(?:only\s+)?weekday-?off jobs?\s+only\b/gi,
    replace: "weekdays off only",
  },
  {
    label: "Normalize only weekday-off jobs phrasing",
    pattern: /\bonly\s+weekday-?off jobs?\b/gi,
    replace: "weekdays off only",
  },
  {
    label: "Normalize weekday-off crews phrasing",
    pattern: /\bonly\s+weekday-?off crews?\b/gi,
    replace: "weekdays off only",
  },
  {
    label: "Normalize dashed weekday phrasing",
    pattern: /\bweekdays-?off only\b/gi,
    replace: "weekdays off only",
  },
  {
    label: "Normalize dashed weekend phrasing",
    pattern: /\bweekends-?off only\b/gi,
    replace: "weekends off only",
  },
  {
    label: "Normalize hidden standby phrasing",
    pattern: /\bhide standby\b/gi,
    replace: "no standby",
  },
  {
    label: "Normalize hidden spareboard phrasing",
    pattern: /\bhide spareboard\b/gi,
    replace: "no spareboard",
  },
  {
    label: "Normalize hidden UP phrasing",
    pattern: /\bhide up crews?\b/gi,
    replace: "no UP jobs",
  },
  {
    label: "Normalize highest OT shorthand",
    pattern: /\bhighest ot\b/gi,
    replace: "highest overtime",
  },
  {
    label: "Normalize least OT shorthand",
    pattern: /\bleast ot\b/gi,
    replace: "least overtime",
  },
  {
    label: "Normalize later starts ordering phrasing",
    pattern: /\blater starts first\b/gi,
    replace: "prefer later starts",
  },
  {
    label: "Normalize earlier starts ordering phrasing",
    pattern: /\bearlier starts first\b/gi,
    replace: "prefer earlier starts",
  },
  {
    label: "Normalize finish cutoff phrasing",
    pattern: /\bno finishes after\b/gi,
    replace: "must finish by",
  },
  {
    label: "Normalize start cutoff phrasing",
    pattern: /\bnothing starting before\b/gi,
    replace: "no jobs starting before",
  },
  {
    label: "Normalize generic no-jobs-before phrasing",
    pattern: /\bnothing before\b/gi,
    replace: "no jobs before",
  },
];

export function normalizePromptText(prompt: string): PromptNormalizationResult {
  let normalizedPrompt = prompt
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const appliedRules: string[] = [];

  for (const rule of NORMALIZATION_RULES) {
    const nextPrompt = normalizedPrompt.replace(rule.pattern, rule.replace);

    if (nextPrompt !== normalizedPrompt) {
      normalizedPrompt = nextPrompt;
      appliedRules.push(rule.label);
    }
  }

  normalizedPrompt = normalizedPrompt.replace(/\s+/g, " ").trim();

  return {
    rawPrompt: prompt,
    normalizedPrompt,
    appliedRules,
  };
}
