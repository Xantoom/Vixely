import { createContext, useContext } from 'react';
import type { Task } from './tasks';

/** The task page an editor is shown on, if any: its empty state names the task. */
export const TaskContext = createContext<Task | null>(null);

export function useTask(): Task | null {
	return useContext(TaskContext);
}
