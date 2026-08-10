import type { Prisma } from "@prisma/client";

export type OutboxType =
  | "todo.created"
  | "todo.updated"
  | "todo.deleted"
  | "todo.restored"
  | "todo.bulk";

export async function writeOutbox(
  tx: Prisma.TransactionClient,
  type: OutboxType,
  payload: Prisma.InputJsonValue,
) {
  await tx.outboxEvent.create({
    data: {
      type,
      payload,
    },
  });
}
