import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  ConnectorError,
  QUOTA_MESSAGE,
  isQuotaError,
  recommendedAction,
  toConnectorError,
} from '../../src/shared/failures';
import { fetchErrorCode } from '../../src/domain/content.types';

describe('failure mapping', () => {
  it('recognises quota errors, direct or wrapped in an aborted transaction', () => {
    const quota = new DOMException('full', 'QuotaExceededError');
    expect(isQuotaError(quota)).toBe(true);
    expect(isQuotaError({ name: 'AbortError', error: quota })).toBe(true);
    expect(isQuotaError({ target: { error: quota } })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it('turns quota and abort errors into user-facing connector errors', () => {
    expect(toConnectorError(new DOMException('full', 'QuotaExceededError')).message).toBe(QUOTA_MESSAGE);
    expect(toConnectorError(new DOMException('stop', 'AbortError')).code).toBe('aborted');
    const long = toConnectorError(new Error('x'.repeat(1000)));
    expect(long.code).toBe('other');
    expect(long.message.length).toBeLessThanOrEqual(300);
    const ce = new ConnectorError('http', 'HTTP 500', { statusCode: 500 });
    expect(toConnectorError(ce)).toBe(ce);
  });

  it('has a recommended action for every error code', () => {
    for (const code of fetchErrorCode.options) expect(recommendedAction(code).length).toBeGreaterThan(10);
  });
});
