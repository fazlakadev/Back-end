export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  trm?: boolean;
  iat?: number;
  exp?: number;
}

export interface AdminJwtPayload {
  sub: string;
  username: string;
  rank: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface CallerContext {
  userId?: string;
  isAdmin: boolean;
  adminRank?: string;
  adminPermissions?: string[];
}

export interface RequestContext {
  platform?: string;
  deviceType?: string;
  deviceName?: string;
  os?: string;
  browser?: string;
  appVersion?: string;
  userAgent?: string;
  ip?: string;
  ipHash?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lng?: number;
  referrer?: string;
  locale?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
