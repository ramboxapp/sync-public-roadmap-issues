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
Object.defineProperty(exports, "__esModule", { value: true });
// import octokit
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const octokit_1 = require("octokit");
const issueSyncer_1 = require("./issueSyncer");
const labelSyncer_1 = require("./labelSyncer");
// use label from ./Label.ts
let owner_source = '';
let repo_source = '';
let owner_target = '';
let repo_target = '';
let source_pat = core.getInput('source_pat') || process.env.GITHUB_TOKEN;
let target_pat = core.getInput('target_pat') || source_pat;
let source_url = core.getInput('source_url') || 'api.github.com';
let target_url = core.getInput('target_url') || source_url;
let ONLY_SYNC_ON_LABEL;
let SKIP_SYNC_ON_LABEL;
// Determine which context we are running from
if (process.env.CI == 'true') {
    console.log('Reading params from actions context...');
    // Read source and target repos
    repo_source = core.getInput('source_repo') ? core.getInput('source_repo') : github.context.repo.owner + '/' + github.context.repo.repo;
    owner_source = repo_source.split('/')[0];
    repo_source = repo_source.split('/')[1];
    repo_target = core.getInput('target_repo');
    owner_target = repo_target.split('/')[0];
    repo_target = repo_target.split('/')[1];
    // Read params
    ONLY_SYNC_ON_LABEL = core.getInput('only_sync_on_label');
    SKIP_SYNC_ON_LABEL = core.getInput('skip_sync_on_label');
    console.log('Repos: ' + owner_source + '/' + repo_source + ' -> ' + owner_target + '/' + repo_target);
    ONLY_SYNC_ON_LABEL && console.log('Only sync on label: ' + ONLY_SYNC_ON_LABEL);
    SKIP_SYNC_ON_LABEL && console.log('Skip sync on label: ' + SKIP_SYNC_ON_LABEL);
    console.log('Do not sync comments: ' + core.getBooleanInput('only_sync_main_issue'));
}
else {
    console.log('Reading params from CLI context...');
    // read all variables from launch parameters
    const launchArgs = process.argv;
    for (let i = 0; i < launchArgs.length; i++) {
        if (launchArgs[i] === '--source_owner') {
            owner_source = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--source_repo') {
            repo_source = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--target_owner') {
            owner_target = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--target_repo') {
            repo_target = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--source_pat') {
            source_pat = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--target_pat') {
            target_pat = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--source_url') {
            source_url = launchArgs[i + 1];
        }
        else if (launchArgs[i] === '--target_url') {
            target_url = launchArgs[i + 1];
        }
    }
}
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
    .then(() => {
    const payload = require(process.env.GITHUB_EVENT_PATH);
    const number = (payload.issue || payload.pull_request || payload).number;
    console.log('PAYLOAD:', payload);
    // retrieve issue by owner, repo and number from octokit_source
    octokit_source
        .request('GET /repos/{owner}/{repo}/issues/{number}', {
        owner: owner_source,
        repo: repo_source,
        number: number,
    })
        .then((response) => {
        // Retrieved issue
        const issue = response.data;
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
        switch (process.env.GITHUB_EVENT_NAME) {
            case 'issue_comment':
                // If flag for only syncing issue bodies is set and skip if true
                if (core.getBooleanInput('only_sync_main_issue'))
                    return;
                if (payload.action !== 'created') {
                    console.warn('This will only sync new comments, events of current type are ignored', payload.action);
                    return;
                }
                // Retrieve new comment
                let issueComment;
                octokit_source
                    .request('GET /repos/{owner}/{repo}/issues/comments/{comment_id}', {
                    owner: owner_source,
                    repo: repo_source,
                    issue_number: number,
                    comment_id: payload.comment.id,
                })
                    .then((response) => {
                    issueComment = response.data;
                    issueSyncer_1.IssueSyncer.getIssueNumberByTitle(octokit_target, owner_target, repo_target, issue.title).then((targetIssueNumber) => {
                        // Transfer new comment to target issue
                        octokit_target
                            .request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
                            owner: owner_target,
                            repo: repo_target,
                            issue_number: targetIssueNumber,
                            body: issueComment.body || '',
                        })
                            .then(() => {
                            console.info('Successfully created new comment on issue');
                        })
                            .catch((err) => {
                            let msg = 'Failed to create new comment on issue';
                            console.error(msg, err);
                            core.setFailed(msg + ' ${err}');
                        });
                    });
                })
                    .catch((err) => {
                    let msg = 'Failed to retrieve issue comments';
                    console.error(msg, err);
                    core.setFailed(msg + ' ${err}');
                });
                break;
            case 'issues':
                // If the issue was updated, we need to sync labels
                switch (payload.action) {
                    case 'opened':
                        // Create new issue in target repo
                        octokit_target
                            .request('POST /repos/{owner}/{repo}/issues', {
                            owner: owner_target,
                            repo: repo_target,
                            title: issue.title,
                            // body: issue.body, // TODO
                            milestone: issue.milestone,
                            labels: issue.labels.map((label) => label.name) || [''],
                            assignees: issue.assignees.map((assignee) => assignee.login) || null,
                        })
                            .then((response) => {
                            console.log('Created issue:', response.data.title);
                            // Link the created issue as a sub-issue of the source issue
                            octokit_target
                                .request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
                                owner: owner_source,
                                repo: repo_source,
                                issue_number: issue.number,
                                sub_issue_id: response.data.id,
                            })
                                .then((response) => {
                                console.log('Added sub-issue:', response.data.title);
                            })
                                .catch((error) => {
                                let msg = 'Error adding to sub-issue:';
                                console.error(msg, error);
                                core.setFailed(msg + ' ${error}');
                            });
                        })
                            .catch((error) => {
                            let msg = 'Error creating issue:';
                            console.error(msg, error);
                            core.setFailed(msg + ' ${error}');
                        });
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
                        octokit_target
                            .request('GET /repos/{owner}/{repo}/issues', {
                            owner: owner_target,
                            repo: repo_target,
                            filter: 'all',
                            state: 'all',
                            title: issue.title,
                        })
                            .then((response) => {
                            // Found issue in target repo
                            const targetIssue = response.data.find((targetIssue) => targetIssue.title === issue.title);
                            if (targetIssue) {
                                // Update issue in target repo
                                // Update issue in target repo, identify target repo issue number by title match
                                octokit_target
                                    .request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
                                    owner: owner_target,
                                    repo: repo_target,
                                    title: issue.title,
                                    body: issue.body,
                                    state: issue.state,
                                    issue_number: targetIssue.number,
                                    milestone: issue.milestone || null,
                                    labels: issue.labels.map((label) => label.name) || [''],
                                    assignees: issue.assignees.map((assignee) => assignee.login) || null,
                                })
                                    .then((response) => {
                                    console.log('Updated issue:', response.data.title);
                                })
                                    .catch((error) => {
                                    console.error('Error updating issue:', error);
                                });
                            }
                            else {
                                console.error('Could not find matching issue in target repo for title', issue.title);
                                console.log('Issue type', issue.issue_type);
                                // Create the issue if not existing
                                octokit_target
                                    .request('POST /repos/{owner}/{repo}/issues', {
                                    owner: owner_target,
                                    repo: repo_target,
                                    title: issue.title,
                                    // body: issue.body, // TODO
                                    // state: issue.state,
                                    milestone: issue.milestone,
                                    labels: issue.labels.map((label) => label.name) || [],
                                    assignees: issue.assignees.map((assignee) => assignee.login) || [],
                                    // issue_type: 'Bug',
                                })
                                    .then((response) => {
                                    console.log('Created issue for lack of a match:', response.data.title);
                                    // Link the created issue as a sub-issue of the source issue
                                    octokit_target
                                        .request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
                                        owner: owner_source,
                                        repo: repo_source,
                                        issue_number: number,
                                        sub_issue_id: response.data.id,
                                    })
                                        .then((response) => {
                                        console.log('Added sub-issue:', response.data.title);
                                    })
                                        .catch((error) => {
                                        let msg = 'Error adding to sub-issue:';
                                        console.error(msg, error);
                                        core.setFailed(msg + ' ${error}');
                                    });
                                })
                                    .catch((error) => {
                                    let msg = 'Error creating issue for lack of a match:';
                                    console.error(msg, error);
                                    core.setFailed(msg + ' ${error}');
                                });
                            }
                        })
                            .catch((error) => {
                            let msg = 'Error finding issue in target repo:';
                            console.error(msg, error);
                            core.setFailed(msg + ' ${error}');
                        });
                        break;
                    default:
                        console.log('We are currently not handling events of type ' + payload.action);
                        break;
                }
                break;
            default:
                break;
        }
    })
        .catch((err) => {
        console.error('Failed to retrieve issue', err);
        core.setFailed('Failed to retrieve issue ${err}');
    });
});
