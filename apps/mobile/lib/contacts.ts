// Contacts are used for one thing only: telling "No UPI ID saved for X" (they're in your contacts)
// apart from "I don't know X yet". Nothing from contacts is stored or sent anywhere.
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from "expo-contacts";
import { normalizeName } from "./match";

export type ContactLookup = "found" | "notFound" | "denied";

export async function findContactByName(name: string): Promise<ContactLookup> {
  try {
    let permission = await getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await requestPermissionsAsync();
    if (!permission.granted) return "denied";

    const spoken = normalizeName(name);
    if (!spoken) return "notFound";
    const fields = [ContactField.FULL_NAME, ContactField.NICKNAME] as const;
    const results = await Contact.getAllDetails(fields, { name, limit: 25 });
    const found = results.some((c) =>
      [(c as { fullName?: string | null }).fullName, (c as { nickname?: string | null }).nickname].some(
        (form) => {
          const candidate = form ? normalizeName(form) : "";
          return candidate === spoken || candidate.startsWith(`${spoken} `);
        },
      ),
    );
    return found ? "found" : "notFound";
  } catch {
    return "notFound";
  }
}
