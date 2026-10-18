import { API_URL } from "@/lib/config";
import type {
  RMPRating,
  RMPSchool,
  Section,
  SchedulePreferences,
  GeneratedSchedule,
  ChatMessage,
  TranscriptData,
  TranscriptCourse,
} from "@workspace/shared/types";

class BetterSSBApi {
  private baseUrl: string;

  constructor(baseUrl = API_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    // Sends the backend session cookie (see lib/auth.ts).
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "Unknown error");
      throw new Error(`API ${res.status}: ${body}`);
    }

    return res.json();
  }

  async searchSchools(query: string): Promise<RMPSchool[]> {
    return this.request<RMPSchool[]>(
      `/rmp/schools?query=${encodeURIComponent(query)}`,
    );
  }

  async searchProfessor(name: string, school: string): Promise<RMPRating[]> {
    return this.request<RMPRating[]>(
      `/rmp/search?name=${encodeURIComponent(name)}&school=${encodeURIComponent(school)}`,
    );
  }

  async generateSchedules(
    sections: Section[],
    preferences: SchedulePreferences,
  ): Promise<GeneratedSchedule[]> {
    return this.request<GeneratedSchedule[]>("/schedule/generate", {
      method: "POST",
      body: JSON.stringify({ sections, preferences }),
    });
  }

  async chat(messages: ChatMessage[], context?: string): Promise<string> {
    const result = await this.request<{ response: string }>("/chat/", {
      method: "POST",
      body: JSON.stringify({ messages, context }),
    });
    return result.response;
  }

  async parseTranscript(text: string): Promise<TranscriptData> {
    const res = await fetch(`${this.baseUrl}/transcript/parse`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
      credentials: "include",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "Unknown error");
      throw new Error(`API ${res.status}: ${body}`);
    }

    return res.json();
  }

  async checkPrerequisites(
    completed: TranscriptCourse[],
    required: string[],
  ): Promise<Record<string, boolean>> {
    return this.request<Record<string, boolean>>("/transcript/check-prereqs", {
      method: "POST",
      body: JSON.stringify({ completed, required }),
    });
  }
}

export const api = new BetterSSBApi();
export { BetterSSBApi };
