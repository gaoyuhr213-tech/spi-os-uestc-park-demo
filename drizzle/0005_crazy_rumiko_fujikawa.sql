CREATE TABLE `decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eid` varchar(16) NOT NULL,
	`dtype` enum('contact','mentor','hr_service','policy','referral') NOT NULL,
	`title` varchar(255) NOT NULL,
	`reason` text NOT NULL,
	`stars` int NOT NULL DEFAULT 3,
	`needTag` varchar(16),
	`matchedResources` text,
	`status` enum('suggested','adopted','executing','done','dismissed') NOT NULL DEFAULT 'suggested',
	`assignee` varchar(64),
	`outcome` varchar(16),
	`outcomeNote` varchar(255),
	`revenueTier` varchar(24),
	`genKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `decisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `decisions_genKey_unique` UNIQUE(`genKey`)
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rtype` enum('mentor','headhunter','alumni','professor','investor','lawfirm','tax','vendor','gaoyu') NOT NULL,
	`name` varchar(128) NOT NULL,
	`org` varchar(128),
	`needTags` varchar(128) NOT NULL,
	`indTags` varchar(128),
	`stageTags` varchar(128),
	`capacity` int NOT NULL DEFAULT 5,
	`graphKey` varchar(64),
	`note` varchar(255),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resources_id` PRIMARY KEY(`id`)
);
