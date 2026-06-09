-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('NATIVE', 'BROWSER');

-- CreateEnum
CREATE TYPE "EnrollmentLinkKind" AS ENUM ('AGENT', 'INSTANT', 'BOTH');

-- AlterEnum
ALTER TYPE "EnrollmentLinkEventType" ADD VALUE 'CONNECT';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "deviceType" "DeviceType" NOT NULL DEFAULT 'NATIVE';

-- AlterTable
ALTER TABLE "EnrollmentLink" ADD COLUMN "kind" "EnrollmentLinkKind" NOT NULL DEFAULT 'BOTH';
