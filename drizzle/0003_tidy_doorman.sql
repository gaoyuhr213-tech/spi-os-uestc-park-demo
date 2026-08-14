CREATE TABLE `graphEdges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromKey` varchar(64) NOT NULL,
	`toKey` varchar(64) NOT NULL,
	`relType` enum('referral','alumni','pipeline','partner') NOT NULL,
	`strength` int NOT NULL DEFAULT 50,
	`evidence` varchar(255),
	`pathTag` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graphEdges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graphNodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`kind` enum('company','person','platform','dept') NOT NULL,
	`label` varchar(128) NOT NULL,
	`attrsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `graphNodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `graphNodes_nodeKey_unique` UNIQUE(`nodeKey`)
);
