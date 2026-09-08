export function resolveConfig(local, shared) {
	return local ?? shared ?? "default";
}
