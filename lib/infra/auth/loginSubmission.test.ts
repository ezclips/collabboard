import { describe, expect, it } from "vitest";

import {
  createLoginSubmissionGate,
  parseRetryAfterSeconds,
} from "./loginSubmission";

describe("createLoginSubmissionGate", () => {
  it("double click results in one request", async () => {
    let resolveRequest: (() => void) | undefined;
    let requestCount = 0;
    const gate = createLoginSubmissionGate();

    const first = gate.submit(async () => {
      requestCount += 1;
      await new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
      return "ok";
    });
    const second = await gate.submit(async () => {
      requestCount += 1;
      return "unexpected";
    });

    expect(requestCount).toBe(1);
    expect(second).toEqual({
      accepted: false,
      reason: "pending",
      retryAfterSeconds: 0,
    });

    expect(resolveRequest).toBeTypeOf("function");
    resolveRequest?.();
    await expect(first).resolves.toEqual({ accepted: true, value: "ok" });
  });

  it("pressing Enter results in one request", async () => {
    let requestCount = 0;
    const gate = createLoginSubmissionGate();

    const result = await gate.submit(async () => {
      requestCount += 1;
      return "ok";
    });

    expect(requestCount).toBe(1);
    expect(result).toEqual({ accepted: true, value: "ok" });
  });

  it("submit while pending is ignored", async () => {
    let resolveRequest: (() => void) | undefined;
    const gate = createLoginSubmissionGate();

    const first = gate.submit(async () => {
      await new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
      return "ok";
    });

    expect(await gate.submit(async () => "ignored")).toEqual({
      accepted: false,
      reason: "pending",
      retryAfterSeconds: 0,
    });

    expect(resolveRequest).toBeTypeOf("function");
    resolveRequest?.();
    await first;
  });

  it("submit during Retry-After cooldown is ignored", async () => {
    let now = 1_000;
    const gate = createLoginSubmissionGate({ now: () => now });

    gate.startCooldown(30);

    expect(await gate.submit(async () => "blocked")).toEqual({
      accepted: false,
      reason: "cooldown",
      retryAfterSeconds: 30,
    });
  });

  it("request becomes available after cooldown", async () => {
    let now = 1_000;
    const gate = createLoginSubmissionGate({ now: () => now });

    gate.startCooldown(5);
    now += 5_001;

    expect(await gate.submit(async () => "ok")).toEqual({
      accepted: true,
      value: "ok",
    });
  });

  it("does not retry automatically after a rejection", async () => {
    let requestCount = 0;
    const gate = createLoginSubmissionGate();

    const rejection = await gate.submit(async () => {
      requestCount += 1;
      throw new Error("fail");
    }).catch((error) => error);

    expect(requestCount).toBe(1);
    expect(rejection).toBeInstanceOf(Error);
    expect(requestCount).toBe(1);
    expect(gate.isPending()).toBe(false);
  });
});

describe("parseRetryAfterSeconds", () => {
  it("prefers numeric Retry-After seconds", () => {
    expect(parseRetryAfterSeconds("120", 300)).toBe(120);
  });

  it("falls back when Retry-After is missing", () => {
    expect(parseRetryAfterSeconds(null, 300)).toBe(300);
  });
});
