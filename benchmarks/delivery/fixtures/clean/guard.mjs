export function shouldBlock(request) {
  const wantsChanges = request.applyChanges;
  const canMutate = request.tools.some(tool => tool === "edit" || tool === "write");
  return wantsChanges && canMutate && !request.attemptedMutation;
}
