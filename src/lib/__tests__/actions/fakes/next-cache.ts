import { state } from './db'
export function revalidatePath(path: string) { state.revalidated.push(path) }
