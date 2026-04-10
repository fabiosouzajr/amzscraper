import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { NotificationChannelType, NotificationRuleType, EmailConfig, TelegramConfig, DiscordConfig, LowestInDaysParams, BelowThresholdParams, PercentageDropParams } from '../types';

export const CHANNELS_KEY = ['notification-channels'] as const;
export const RULES_KEY = (productId?: number) => ['notification-rules', productId ?? null] as const;
export const HISTORY_KEY = (limit?: number) => ['notification-history', limit ?? 50] as const;

export function useNotificationChannels() {
  return useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: () => api.notifications.getChannels(),
  });
}

export function useNotificationRules(productId?: number) {
  return useQuery({
    queryKey: RULES_KEY(productId),
    queryFn: () => api.notifications.getRules(productId),
  });
}

export function useNotificationHistory(limit = 50) {
  return useQuery({
    queryKey: HISTORY_KEY(limit),
    queryFn: () => api.notifications.getHistory(limit),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: NotificationChannelType; name: string; config: EmailConfig | TelegramConfig | DiscordConfig }) =>
      api.notifications.createChannel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.notifications.deleteChannel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { product_id?: number | null; channel_id: number; type: NotificationRuleType; params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams }) =>
      api.notifications.createRule(data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: RULES_KEY(vars.product_id ?? undefined) });
      qc.invalidateQueries({ queryKey: RULES_KEY() });
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, productId: _productId }: { id: number; productId?: number }) =>
      api.notifications.deleteRule(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: RULES_KEY(vars.productId) });
      qc.invalidateQueries({ queryKey: RULES_KEY() });
    },
  });
}
