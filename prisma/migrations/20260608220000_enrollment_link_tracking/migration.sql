-- CreateEnum
CREATE TYPE "EnrollmentLinkEventType" AS ENUM ('OPEN', 'DOWNLOAD');

-- CreateTable
CREATE TABLE "EnrollmentLinkEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "type" "EnrollmentLinkEventType" NOT NULL,
    "visitorKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentLinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrollmentLinkEvent_linkId_type_idx" ON "EnrollmentLinkEvent"("linkId", "type");

-- CreateIndex
CREATE INDEX "EnrollmentLinkEvent_linkId_createdAt_idx" ON "EnrollmentLinkEvent"("linkId", "createdAt");

-- AddForeignKey
ALTER TABLE "EnrollmentLinkEvent" ADD CONSTRAINT "EnrollmentLinkEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "EnrollmentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
