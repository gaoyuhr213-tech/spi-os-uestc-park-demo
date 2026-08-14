CREATE TABLE `accessPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`role` enum('user','admin') NOT NULL,
	`fieldGroup` enum('public','business','sensitive','pii') NOT NULL,
	`effect` enum('allow','mask','deny') NOT NULL,
	`condition` varchar(255),
	`updatedBy` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accessPolicies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`cid` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`ctype` enum('manual','csv','paste','api') NOT NULL,
	`status` enum('active','planned','paused','error') NOT NULL DEFAULT 'planned',
	`source` varchar(256),
	`configJson` text,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connectors_id` PRIMARY KEY(`id`),
	CONSTRAINT `connectors_cid_unique` UNIQUE(`cid`)
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`eid` varchar(16) NOT NULL,
	`scope` enum('contact_info','hr_data','finance_data','full_profile') NOT NULL,
	`status` enum('granted','revoked','expired') NOT NULL DEFAULT 'granted',
	`grantedBy` varchar(64),
	`basis` varchar(255),
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`revokedBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingestionJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`connectorId` varchar(64) NOT NULL,
	`status` enum('running','success','partial','failed') NOT NULL DEFAULT 'running',
	`rowsIn` int NOT NULL DEFAULT 0,
	`rowsOut` int NOT NULL DEFAULT 0,
	`rowsSkipped` int NOT NULL DEFAULT 0,
	`error` text,
	`summaryJson` text,
	`triggeredBy` varchar(64),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `ingestionJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mergeDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(32) NOT NULL DEFAULT 'uestc',
	`sourceEids` text NOT NULL,
	`targetEid` varchar(16) NOT NULL,
	`confidence` int NOT NULL,
	`evidenceJson` text NOT NULL,
	`status` enum('auto_merged','pending','confirmed','split','dismissed') NOT NULL DEFAULT 'pending',
	`decidedBy` varchar(64),
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mergeDecisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `decisions` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `decisions` ADD `resourceId` int;--> statement-breakpoint
ALTER TABLE `decisions` ADD `basedOn` text;--> statement-breakpoint
ALTER TABLE `enrichments` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `entities` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `graphEdges` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `graphNodes` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `lifecycleEvents` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `opsLedger` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `parseHistory` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `resources` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `ruleConfigs` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;--> statement-breakpoint
ALTER TABLE `taskCompletions` ADD `tenantId` varchar(32) DEFAULT 'uestc' NOT NULL;