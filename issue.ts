import { Label } from './labelSyncer';

export class Assignee {
	id: number;
	login: string;
}

export class Issue {
	id: number;
	number: number;
	title: string;
	authors: string[];
	body: string;
	state: 'open' | 'closed';
	milestone: null | string | number;
	labels: Label[];
	assignees: Assignee[];
	issue_type: string;
}

export class IssueComment {
	id: number;
	body?: string;
}
