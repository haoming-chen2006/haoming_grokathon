import { describe, expect, test } from "bun:test";
import { ControlRoomBus, type PublishedEvent } from "./controlRoomEvents";

describe("control room event bus", () => {
  test("delivers events to subscribers of that project", () => {
    const bus = new ControlRoomBus();
    const received: PublishedEvent[] = [];
    bus.subscribe("p1", (e) => received.push(e));

    bus.publish("p1", { type: "progress", percent: 25, completed: 1, total: 4 });

    expect(received).toHaveLength(1);
    expect(received[0].projectId).toBe("p1");
    expect(received[0].event).toEqual({ type: "progress", percent: 25, completed: 1, total: 4 });
    expect(received[0].at).toBeTruthy();
  });

  test("does not leak events across projects", () => {
    const bus = new ControlRoomBus();
    const p1: PublishedEvent[] = [];
    const p2: PublishedEvent[] = [];
    bus.subscribe("p1", (e) => p1.push(e));
    bus.subscribe("p2", (e) => p2.push(e));

    bus.publish("p1", { type: "progress", percent: 10, completed: 1, total: 10 });

    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(0);
  });

  test("every subscriber of a project receives the event", () => {
    const bus = new ControlRoomBus();
    let a = 0;
    let b = 0;
    bus.subscribe("p1", () => a++);
    bus.subscribe("p1", () => b++);
    bus.publish("p1", { type: "progress", percent: 1, completed: 0, total: 1 });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test("unsubscribing stops delivery and cleans up", () => {
    const bus = new ControlRoomBus();
    const received: PublishedEvent[] = [];
    const off = bus.subscribe("p1", (e) => received.push(e));

    bus.publish("p1", { type: "progress", percent: 1, completed: 0, total: 1 });
    off();
    bus.publish("p1", { type: "progress", percent: 2, completed: 0, total: 1 });

    expect(received).toHaveLength(1);
    expect(bus.subscriberCount("p1")).toBe(0);
  });

  test("a throwing subscriber does not prevent others being notified", () => {
    const bus = new ControlRoomBus();
    let reached = false;
    bus.subscribe("p1", () => {
      throw new Error("bad subscriber");
    });
    bus.subscribe("p1", () => {
      reached = true;
    });

    expect(() => bus.publish("p1", { type: "progress", percent: 1, completed: 0, total: 1 })).not.toThrow();
    expect(reached).toBe(true);
  });

  test("recent history is replayed to late joiners", () => {
    const bus = new ControlRoomBus();
    bus.publish("p1", { type: "progress", percent: 10, completed: 1, total: 10 });
    bus.publish("p1", { type: "progress", percent: 20, completed: 2, total: 10 });

    // A client connecting now must not be blind to what already happened.
    expect(bus.history("p1").map((p) => (p.event as any).percent)).toEqual([10, 20]);
  });

  test("history is bounded so a long run cannot grow without limit", () => {
    const bus = new ControlRoomBus(3);
    for (let i = 0; i < 10; i++) {
      bus.publish("p1", { type: "progress", percent: i, completed: i, total: 10 });
    }
    const history = bus.history("p1");
    expect(history).toHaveLength(3);
    expect(history.map((p) => (p.event as any).percent)).toEqual([7, 8, 9]);
  });

  test("clear removes one project without touching others", () => {
    const bus = new ControlRoomBus();
    bus.publish("p1", { type: "progress", percent: 1, completed: 0, total: 1 });
    bus.publish("p2", { type: "progress", percent: 2, completed: 0, total: 1 });
    bus.clear("p1");
    expect(bus.history("p1")).toHaveLength(0);
    expect(bus.history("p2")).toHaveLength(1);
  });
});
