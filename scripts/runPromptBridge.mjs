const [, , actionArg, ...restArgs] = process.argv;

const action = actionArg || "runRegressionSuite";
const baseUrl = process.env.CREWBIDS_BRIDGE_URL || "http://localhost:3000";
const bridgeUrl = `${baseUrl}/api/dev/prompt-bridge`;

const supportedActions = new Set([
  "runPrompt",
  "summarizePrompt",
  "summarizePrompts",
  "runRegressionSuite",
]);

if (!supportedActions.has(action)) {
  console.error(
    `Unsupported action "${action}". Use one of: ${Array.from(
      supportedActions
    ).join(", ")}`
  );
  process.exit(1);
}

let payload = null;

if (action === "runPrompt" || action === "summarizePrompt") {
  payload = restArgs.join(" ").trim();

  if (!payload) {
    console.error(`Action "${action}" requires a prompt string.`);
    process.exit(1);
  }
}

if (action === "summarizePrompts") {
  payload = restArgs;

  if (!payload.length) {
    console.error('Action "summarizePrompts" requires one or more prompts.');
    process.exit(1);
  }
}

const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const command = {
  id: commandId,
  action,
  payload,
  createdAt: new Date().toISOString(),
};

async function postCommand() {
  const response = await fetch(bridgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "command",
      command,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to post command: ${response.status}`);
  }
}

async function waitForResult() {
  const startedAt = Date.now();
  const timeoutMs = 120000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(bridgeUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bridge state: ${response.status}`);
    }

    const state = await response.json();
    const latestResult = state?.latestResult;

    if (latestResult?.commandId === commandId) {
      return latestResult;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(
    "Timed out waiting for prompt bridge result. Make sure the app is open with a loaded package."
  );
}

try {
  console.log(`Dispatching ${action} to ${bridgeUrl}`);
  await postCommand();
  const result = await waitForResult();

  if (result.status === "failed") {
    console.error("Prompt bridge failed:", result.error || "Unknown error");
    process.exit(1);
  }

  console.log(JSON.stringify(result.payload, null, 2));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unknown prompt bridge failure"
  );
  process.exit(1);
}
