import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export const CATEGORIES_KEY = ['categories'] as const;

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => api.getCategoryTree(),
    staleTime: 5 * 60_000, // 5 min — category tree rarely changes
  });
}
