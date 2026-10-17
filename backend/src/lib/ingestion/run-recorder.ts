/**
 * Records the outcome of every ingestion step so failures are visible (DR-20..DR-22).
 * Steps are aggregated per (source, status) to keep runs of thousands of areas readable.
 */

export type StepStatus = "ok" | "partial" | "failed" | "skipped";
export type RunStatus = "ok" | "partial" | "failed";

export type StepOutcome = {
  source: string;
  status: StepStatus;
  rowsWritten?: number;
  message?: string;
};

export type AggregatedStep = {
  source: string;
  status: StepStatus;
  occurrences: number;
  rowsWritten: number;
  messages: string[];
};

const MAX_MESSAGES = 5;

export class RunRecorder {
  private readonly groups = new Map<string, AggregatedStep>();

  record(outcome: StepOutcome): void {
    const key = `${outcome.source}|${outcome.status}`;
    let group = this.groups.get(key);
    if (!group) {
      group = {
        source: outcome.source,
        status: outcome.status,
        occurrences: 0,
        rowsWritten: 0,
        messages: [],
      };
      this.groups.set(key, group);
    }
    group.occurrences += 1;
    group.rowsWritten += outcome.rowsWritten ?? 0;
    if (
      outcome.message &&
      group.messages.length < MAX_MESSAGES &&
      !group.messages.includes(outcome.message)
    ) {
      group.messages.push(outcome.message);
    }
  }

  steps(): AggregatedStep[] {
    return [...this.groups.values()].sort((a, b) =>
      `${a.source}${a.status}`.localeCompare(`${b.source}${b.status}`),
    );
  }

  /** `failed` when nothing succeeded, `partial` when anything failed, otherwise `ok`. */
  status(): RunStatus {
    const steps = this.steps();
    const failed = steps.some((s) => s.status === "failed" || s.status === "partial");
    const succeeded = steps.some((s) => s.status === "ok");
    if (!failed) return "ok";
    return succeeded ? "partial" : "failed";
  }

  exitCode(): 0 | 1 {
    return this.status() === "ok" ? 0 : 1;
  }

  summary(): string {
    const steps = this.steps();
    if (steps.length === 0) return "no steps recorded";
    return steps
      .map((s) => {
        const detail = s.messages.length > 0 ? ` (${s.messages.join("; ")})` : "";
        return `${s.source}: ${s.status} x${s.occurrences}, rows=${s.rowsWritten}${detail}`;
      })
      .join("\n");
  }
}

/** Maps an `ingest*` return value to a step outcome. */
export function outcomeFromResult(
  source: string,
  result: { status?: string; count?: number; reason?: string } | null | undefined,
): StepOutcome {
  if (!result) return { source, status: "failed", message: "no result" };
  if (result.status === "skipped") {
    return { source, status: "skipped", message: result.reason };
  }
  if (result.status === "partial") {
    return { source, status: "partial", rowsWritten: result.count, message: result.reason };
  }
  if (result.status === "failed") {
    return { source, status: "failed", message: result.reason };
  }
  return { source, status: "ok", rowsWritten: result.count };
}
