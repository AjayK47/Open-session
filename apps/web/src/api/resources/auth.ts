import type { AuthUser, EvaluationPersona, EvaluationPersonaName, RequestCodeResponse } from "@opensession/schemas";
import { http } from "../client";

export const authApi = {
  requestCode: (email: string) => http.post<RequestCodeResponse>("/api/v1/auth/request-code", { email }),
  verify: (email: string, code: string) => http.post<AuthUser>("/api/v1/auth/verify", { email, code }),
  logout: () => http.post<{ ok: boolean }>("/api/v1/auth/logout"),
  me: () => http.get<AuthUser>("/api/v1/auth/me"),
  evaluationPersonas: () => http.get<EvaluationPersona[]>("/api/v1/auth/evaluation-personas"),
  evaluationLogin: (persona: EvaluationPersonaName) =>
    http.post<AuthUser>("/api/v1/auth/evaluation-login", { persona }),
};
