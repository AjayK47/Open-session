import type {
  Room,
  RoomInput,
  SessionFormat,
  SessionFormatInput,
  Tag,
  TagInput,
  Track,
  TrackInput,
} from "@opensession/schemas";
import { http } from "../client";

export const programApi = {
  tracks: {
    list: (eventId: string) => http.get<Track[]>(`/api/v1/events/${eventId}/tracks`),
    create: (eventId: string, input: TrackInput) => http.post<Track>(`/api/v1/events/${eventId}/tracks`, input),
    update: (eventId: string, trackId: string, input: Partial<TrackInput>) =>
      http.patch<Track>(`/api/v1/events/${eventId}/tracks/${trackId}`, input),
  },
  rooms: {
    list: (eventId: string) => http.get<Room[]>(`/api/v1/events/${eventId}/rooms`),
    create: (eventId: string, input: RoomInput) => http.post<Room>(`/api/v1/events/${eventId}/rooms`, input),
    update: (eventId: string, roomId: string, input: Partial<RoomInput>) =>
      http.patch<Room>(`/api/v1/events/${eventId}/rooms/${roomId}`, input),
  },
  formats: {
    list: (eventId: string) => http.get<SessionFormat[]>(`/api/v1/events/${eventId}/formats`),
    create: (eventId: string, input: SessionFormatInput) =>
      http.post<SessionFormat>(`/api/v1/events/${eventId}/formats`, input),
    update: (eventId: string, formatId: string, input: Partial<SessionFormatInput>) =>
      http.patch<SessionFormat>(`/api/v1/events/${eventId}/formats/${formatId}`, input),
  },
  tags: {
    list: (eventId: string) => http.get<Tag[]>(`/api/v1/events/${eventId}/tags`),
    create: (eventId: string, input: TagInput) => http.post<Tag>(`/api/v1/events/${eventId}/tags`, input),
    update: (eventId: string, tagId: string, input: Partial<TagInput>) =>
      http.patch<Tag>(`/api/v1/events/${eventId}/tags/${tagId}`, input),
  },
};
