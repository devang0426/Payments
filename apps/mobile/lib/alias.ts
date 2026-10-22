// M15 nicknames ("Maa matlab Mummy"): may this name be added to that saved payee? Pure. Saving needs the
// phone's fingerprint/PIN (app/alias.tsx, like any payee change, CLAUDE.md rule 6); voice alone never
// saves. A name that would also match ANOTHER payee is refused, so it can never make "Maa" pay someone
// else or turn a clear name into a "Which …?".
import { matchPayees } from "./match";
import { MAX_ALIASES, MAX_NAME_LENGTH, type Payee } from "./payees";

export type AliasCheck =
  | { ok: true; payee: Payee; alias: string }
  | { ok: false; reason: "noPayee" | "many" | "invalid" | "already" | "usedByOther" | "tooMany" };

const clean = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function checkAlias(aliasSpoken: string, nameSpoken: string, payees: Payee[]): AliasCheck {
  const target = matchPayees(nameSpoken, payees);
  if (target.kind === "none") return { ok: false, reason: "noPayee" };
  if (target.kind === "many") return { ok: false, reason: "many" };
  const payee = target.payee;

  const alias = clean(aliasSpoken);
  if (!alias || alias.length > MAX_NAME_LENGTH) return { ok: false, reason: "invalid" };
  if (clean(payee.displayName) === alias || payee.aliases.includes(alias)) return { ok: false, reason: "already" };

  const other = matchPayees(alias, payees);
  if (other.kind === "many" || (other.kind === "one" && other.payee.id !== payee.id)) return { ok: false, reason: "usedByOther" };
  if (other.kind === "one") return { ok: false, reason: "already" }; // already reaches this payee
  if (payee.aliases.length >= MAX_ALIASES) return { ok: false, reason: "tooMany" };
  return { ok: true, payee, alias };
}
