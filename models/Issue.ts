import Label from './Label';
import Assignee from './Assignee';
import Milestone from './Milestone';

export default class Issue {
	id: number;
	number: number;
	title: string;
	authors: string[];
	body: string;
	state: 'open' | 'closed';
	milestone: Milestone | null;
	labels: Label[];
	assignees: Assignee[];
	issue_type: string;
}
