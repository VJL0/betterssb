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
      const required = prereqInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
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
    <div className="flex flex-col gap-3">
      <Card title="Paste Transcript">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your transcript text here..."
          className="min-h-24 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <div className="mt-2.5">
          <Button onClick={parse} loading={loading} disabled={!text.trim()}>
            Parse Transcript
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {transcript && (
        <>
          <Card
            title={`Courses (${transcript.courses.length})${transcript.gpa != null ? ` — GPA: ${transcript.gpa.toFixed(2)}` : ""}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-left">
                    <th className="px-2 py-1.5 font-semibold">Course</th>
                    <th className="px-2 py-1.5 font-semibold">Title</th>
                    <th className="px-2 py-1.5 font-semibold">Grade</th>
                    <th className="px-2 py-1.5 font-semibold">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {transcript.courses.map((c, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 font-medium">
                        {c.subject} {c.courseNumber}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">{c.title}</td>
                      <td className="px-2 py-1.5">
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
                      <td className="px-2 py-1.5">{c.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Check Prerequisites">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Required courses (comma-separated)
                </label>
                <input
                  value={prereqInput}
                  onChange={(e) => setPrereqInput(e.target.value)}
                  placeholder="CS 201, MATH 301"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <Button
                size="sm"
                onClick={checkPrereqs}
                loading={prereqLoading}
                disabled={!prereqInput.trim()}
              >
                Check
              </Button>
            </div>

            {prereqs && (
              <div className="mt-3 flex flex-col gap-1.5">
                {Object.entries(prereqs).map(([course, met]) => (
                  <div
                    key={course}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-base">{met ? "✅" : "❌"}</span>
                    <span className="font-medium">{course}</span>
                    <span
                      className={
                        met ? "text-green-600" : "text-red-600"
                      }
                    >
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
