import { Octokit } from 'octokit';
import Label from './models/Label';

export class LabelSyncer {
	public static syncLabels(
		octokit_source: Octokit,
		octokit_target: Octokit,
		owner_source: string,
		repo_source: string,
		owner_target: string,
		repo_target: string
	): Promise<void> {
		// Retrieve labels in source repo
		let sourceRepoLabels: Label[] = [];
		return octokit_source
			.request('GET /repos/{owner}/{repo}/labels', {
				owner: owner_source,
				repo: repo_source,
			})
			.then((response) => {
				sourceRepoLabels = response.data;
			})
			.catch((err) => {
				console.error('Failed to retrieve source repo labels', err);
			})
			.then(() => {
				// Retrieve labels in target repo
				let targetRepoLabels: Label[] = [];
				octokit_target
					.request('GET /repos/{owner}/{repo}/labels', {
						owner: owner_target,
						repo: repo_target,
					})
					.then((response) => {
						targetRepoLabels = response.data;
					})
					.catch((err) => {
						console.error('Failed to retrieve target repo labels', err);
					})
					.then(() => {
						// Filter source repo labels: remove all that from list that are already contained in target (= delta)
						sourceRepoLabels = sourceRepoLabels.filter(
							(label) =>
								targetRepoLabels
									// Match by name and description, as IDs may vary across repos
									.find(
										(targetEntry) => targetEntry.name == label.name
									) === undefined
						);

						// Create delta of missing issues in target
						Promise.all(
							sourceRepoLabels.map((element) => {
								return octokit_target
									.request('POST /repos/{owner}/{repo}/labels', {
										owner: owner_target,
										repo: repo_target,
										name: element.name,
										description: element.description ? element.description : '',
										color: element.color,
									})
									.then(() => 'Successfully synced label ' + element.name)
									.catch((err) => 'Failed to sync label ' + element.name + ': ' + err);
							})
						).then((results) => {
							results.forEach((element) => console.log(element));
						});
					});
			});
	}
}
