import { useState } from "react";
import { sendMessage } from "@/lib/messaging";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import type { TranscriptData } from "@workspace/api-client";

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
      <Card size="sm">
        <CardHeader>
          <CardTitle>Paste Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Transcript text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your transcript text here..."
            className="min-h-24"
          />
          <div className="mt-2.5">
            <Button onClick={parse} disabled={loading || !text.trim()}>
              {loading && <Spinner data-icon="inline-start" aria-hidden />}
              Parse Transcript
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                  <tr className="border-b-2 border-border text-left">
                    <th className="px-2 py-1.5 font-semibold">Course</th>
                    <th className="px-2 py-1.5 font-semibold">Title</th>
                    <th className="px-2 py-1.5 font-semibold">Grade</th>
                    <th className="px-2 py-1.5 font-semibold">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {transcript.courses.map((c, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1.5 font-medium">
                        {c.subject} {c.courseNumber}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {c.title}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge
                          variant={
                            ["A", "A+", "A-"].includes(c.grade)
                              ? "success"
                              : ["B", "B+", "B-"].includes(c.grade)
                                ? "info"
                                : ["C", "C+", "C-"].includes(c.grade)
                                  ? "warning"
                                  : "destructive"
                          }
                        >
                          {c.grade}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5">{c.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Check Prerequisites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="transcript-required">
                    Required courses (comma-separated)
                  </FieldLabel>
                  <Input
                    id="transcript-required"
                    value={prereqInput}
                    onChange={(e) => setPrereqInput(e.target.value)}
                    placeholder="CS 201, MATH 301"
                  />
                </Field>
                <Button
                  size="sm"
                  onClick={checkPrereqs}
                  disabled={prereqLoading || !prereqInput.trim()}
                >
                  {prereqLoading && (
                    <Spinner data-icon="inline-start" aria-hidden />
                  )}
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
                        className={met ? "text-success" : "text-destructive"}
                      >
                        {met ? "Satisfied" : "Not met"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
