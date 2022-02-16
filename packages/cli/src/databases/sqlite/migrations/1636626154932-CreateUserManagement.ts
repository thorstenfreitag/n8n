import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuid } from 'uuid';
import config = require('../../../../config');
import { loadSurveyFromDisk } from '../../utils/migrationHelpers';

export class CreateUserManagement1636626154932 implements MigrationInterface {
	name = 'CreateUserManagement1636626154932';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tablePrefix = config.get('database.tablePrefix');

		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}role" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(32) NOT NULL, "scope" varchar NOT NULL, "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), CONSTRAINT "UQ_${tablePrefix}5b49d0f504f7ef31045a1fb2eb8" UNIQUE ("scope", "name"))`,
		);

		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}user" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar(254), "firstName" varchar(32), "lastName" varchar(32), "password" varchar, "resetPasswordToken" varchar, "resetPasswordTokenExpiration" integer DEFAULT NULL, "personalizationAnswers" text, "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "globalRoleId" integer NOT NULL, CONSTRAINT "FK_${tablePrefix}f0609be844f9200ff4365b1bb3d" FOREIGN KEY ("globalRoleId") REFERENCES "${tablePrefix}role" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_${tablePrefix}e12875dfb3b1d92d7d7c5377e2" ON "${tablePrefix}user" ("email") `,
		);

		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}shared_workflow" ("createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "roleId" integer NOT NULL, "userId" varchar NOT NULL, "workflowId" integer NOT NULL, CONSTRAINT "FK_${tablePrefix}3540da03964527aa24ae014b780" FOREIGN KEY ("roleId") REFERENCES "${tablePrefix}role" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_${tablePrefix}82b2fd9ec4e3e24209af8160282" FOREIGN KEY ("userId") REFERENCES "${tablePrefix}user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_${tablePrefix}b83f8d2530884b66a9c848c8b88" FOREIGN KEY ("workflowId") REFERENCES "${tablePrefix}workflow_entity" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("userId", "workflowId"))`,
		);

		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}shared_credentials" ("createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "roleId" integer NOT NULL, "userId" varchar NOT NULL, "credentialsId" integer NOT NULL, CONSTRAINT "FK_${tablePrefix}c68e056637562000b68f480815a" FOREIGN KEY ("roleId") REFERENCES "${tablePrefix}role" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_${tablePrefix}484f0327e778648dd04f1d70493" FOREIGN KEY ("userId") REFERENCES "${tablePrefix}user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_${tablePrefix}68661def1d4bcf2451ac8dbd949" FOREIGN KEY ("credentialsId") REFERENCES "${tablePrefix}credentials_entity" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("userId", "credentialsId"))`,

		);

		await queryRunner.query(
			`CREATE TABLE "${tablePrefix}settings" ("key"	TEXT NOT NULL,"value"	TEXT NOT NULL DEFAULT \'\',"loadOnStartup"	boolean NOT NULL default false,PRIMARY KEY("key"));`,
		);

		// Insert initial roles
		await queryRunner.query(`
			INSERT INTO "${tablePrefix}role" (name, scope)
			VALUES ("owner", "global");
		`);

		const instanceOwnerRole = await queryRunner.query('SELECT last_insert_rowid() as insertId');

		await queryRunner.query(`
			INSERT INTO "${tablePrefix}role" (name, scope)
			VALUES ("member", "global");
		`);

		await queryRunner.query(`
			INSERT INTO "${tablePrefix}role" (name, scope)
			VALUES ("owner", "workflow");
		`);

		const workflowOwnerRole = await queryRunner.query('SELECT last_insert_rowid() as insertId');

		await queryRunner.query(`
			INSERT INTO "${tablePrefix}role" (name, scope)
			VALUES ("owner", "credential");
		`);

		const credentialOwnerRole = await queryRunner.query('SELECT last_insert_rowid() as insertId');

		const survey = loadSurveyFromDisk();

		const ownerUserId = uuid();
		await queryRunner.query(`
			INSERT INTO "${tablePrefix}user" (id, globalRoleId, personalizationAnswers) values
			(?, ?, ?)
		`, [ownerUserId, instanceOwnerRole[0].insertId, survey ?? null]);

		await queryRunner.query(`
			INSERT INTO "${tablePrefix}shared_workflow" (createdAt, updatedAt, roleId, userId, workflowId)
			select DATETIME('now'), DATETIME('now'), '${workflowOwnerRole[0].insertId}', '${ownerUserId}', id from "${tablePrefix}workflow_entity"
		`);

		await queryRunner.query(`
			INSERT INTO "${tablePrefix}shared_credentials" (createdAt, updatedAt, roleId, userId, credentialsId)
			select DATETIME('now'), DATETIME('now'), '${credentialOwnerRole[0].insertId}', '${ownerUserId}', id from "${tablePrefix}credentials_entity"
		`);

		await queryRunner.query(`
			INSERT INTO "${tablePrefix}settings" (key, value, loadOnStartup) values
			('userManagement.hasOwner', 'false', true)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const tablePrefix = config.get('database.tablePrefix');
		await queryRunner.query(`DROP TABLE "${tablePrefix}shared_credentials"`);
		await queryRunner.query(`DROP TABLE "${tablePrefix}shared_workflow"`);
		await queryRunner.query(`DROP INDEX "IDX_${tablePrefix}e12875dfb3b1d92d7d7c5377e2"`);
		await queryRunner.query(`DROP TABLE "${tablePrefix}user"`);
		await queryRunner.query(`DROP TABLE "${tablePrefix}role"`);
		await queryRunner.query(`DROP TABLE "${tablePrefix}settings"`);
	}
}
