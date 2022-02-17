/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable import/no-cycle */
import { Workflow } from 'n8n-workflow';
import { In, IsNull, Not } from 'typeorm';
import { PublicUser } from './Interfaces';
import { Db, GenericHelpers, ResponseHelper } from '..';
import config = require('../../config');
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, User } from '../databases/entities/User';

export async function getWorkflowOwner(workflowId: string | number): Promise<User> {
	const sharedWorkflow = await Db.collections.SharedWorkflow!.findOneOrFail({
		where: { workflow: { id: workflowId } },
		relations: ['user', 'user.globalRole'],
	});

	return sharedWorkflow.user;
}

export async function getInstanceOwner(): Promise<User> {
	const qb = Db.collections.User!.createQueryBuilder('u');
	qb.innerJoin('u.globalRole', 'gr');
	qb.andWhere('gr.name = :name and gr.scope = :scope', { name: 'owner', scope: 'global' });

	const owner = await qb.getOneOrFail();
	return owner;
}

export const isEmailSetUp = Boolean(config.get('userManagement.emails.mode'));

/**
 * Return the n8n instance base URL without trailing slash.
 */
export function getInstanceBaseUrl(): string {
	const baseUrl = GenericHelpers.getBaseUrl();
	return baseUrl.endsWith('/') ? baseUrl.slice(0, baseUrl.length - 1) : baseUrl;
}

export async function isInstanceOwnerSetup(): Promise<boolean> {
	const users = await Db.collections.User!.find({ email: Not(IsNull()) });
	return users.length !== 0;
}

// TODO: Enforce at model level
export function validatePassword(password?: string): string {
	if (!password) {
		throw new ResponseHelper.ResponseError('Password is mandatory', undefined, 400);
	}

	if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
		throw new ResponseHelper.ResponseError(
			`Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long`,
			undefined,
			400,
		);
	}

	return password;
}

/**
 * Remove sensitive properties from the user to return to the client.
 */
export function sanitizeUser(user: User): PublicUser {
	const { password, resetPasswordToken, createdAt, updatedAt, ...sanitizedUser } = user;
	return sanitizedUser;
}

async function getCredentialIdByName(name: string): Promise<string | number | null> {
	const credential = await Db.collections.Credentials!.findOne({
		where: {
			name,
		},
	});
	if (credential) {
		return credential.id;
	}
	return null;
}

export async function getUserById(userId: string): Promise<User> {
	const user = await Db.collections.User!.findOneOrFail({
		where: { id: userId },
		relations: ['globalRole'],
	});
	return user;
}

export async function checkPermissionsForExecution(
	workflow: Workflow,
	userId: string,
): Promise<void> {
	const credentialIds = new Set();
	const nodeNames = Object.keys(workflow.nodes);
	const pendingPromises = [] as Array<Promise<string | number | null>>;
	nodeNames.forEach((nodeName) => {
		const node = workflow.nodes[nodeName];
		if (node.credentials) {
			const credentialNames = Object.keys(node.credentials);
			credentialNames.forEach((credentialName) => {
				const credentialDetail = node.credentials![credentialName];
				if (credentialDetail.id) {
					credentialIds.add(credentialDetail.id.toString());
				} else {
					pendingPromises.push(getCredentialIdByName(credentialDetail.name));
				}
			});
		}
	});

	const fullfilledPromises = await Promise.all(pendingPromises);
	fullfilledPromises.forEach((credentialId) => {
		if (credentialId !== null) {
			credentialIds.add(credentialId.toString());
		} else {
			throw new Error('One or more of the required credentials was not found in the database.');
		}
	});
	// We converted all IDs to string so that the set cannot contain duplicates.

	const ids = Array.from(credentialIds);

	if (ids.length === 0) {
		return;
	}

	const credentialCount = await Db.collections.SharedCredentials!.count({
		where: {
			user: { id: userId },
			credentials: In(ids),
		},
	});

	if (ids.length !== credentialCount) {
		throw new Error('One or more of the required credentials was not found in the database.');
	}
}
