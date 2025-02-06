import { Octokit } from 'octokit';
import Milestone from './models/Milestone';

export class MilestoneSyncer {
	public static syncMilestones(
		octokit_source: Octokit,
		octokit_target: Octokit,
		owner_source: string,
		repo_source: string,
		owner_target: string,
		repo_target: string
	): Promise<void> {
		// Retrieve milestones in source repo
		let sourceRepoMilestones: Milestone[] = [];
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
				let targetRepoMilestones: Milestone[] = [];
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
						// Filter source repo milestones: remove all that from list that are already contained in target (= delta)
						sourceRepoMilestones = sourceRepoMilestones.filter(
							(label) =>
								targetRepoMilestones
									// Match by name and description, as IDs may vary across repos
									.find((targetEntry) => targetEntry.title == label.title) == undefined
						);

						// Create delta of missing issues in target
						Promise.all(
							sourceRepoMilestones.map((element) => {
								return octokit_target
									.request('POST /repos/{owner}/{repo}/milestones', {
										owner: owner_target,
										repo: repo_target,
										title: element.title,
										description: element.description || '',
										state: element.state,
									})
									.then(() => 'Successfully synced milestone ' + element.title)
									.catch((err) => 'Failed to sync milestone ' + element.title + ': ' + err);
							})
						).then((results) => {
							results.forEach((element) => console.log(element));
						});
					});
			});
	}
}
