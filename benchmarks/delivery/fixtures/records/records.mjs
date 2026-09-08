export function completedArtifacts(records) {
  return records.filter(record => record.state === "completed").map(record => record.artifact);
}
