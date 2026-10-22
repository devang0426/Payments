import { getVoiceLang, loadVoiceLang, setVoiceLang } from "../voice";
import { memoryStore } from "./fixtures";

describe("mic language is remembered", () => {
  it("survives a restart: set → load from the same store", async () => {
    const store = memoryStore();
    setVoiceLang("hi-IN", store);
    setVoiceLang("en-IN"); // in-memory change only on the default store
    expect(await loadVoiceLang(store)).toBe("hi-IN");
    expect(getVoiceLang()).toBe("hi-IN");
  });

  it.each([["fr-FR"], ["garbage"], [""]])("an unknown saved value (%j) keeps the current choice", async (saved) => {
    setVoiceLang("en-IN", memoryStore());
    expect(await loadVoiceLang(memoryStore({ "flowpay.voice-lang.v1": saved }))).toBe("en-IN");
  });

  it("an unreadable store keeps the current choice", async () => {
    setVoiceLang("hi-IN", memoryStore());
    const broken = { ...memoryStore(), getItem: async () => Promise.reject(new Error("io")) };
    expect(await loadVoiceLang(broken)).toBe("hi-IN");
  });
});
