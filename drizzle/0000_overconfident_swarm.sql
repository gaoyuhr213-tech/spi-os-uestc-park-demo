CREATE TABLE `enrichments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eid` varchar(16) NOT NULL,
	`uscc` varchar(32),
	`regCapital` varchar(32),
	`founded` varchar(16),
	`insured` int,
	`legalRep` varchar(64),
	`branches` int,
	`jobs` int,
	`topJobs` text,
	`salaryRange` varchar(64),
	`patents` int,
	`softCopyrights` int,
	`hiTech` varchar(16),
	`funding` varchar(64),
	`bidAmount` varchar(32),
	`icp` varchar(64),
	`keyContact` varchar(128),
	`referralVia` varchar(128),
	`referralNote` text,
	`verified` enum('待核验','已核验','存疑','牌面遮挡') NOT NULL DEFAULT '待核验',
	`verifiedBy` varchar(64),
	`remark` text,
	`importedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrichments_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrichments_eid_unique` UNIQUE(`eid`)
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eid` varchar(16) NOT NULL,
	`name` varchar(128) NOT NULL,
	`floor` varchar(32) NOT NULL,
	`room` varchar(64) NOT NULL,
	`ind` varchar(32) NOT NULL,
	`nature` varchar(64) NOT NULL,
	`cross` int NOT NULL DEFAULT 0,
	`tierRole` enum('tenant','operator','support') NOT NULL DEFAULT 'tenant',
	`hiringBase` enum('高','中','低','无') NOT NULL DEFAULT '无',
	`note` text,
	`referralPath` enum('A','B','C','D'),
	`entryPoint` text,
	`signalsJson` text,
	`dimsJson` text,
	`demo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entities_id` PRIMARY KEY(`id`),
	CONSTRAINT `entities_eid_unique` UNIQUE(`eid`)
);
--> statement-breakpoint
CREATE TABLE `lifecycleEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eid` varchar(16) NOT NULL,
	`stage` enum('未触达','已触达','已约见','已成交') NOT NULL,
	`note` varchar(256),
	`actor` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lifecycleEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ruleConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`configJson` text NOT NULL,
	`description` varchar(256),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ruleConfigs_id` PRIMARY KEY(`id`),
	CONSTRAINT `ruleConfigs_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
