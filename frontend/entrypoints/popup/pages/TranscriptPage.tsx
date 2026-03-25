import { useState } from "react";
import type { TranscriptData } from "@/types";
import { sendMessage } from "@/lib/messaging";
import { Button, Card, Badge } from "@/components/ui";

export function TranscriptPage() {
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [prereqs, setPrereqs] = useState<Record<string, boolean> | null>(null);
  const [prereqInput, setPrereqInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [prereqLoading, setPrereqLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await sendMessage({
        type: "PARSE_TRANSCRIPT",
        payload: { text },
      });

      if (response.success) {
        setTranscript(response.data as TranscriptData);
      } else {
        setError(response.error ?? "Failed to parse transcript");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function checkPrereqs() {
    if (!transcript || !prereqInput.trim()) return;
    setPrereqLoading(true);

    try {
      const required = prereqInput.split(",").map((s) => s.trim()).filter(Boolean);
      const response = await sendMessage({
        type: "CHECK_PREREQS",
        payload: { completed: transcript.courses, required },
      });

      if (response.success) {
        setPrereqs(response.data as Record<string, boolean>);
      }
    } catch {
      // silently handle
    } finally {
      setPrereqLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Card title="Paste Transcript">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your transcript text here..."
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontSize: "13px",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div style={{ marginTop: "10px" }}>
          <Button onClick={parse} loading={loading} disabled={!text.trim()}>
            Parse Transcript
          </Button>
        </div>
      </Card>

      {error && (
        <div style={{ color: "#dc2626", fontSize: "13px", padding: "8px 12px", background: "#fee2e2", borderRadius: "8px" }}>
          {error}
        </div>
      )}

      {transcript && (
        <>
          <Card title={`Courses (${transcript.courses.length})${transcript.gpa != null ? ` — GPA: ${transcript.gpa.toFixed(2)}` : ""}`}>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Course</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Title</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Grade</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {transcript.courses.map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 500 }}>
                        {c.subject} {c.courseNumber}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#6b7280" }}>{c.title}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <Badge
                          text={c.grade}
                          color={
                            ["A", "A+", "A-"].includes(c.grade)
                              ? "green"
                              : ["B", "B+", "B-"].includes(c.grade)
                                ? "blue"
                                : ["C", "C+", "C-"].includes(c.grade)
                                  ? "yellow"
                                  : "red"
                          }
                        />
                      </td>
                      <td style={{ padding: "6px 8px" }}>{c.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Check Prerequisites">
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#374151", marginBottom: "4px" }}>
                  Required courses (comma-separated)
                </label>
                <input
                  value={prereqInput}
                  onChange={(e) => setPrereqInput(e.target.value)}
                  placeholder="CS 201, MATH 301"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>
              <Button size="sm" onClick={checkPrereqs} loading={prereqLoading} disabled={!prereqInput.trim()}>
                Check
              </Button>
            </div>

            {prereqs && (
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {Object.entries(prereqs).map(([course, met]) => (
                  <div
                    key={course}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>{met ? "✅" : "❌"}</span>
                    <span style={{ fontWeight: 500 }}>{course}</span>
                    <span style={{ color: met ? "#16a34a" : "#dc2626" }}>
                      {met ? "Satisfied" : "Not met"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
