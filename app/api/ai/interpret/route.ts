import { NextResponse } from "next/server";

const DEBUG_LOGS = false;

function debugLog(...args: unknown[]) {
  if (!DEBUG_LOGS) return;
  console.log(...args);
}

type ParsedPreferences = {
  filters: {
    field: string;
    operator: string;
    value: string | number | boolean | string[];
    strength: "hard" | "strong" | "soft";
  }[];
  priority_groups: {
    rank: number;
    strength: "hard" | "strong" | "soft";
    conditions: {
      field: string;
      operator: string;
      value: string | number | boolean;
    }[];
  }[];
  sort_preferences: {
    field:
      | "on_duty"
      | "off_duty"
      | "operating_hours_daily"
      | "operating_hours_weekly"
      | "van_hours_daily"
      | "overtime_hours_weekly"
      | "total_paid_hours_weekly"
      | "weekends_off";
    direction: "asc" | "desc";
    strength: "hard" | "strong" | "soft";
    weight?: number;
  }[];
  tradeoffs: {
    type: string;
    value?: string;
    weight?: number;
  }[];
  unknown_clauses: {
    text: string;
  }[];
  scoped_preferences: {
    terminal: string;
    normalized_terminal: string;
    priority_rank: number;
    sort_preferences: {
      field:
        | "on_duty"
        | "off_duty"
        | "operating_hours_daily"
        | "operating_hours_weekly"
        | "van_hours_daily"
        | "overtime_hours_weekly"
        | "total_paid_hours_weekly"
        | "weekends_off";
      direction: "asc" | "desc";
      strength: "hard" | "strong" | "soft";
      weight?: number;
    }[];
    filters: {
      field: string;
      operator: string;
      value: string | number | boolean | string[];
      strength: "hard" | "strong" | "soft";
    }[];
    required_days_off: string[];
    requires_weekends_off: boolean;
  }[];
};

function emptyPreferences(): ParsedPreferences {
  return {
    filters: [],
    priority_groups: [],
    sort_preferences: [],
    tradeoffs: [],
    unknown_clauses: [],
    scoped_preferences: [],
  };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

function normalizeAiResult(value: any): ParsedPreferences {
  const base = emptyPreferences();

  if (!value || typeof value !== "object") {
    return base;
  }

  return {
    filters: Array.isArray(value.filters) ? value.filters : [],
    priority_groups: Array.isArray(value.priority_groups)
      ? value.priority_groups
      : [],
    sort_preferences: Array.isArray(value.sort_preferences)
      ? value.sort_preferences
      : [],
    tradeoffs: Array.isArray(value.tradeoffs) ? value.tradeoffs : [],
    unknown_clauses: Array.isArray(value.unknown_clauses)
      ? value.unknown_clauses
      : [],
    scoped_preferences: Array.isArray(value.scoped_preferences)
      ? value.scoped_preferences
      : [],
  };
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(emptyPreferences());
    }

    const systemPrompt = `
You are a railway crew bidding assistant for GO Transit-style crew bid preferences.

Your job is to convert a user's plain-English bid preferences into STRICT JSON matching this exact schema:

{
  "filters": [],
  "priority_groups": [],
  "sort_preferences": [],
  "tradeoffs": [],
  "unknown_clauses": [],
  "scoped_preferences": []
}

Return ONLY valid JSON.
Do not use markdown fences.
Do not add commentary.

CRITICAL FAILURE RULES

- If the user mentions any recognizable terminal or terminal alias, the output must not be empty.
- If the user mentions weekends off, standby, mornings, nights, early starts, late starts, or exclusions, the output must not be empty.
- Returning all-empty arrays is only valid if the prompt truly contains no bidding preference at all.
- If a terminal is mentioned, it must appear in at least one of:
  - "priority_groups"
  - "filters"
  - "scoped_preferences"
- Do not ignore aliases or shorthand.
- If the prompt contains an obvious preference, do not return all-empty arrays.

IMPORTANT RULES

1. Terminal preferences
- If the user prefers one or more terminals, add them to "priority_groups" in the order mentioned.
- Use terminal values in normalized lowercase form:
  "wrmf"
  "willowbrook"
  "lewis road"
  "richmond hill"
  "milton"
  "barrie"
  "bradford"
  "kitchener"
  "lincolnville"
  "spareboard"
  "standby"

Recognize these aliases:
- "wrmf" => "wrmf"
- "wb", "wb_d", "wb_up", "willowbrook" => "willowbrook"
- "lr", "lr_d", "lewis rd", "lewis road" => "lewis road"
- "rh", "rh_d", "richmond hill" => "richmond hill"
- "ml", "ml_d", "milton" => "milton"
- "ae", "ae_d", "allandale", "barrie" => "barrie"
- "bd", "bd_d", "bradford" => "bradford"
- "sh", "sh_d", "shirley", "kitchener" => "kitchener"
- "li", "li_d", "lincolnville" => "lincolnville"
- "spareboard" => "spareboard"
- "stby", "standby" => "standby"

2. Scoped preferences
- If a user mentions a terminal and then gives preferences tied to that terminal, place those preferences inside that terminal's "scoped_preferences" entry.
- Each scoped preference object must have:
  {
    "terminal": "Display Name",
    "normalized_terminal": "lowercase normalized name",
    "priority_rank": number,
    "sort_preferences": [],
    "filters": [],
    "required_days_off": [],
    "requires_weekends_off": false
  }

3. Hard filters
Use "filters" or scoped "filters" for hard constraints.
Examples:
- "no starts before 07:30" => { "field": "on_duty", "operator": ">=", "value": "07:30", "strength": "hard" }
- "finish by 18:00" => { "field": "off_duty", "operator": "<=", "value": "18:00", "strength": "hard" }
- "only lewis road and willowbrook" => terminal in filter
- "exclude standby" => terminal not_in filter

4. Sort preferences
Use sort_preferences for softer ranking preferences.
Allowed fields:
- "on_duty"
- "off_duty"
- "operating_hours_daily"
- "operating_hours_weekly"
- "van_hours_daily"
- "overtime_hours_weekly"
- "total_paid_hours_weekly"
- "weekends_off"

Direction:
- earlier starts => "on_duty", "asc"
- later starts => "on_duty", "desc"
- earlier finishes => "off_duty", "asc"
- later finishes => "off_duty", "desc"
- more overtime => "overtime_hours_weekly", "desc"
- less overtime => "overtime_hours_weekly", "asc"
- less operating => "operating_hours_daily", "asc"
- more operating => "operating_hours_daily", "desc"
- less van => "van_hours_daily", "asc"
- more van => "van_hours_daily", "desc"
- weekends off preferred => "weekends_off", "desc"

Strength must be one of:
- "hard"
- "strong"
- "soft"

5. Days off
- "weekends off" means:
  "requires_weekends_off": true
and usually also a scoped sort preference:
  { "field": "weekends_off", "direction": "desc", "strength": "strong", "weight": 7 }
- If the user says specific days like Monday or Friday off, add them to "required_days_off" as lowercase full day names.

6. Unknown clauses
- If a phrase cannot be confidently mapped, add it to:
  { "text": "original clause" }
inside "unknown_clauses"
- But do not put obvious terminal mentions into unknown_clauses.

7. Weights
Use reasonable defaults:
- strongest terminal preference: 10
- time preference: 8
- weekends off: 7
- overtime preference: 10
- operating preference: 9
- van preference: 8

8. Interpret naturally
Examples:
- "prefer lewis road" means Lewis Road is priority rank 1
- "weekends off, prefer lewis road" means Lewis Road priority rank 1 and weekends-off preference scoped to Lewis Road
- "barrie first, then bradford" means two priority_groups in that order
- "only willowbrook and milton" means terminal in filter
- "no standby" means terminal not_in filter for standby
- "prefer mornings" means on_duty asc sort preference
- "mornings only" means on_duty <= 11:59 hard filter
- "prefer evenings" means on_duty desc sort preference
- "evenings only" means on_duty >= 16:00 hard filter
- "no nights" means on_duty <= 15:59 hard filter

EXAMPLE 1
User:
weekends off, prefer lewis road

Output:
{
  "filters": [],
  "priority_groups": [
    {
      "rank": 1,
      "strength": "strong",
      "conditions": [
        { "field": "terminal", "operator": "=", "value": "lewis road" }
      ]
    }
  ],
  "sort_preferences": [],
  "tradeoffs": [],
  "unknown_clauses": [],
  "scoped_preferences": [
    {
      "terminal": "Lewis Road",
      "normalized_terminal": "lewis road",
      "priority_rank": 1,
      "sort_preferences": [
        {
          "field": "weekends_off",
          "direction": "desc",
          "strength": "strong",
          "weight": 7
        }
      ],
      "filters": [],
      "required_days_off": [],
      "requires_weekends_off": true
    }
  ]
}

EXAMPLE 2
User:
only willowbrook and milton, no standby, prefer later starts

Output:
{
  "filters": [
    {
      "field": "terminal",
      "operator": "in",
      "value": ["willowbrook", "milton"],
      "strength": "hard"
    },
    {
      "field": "terminal",
      "operator": "not_in",
      "value": ["standby"],
      "strength": "hard"
    }
  ],
  "priority_groups": [
    {
      "rank": 1,
      "strength": "strong",
      "conditions": [
        { "field": "terminal", "operator": "=", "value": "willowbrook" }
      ]
    },
    {
      "rank": 2,
      "strength": "strong",
      "conditions": [
        { "field": "terminal", "operator": "=", "value": "milton" }
      ]
    }
  ],
  "sort_preferences": [
    {
      "field": "on_duty",
      "direction": "desc",
      "strength": "strong",
      "weight": 8
    }
  ],
  "tradeoffs": [],
  "unknown_clauses": [],
  "scoped_preferences": [
    {
      "terminal": "Willowbrook",
      "normalized_terminal": "willowbrook",
      "priority_rank": 1,
      "sort_preferences": [],
      "filters": [],
      "required_days_off": [],
      "requires_weekends_off": false
    },
    {
      "terminal": "Milton",
      "normalized_terminal": "milton",
      "priority_rank": 2,
      "sort_preferences": [],
      "filters": [],
      "required_days_off": [],
      "requires_weekends_off": false
    }
  ]
}

EXAMPLE 3
User:
prefer lewis road

Output:
{
  "filters": [],
  "priority_groups": [
    {
      "rank": 1,
      "strength": "strong",
      "conditions": [
        { "field": "terminal", "operator": "=", "value": "lewis road" }
      ]
    }
  ],
  "sort_preferences": [],
  "tradeoffs": [],
  "unknown_clauses": [],
  "scoped_preferences": [
    {
      "terminal": "Lewis Road",
      "normalized_terminal": "lewis road",
      "priority_rank": 1,
      "sort_preferences": [],
      "filters": [],
      "required_days_off": [],
      "requires_weekends_off": false
    }
  ]
}

Now convert the user prompt into JSON using the schema exactly.
`;



    const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
  model: "gpt-5.4-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Interpret this crew bidding request into the required JSON schema.

User prompt:
"${prompt}"

If the prompt mentions a terminal, terminal alias, weekends off, standby, mornings, nights, early starts, late starts, or exclusions, those preferences must appear in the JSON.

If the prompt clearly contains a bidding preference, do not return all-empty arrays.

Return only valid JSON.`,
      },
    ],
  }),
});


  const data = await response.json();

if (!response.ok) {
  console.error("OpenAI API error:", data);
  return NextResponse.json({
    source: "openai_error",
    preferences: emptyPreferences(),
  });
}

debugLog("OPENAI FULL RESPONSE:", JSON.stringify(data, null, 2));

const message = data?.choices?.[0]?.message;
const content =
  typeof message?.content === "string" ? message.content.trim() : "";

debugLog("AI RAW TEXT:", content);

if (!content) {
  console.error("OpenAI returned empty content", data);
  return NextResponse.json({
    source: "empty_ai_content",
    preferences: emptyPreferences(),
  });
}

const rawJson = extractJson(content);
debugLog("AI EXTRACTED JSON:", rawJson);

if (!rawJson) {
  console.error("No JSON found in AI content", content);
  return NextResponse.json({
    source: "no_json_found",
    preferences: emptyPreferences(),
  });
}

let parsed;
try {
  parsed = JSON.parse(rawJson);
} catch (parseErr) {
  console.error("JSON parse failed:", parseErr, rawJson);
  return NextResponse.json({
    source: "json_parse_failed",
    preferences: emptyPreferences(),
  });
}

return NextResponse.json({
  source: "ai",
  preferences: normalizeAiResult(parsed),
});
} catch (err) {
  console.error("AI interpret route failed:", err);
  return NextResponse.json({
    source: "route_error",
    preferences: emptyPreferences(),
  });
}
}

