-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TodoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RecurrenceUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS');

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TodoStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "TodoPriority" NOT NULL DEFAULT 'MEDIUM',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceFrequency" "RecurrenceFrequency",
    "recurrenceInterval" INTEGER,
    "recurrenceUnit" "RecurrenceUnit",
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "previousOccurrenceId" TEXT,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoDependency" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "dependsOnTodoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodoDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Todo_previousOccurrenceId_key" ON "Todo"("previousOccurrenceId");

-- CreateIndex
CREATE INDEX "Todo_deletedAt_status_idx" ON "Todo"("deletedAt", "status");

-- CreateIndex
CREATE INDEX "Todo_deletedAt_priority_idx" ON "Todo"("deletedAt", "priority");

-- CreateIndex
CREATE INDEX "Todo_deletedAt_dueDate_idx" ON "Todo"("deletedAt", "dueDate");

-- CreateIndex
CREATE INDEX "Todo_deletedAt_name_idx" ON "Todo"("deletedAt", "name");

-- CreateIndex
CREATE INDEX "Todo_dueDate_idx" ON "Todo"("dueDate");

-- CreateIndex
CREATE INDEX "TodoDependency_dependsOnTodoId_idx" ON "TodoDependency"("dependsOnTodoId");

-- CreateIndex
CREATE UNIQUE INDEX "TodoDependency_todoId_dependsOnTodoId_key" ON "TodoDependency"("todoId", "dependsOnTodoId");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_previousOccurrenceId_fkey" FOREIGN KEY ("previousOccurrenceId") REFERENCES "Todo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoDependency" ADD CONSTRAINT "TodoDependency_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoDependency" ADD CONSTRAINT "TodoDependency_dependsOnTodoId_fkey" FOREIGN KEY ("dependsOnTodoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
