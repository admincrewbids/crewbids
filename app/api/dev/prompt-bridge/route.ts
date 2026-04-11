import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PromptBridgeCommand = {
  id: string;
  action:
    | "runPrompt"
    | "summarizePrompt"
    | "summarizePrompts"
    | "runRegressionSuite";
  payload?: unknown;
  createdAt: string;
};

type PromptBridgeResult = {
  commandId: string;
  action: PromptBridgeCommand["action"];
  status: "completed" | "failed";
  completedAt: string;
  payload?: unknown;
  error?: string;
};

type PromptBridgeState = {
  command: PromptBridgeCommand | null;
  latestResult: PromptBridgeResult | null;
};

const DEBUG_DIR = path.join(process.cwd(), ".debug");
const STATE_FILE = path.join(DEBUG_DIR, "prompt-bridge-state.json");

async function ensureStateFile() {
  await mkdir(DEBUG_DIR, { recursive: true });

  try {
    await readFile(STATE_FILE, "utf8");
  } catch {
    const initialState: PromptBridgeState = {
      command: null,
      latestResult: null,
    };

    await writeFile(STATE_FILE, JSON.stringify(initialState, null, 2), "utf8");
  }
}

async function readState(): Promise<PromptBridgeState> {
  await ensureStateFile();
  const raw = await readFile(STATE_FILE, "utf8");
  return JSON.parse(raw) as PromptBridgeState;
}

async function writeState(state: PromptBridgeState) {
  await ensureStateFile();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const body = (await request.json()) as
    | { type: "command"; command: PromptBridgeCommand }
    | { type: "result"; result: PromptBridgeResult };

  const currentState = await readState();

  if (body.type === "command") {
    const nextState: PromptBridgeState = {
      ...currentState,
      command: body.command,
    };

    await writeState(nextState);
    return NextResponse.json({ ok: true, commandId: body.command.id });
  }

  if (body.type === "result") {
    const nextState: PromptBridgeState = {
      ...currentState,
      latestResult: body.result,
    };

    await writeState(nextState);
    return NextResponse.json({ ok: true, commandId: body.result.commandId });
  }

  return NextResponse.json(
    { ok: false, error: "Unsupported prompt bridge payload" },
    { status: 400 }
  );
}
