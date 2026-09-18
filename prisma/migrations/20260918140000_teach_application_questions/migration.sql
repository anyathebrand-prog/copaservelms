-- Two questions on the "Teach with us" form: how experienced the applicant is
-- with course video, and whether they can bring an audience.
--
-- Both nullable. Applications made before the questions existed have no
-- answer, and backfilling one would put words in the applicant's mouth.

-- CreateEnum
CREATE TYPE "VideoExperience" AS ENUM ('BEGINNER', 'SOME_KNOWLEDGE', 'EXPERIENCED', 'VIDEOS_READY');

-- CreateEnum
CREATE TYPE "AudienceSize" AS ENUM ('NONE', 'SMALL', 'SIZABLE');

-- AlterTable
ALTER TABLE "instructor_applications"
  ADD COLUMN "videoExperience" "VideoExperience",
  ADD COLUMN "audienceSize" "AudienceSize";
