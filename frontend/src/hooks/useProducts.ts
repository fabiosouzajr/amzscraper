import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const PRODUCTS_KEY = (categoryFilter?: string, page?: number, pageSize?: number) =>
  ['products', categoryFilter ?? '', page ?? 1, pageSize ?? 20] as const;

export function useProducts(categoryFilter?: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: PRODUCTS_KEY(categoryFilter, page, pageSize),
    queryFn: () => api.getProducts(categoryFilter || undefined, page, pageSize),
  });
}

export function useAddProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asin: string) => api.addProduct(asin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
