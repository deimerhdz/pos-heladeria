/** Paginated response wrapper used by the super-admin list endpoints (`Page[T]`). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
