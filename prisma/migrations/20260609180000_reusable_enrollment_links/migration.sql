-- Reusable enrollment links: many devices per link, no mandatory expiry

ALTER TABLE "Device" ADD COLUMN "enrollmentLinkId" TEXT;
ALTER TABLE "Device" ADD COLUMN "browser" TEXT;
ALTER TABLE "Device" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "Device" ADD COLUMN "timezone" TEXT;
ALTER TABLE "Device" ADD COLUMN "language" TEXT;
ALTER TABLE "Device" ADD COLUMN "country" TEXT;
ALTER TABLE "Device" ADD COLUMN "city" TEXT;
ALTER TABLE "Device" ADD COLUMN "screenResolution" TEXT;

UPDATE "Device" d
SET "enrollmentLinkId" = el."id"
FROM "EnrollmentLink" el
WHERE el."deviceId" = d."id";

ALTER TABLE "EnrollmentLink" DROP CONSTRAINT IF EXISTS "EnrollmentLink_deviceId_fkey";
ALTER TABLE "EnrollmentLink" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "EnrollmentLink" DROP COLUMN IF EXISTS "usedAt";

ALTER TABLE "EnrollmentLink" ALTER COLUMN "expiresAt" DROP NOT NULL;
UPDATE "EnrollmentLink" SET "expiresAt" = NULL;

ALTER TABLE "Device"
  ADD CONSTRAINT "Device_enrollmentLinkId_fkey"
  FOREIGN KEY ("enrollmentLinkId") REFERENCES "EnrollmentLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Device_enrollmentLinkId_idx" ON "Device"("enrollmentLinkId");
