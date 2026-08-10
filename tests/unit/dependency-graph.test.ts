import { describe, expect, it } from "vitest";
import {
  isBlockedByDependencies,
  wouldCreateCycle,
} from "@/features/todos/dependency-graph";

describe("wouldCreateCycle", () => {
  it("rejects self-dependencies", () => {
    expect(wouldCreateCycle("a", ["a"], [])).toBe(true);
  });

  it("detects a direct cycle", () => {
    const edges = [{ todoId: "b", dependsOnTodoId: "a" }];
    expect(wouldCreateCycle("a", ["b"], edges)).toBe(true);
  });

  it("detects an indirect cycle", () => {
    const edges = [
      { todoId: "b", dependsOnTodoId: "c" },
      { todoId: "c", dependsOnTodoId: "a" },
    ];
    expect(wouldCreateCycle("a", ["b"], edges)).toBe(true);
  });

  it("allows a valid dependency tree", () => {
    const edges = [
      { todoId: "b", dependsOnTodoId: "c" },
      { todoId: "c", dependsOnTodoId: "d" },
    ];
    expect(wouldCreateCycle("a", ["b"], edges)).toBe(false);
  });
});

describe("isBlockedByDependencies", () => {
  it("is blocked when any dependency is incomplete", () => {
    expect(
      isBlockedByDependencies([
        { status: "COMPLETED" },
        { status: "IN_PROGRESS" },
      ]),
    ).toBe(true);
  });

  it("is unblocked when all dependencies are completed", () => {
    expect(
      isBlockedByDependencies([
        { status: "COMPLETED" },
        { status: "COMPLETED" },
      ]),
    ).toBe(false);
  });
});
