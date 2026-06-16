import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../lib/db";
import { getServerEnv } from "../../../lib/env";
import { getAssistantSession } from "../../../lib/assistant/auth";
import { assistantTools, executeTool, type ToolContext } from "../../../lib/assistant/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const MAX_TURNS = 8; // safety bound on the tool-use loop

type ClientMessage = { role: "user" | "assistant"; text: string };

function systemPrompt(lcName: string, role: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the AIESEC CRM assistant for the "${lcName}" Local Committee. Today is ${today}. The person you are helping has the role: ${role}.

You help run the LC's exchange pipeline: candidates (Exchange Participants), company/TN partners, and partner LCs, tracked through funnel stages (sign_up → applied → matched → approved → realized → finished → completed) across programmes GT (Global Talent), GE (Global Entrepreneur), and GV (Global Volunteer).

You have tools to read and modify this LC's data. Guidelines:
- Use tools to ground every factual claim — never invent contact names, counts, or stats.
- You may create and update records when asked. For anything that contacts a real person (email campaigns, conversation replies), create it as a DRAFT and tell the user to review/send it themselves.
- When the user is vague, search first, then confirm which record you mean before mutating it.
- Be concise. Use short markdown. Reference real names and ids returned by tools.
- All data is scoped to this LC; never claim access to other committees.`;
}

function sse(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { messages?: ClientMessage[]; lcId?: string } | null;
  if (!body?.messages?.length) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

  const session = await getAssistantSession(body.lcId);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx: ToolContext = {
    db: getDb(),
    lcId: session.membership.lcId,
    userId: session.userId,
    role: session.membership.role
  };

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: MessageParam[] = body.messages.map((m) => ({ role: m.role, content: m.text }));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt(session.membership.lcName, session.membership.role),
            tools: assistantTools as never,
            messages
          });

          response.on("text", (text) => sse(controller, { type: "text", value: text }));

          const final = await response.finalMessage();
          messages.push({ role: "assistant", content: final.content });

          if (final.stop_reason !== "tool_use") break;

          const toolUses = final.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
          const toolResults = [];
          for (const tu of toolUses) {
            sse(controller, { type: "tool", name: tu.name, status: "running" });
            const result = await executeTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
            sse(controller, { type: "tool", name: tu.name, status: "done" });
            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content: JSON.stringify(result)
            });
          }
          messages.push({ role: "user", content: toolResults });
        }
        sse(controller, { type: "done" });
      } catch (err) {
        sse(controller, { type: "error", message: err instanceof Error ? err.message : "Assistant failed." });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" }
  });
}
