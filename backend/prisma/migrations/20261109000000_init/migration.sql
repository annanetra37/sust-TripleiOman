-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "digitStyle" TEXT NOT NULL DEFAULT 'western',
    "showHijri" BOOLEAN NOT NULL DEFAULT false,
    "platformRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "recoveryCodes" JSONB NOT NULL DEFAULT '[]',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetExpiresAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "legalNameEn" TEXT NOT NULL,
    "legalNameAr" TEXT,
    "crNumber" TEXT,
    "legalForm" TEXT,
    "activities" TEXT,
    "address" TEXT,
    "governorate" TEXT,
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "tin" TEXT,
    "vatNumber" TEXT,
    "exciseNumber" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "vatRegisteredAt" TIMESTAMP(3),
    "vatGroupRepId" TEXT,
    "annualSuppliesBaisa" BIGINT NOT NULL DEFAULT 0,
    "employees" INTEGER NOT NULL DEFAULT 0,
    "paidUpCapitalBaisa" BIGINT NOT NULL DEFAULT 0,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "obligationsSummary" JSONB NOT NULL DEFAULT '[]',
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "isPractitionerFirm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "approvedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "value" JSONB NOT NULL,
    "sourceCitation" TEXT NOT NULL,
    "changeNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "ruleRef" TEXT,
    "notes" TEXT,
    "remindersSent" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "filename" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "direction" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT,
    "counterpartyName" TEXT,
    "counterpartyVat" TEXT,
    "counterpartyCountry" TEXT NOT NULL DEFAULT 'OM',
    "description" TEXT,
    "accountCode" TEXT,
    "netBaisa" BIGINT NOT NULL,
    "vatBaisa" BIGINT NOT NULL DEFAULT 0,
    "vatCategory" TEXT,
    "categorySource" TEXT,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "isImport" BOOLEAN NOT NULL DEFAULT false,
    "isCreditNote" BOOLEAN NOT NULL DEFAULT false,
    "inputBlocked" BOOLEAN NOT NULL DEFAULT false,
    "hasTaxInvoice" BOOLEAN NOT NULL DEFAULT true,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "lockedByReturnId" TEXT,
    "einvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT,
    "taxCategory" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturn" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "obligationId" TEXT,
    "taxType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "boxes" JSONB NOT NULL DEFAULT '{}',
    "explanation" JSONB NOT NULL DEFAULT '{}',
    "exceptions" JSONB NOT NULL DEFAULT '[]',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "ruleVersions" JSONB NOT NULL DEFAULT '{}',
    "amountDueBaisa" BIGINT NOT NULL DEFAULT 0,
    "preparedById" TEXT NOT NULL,
    "submittedForReviewAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewComment" TEXT,
    "approvedAt" TIMESTAMP(3),
    "signatureHash" TEXT,
    "submissionRef" TEXT,
    "submittedAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "vatNumber" TEXT,
    "crNumber" TEXT,
    "country" TEXT NOT NULL DEFAULT 'OM',
    "address" TEXT,
    "city" TEXT,
    "email" TEXT,
    "peppolId" TEXT,
    "hasOmanPE" BOOLEAN NOT NULL DEFAULT false,
    "residencyCertExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "docType" TEXT NOT NULL DEFAULT 'INVOICE',
    "kind" TEXT NOT NULL DEFAULT 'B2B',
    "number" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "supplyDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'OMR',
    "buyer" JSONB NOT NULL DEFAULT '{}',
    "seller" JSONB NOT NULL DEFAULT '{}',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "netBaisa" BIGINT NOT NULL DEFAULT 0,
    "vatBaisa" BIGINT NOT NULL DEFAULT 0,
    "totalBaisa" BIGINT NOT NULL DEFAULT 0,
    "originalInvoiceId" TEXT,
    "originalNumber" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validationErrors" JSONB NOT NULL DEFAULT '[]',
    "xml" TEXT,
    "sha256" TEXT,
    "qrPayload" TEXT,
    "aspMessageId" TEXT,
    "idempotencyKey" TEXT,
    "statusHistory" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhtPayment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "grossBaisa" BIGINT NOT NULL,
    "netOfTax" BOOLEAN NOT NULL DEFAULT false,
    "rateBp" INTEGER NOT NULL,
    "treatyApplied" BOOLEAN NOT NULL DEFAULT false,
    "whtBaisa" BIGINT NOT NULL,
    "explanation" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExciseProduct" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExciseProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT,
    "ownerUserId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "relatedType" TEXT,
    "relatedId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLetter" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT,
    "letterType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "responseDueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "notes" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "seq" BIGSERIAL NOT NULL,
    "organisationId" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organisationId_key" ON "Membership"("userId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "TaxRule_key_status_idx" ON "TaxRule"("key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_key_version_key" ON "TaxRule"("key", "version");

-- CreateIndex
CREATE INDEX "Obligation_organisationId_dueDate_idx" ON "Obligation"("organisationId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_organisationId_taxType_periodStart_periodEnd_key" ON "Obligation"("organisationId", "taxType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Transaction_organisationId_date_idx" ON "Transaction"("organisationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_organisationId_accountCode_key" ON "AccountMapping"("organisationId", "accountCode");

-- CreateIndex
CREATE INDEX "TaxReturn_organisationId_taxType_periodStart_idx" ON "TaxReturn"("organisationId", "taxType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoice_idempotencyKey_key" ON "EInvoice"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoice_organisationId_direction_number_key" ON "EInvoice"("organisationId", "direction", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ExciseProduct_organisationId_sku_key" ON "ExciseProduct"("organisationId", "sku");

-- CreateIndex
CREATE INDEX "TaxDocument_organisationId_category_idx" ON "TaxDocument"("organisationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PitProfile_userId_taxYear_key" ON "PitProfile"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_createdAt_idx" ON "AuditLog"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoice" ADD CONSTRAINT "EInvoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhtPayment" ADD CONSTRAINT "WhtPayment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhtPayment" ADD CONSTRAINT "WhtPayment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExciseProduct" ADD CONSTRAINT "ExciseProduct_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDocument" ADD CONSTRAINT "TaxDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLetter" ADD CONSTRAINT "TaxLetter_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitProfile" ADD CONSTRAINT "PitProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

