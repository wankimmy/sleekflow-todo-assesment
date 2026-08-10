"use client";

import { Suspense } from "react";
import { TasksPanel } from "@/features/todos/components/tasks-panel";
import { LoadingState } from "@/features/todos/components/ui-states";

export default function TrashPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading trash…" />}>
      <TasksPanel onlyDeleted />
    </Suspense>
  );
}
