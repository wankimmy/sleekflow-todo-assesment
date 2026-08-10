"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Subscribes to outbox SSE and invalidates todo-related queries. */
export function RealtimeInvalidator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
    };

    source.addEventListener("outbox", invalidate);

    return () => {
      source.removeEventListener("outbox", invalidate);
      source.close();
    };
  }, [queryClient]);

  return null;
}
