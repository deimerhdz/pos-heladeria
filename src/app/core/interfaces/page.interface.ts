/** Envoltura de paginación devuelta por el backend (`Page[T]`, app/core/pagination.py). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
