import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function snapshot(root) {
	const entries = {};
	function visit(dir) {
		for (const name of fs.readdirSync(dir).sort()) {
			const full = path.join(dir, name);
			const relative = path.relative(root, full).split(path.sep).join("/");
			const stat = fs.lstatSync(full);
			if (stat.isDirectory()) { entries[relative] = "directory"; visit(full); }
			else if (stat.isFile()) entries[relative] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
			else throw new Error(`Non-regular entry: ${relative}`);
		}
	}
	visit(root);
	return entries;
}

export function changedPaths(fixture, workspace) {
	const before = snapshot(fixture);
	const after = snapshot(workspace);
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort();
}

