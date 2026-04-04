import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function usePriceDrops(limit = 10) {
  return useQuery({
    queryKey: ['priceDrops', limit],
    queryFn: () => api.getPriceDrops(limit),
    staleTime: 30_000,
  });
}

export function usePriceIncreases(limit = 10) {
  return useQuery({
    queryKey: ['priceIncreases', limit],
    queryFn: () => api.getPriceIncreases(limit),
    staleTime: 30_000,
  });
}
