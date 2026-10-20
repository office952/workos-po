import { formatTimestamp } from '../../presentation/format';

export function moment(value: string | null) { return value ? formatTimestamp(value) : 'Neînregistrat'; }

