// DEV only: print the raw tool calls the model makes for test sentences (fake eval data, never real
// user text). Usage: npx tsx scripts/agent-debug.ts "Mummy ko 500" ["second user turn" ...]
import dotenv from "dotenv";

dotenv.config({ quiet: true });
const { callAgent } = await import("../src/llm.ts");
const { AGENT_SYSTEM_PROMPT } = await import("../src/tools.ts");

const turns = process.argv.slice(2);
const out = await callAgent([
  { role: "system", content: AGENT_SYSTEM_PROMPT },
  ...turns.map((t) => (t.startsWith("@") ? { role: "assistant" as const, content: t.slice(1) } : { role: "user" as const, content: t })),
]);
for (const c of out.toolCalls) console.log(`${c.name} ${c.arguments}`);
