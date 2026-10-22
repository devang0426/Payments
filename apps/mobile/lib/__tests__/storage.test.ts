import { createWriteQueue } from "../storage";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createWriteQueue: one change at a time, in the order they were started", () => {
  it("runs jobs one after another, never overlapping", async () => {
    const run = createWriteQueue();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
      return name;
    };
    expect(await Promise.all([run(job("a")), run(job("b")), run(job("c"))])).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["a start", "a end", "b start", "b end", "c start", "c end"]);
  });

  it("a failing job rejects only its own caller; the next job still runs", async () => {
    const run = createWriteQueue();
    const failing = run(async () => {
      throw new Error("disk");
    });
    const next = run(async () => "ok");
    await expect(failing).rejects.toThrow("disk");
    await expect(next).resolves.toBe("ok");
  });

  it("separate queues don't wait for each other", async () => {
    const a = createWriteQueue();
    const b = createWriteQueue();
    let release!: () => void;
    const blocked = a(() => new Promise<void>((resolve) => (release = resolve)));
    await expect(b(async () => "b done")).resolves.toBe("b done");
    release();
    await blocked;
  });
});
