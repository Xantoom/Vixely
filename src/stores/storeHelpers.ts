export function withUpdatedKey<T extends object, K extends keyof T>(source: T, key: K, value: T[K]): T {
	return { ...source, [key]: value } as T;
}
