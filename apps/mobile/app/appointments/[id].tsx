import { APPOINTMENT_STATUS_LABELS, type AppointmentDetailDto } from "@aiesec/api-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Linking, ScrollView, View } from "react-native";
import { Avatar, Badge, Button, Card, Loading, StateBlock, Txt } from "../../src/components/ui";
import { ApiError, apiFetch } from "../../src/lib/api";
import { formatDayHeading, formatTimeRange } from "../../src/lib/format";
import { useAppointment } from "../../src/lib/queries";
import { useSession } from "../../src/lib/session";
import { space } from "../../src/theme";

function statusTone(status: AppointmentDetailDto["status"]) {
  switch (status) {
    case "confirmed":
      return "success" as const;
    case "completed":
      return "primary" as const;
    case "cancelled":
      return "danger" as const;
    case "no_show":
      return "warning" as const;
  }
}

export default function AppointmentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const { activeLcId, can } = useSession();

  const { data: appointment, isPending, error, refetch } = useAppointment(id);
  const canManage = can("manage_booking");

  const setStatus = useMutation({
    mutationFn: async (status: "cancelled" | "completed" | "no_show") =>
      apiFetch(`/appointments/${id}`, { method: "PATCH", lcId: activeLcId, body: { status } }),
    onSuccess: () => {
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["appointments", activeLcId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", activeLcId] });
    },
    onError: (mutationError) => {
      Alert.alert("Couldn't update", mutationError instanceof ApiError ? mutationError.message : "Please try again.");
    }
  });

  if (error) {
    return (
      <StateBlock
        icon="calendar-outline"
        title="Couldn't load this appointment"
        message={error instanceof ApiError ? error.message : "Something went wrong."}
        action={{ label: "Try again", onPress: () => void refetch() }}
      />
    );
  }

  if (isPending || !appointment) return <Loading label="Loading appointment" />;

  const isOpen = appointment.status === "confirmed";

  function confirmCancel() {
    Alert.alert(
      "Cancel appointment",
      `Cancel ${appointment!.guestName}'s booking? The calendar invite is withdrawn and they're notified by Google.`,
      [
        { text: "Keep it", style: "cancel" },
        { text: "Cancel booking", style: "destructive", onPress: () => setStatus.mutate("cancelled") }
      ]
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: appointment.typeName ?? "Appointment" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        <View style={{ alignItems: "center", gap: space.sm }}>
          <Avatar name={appointment.guestName} size={64} />
          <Txt variant="title">{appointment.guestName}</Txt>
          <Badge label={APPOINTMENT_STATUS_LABELS[appointment.status]} tone={statusTone(appointment.status)} />
        </View>

        <Card style={{ gap: space.sm, alignItems: "center" }}>
          <Txt variant="heading">{formatDayHeading(appointment.startAt)}</Txt>
          <Txt variant="body" tone="muted">
            {formatTimeRange(appointment.startAt, appointment.endAt)}
          </Txt>
          <Txt variant="caption" tone="subtle">
            {new Date(appointment.startAt).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric"
            })}
            {" · "}
            {appointment.timezone}
          </Txt>
        </Card>

        <View style={{ gap: space.md }}>
          {appointment.meetUrl ? (
            <Button
              label="Join Google Meet"
              icon="videocam-outline"
              onPress={() => void Linking.openURL(appointment.meetUrl!)}
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button
              label="Email"
              icon="mail-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(`mailto:${appointment.guestEmail}`)}
            />
            {appointment.guestPhone ? (
              <Button
                label="Call"
                icon="call-outline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => void Linking.openURL(`tel:${appointment.guestPhone}`)}
              />
            ) : null}
          </View>
        </View>

        <Card style={{ gap: space.md }}>
          <Txt variant="heading">Guest</Txt>
          {(
            [
              ["Email", appointment.guestEmail],
              ["Phone", appointment.guestPhone],
              ["Booked", new Date(appointment.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })]
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <Txt variant="caption" tone="muted">
                {label}
              </Txt>
              <Txt variant="caption" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
                {value ?? "—"}
              </Txt>
            </View>
          ))}
          {appointment.contact ? (
            <Button
              label="Open CRM contact"
              variant="secondary"
              icon="person-outline"
              onPress={() => router.push(`/contacts/${appointment.contact!.id}`)}
            />
          ) : null}
        </Card>

        {appointment.intakeResponses.length > 0 ? (
          <Card style={{ gap: space.md }}>
            <Txt variant="heading">Intake answers</Txt>
            {appointment.intakeResponses.map((response, index) => (
              <View key={`${response.label}-${index}`} style={{ gap: 2 }}>
                <Txt variant="caption" tone="muted">
                  {response.label}
                </Txt>
                <Txt variant="body">{response.value}</Txt>
              </View>
            ))}
          </Card>
        ) : null}

        {appointment.notes ? (
          <Card style={{ gap: space.sm }}>
            <Txt variant="heading">Notes</Txt>
            <Txt variant="body">{appointment.notes}</Txt>
          </Card>
        ) : null}

        {canManage && isOpen ? (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Button
                label="Completed"
                icon="checkmark-circle-outline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => setStatus.mutate("completed")}
                loading={setStatus.isPending}
              />
              <Button
                label="No show"
                icon="person-remove-outline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => setStatus.mutate("no_show")}
                loading={setStatus.isPending}
              />
            </View>
            <Button label="Cancel appointment" variant="destructive" onPress={confirmCancel} />
          </View>
        ) : canManage ? (
          <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
            This appointment is {APPOINTMENT_STATUS_LABELS[appointment.status].toLowerCase()}. Re-open it from the web
            app if you need to restore the calendar invite.
          </Txt>
        ) : null}
      </ScrollView>
    </>
  );
}
