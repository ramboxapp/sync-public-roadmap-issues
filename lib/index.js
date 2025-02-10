"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// import octokit
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const octokit_1 = require("octokit");
const labelSyncer_1 = require("./labelSyncer");
const milestoneSyncer_1 = require("./milestoneSyncer");
let source_pat = core.getInput('source_pat') || process.env.GITHUB_TOKEN;
let target_pat = core.getInput('target_pat') || source_pat;
let source_url = core.getInput('source_url') || 'api.github.com';
let target_url = core.getInput('target_url') || source_url;
let ONLY_SYNC_ON_LABEL;
let SKIP_SYNC_ON_LABEL;
if (process.env.GITHUB_EVENT_NAME !== 'issues')
    throw Error(`Unhandled event type ${process.env.GITHUB_EVENT_NAME}`);
console.log('Reading params from actions context...');
// Read source and target repos
let repo_source = core.getInput('source_repo') ? core.getInput('source_repo') : github.context.repo.owner + '/' + github.context.repo.repo;
let owner_source = repo_source.split('/')[0];
repo_source = repo_source.split('/')[1];
let repo_target = core.getInput('target_repo');
let owner_target = repo_target.split('/')[0];
repo_target = repo_target.split('/')[1];
// Read params
ONLY_SYNC_ON_LABEL = core.getInput('only_sync_on_label');
SKIP_SYNC_ON_LABEL = core.getInput('skip_sync_on_label');
console.log('Repos: ' + owner_source + '/' + repo_source + ' -> ' + owner_target + '/' + repo_target);
ONLY_SYNC_ON_LABEL && console.log('Only sync on label: ' + ONLY_SYNC_ON_LABEL);
SKIP_SYNC_ON_LABEL && console.log('Skip sync on label: ' + SKIP_SYNC_ON_LABEL);
console.log('Do not sync comments: ' + core.getBooleanInput('only_sync_main_issue'));
// Init octokit for source and target
const octokit_source = new octokit_1.Octokit({
    auth: source_pat,
    baseUrl: `https://${source_url}`,
});
const octokit_target = new octokit_1.Octokit({
    auth: target_pat,
    baseUrl: `https://${target_url}`,
});
labelSyncer_1.LabelSyncer.syncLabels(octokit_source, octokit_target, owner_source, repo_source, owner_target, repo_target)
    .then(() => console.log('Successfully synced labels'))
    .then(() => milestoneSyncer_1.MilestoneSyncer.syncMilestones(octokit_source, octokit_target, owner_source, repo_source, owner_target, repo_target))
    .then(() => console.log('Successfully synced milestones'))
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    const payload = require(process.env.GITHUB_EVENT_PATH);
    const number = (payload.issue || payload.pull_request || payload).number;
    // retrieve issue by owner, repo and number from octokit_source
    const { data: issue } = yield octokit_source.request('GET /repos/{owner}/{repo}/issues/{number}', {
        owner: owner_source,
        repo: repo_source,
        number: number,
    });
    console.log('Found issue:', issue.title);
    console.log('Labels:', issue.labels.map((label) => label.name));
    // If flag for skip syncing labelled issues is set, check if issue has label of specified sync type
    if (SKIP_SYNC_ON_LABEL && issue.labels.find((label) => label.name === SKIP_SYNC_ON_LABEL)) {
        console.log('Skipping sync for issue with label', SKIP_SYNC_ON_LABEL);
        return;
    }
    // If flag for only syncing labelled issues is set, check if issue has label of specified sync type
    if (ONLY_SYNC_ON_LABEL && !issue.labels.find((label) => label.name === ONLY_SYNC_ON_LABEL)) {
        console.log('Skipping sync for issue without label', ONLY_SYNC_ON_LABEL);
        return;
    }
    // Add "syncing" label to issue to prevent multiple syncs
    yield octokit_source.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner: owner_source,
        repo: repo_source,
        issue_number: number,
        labels: ['syncing'],
    });
    // If the issue was updated, we need to sync labels
    switch (payload.action) {
        case 'opened':
            // Create new issue in target repo
            const { data: createdIssue } = yield octokit_target.request('POST /repos/{owner}/{repo}/issues', {
                owner: owner_target,
                repo: repo_target,
                title: issue.title,
                // body: issue.body, // TODO
                state: issue.state,
                milestone: issue.milestone.id,
                labels: issue.labels.map((label) => label.name) || [''],
                assignees: issue.assignees.map((assignee) => assignee.login) || null,
            });
            yield octokit_target.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
                owner: owner_source,
                repo: repo_source,
                issue_number: issue.number,
                sub_issue_id: createdIssue.id,
            });
            console.log('Created issue and sub-issue:', createdIssue.title);
            break;
        case 'edited':
        case 'closed':
        case 'reopened':
        case 'assigned':
        case 'unassigned':
        case 'labeled':
        case 'unlabeled':
        case 'milestoned':
        case 'demilestoned':
            // Find issue number from target repo where the issue title matches the title of the issue in the source repo
            const { data: targetIssues } = yield octokit_target.request('GET /repos/{owner}/{repo}/issues', {
                owner: owner_target,
                repo: repo_target,
                filter: 'all',
                state: 'all',
            });
            const targetIssue = targetIssues.find((targetIssue) => targetIssue.title === issue.title);
            if (payload.action === 'demilestoned' || issue.milestone === null) {
                if (!targetIssue) {
                    console.log('Issue is not assigned to a milestone, skipping...');
                    break;
                }
                console.log('Deleting issue because was moved to Backlog...');
                yield octokit_target.graphql(`mutation {
						deleteIssue(input: {issueId: "${targetIssue.node_id}"}) {
							clientMutationId
						}
					}`);
                break;
            }
            // Find milestone id from target repo
            console.log('Searching for target milestone:', issue.milestone.title);
            const { data: targetMilestones } = yield octokit_target.request('GET /repos/{owner}/{repo}/milestones', {
                owner: owner_target,
                repo: repo_target,
                state: 'all',
            });
            const targetMilestone = targetMilestones.find((targetMilestone) => targetMilestone.title === issue.milestone.title);
            console.log('Found target milestone:', targetMilestone.title);
            // If no issue was found, create a new one
            if (!targetIssue) {
                console.error('Could not find issue in target repo, lets create it...');
                const { data: createdIssue } = yield octokit_target.request('POST /repos/{owner}/{repo}/issues', {
                    owner: owner_target,
                    repo: repo_target,
                    title: issue.title,
                    // body: issue.body, // TODO
                    state: issue.state,
                    milestone: targetMilestone === null || targetMilestone === void 0 ? void 0 : targetMilestone.number,
                    labels: issue.labels.map((label) => label.name) || [],
                    assignees: issue.assignees.map((assignee) => assignee.login) || [],
                });
                // Link the created issue as a sub-issue of the source issue
                yield octokit_target.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
                    owner: owner_source,
                    repo: repo_source,
                    issue_number: number,
                    sub_issue_id: createdIssue.id,
                });
                break;
            }
            // Update issue in target repo
            yield octokit_target.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
                owner: owner_target,
                repo: repo_target,
                issue_number: targetIssue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                milestone: targetMilestone === null || targetMilestone === void 0 ? void 0 : targetMilestone.number,
                labels: issue.labels.map((label) => label.name) || [''],
                assignees: issue.assignees.map((assignee) => assignee.login) || null,
            });
            console.log('Updated issue:', targetIssue.title);
            break;
        default:
            console.log('We are currently not handling events of type ' + payload.action);
            break;
    }
    // Remove "syncing" label
    yield octokit_source.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', {
        owner: owner_source,
        repo: repo_source,
        issue_number: number,
        name: 'syncing',
    });
}));
