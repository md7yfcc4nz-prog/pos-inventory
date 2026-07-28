-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill usernames from the email local-part
UPDATE "User"
SET "username" = lower(
  CASE
    WHEN instr("email", '@') > 1 THEN substr("email", 1, instr("email", '@') - 1)
    ELSE "email"
  END
);

-- Resolve collisions: keep the earliest row, suffix the rest
UPDATE "User"
SET "username" = "username" || '_' || substr("id", -6)
WHERE "id" IN (
  SELECT u."id"
  FROM "User" u
  WHERE EXISTS (
    SELECT 1
    FROM "User" other
    WHERE other."username" = u."username"
      AND other."id" < u."id"
  )
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
