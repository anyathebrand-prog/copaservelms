-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'PDF', 'AUDIO', 'TEXT', 'EXTERNAL_LINK', 'EMBEDDED_SLIDES', 'CODE_SNIPPET');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'CHECKBOX', 'SHORT_ANSWER', 'ESSAY', 'TRUE_FALSE', 'DRAG_AND_DROP', 'MATCHING');

-- CreateEnum
CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_GRADED', 'PENDING_MANUAL_GRADING', 'GRADED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'GRADED', 'RETURNED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('PENDING_APPROVAL', 'ISSUED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MintStatus" AS ENUM ('NOT_MINTED', 'MINT_ELIGIBLE', 'MINT_PENDING', 'MINTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WalletProvider" AS ENUM ('WALLETCONNECT', 'METAMASK', 'COINBASE', 'RAINBOW', 'AVALANCHE_CORE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_NOTICE', 'TERMS_OF_SERVICE', 'COOKIES', 'MARKETING_EMAIL', 'MARKETING_SMS', 'DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('GRANTED', 'WITHDRAWN', 'UPDATED');

-- CreateEnum
CREATE TYPE "LiveClassProvider" AS ENUM ('ZOOM', 'GOOGLE_MEET', 'OTHER');

-- CreateEnum
CREATE TYPE "LiveClassStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResourceScope" AS ENUM ('COURSE', 'MODULE', 'LESSON', 'LIVE_CLASS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "organizationId" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "profession" TEXT,
    "organizationName" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "emergencyContact" TEXT,
    "xpPoints" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "learningMinutes" INTEGER NOT NULL DEFAULT 0,
    "communicationPrefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "contactEmail" TEXT,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "promoVideoUrl" TEXT,
    "level" "CourseLevel" NOT NULL DEFAULT 'BEGINNER',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "priceMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "estimatedMinutes" INTEGER,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minQuizScore" INTEGER,
    "requiresAssignments" BOOLEAN NOT NULL DEFAULT false,
    "minAttendanceRate" INTEGER,
    "requiresAdminApproval" BOOLEAN NOT NULL DEFAULT false,
    "certificateValidMonths" INTEGER,
    "instructorId" UUID NOT NULL,
    "categoryId" UUID,
    "templateId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LessonType" NOT NULL DEFAULT 'VIDEO',
    "contentUrl" TEXT,
    "content" TEXT,
    "position" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_prerequisites" (
    "lessonId" UUID NOT NULL,
    "prerequisiteId" UUID NOT NULL,

    CONSTRAINT "lesson_prerequisites_pkey" PRIMARY KEY ("lessonId","prerequisiteId")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "scope" "ResourceScope" NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "courseId" UUID,
    "moduleId" UUID,
    "lessonId" UUID,
    "liveClassId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "enrolledBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "bookmarks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "lessonId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timeLimitMinutes" INTEGER,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "maxAttempts" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "showAnswersAfter" BOOLEAN NOT NULL DEFAULT true,
    "countsTowardCertificate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER,
    "maxScore" INTEGER,
    "passed" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_answers" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "response" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "pointsAwarded" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "dueAt" TIMESTAMP(3),
    "maxPoints" INTEGER NOT NULL DEFAULT 100,
    "allowedFileTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxFileSizeMb" INTEGER,
    "allowResubmission" BOOLEAN NOT NULL DEFAULT true,
    "rubric" JSONB NOT NULL DEFAULT '[]',
    "isRequiredForCertificate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "files" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "grade" INTEGER,
    "rubricScores" JSONB,
    "feedback" TEXT,
    "gradedById" UUID,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "logoUrl" TEXT,
    "signatureUrl" TEXT,
    "backgroundUrl" TEXT,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "templateId" UUID,
    "status" "CertificateStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "pdfUrl" TEXT,
    "qrCodeUrl" TEXT,
    "verificationUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "mintStatus" "MintStatus" NOT NULL DEFAULT 'NOT_MINTED',
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "provider" "WalletProvider" NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mint_transactions" (
    "id" UUID NOT NULL,
    "certificateId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "status" "MintStatus" NOT NULL DEFAULT 'MINT_PENDING',
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT,
    "tokenId" TEXT,
    "transactionHash" TEXT,
    "metadataUri" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "explorerUrl" TEXT,
    "errorMessage" TEXT,
    "mintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mint_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "enrollmentId" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "couponCode" TEXT,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "invoiceUrl" TEXT,
    "providerPayload" JSONB NOT NULL DEFAULT '{}',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_classes" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "provider" "LiveClassProvider" NOT NULL DEFAULT 'ZOOM',
    "status" "LiveClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "joinUrl" TEXT,
    "externalId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_attendances" (
    "id" UUID NOT NULL,
    "liveClassId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "minutesAttended" INTEGER NOT NULL DEFAULT 0,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "xpValue" INTEGER NOT NULL DEFAULT 0,
    "isMintable" BOOLEAN NOT NULL DEFAULT false,
    "courseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "badgeId" UUID NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_posts" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "discussion_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "postId" UUID,
    "lessonId" UUID,
    "parentId" UUID,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "policyVersion" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseUserId_key" ON "users"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_instructorId_idx" ON "courses"("instructorId");

-- CreateIndex
CREATE INDEX "courses_categoryId_idx" ON "courses"("categoryId");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "modules_courseId_position_key" ON "modules"("courseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_moduleId_position_key" ON "lessons"("moduleId", "position");

-- CreateIndex
CREATE INDEX "resources_courseId_idx" ON "resources"("courseId");

-- CreateIndex
CREATE INDEX "resources_lessonId_idx" ON "resources"("lessonId");

-- CreateIndex
CREATE INDEX "enrollments_courseId_idx" ON "enrollments"("courseId");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- CreateIndex
CREATE INDEX "lesson_progress_userId_idx" ON "lesson_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_enrollmentId_lessonId_key" ON "lesson_progress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "quizzes_courseId_idx" ON "quizzes"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "questions_quizId_position_key" ON "questions"("quizId", "position");

-- CreateIndex
CREATE INDEX "quiz_attempts_enrollmentId_idx" ON "quiz_attempts"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quizId_userId_attemptNumber_key" ON "quiz_attempts"("quizId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_answers_attemptId_questionId_key" ON "quiz_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "assignments_courseId_idx" ON "assignments"("courseId");

-- CreateIndex
CREATE INDEX "submissions_enrollmentId_idx" ON "submissions"("enrollmentId");

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignmentId_userId_attemptNumber_key" ON "submissions"("assignmentId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_templates_name_key" ON "certificate_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_credentialId_key" ON "certificates"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_enrollmentId_key" ON "certificates"("enrollmentId");

-- CreateIndex
CREATE INDEX "certificates_userId_idx" ON "certificates"("userId");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "wallets_address_idx" ON "wallets"("address");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_address_chainId_key" ON "wallets"("userId", "address", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "mint_transactions_certificateId_key" ON "mint_transactions"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "mint_transactions_transactionHash_key" ON "mint_transactions"("transactionHash");

-- CreateIndex
CREATE INDEX "mint_transactions_walletId_idx" ON "mint_transactions"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_enrollmentId_key" ON "payments"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_userId_idx" ON "payments"("userId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "live_classes_courseId_idx" ON "live_classes"("courseId");

-- CreateIndex
CREATE INDEX "live_classes_startsAt_idx" ON "live_classes"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_attendances_liveClassId_userId_key" ON "live_class_attendances"("liveClassId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "badges_name_key" ON "badges"("name");

-- CreateIndex
CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_userId_badgeId_key" ON "achievements"("userId", "badgeId");

-- CreateIndex
CREATE INDEX "discussion_posts_courseId_idx" ON "discussion_posts"("courseId");

-- CreateIndex
CREATE INDEX "discussion_posts_authorId_idx" ON "discussion_posts"("authorId");

-- CreateIndex
CREATE INDEX "comments_postId_idx" ON "comments"("postId");

-- CreateIndex
CREATE INDEX "comments_lessonId_idx" ON "comments"("lessonId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_scheduledFor_idx" ON "notifications"("scheduledFor");

-- CreateIndex
CREATE INDEX "consent_logs_userId_type_idx" ON "consent_logs"("userId", "type");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "certificate_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "live_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "certificate_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mint_transactions" ADD CONSTRAINT "mint_transactions_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mint_transactions" ADD CONSTRAINT "mint_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_attendances" ADD CONSTRAINT "live_class_attendances_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "live_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_attendances" ADD CONSTRAINT "live_class_attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badges" ADD CONSTRAINT "badges_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
