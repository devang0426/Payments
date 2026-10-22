// Saved payees (name → UPI ID), in SecureStore on the phone only. Added/edited in Settings.
// Each payee has its own key (SecureStore values should stay under ~2 KB) plus an index of ids.
import { z } from "zod";
import { normalizePhone } from "./phone";
import { createWriteQueue, secureStore, type KeyValueStore } from "./storage";
import { VPA_PATTERN } from "./upi";

export const MAX_NAME_LENGTH = 50;
export const MAX_ALIASES = 10;

const INDEX_KEY = "flowpay.payees.index";
const payeeKey = (id: string) => `flowpay.payee.${id}`;

const fields = {
  id: z.string().regex(/^[\w-]{1,64}$/),
  displayName: z.string().min(1).max(MAX_NAME_LENGTH),
  vpa: z.string().regex(VPA_PATTERN),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/).optional(),
  aliases: z.array(z.string().min(1).max(MAX_NAME_LENGTH)).max(MAX_ALIASES),
};
const timestamp = z.number().int().nonnegative();

// addedAt: when the payee was saved. vpaChangedAt: when it got its current UPI ID. Both drive the
// 24 h new-payee limit in rules.ts.
export const PayeeSchema = z.object({ ...fields, addedAt: timestamp, vpaChangedAt: timestamp });
export type Payee = z.infer<typeof PayeeSchema>;

// Saved before M10: the same fields without timestamps. Only an entry with neither timestamp key is
// migrated; a broken timestamp is corrupt data, not an old payee.
const LegacyPayeeSchema = z.object(fields);
const isLegacy = (value: unknown) =>
  typeof value === "object" && value !== null && !("addedAt" in value) && !("vpaChangedAt" in value);

export type PayeeInput = { displayName: string; vpa: string; phone?: string; aliases?: string[] };

export type PayeeError =
  | "INVALID_NAME"
  | "INVALID_VPA"
  | "INVALID_PHONE"
  | "INVALID_ALIASES"
  | "DUPLICATE_VPA"
  | "NOT_FOUND";

export type PayeeResult = { ok: true; payee: Payee } | { ok: false; error: PayeeError };

type CleanPayee = Omit<Payee, "id" | "addedAt" | "vpaChangedAt">;

// Trim/lowercase/dedupe the user's input, or say what's wrong with it.
function clean(input: PayeeInput): { ok: true; value: CleanPayee } | { ok: false; error: PayeeError } {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (!displayName || displayName.length > MAX_NAME_LENGTH) return { ok: false, error: "INVALID_NAME" };

  const vpa = input.vpa.trim().toLowerCase();
  if (!VPA_PATTERN.test(vpa)) return { ok: false, error: "INVALID_VPA" };

  let phone: string | undefined;
  if (input.phone?.trim()) {
    const normalized = normalizePhone(input.phone);
    if (!normalized) return { ok: false, error: "INVALID_PHONE" };
    phone = normalized;
  }

  const aliases = [
    ...new Set((input.aliases ?? []).map((a) => a.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean)),
  ];
  if (aliases.length > MAX_ALIASES || aliases.some((a) => a.length > MAX_NAME_LENGTH)) {
    return { ok: false, error: "INVALID_ALIASES" };
  }

  return { ok: true, value: { displayName, vpa, ...(phone ? { phone } : {}), aliases } };
}

const defaultId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createPayeeStore(
  store: KeyValueStore = secureStore,
  newId: () => string = defaultId,
  clock: () => number = Date.now,
) {
  const queue = createWriteQueue();

  async function readIndex(): Promise<{ ids: string[]; corrupt: boolean }> {
    const raw = await store.getItem(INDEX_KEY);
    if (raw === null) return { ids: [], corrupt: false };
    try {
      const ids = z.array(z.string()).parse(JSON.parse(raw));
      return { ids, corrupt: false };
    } catch {
      return { ids: [], corrupt: true };
    }
  }

  async function load(): Promise<{ payees: Payee[]; corrupt: boolean }> {
    const index = await readIndex();
    let corrupt = index.corrupt;
    const payees: Payee[] = [];
    for (const id of index.ids) {
      const raw = await store.getItem(payeeKey(id));
      const value = raw === null ? undefined : safeJson(raw);
      const parsed = PayeeSchema.safeParse(value);
      if (parsed.success) {
        payees.push(parsed.data);
        continue;
      }
      const legacy = isLegacy(value) ? LegacyPayeeSchema.safeParse(value) : null;
      if (legacy?.success) payees.push(await migrate(legacy.data));
      else corrupt = true;
    }
    return { payees, corrupt };
  }

  // A pre-M10 payee counts as saved now (the safe side: one 24 h limit after the update). The time
  // is written back once, so later loads don't restart the 24 h.
  async function migrate(old: CleanPayee & { id: string }): Promise<Payee> {
    const now = clock();
    const payee: Payee = { ...old, addedAt: now, vpaChangedAt: now };
    try {
      await store.setItem(payeeKey(payee.id), JSON.stringify(payee));
    } catch {
      // Not written: the next load migrates again. Still never treated as an old payee.
    }
    return payee;
  }

  async function save(payee: Payee, ids: string[]): Promise<void> {
    await store.setItem(payeeKey(payee.id), JSON.stringify(payee));
    await store.setItem(INDEX_KEY, JSON.stringify(ids));
  }

  return {
    load,

    add(input: PayeeInput): Promise<PayeeResult> {
      return queue(async () => {
        const cleaned = clean(input);
        if (!cleaned.ok) return cleaned;
        const { payees } = await load();
        if (payees.some((p) => p.vpa === cleaned.value.vpa)) return { ok: false, error: "DUPLICATE_VPA" };
        const now = clock();
        const payee: Payee = { id: newId(), ...cleaned.value, addedAt: now, vpaChangedAt: now };
        await save(payee, [...payees.map((p) => p.id), payee.id]);
        return { ok: true, payee };
      });
    },

    // A new UPI ID restarts the 24 h new-payee limit; name, phone and other names don't.
    update(id: string, input: PayeeInput): Promise<PayeeResult> {
      return queue(async () => {
        const cleaned = clean(input);
        if (!cleaned.ok) return cleaned;
        const { payees } = await load();
        const existing = payees.find((p) => p.id === id);
        if (!existing) return { ok: false, error: "NOT_FOUND" };
        if (payees.some((p) => p.id !== id && p.vpa === cleaned.value.vpa)) {
          return { ok: false, error: "DUPLICATE_VPA" };
        }
        const vpaChangedAt = existing.vpa === cleaned.value.vpa ? existing.vpaChangedAt : clock();
        const payee: Payee = { id, ...cleaned.value, addedAt: existing.addedAt, vpaChangedAt };
        await save(payee, payees.map((p) => p.id));
        return { ok: true, payee };
      });
    },

    remove(id: string): Promise<boolean> {
      return queue(async () => {
        const { payees } = await load();
        if (!payees.some((p) => p.id === id)) return false;
        await store.setItem(INDEX_KEY, JSON.stringify(payees.filter((p) => p.id !== id).map((p) => p.id)));
        await store.removeItem(payeeKey(id));
        return true;
      });
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
