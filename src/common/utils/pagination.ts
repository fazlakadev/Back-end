import { BadRequestException } from '@nestjs/common';
import { PaginationQuery } from '../types/request-context';

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  skip: number;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function resolvePagination(query: PaginationQuery): PaginationParams {
  const page = Math.max(parseInt(String(query.page ?? 1), 10) || 1, 1);
  const limit = Math.min(
    Math.max(
      parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder: 'asc' | 'desc' = query.sortOrder === 'asc' ? 'asc' : 'desc';

  return { page, limit, sortBy, sortOrder, skip: (page - 1) * limit };
}

export function orderByClause(sortBy: string, sortOrder: 'asc' | 'desc') {
  return { [sortBy]: sortOrder };
}

export function buildMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function parseIdParam(value: string): string {
  if (!value || value.trim().length === 0) {
    throw new BadRequestException('Invalid id');
  }
  return value.trim();
}
