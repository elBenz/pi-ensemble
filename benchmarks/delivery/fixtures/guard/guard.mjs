export function shouldBlock(request) {
  const wantsChanges = request.applyChanges || request.suggestedFix;
  const canMutate = request.tools.some(tool => tool === "edit" || tool === "write");
  return wantsChanges && canMutate && !request.attemptedMutation;
}
