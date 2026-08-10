-- Change Todo.ownerId ON DELETE from SET NULL to CASCADE so deleting a user
-- removes their private todos instead of publishing them to the shared board.
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_ownerId_fkey";

ALTER TABLE "Todo" ADD CONSTRAINT "Todo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
