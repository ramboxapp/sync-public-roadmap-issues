import { Label } from './labelSyncer';

export class Assignee {
	id: number;
	login: string;
}

export class Milestone {
	number: number;
}

export class Issue {
	id: number;
	number: number;
	title: string;
	authors: string[];
	body: string;
	state: 'open' | 'closed';
	milestone: Milestone;
	labels: Label[];
	assignees: Assignee[];
}

export class IssueComment {
	id: number;
	body?: string;
}
