import type {
  AppointmentDetailDto,
  AppointmentListQuery,
  AppointmentListResponse,
  ContactDetailDto,
  ContactListQuery,
  ContactListResponse,
  ConversationDetailDto,
  ConversationListQuery,
  ConversationListResponse,
  DashboardResponse,
  EmailCampaignDetailDto,
  EmailListQuery,
  EmailListResponse,
  ExpaInsightsResponse,
  ExpaResponse,
  SocialListQuery,
  SocialListResponse,
  SocialPostDto
} from "@aiesec/api-contract";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useSession } from "./session";

// Every LC-scoped key starts with the resource name and the LC id, so switching
// workspaces can drop a whole resource in one removeQueries call.

export function useDashboard() {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["dashboard", activeLcId],
    enabled: Boolean(activeLcId),
    queryFn: () => apiFetch<DashboardResponse>("/dashboard", { lcId: activeLcId })
  });
}

export type ContactFilters = Partial<Pick<ContactListQuery, "q" | "type" | "stage" | "programme" | "tag">>;

export function useContacts(filters: ContactFilters) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["contacts", activeLcId, filters],
    enabled: Boolean(activeLcId),
    queryFn: ({ signal }) =>
      apiFetch<ContactListResponse>("/contacts", {
        lcId: activeLcId,
        query: { ...filters, limit: 100 },
        signal
      }),
    // Keep the previous page visible while a new search runs, so typing in the
    // search box doesn't flash an empty list on every keystroke.
    placeholderData: (previous) => previous
  });
}

export function useContact(id: string) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["contacts", activeLcId, "detail", id],
    enabled: Boolean(activeLcId) && Boolean(id),
    queryFn: () => apiFetch<ContactDetailDto>(`/contacts/${id}`, { lcId: activeLcId })
  });
}

export type ConversationFilters = Partial<Pick<ConversationListQuery, "channel" | "status" | "assigned" | "unread">>;

export function useConversations(filters: ConversationFilters) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["conversations", activeLcId, filters],
    enabled: Boolean(activeLcId),
    queryFn: ({ signal }) =>
      apiFetch<ConversationListResponse>("/conversations", {
        lcId: activeLcId,
        query: { ...filters, limit: 100 },
        signal
      }),
    placeholderData: (previous) => previous
  });
}

export type SocialFilters = Partial<Pick<SocialListQuery, "status">>;

export function useSocialPosts(filters: SocialFilters) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["social", activeLcId, filters],
    enabled: Boolean(activeLcId),
    queryFn: ({ signal }) =>
      apiFetch<SocialListResponse>("/social", { lcId: activeLcId, query: { ...filters, limit: 100 }, signal }),
    placeholderData: (previous) => previous
  });
}

export function useSocialPost(id: string) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["social", activeLcId, "detail", id],
    enabled: Boolean(activeLcId) && Boolean(id),
    queryFn: () => apiFetch<SocialPostDto>(`/social/${id}`, { lcId: activeLcId })
  });
}

export type EmailFilters = Partial<Pick<EmailListQuery, "status">>;

export function useCampaigns(filters: EmailFilters) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["email", activeLcId, filters],
    enabled: Boolean(activeLcId),
    queryFn: ({ signal }) =>
      apiFetch<EmailListResponse>("/email", { lcId: activeLcId, query: { ...filters, limit: 100 }, signal }),
    placeholderData: (previous) => previous
  });
}

export function useCampaign(id: string) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["email", activeLcId, "detail", id],
    enabled: Boolean(activeLcId) && Boolean(id),
    queryFn: () => apiFetch<EmailCampaignDetailDto>(`/email/${id}`, { lcId: activeLcId })
  });
}

export function useExpa() {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["expa", activeLcId],
    enabled: Boolean(activeLcId),
    queryFn: () => apiFetch<ExpaResponse>("/expa", { lcId: activeLcId })
  });
}

export function useExpaInsights(enabled: boolean) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["expa", activeLcId, "insights"],
    enabled: Boolean(activeLcId) && enabled,
    queryFn: () => apiFetch<ExpaInsightsResponse>("/expa/insights", { lcId: activeLcId }),
    // The ml-api can take a few seconds; don't re-run it on every tab switch.
    staleTime: 5 * 60 * 1000
  });
}

export type AppointmentFilters = Partial<Pick<AppointmentListQuery, "scope" | "status">>;

/** The device's IANA zone, so the server can resolve "today" the way the user sees it. */
function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function useAppointments(filters: AppointmentFilters) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["appointments", activeLcId, filters],
    enabled: Boolean(activeLcId),
    queryFn: ({ signal }) =>
      apiFetch<AppointmentListResponse>("/appointments", {
        lcId: activeLcId,
        query: { ...filters, timezone: deviceTimezone(), limit: 100 },
        signal
      }),
    placeholderData: (previous) => previous
  });
}

export function useAppointment(id: string) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["appointments", activeLcId, "detail", id],
    enabled: Boolean(activeLcId) && Boolean(id),
    queryFn: () => apiFetch<AppointmentDetailDto>(`/appointments/${id}`, { lcId: activeLcId })
  });
}

export function useConversation(id: string) {
  const { activeLcId } = useSession();
  return useQuery({
    queryKey: ["conversations", activeLcId, "detail", id],
    enabled: Boolean(activeLcId) && Boolean(id),
    queryFn: () => apiFetch<ConversationDetailDto>(`/conversations/${id}`, { lcId: activeLcId }),
    // A thread is the one screen where staleness is actively annoying.
    refetchInterval: 30_000
  });
}
