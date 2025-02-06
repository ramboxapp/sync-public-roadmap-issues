export default class Milestone {
	id: number;
	node_id: string;
	title: string;
	number: number;
	description: string | null;
	state: 'open' | 'closed';
	due_on: string;
}
