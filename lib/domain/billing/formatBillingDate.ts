import { PLAN_RENEWAL_DATE_FORMAT } from './plans';

/** PATCH-191. The ONE date spelling, shared with the refusal text. */
export function formatBillingDate(iso: string): string {
  return PLAN_RENEWAL_DATE_FORMAT.format(new Date(iso));
}
