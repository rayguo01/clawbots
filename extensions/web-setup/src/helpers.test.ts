import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { readJsonBody, sendJson } from "./helpers.js";

describe("sendJson", () => {
  it("sets status code, content-type header, and stringified body", () => {
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    sendJson(res, 200, { ok: true });

    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json; charset=utf-8");
    expect(res.end).toHaveBeenCalledWith('{"ok":true}');
  });
});

describe("readJsonBody", () => {
  function mockReq(body: string): IncomingMessage {
    const { EventEmitter } = require("node:events");
    const req = new EventEmitter();
    process.nextTick(() => {
      req.emit("data", Buffer.from(body));
      req.emit("end");
    });
    return req as IncomingMessage;
  }

  it("parses JSON body", async () => {
    const result = await readJsonBody(mockReq('{"key":"value"}'));
    expect(result).toEqual({ key: "value" });
  });

  it("returns empty object for invalid JSON", async () => {
    const result = await readJsonBody(mockReq("not json"));
    expect(result).toEqual({});
  });

  it("returns empty object for empty body", async () => {
    const result = await readJsonBody(mockReq(""));
    expect(result).toEqual({});
  });
});
