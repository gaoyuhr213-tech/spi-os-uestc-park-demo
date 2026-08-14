CREATE TABLE `opsLedger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(32) NOT NULL,
	`targetEid` varchar(16),
	`detail` varchar(512),
	`actor` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `opsLedger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskCompletions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eid` varchar(16) NOT NULL,
	`taskType` enum('首触','复访','培育跟进') NOT NULL,
	`weekKey` varchar(12) NOT NULL,
	`note` varchar(256),
	`actor` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taskCompletions_id` PRIMARY KEY(`id`)
);
