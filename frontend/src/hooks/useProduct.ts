import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export const PRODUCT_KEY = (id: number) => ['product', id] as const;

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: PRODUCT_KEY(id ?? 0),
    queryFn: () => api.getProduct(id!),
    enabled: id !== null,
  });
}
