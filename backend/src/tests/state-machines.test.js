import { describe, expect, it } from "vitest";
import { assertSessionTransition, assertTaskTransition } from "../core/state-machines.js";
describe("recording task state machine", () => {
    it("allows approved path", () => {
        expect(() => assertTaskTransition("UNASSIGNED", "ASSIGNED")).not.toThrow();
        expect(() => assertTaskTransition("QA_PENDING", "APPROVED")).not.toThrow();
    });
    it("rejects invalid jumps", () => {
        expect(() => assertTaskTransition("UNASSIGNED", "APPROVED")).toThrow();
    });
});
describe("dual session state machine", () => {
    it("allows synchronized session path", () => {
        expect(() => assertSessionTransition("WAITING_FOR_PARTICIPANTS", "READY")).not.toThrow();
        expect(() => assertSessionTransition("READY", "RECORDING")).not.toThrow();
    });
    it("rejects starting before ready", () => {
        expect(() => assertSessionTransition("WAITING_FOR_PARTICIPANTS", "RECORDING")).toThrow();
    });
});
