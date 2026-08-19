import { BadRequestException } from '@nestjs/common';
import {
  resolvePagination,
  buildMeta,
  orderByClause,
  parseIdParam,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from './pagination';

describe('resolvePagination', () => {
  it('should return defaults when no query params provided', () => {
    const result = resolvePagination({});
    expect(result).toEqual({
      page: 1,
      limit: DEFAULT_LIMIT,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      skip: 0,
    });
  });

  it('should parse valid page and limit', () => {
    const result = resolvePagination({ page: 3, limit: 10 });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.skip).toBe(20);
  });

  it('should clamp page to minimum 1', () => {
    expect(resolvePagination({ page: -5 }).page).toBe(1);
    expect(resolvePagination({ page: 0 }).page).toBe(1);
  });

  it('should clamp limit to MAX_LIMIT', () => {
    expect(resolvePagination({ limit: 999 }).limit).toBe(MAX_LIMIT);
  });

  it('should clamp limit to minimum 1', () => {
    expect(resolvePagination({ limit: -10 }).limit).toBe(1);
  });

  it('should default limit when 0 is passed (falsy falls back)', () => {
    expect(resolvePagination({ limit: 0 }).limit).toBe(DEFAULT_LIMIT);
  });

  it('should handle string inputs like query strings', () => {
    const result = resolvePagination({ page: '2' as any, limit: '5' as any });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.skip).toBe(5);
  });

  it('should handle NaN string inputs gracefully', () => {
    const result = resolvePagination({ page: 'abc' as any, limit: 'xyz' as any });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(DEFAULT_LIMIT);
  });

  it('should use custom sortBy and sortOrder', () => {
    const result = resolvePagination({ sortBy: 'name', sortOrder: 'asc' });
    expect(result.sortBy).toBe('name');
    expect(result.sortOrder).toBe('asc');
  });

  it('should default sortOrder to desc when invalid', () => {
    const result = resolvePagination({ sortOrder: 'invalid' as any });
    expect(result.sortOrder).toBe('desc');
  });

  it('should calculate skip correctly for page 1', () => {
    const result = resolvePagination({ page: 1, limit: 25 });
    expect(result.skip).toBe(0);
  });
});

describe('buildMeta', () => {
  it('should calculate total pages and pagination flags', () => {
    const meta = buildMeta(55, 2, 20);
    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 55,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('should set hasNextPage false on last page', () => {
    const meta = buildMeta(40, 2, 20);
    expect(meta.totalPages).toBe(2);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('should set hasPreviousPage false on first page', () => {
    const meta = buildMeta(100, 1, 20);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(false);
  });

  it('should handle zero total', () => {
    const meta = buildMeta(0, 1, 20);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });

  it('should handle exact division', () => {
    const meta = buildMeta(40, 2, 20);
    expect(meta.totalPages).toBe(2);
    expect(meta.hasNextPage).toBe(false);
  });

  it('should return totalPages 0 when limit is 0 (edge case)', () => {
    const meta = buildMeta(0, 1, 0);
    expect(meta.totalPages).toBe(0);
  });
});

describe('orderByClause', () => {
  it('should return object with sortBy key and sortOrder value', () => {
    expect(orderByClause('name', 'asc')).toEqual({ name: 'asc' });
    expect(orderByClause('createdAt', 'desc')).toEqual({ createdAt: 'desc' });
  });
});

describe('parseIdParam', () => {
  it('should return trimmed value', () => {
    expect(parseIdParam('  abc123  ')).toBe('abc123');
  });

  it('should throw BadRequestException for empty string', () => {
    expect(() => parseIdParam('')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for whitespace only', () => {
    expect(() => parseIdParam('   ')).toThrow(BadRequestException);
  });
});
