// Any common way of writing an Indian mobile number → "+91XXXXXXXXXX", or null.
export function normalizePhone(raw: string): string | null {
  if (/[a-z]/i.test(raw)) return null;
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;

  let national: string;
  if (digits.length === 10) national = digits;
  else if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith("91")) national = digits.slice(2);
  else if (digits.length === 14 && digits.startsWith("0091")) national = digits.slice(4);
  else return null;

  // Indian mobile numbers start with 6, 7, 8 or 9.
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}
