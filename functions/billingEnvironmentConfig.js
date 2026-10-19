import { defineBoolean, defineString } from 'firebase-functions/params';
import { canUseBilling, billingPaths } from './billingEnvironment.js';

export const billingSandbox = defineBoolean('BILLING_SANDBOX', { default: true });
const testerIds = defineString('BILLING_TESTER_UIDS', { default: '' });
export const allowedBillingUser = uid => canUseBilling(uid, billingSandbox.value(), testerIds.value());

export const currentBillingPaths = uid => billingPaths(billingSandbox.value(), uid);
