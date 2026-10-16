// Live check of POST /parse against a running server (`npm run dev` first).
// Usage: npm run smoke            (default http://localhost:3000)
//        npm run smoke -- http://172.20.10.2:3000
const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");

const cases: [text: string, expected: string][] = [
  ["Mummy ko paanch sau bhejo", '{"ok":true,"name":"Mummy","amount":{"kind":"paise","paise":50000}}'],
  ["Papa ko dhai sau", '{"ok":true,"name":"Papa","amount":{"kind":"paise","paise":25000}}'],
  ["Rahul ko 1.5k", '{"ok":true,"name":"Rahul","amount":{"kind":"paise","paise":150000}}'],
  ["मम्मी को ५०० भेजो", '{"ok":true,"name":"मम्मी","amount":{"kind":"paise","paise":50000}}'],
  ["Mummy ko pichhli baar jitna bhejo", '{"ok":true,"name":"Mummy","amount":{"kind":"last"}}'],
  ["मम्मी को पिछली बार जितना भेजो", '{"ok":true,"name":"मम्मी","amount":{"kind":"last"}}'],
  ["Mummy ko bhejo", '{"ok":false,"error":"NO_AMOUNT"}'],
  ["kya haal hai", '{"ok":false,"error":"NO_NAME"}'],
];

let passed = 0;
for (const [text, expected] of cases) {
  let actual: string;
  try {
    const res = await fetch(`${baseUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    actual = JSON.stringify(await res.json());
  } catch (e) {
    actual = `request failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  const ok = actual === expected;
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${text}\n      got:      ${actual}${ok ? "" : `\n      expected: ${expected}`}`);
}
console.log(`\n${passed}/${cases.length} passed`);
process.exitCode = passed === cases.length ? 0 : 1;
