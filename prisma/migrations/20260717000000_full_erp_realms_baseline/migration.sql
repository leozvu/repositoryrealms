-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "roles" TEXT NOT NULL DEFAULT '["STAFF"]',
    "teamId" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "salary" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totpSecret" TEXT,
    "birthday" TEXT,
    "userType" TEXT NOT NULL DEFAULT 'employee',
    "accessUntil" TEXT,
    "hourlyRate" INTEGER NOT NULL DEFAULT 0,
    "skills" TEXT,
    "portfolio" TEXT,
    "loginFails" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "industry" TEXT,
    "address" TEXT,
    "note" TEXT,
    "createdAt" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "value" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "ownerId" TEXT,
    "note" TEXT,
    "createdAt" TEXT,
    "expectedClose" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "desc" TEXT,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "service" TEXT,
    "budget" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "startDate" TEXT,
    "deadline" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "autoProgress" BOOLEAN NOT NULL DEFAULT true,
    "budgetHours" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" TEXT,
    "budgetHours" INTEGER NOT NULL DEFAULT 0,
    "phases" TEXT NOT NULL DEFAULT '[]',
    "milestones" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "assigneeId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "dueDate" TEXT,
    "note" TEXT,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "recur" TEXT,
    "estHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phaseId" TEXT,
    "labels" TEXT NOT NULL DEFAULT '[]',
    "statusSince" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealmProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "realmClass" TEXT NOT NULL DEFAULT 'Realm Builder',
    "color" TEXT NOT NULL DEFAULT '#3b8061',
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealmProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealmQuestConfig" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "renown" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuredById" TEXT,
    "configuredAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealmQuestConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealmRewardBudget" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "goldCap" INTEGER NOT NULL DEFAULT 140,
    "perUserGoldCap" INTEGER NOT NULL DEFAULT 45,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuredById" TEXT,
    "configuredAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealmRewardBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealmGoldEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "renown" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealmGoldEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "scores" TEXT NOT NULL DEFAULT '[]',
    "selfNote" TEXT,
    "mgrNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "invoiceId" TEXT,
    "date" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "TimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'hourly',
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidDate" TEXT,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "items" TEXT NOT NULL DEFAULT '[]',
    "vat" INTEGER NOT NULL DEFAULT 8,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "date" TEXT NOT NULL,
    "note" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "items" TEXT NOT NULL DEFAULT '[]',
    "vat" INTEGER NOT NULL DEFAULT 8,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "date" TEXT NOT NULL,
    "dueDate" TEXT,
    "paidDate" TEXT,
    "payments" TEXT NOT NULL DEFAULT '[]',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recGroup" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "date" TEXT NOT NULL,
    "desc" TEXT,
    "projectId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'annual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "note" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "projectId" TEXT,
    "desc" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidDate" TEXT,

    CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'client',
    "partner" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "signDate" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "serial" TEXT,
    "holderId" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "buyDate" TEXT,
    "renewAt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_use',
    "note" TEXT,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refId" TEXT,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "steps" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "checkIn" TEXT,
    "checkOut" TEXT,
    "otHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "note" TEXT,
    "createdAt" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lines" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "desc" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Okr" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "note" TEXT,

    CONSTRAINT "Okr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsResponse" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "score" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'dm',
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvMember" (
    "id" TEXT NOT NULL,
    "convId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConvMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "convId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TEXT,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "roles" TEXT NOT NULL DEFAULT '["PM"]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '["*"]',
    "secret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" TEXT,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "resource" TEXT NOT NULL,
    "event" TEXT NOT NULL DEFAULT 'update',
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsatResponse" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "clientId" TEXT,
    "score" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "CsatResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "route" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborationPresenceSession" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'erp',
    "availability" TEXT NOT NULL DEFAULT 'available',
    "capabilities" TEXT NOT NULL DEFAULT '["chat"]',
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationPresenceSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "CollaborationContactRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "sourceSurface" TEXT NOT NULL DEFAULT 'realm',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "actionAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaborationContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocLink" (
    "id" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "quotes" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Onboarding" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "candidateId" TEXT,
    "position" TEXT,
    "startDate" TEXT,
    "items" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "json" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "refId" TEXT,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowingArea" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PUC',
    "name" TEXT NOT NULL,
    "crop" TEXT,
    "province" TEXT,
    "areaHa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "owner" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowingArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaCode" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legacyCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validFrom" TEXT,
    "validTo" TEXT,
    "note" TEXT,

    CONSTRAINT "AreaCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT,
    "crop" TEXT,
    "market" TEXT NOT NULL,
    "incoterm" TEXT NOT NULL DEFAULT 'FOB',
    "transportMode" TEXT NOT NULL DEFAULT 'SEA',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'TT',
    "containerType" TEXT,
    "containerNo" TEXT,
    "sealNo" TEXT,
    "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "etd" TEXT,
    "eta" TEXT,
    "blNo" TEXT,
    "lcNo" TEXT,
    "lcExpiry" TEXT,
    "presentDeadline" TEXT,
    "growingAreaId" TEXT,
    "packingHouseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentDoc" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "refNo" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TEXT,
    "note" TEXT,

    CONSTRAINT "ShipmentDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "crop" TEXT NOT NULL,
    "vendorId" TEXT,
    "growingAreaId" TEXT,
    "warehouse" TEXT,
    "harvestDate" TEXT,
    "expiryDate" TEXT,
    "receivedDate" TEXT,
    "qtyIn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtyOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'tiktok',
    "shop" TEXT,
    "clientId" TEXT,
    "date" TEXT NOT NULL,
    "startAt" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "hostId" TEXT,
    "assistantId" TEXT,
    "contractType" TEXT NOT NULL DEFAULT 'affiliate',
    "gmv" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
    "peakViewers" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netGmv" INTEGER NOT NULL DEFAULT 0,
    "platformFee" INTEGER NOT NULL DEFAULT 0,
    "taxWithheld" INTEGER NOT NULL DEFAULT 0,
    "netReceived" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "hostPayBase" INTEGER NOT NULL DEFAULT 0,
    "hostPayRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hostAdvance" INTEGER NOT NULL DEFAULT 0,
    "hostSettled" INTEGER NOT NULL DEFAULT 0,
    "hostPit" INTEGER NOT NULL DEFAULT 0,
    "settledDate" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'tiktok',
    "shop" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "category" TEXT,
    "occurredAt" TEXT NOT NULL,
    "expiresAt" TEXT,
    "appealDeadline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "Phase_projectId_idx" ON "Phase"("projectId");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RealmProfile_userId_key" ON "RealmProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RealmQuestConfig_taskId_key" ON "RealmQuestConfig"("taskId");

-- CreateIndex
CREATE INDEX "RealmQuestConfig_status_idx" ON "RealmQuestConfig"("status");

-- CreateIndex
CREATE INDEX "RealmQuestConfig_configuredById_idx" ON "RealmQuestConfig"("configuredById");

-- CreateIndex
CREATE INDEX "RealmQuestConfig_approvedById_idx" ON "RealmQuestConfig"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "RealmRewardBudget_period_key" ON "RealmRewardBudget"("period");

-- CreateIndex
CREATE INDEX "RealmRewardBudget_status_idx" ON "RealmRewardBudget"("status");

-- CreateIndex
CREATE INDEX "RealmRewardBudget_configuredById_idx" ON "RealmRewardBudget"("configuredById");

-- CreateIndex
CREATE INDEX "RealmRewardBudget_approvedById_idx" ON "RealmRewardBudget"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "RealmGoldEntry_idempotencyKey_key" ON "RealmGoldEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RealmGoldEntry_userId_createdAt_idx" ON "RealmGoldEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RealmGoldEntry_sourceType_sourceId_idx" ON "RealmGoldEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RealmGoldEntry_userId_type_sourceType_sourceId_key" ON "RealmGoldEntry"("userId", "type", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_quarter_key" ON "Review"("userId", "quarter");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");

-- CreateIndex
CREATE INDEX "TimeLog_userId_idx" ON "TimeLog"("userId");

-- CreateIndex
CREATE INDEX "TimeLog_projectId_idx" ON "TimeLog"("projectId");

-- CreateIndex
CREATE INDEX "TimeLog_date_idx" ON "TimeLog"("date");

-- CreateIndex
CREATE INDEX "TimeLog_taskId_idx" ON "TimeLog"("taskId");

-- CreateIndex
CREATE INDEX "TimeLog_invoiceId_idx" ON "TimeLog"("invoiceId");

-- CreateIndex
CREATE INDEX "Payout_userId_idx" ON "Payout"("userId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_code_key" ON "Quote"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_code_key" ON "Invoice"("code");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_projectId_idx" ON "Transaction"("projectId");

-- CreateIndex
CREATE INDEX "Leave_userId_idx" ON "Leave"("userId");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_month_key" ON "Payroll"("month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_month_category_key" ON "Budget"("month", "category");

-- CreateIndex
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConvMember_convId_userId_key" ON "ConvMember"("convId", "userId");

-- CreateIndex
CREATE INDEX "Message_convId_createdAt_idx" ON "Message"("convId", "createdAt");

-- CreateIndex
CREATE INDEX "Commission_userId_idx" ON "Commission"("userId");

-- CreateIndex
CREATE INDEX "Commission_invoiceId_idx" ON "Commission"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "CollaborationPresenceSession_userId_lastSeen_idx" ON "CollaborationPresenceSession"("userId", "lastSeen");

-- CreateIndex
CREATE INDEX "CollaborationPresenceSession_lastSeen_idx" ON "CollaborationPresenceSession"("lastSeen");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationContactRequest_idempotencyKey_key" ON "CollaborationContactRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CollaborationContactRequest_targetId_status_createdAt_idx" ON "CollaborationContactRequest"("targetId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CollaborationContactRequest_requesterId_createdAt_idx" ON "CollaborationContactRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "CollaborationContactRequest_expiresAt_idx" ON "CollaborationContactRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AreaCode_areaId_idx" ON "AreaCode"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_market_idx" ON "Shipment"("market");

-- CreateIndex
CREATE INDEX "ShipmentDoc_shipmentId_idx" ON "ShipmentDoc"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_code_key" ON "StockLot"("code");

-- CreateIndex
CREATE INDEX "StockLot_crop_idx" ON "StockLot"("crop");

-- CreateIndex
CREATE INDEX "StockLot_status_idx" ON "StockLot"("status");

-- CreateIndex
CREATE INDEX "StockMove_lotId_idx" ON "StockMove"("lotId");

-- CreateIndex
CREATE INDEX "StockMove_refId_idx" ON "StockMove"("refId");

-- CreateIndex
CREATE INDEX "LiveSession_date_idx" ON "LiveSession"("date");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveSession_hostId_idx" ON "LiveSession"("hostId");

-- CreateIndex
CREATE INDEX "Violation_occurredAt_idx" ON "Violation"("occurredAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmProfile" ADD CONSTRAINT "RealmProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealmGoldEntry" ADD CONSTRAINT "RealmGoldEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvMember" ADD CONSTRAINT "ConvMember_convId_fkey" FOREIGN KEY ("convId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_convId_fkey" FOREIGN KEY ("convId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationPresenceSession" ADD CONSTRAINT "CollaborationPresenceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationContactRequest" ADD CONSTRAINT "CollaborationContactRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationContactRequest" ADD CONSTRAINT "CollaborationContactRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaCode" ADD CONSTRAINT "AreaCode_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GrowingArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentDoc" ADD CONSTRAINT "ShipmentDoc_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
