/**
 * Detect whether adding edges from `todoId` to `dependencyIds`
 * would create a cycle in the dependency graph.
 *
 * Edges mean: todoId depends on dependencyId (todo cannot start until deps complete).
 */
export function wouldCreateCycle(
  todoId: string,
  dependencyIds: string[],
  existingEdges: Array<{ todoId: string; dependsOnTodoId: string }>,
): boolean {
  if (dependencyIds.includes(todoId)) {
    return true;
  }

  const adjacency = new Map<string, string[]>();

  for (const edge of existingEdges) {
    const list = adjacency.get(edge.todoId) ?? [];
    list.push(edge.dependsOnTodoId);
    adjacency.set(edge.todoId, list);
  }

  // Temporarily add proposed edges
  const proposed = [...(adjacency.get(todoId) ?? []), ...dependencyIds];
  adjacency.set(todoId, proposed);

  // Walk from each new dependency. If we can reach todoId, a cycle exists.
  const visited = new Set<string>();
  const stack = [...dependencyIds];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === todoId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const next = adjacency.get(current) ?? [];
    for (const node of next) {
      stack.push(node);
    }
  }

  return false;
}

export function isBlockedByDependencies(
  dependencyStatuses: Array<{ status: string }>,
): boolean {
  return dependencyStatuses.some((dep) => dep.status !== "COMPLETED");
}
