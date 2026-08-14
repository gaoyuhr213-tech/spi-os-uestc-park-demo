CREATE TABLE `dataConflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`conflictKey` varchar(128) NOT NULL,
	`dcEid` varchar(16) NOT NULL,
	`dcFieldName` varchar(64) NOT NULL,
	`evidenceIdsJson` text,
	`currentValue` text,
	`candidateValuesJson` text,
	`recommendedEvidenceId` int,
	`recommendedReason` text,
	`resolutionStatus` enum('open','suggested','resolved','ignored') NOT NULL DEFAULT 'open',
	`resolutionMethod` enum('manual','source_priority','newest_verified','weighted_score','rule_based'),
	`resolvedValue` text,
	`resolvedEvidenceId` int,
	`resolvedBy` varchar(64),
	`resolvedAt` timestamp,
	`dcCreatedAt` timestamp NOT NULL DEFAULT (now()),
	`dcUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dataConflicts_id` PRIMARY KEY(`id`),
	CONSTRAINT `dataConflicts_conflictKey_unique` UNIQUE(`conflictKey`)
);
--> statement-breakpoint
CREATE TABLE `dataSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`sourceKey` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` enum('government','company_official','commercial_database','recruitment','media','park_internal','field_visit','enterprise_submission','other') NOT NULL,
	`provider` varchar(128),
	`acquisitionChannel` enum('manual_paste','excel','api','form','system_sync','file_upload','email','other') NOT NULL DEFAULT 'other',
	`sourceScope` varchar(255),
	`homepageUrl` varchar(512),
	`ownerDepartment` varchar(64),
	`ownerName` varchar(64),
	`authorizationType` enum('public','user_provided','contractual','internal','unknown') NOT NULL DEFAULT 'unknown',
	`authorizationNote` text,
	`refreshMode` enum('one_time','manual','scheduled','event_driven') NOT NULL DEFAULT 'manual',
	`refreshFrequency` varchar(32),
	`reliabilityLevel` enum('A','B','C','D','ungraded') NOT NULL DEFAULT 'ungraded',
	`sensitivityLevel` varchar(16),
	`dsStatus` enum('active','paused','planned','retired') NOT NULL DEFAULT 'active',
	`lastSuccessfulSyncAt` timestamp,
	`lastFailedSyncAt` timestamp,
	`lastFailureReason` text,
	`createdBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dataSources_id` PRIMARY KEY(`id`),
	CONSTRAINT `dataSources_sourceKey_unique` UNIQUE(`sourceKey`)
);
--> statement-breakpoint
CREATE TABLE `decisionEvidenceLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`delDecisionId` int NOT NULL,
	`delEvidenceId` int NOT NULL,
	`delRole` enum('trigger','support','counter_evidence') NOT NULL DEFAULT 'support',
	`delCreatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `decisionEvidenceLinks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entityAliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`eaEid` varchar(16) NOT NULL,
	`aliasType` enum('legal_name','former_name','brand_name','uscc','domain','phone','address','contract_name','other') NOT NULL,
	`aliasValue` varchar(255) NOT NULL,
	`eaNormalizedValue` varchar(255),
	`eaSourceId` int,
	`eaVerified` int NOT NULL DEFAULT 0,
	`eaCreatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entityAliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidenceRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`evidenceKey` varchar(128) NOT NULL,
	`eid` varchar(16) NOT NULL,
	`fieldName` varchar(64) NOT NULL,
	`normalizedValue` text,
	`originalValue` text,
	`valueType` varchar(16),
	`sourceId` int NOT NULL,
	`batchId` int NOT NULL,
	`sourceRecordKey` varchar(128),
	`evidenceExcerpt` text,
	`evidenceLocation` varchar(128),
	`originalUrl` varchar(512),
	`erOriginalFileName` varchar(255),
	`erCollectedAt` timestamp,
	`erEffectiveAt` timestamp,
	`erExpiresAt` timestamp,
	`confidenceScore` int,
	`confidenceLabel` enum('high','medium','low','unknown') NOT NULL DEFAULT 'unknown',
	`verificationStatus` enum('pending','verified','disputed','rejected','expired') NOT NULL DEFAULT 'pending',
	`erVerifiedBy` varchar(64),
	`erVerifiedAt` timestamp,
	`erProcessingMethod` varchar(32),
	`modelName` varchar(64),
	`modelVersion` varchar(32),
	`transformationRule` varchar(128),
	`reliabilityScore` int,
	`isCurrent` int NOT NULL DEFAULT 0,
	`supersededByEvidenceId` int,
	`erCreatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidenceRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `evidenceRecords_evidenceKey_unique` UNIQUE(`evidenceKey`)
);
--> statement-breakpoint
CREATE TABLE `ingestionBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`batchKey` varchar(64) NOT NULL,
	`sourceId` int NOT NULL,
	`ibAcqChannel` enum('manual_paste','excel','api','form','system_sync','file_upload','email','other') NOT NULL DEFAULT 'excel',
	`processingMethod` enum('ai_extract','rule_parse','direct_mapping','manual_entry','connector_sync') NOT NULL DEFAULT 'direct_mapping',
	`originalFileName` varchar(255),
	`originalFileUrl` varchar(512),
	`originalPageUrl` varchar(512),
	`collectedAt` timestamp,
	`effectiveAt` timestamp,
	`expiresAt` timestamp,
	`ibStatus` enum('draft','parsing','review','committed','failed','rolled_back') NOT NULL DEFAULT 'draft',
	`totalRecords` int NOT NULL DEFAULT 0,
	`matchedRecords` int NOT NULL DEFAULT 0,
	`createdRecords` int NOT NULL DEFAULT 0,
	`updatedRecords` int NOT NULL DEFAULT 0,
	`conflictRecords` int NOT NULL DEFAULT 0,
	`failedRecords` int NOT NULL DEFAULT 0,
	`ibActor` varchar(64) NOT NULL,
	`ibNotes` text,
	`beforeSnapshotJson` text,
	`afterSnapshotJson` text,
	`ibCreatedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`rolledBackAt` timestamp,
	`rolledBackBy` varchar(64),
	CONSTRAINT `ingestionBatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `ingestionBatches_batchKey_unique` UNIQUE(`batchKey`)
);
--> statement-breakpoint
CREATE TABLE `scoreModels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`modelKey` varchar(64) NOT NULL,
	`role` enum('champion','challenger','archived') NOT NULL DEFAULT 'challenger',
	`weightsJson` text NOT NULL,
	`backtestJson` text,
	`lineageJson` text NOT NULL,
	`explanation` text,
	`promotedAt` timestamp,
	`promotedBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scoreModels_id` PRIMARY KEY(`id`),
	CONSTRAINT `scoreModels_modelKey_unique` UNIQUE(`modelKey`)
);
--> statement-breakpoint
CREATE TABLE `sourceFieldPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`sfpFieldName` varchar(64) NOT NULL,
	`sourceCategory` varchar(32) NOT NULL,
	`sfpPriority` int NOT NULL DEFAULT 50,
	`maxAgeDays` int NOT NULL DEFAULT 180,
	`requiresVerification` int NOT NULL DEFAULT 0,
	`allowAutoApply` int NOT NULL DEFAULT 0,
	`sfpNotes` text,
	`sfpUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sourceFieldPolicies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowDefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`defKey` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`decisionType` varchar(32),
	`stepsJson` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflowDefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflowDefs_defKey_unique` UNIQUE(`defKey`)
);
--> statement-breakpoint
CREATE TABLE `workflowInstances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`defKey` varchar(64) NOT NULL,
	`decisionId` int,
	`eid` varchar(16),
	`status` enum('running','done','failed','compensated') NOT NULL DEFAULT 'running',
	`currentStep` int NOT NULL DEFAULT 0,
	`stepStatesJson` text NOT NULL,
	`startedBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflowInstances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`instanceId` int NOT NULL,
	`stepIndex` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`assignee` varchar(64),
	`status` enum('open','done','escalated','cancelled') NOT NULL DEFAULT 'open',
	`slaHours` int NOT NULL DEFAULT 72,
	`dueAt` timestamp,
	`escalatedTo` varchar(64),
	`doneAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflowTasks_id` PRIMARY KEY(`id`)
);
