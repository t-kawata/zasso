export function checkExceptions(exceptions, { now, rules }) {
  const seen = new Set();

  for (const exception of exceptions) {
    if (!exception.rule || !rules.has(exception.rule)) {
      throw new Error('unknown rule: ' + (exception.rule ?? '?'));
    }
    if (seen.has(exception.rule)) throw new Error('duplicate exception: ' + exception.rule);
    seen.add(exception.rule);
    if (!exception.scope) throw new Error('scope required: ' + exception.rule);
    if (!exception.approval_ref) throw new Error('approval_ref required: ' + exception.rule);
    if (!exception.expires || exception.expires < now) {
      throw new Error('expired exception: ' + exception.rule);
    }
  }

  return true;
}
