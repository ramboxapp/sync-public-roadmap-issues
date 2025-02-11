// import octokit
import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';
import { IssueSyncer } from './issueSyncer';
import { LabelSyncer } from './labelSyncer';
import { MilestoneSyncer } from './milestoneSyncer';
import Label from './models/Label';
import Assignee from './models/Assignee';
import Issue from './models/Issue';

let payload = null;
let owner_source = '';
let repo_source = '';
let owner_target = '';
let repo_target = '';
let source_pat = core.getInput('source_pat') || process.env.GITHUB_TOKEN;
let target_pat = core.getInput('target_pat') || source_pat;
let source_url = core.getInput('source_url') || 'api.github.com';
let target_url = core.getInput('target_url') || source_url;
let ONLY_SYNC_ON_LABEL: string | boolean;
let SKIP_SYNC_ON_LABEL: string;

// Determine which context we are running from
if (process.env.CI == 'true') {
	console.log('Reading params from actions context...');
	// Read source and target repos
	repo_source = core.getInput('source_repo') ? core.getInput('source_repo') : github.context.repo.owner + '/' + github.context.repo.repo;
	owner_source = repo_source.split('/')[0]; // TODO: Read it from process.env.GITHUB_REPOSITORY.split('/')[0];
	repo_source = repo_source.split('/')[1];
	repo_target = core.getInput('target_repo');
	owner_target = repo_target.split('/')[0];
	repo_target = repo_target.split('/')[1];
	// Read params
	ONLY_SYNC_ON_LABEL = core.getInput('only_sync_on_label');
	SKIP_SYNC_ON_LABEL = core.getInput('skip_sync_on_label');
	payload = require(process.env.GITHUB_EVENT_PATH as string);
} else {
	console.log('Reading params from CLI context...');
	// read all variables from launch parameters
	const launchArgs = process.argv;
	for (let i = 0; i < launchArgs.length; i++) {
		if (launchArgs[i] === '--owner_source') {
			owner_source = launchArgs[i + 1];
		} else if (launchArgs[i] === '--owner_target') {
			owner_target = launchArgs[i + 1];
		} else if (launchArgs[i] === '--repo_source') {
			repo_source = launchArgs[i + 1];
		} else if (launchArgs[i] === '--repo_target') {
			repo_target = launchArgs[i + 1];
		} else if (launchArgs[i] === '--source_pat') {
			source_pat = launchArgs[i + 1];
		} else if (launchArgs[i] === '--target_pat') {
			target_pat = launchArgs[i + 1];
		} else if (launchArgs[i] === '--source_url') {
			source_url = launchArgs[i + 1];
		} else if (launchArgs[i] === '--target_url') {
			target_url = launchArgs[i + 1];
		} else if (launchArgs[i] === '--issue_number') {
			payload = { action: 'labeled', issue: { number: parseInt(launchArgs[i + 1]) } };
		}
	}
	ONLY_SYNC_ON_LABEL = false;
	SKIP_SYNC_ON_LABEL = 'private';
}

console.log('Repos: ' + owner_source + '/' + repo_source + ' -> ' + owner_target + '/' + repo_target);
ONLY_SYNC_ON_LABEL && console.log('Only sync on label: ' + ONLY_SYNC_ON_LABEL);
SKIP_SYNC_ON_LABEL && console.log('Skip sync on label: ' + SKIP_SYNC_ON_LABEL);

// Init octokit for source and target
const octokit_source = new Octokit({
	auth: source_pat,
	baseUrl: `https://${source_url}`,
});

const octokit_target = new Octokit({
	auth: target_pat,
	baseUrl: `https://${target_url}`,
});

(async () => {
	try {
		await LabelSyncer.syncLabels(octokit_source, octokit_target, owner_source, repo_source, owner_target, repo_target);
		console.log('Successfully synced labels');
		await MilestoneSyncer.syncMilestones(octokit_source, octokit_target, owner_source, repo_source, owner_target, repo_target);
		console.log('Successfully synced milestones');

		// If the issue was updated, we need to sync labels
		switch (process.env.GITHUB_EVENT_NAME) {
			case 'workflow_dispatch':
			case 'schedule':
				console.log('Syncing all issues with label "to-sync"...');
				// Retrieve issue by owner, repo and number from octokit_source
				const search = await octokit_source.paginate('GET /repos/{owner}/{repo}/issues', {
					owner: 'ramboxapp',
					repo: 'project-management',
					per_page: 100,
					milestone: '*',
					labels: 'to-sync',
					sort: 'updated',
					direction: 'desc',
				});

				// Find milestone id from target repo
				const { data: targetMilestones } = await octokit_target.request('GET /repos/{owner}/{repo}/milestones', {
					owner: owner_target,
					repo: repo_target,
					state: 'all',
				});

				for (const issue of search) {
					const targetMilestone = targetMilestones.find((targetMilestone) => targetMilestone.title === issue.milestone.title);

					// Find issue number from target repo by sub-issue id
					const { data: targetIssues } = await octokit_target.request(
						'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
						{
							owner: owner_source,
							repo: repo_source,
							issue_number: issue.number,
						}
					);
					const targetIssue = targetIssues[0] || null;

					if (targetIssue) {
						// Update issue in target repo
						await octokit_target.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
							owner: owner_target,
							repo: repo_target,
							issue_number: targetIssue.number,
							title: issue.title,
							body: issue.body,
							// state: issue.state,
							milestone: targetMilestone?.number,
							labels: issue.labels.filter((label: Label) => label.name !== 'to-sync').map((label: Label) => label.name) || [
								'',
							],
							assignees: issue.assignees.map((assignee: Assignee) => assignee.login) || null,
						});
						console.log('Updated issue:', targetIssue.title);
					} else {
						// Create new issue in target repo
						const { data: createdIssue } = await octokit_target.request('POST /repos/{owner}/{repo}/issues', {
							owner: owner_target,
							repo: repo_target,
							title: issue.title,
							// body: issue.body, // TODO
							state: issue.state,
							milestone: targetMilestone.number,
							labels: issue.labels.map((label: Label) => label.name) || [''],
							assignees: issue.assignees.map((assignee: Assignee) => assignee.login) || null,
						});

						await octokit_source.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
							owner: owner_source,
							repo: repo_source,
							issue_number: issue.number,
							sub_issue_id: createdIssue.id,
						});

						console.log('Created issue and sub-issue:', createdIssue.title);
					}

					// Remove "to-sync" label
					await octokit_source.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', {
						owner: owner_source,
						repo: repo_source,
						issue_number: issue.number,
						name: 'to-sync',
					});
				}

				break;
			case 'issues':
				console.log('Finding the issue...');
				// Retrieve issue by owner, repo and number from octokit_source
				const number = (payload.issue || payload.pull_request || payload).number;
				const { data: issue } = await octokit_source.request('GET /repos/{owner}/{repo}/issues/{number}', {
					owner: owner_source,
					repo: repo_source,
					number: number,
				});

				console.log('Issue found:', issue.title);

				// Remove the target issue if the source issue was demilestoned or has no milestone
				if (payload.action === 'demilestoned' || issue.milestone === null) {
					// Find issue number from target repo by sub-issue id
					const { data: targetIssues } = await octokit_target.request(
						'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
						{
							owner: owner_source,
							repo: repo_source,
							issue_number: number,
						}
					);
					const targetIssue = targetIssues[0] || null;
					if (!targetIssue) {
						console.log('Issue is not assigned to a milestone, skipping...');
						break;
					}
					console.log('Deleting issue because was moved to Backlog...');
					await octokit_target.graphql(`
						mutation {
							deleteIssue(input: { issueId: "${targetIssue.node_id}" }) {
								clientMutationId
							}
						}
					`);
					break;
				}

				// If flag for skip syncing labelled issues is set, check if issue has label of specified sync type
				if (SKIP_SYNC_ON_LABEL && issue.labels.find((label: Label) => label.name === SKIP_SYNC_ON_LABEL)) {
					console.log('Skipping sync for issue with label', SKIP_SYNC_ON_LABEL);
					return;
				}

				// If flag for only syncing labelled issues is set, check if issue has label of specified sync type
				if (ONLY_SYNC_ON_LABEL && !issue.labels.find((label: Label) => label.name === ONLY_SYNC_ON_LABEL)) {
					console.log('Skipping sync for issue without label', ONLY_SYNC_ON_LABEL);
					return;
				}

				// Add "to-sync" label to issue to prevent multiple syncs
				console.log('Adding "to-sync" label to issue...');
				await octokit_source.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
					owner: owner_source,
					repo: repo_source,
					issue_number: number,
					labels: ['to-sync'],
				});
				break;
			default:
				console.log('We are currently not handling events of type ' + payload.action);
				break;
		}
		console.log('Successfully synced issues');
	} catch (error) {
		core.setFailed(error.message);
	}
})();
