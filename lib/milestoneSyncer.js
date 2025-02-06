"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MilestoneSyncer = void 0;
class MilestoneSyncer {
    static syncMilestones(octokit_source, octokit_target, owner_source, repo_source, owner_target, repo_target) {
        // Retrieve milestones in source repo
        let sourceRepoMilestones = [];
        return octokit_source
            .request('GET /repos/{owner}/{repo}/milestones', {
            owner: owner_source,
            repo: repo_source,
        })
            .then((response) => {
            sourceRepoMilestones = response.data;
        })
            .catch((err) => {
            console.error('Failed to retrieve source repo labels', err);
        })
            .then(() => {
            // Retrieve milestones in target repo
            let targetRepoMilestones = [];
            octokit_target
                .request('GET /repos/{owner}/{repo}/milestones', {
                owner: owner_target,
                repo: repo_target,
            })
                .then((response) => {
                targetRepoMilestones = response.data;
            })
                .catch((err) => {
                console.error('Failed to retrieve target repo labels', err);
            })
                .then(() => {
                // Filter source repo labels: remove all that from list that are already contained in target (= delta)
                sourceRepoMilestones = sourceRepoMilestones.filter((label) => targetRepoMilestones
                    // Match by name and description, as IDs may vary across repos
                    .find((targetEntry) => targetEntry.title == label.title) == undefined);
                // Create delta of missing issues in target
                Promise.all(sourceRepoMilestones.map((element) => {
                    return octokit_target
                        .request('POST /repos/{owner}/{repo}/milestones', {
                        owner: owner_target,
                        repo: repo_target,
                        title: element.title,
                        description: element.description || '',
                        state: element.state,
                    })
                        .then(() => 'Successfully synced label ' + element.title)
                        .catch((err) => 'Failed to sync label ' + element.title + ': ' + err);
                })).then((results) => {
                    results.forEach((element) => console.log(element));
                });
            });
        });
    }
}
exports.MilestoneSyncer = MilestoneSyncer;
