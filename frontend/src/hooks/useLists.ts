import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const LISTS_KEY = ['lists'] as const;

export function useLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: () => api.getLists(),
  });
}

export function useAddProductToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, productId }: { listId: number; productId: number }) =>
      api.addProductToList(listId, productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useRemoveProductFromList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, productId }: { listId: number; productId: number }) =>
      api.removeProductFromList(listId, productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
