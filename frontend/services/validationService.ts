import { ValidationResult, TestCase, TestCaseResult } from "@/types";

/**
 * Validation service client — sends student code to the language-aware
 * validation-service. For web TPs it runs structural checks; for executable
 * languages it compiles and runs the code against the step's test cases in the
 * sandbox and compares outputs. Returns null when the service is unreachable so
 * callers can fall back to the local HTML validator.
 */

const VALIDATION_BASE =
  process.env.NEXT_PUBLIC_VALIDATION_SERVICE_URL ?? "http://localhost:8006";

interface ServerTestResult {
  name: string;
  passed: boolean;
  stdin?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}

interface ServerValidation {
  valid: boolean;
  checked: string;
  language: string;
  errors: string[];
  hints: string[];
  suggestions?: string[];
  missing: string[];
  test_results?: ServerTestResult[];
  tests_passed?: number;
  tests_total?: number;
  compile_output?: string;
  runtime_error?: string;
}

export const validationService = {
  async validate(input: {
    language: string;
    code: string;
    requiredTags?: string[];
    requiredKeywords?: string[];
    testCases?: TestCase[];
  }): Promise<ValidationResult | null> {
    try {
      const res = await fetch(`${VALIDATION_BASE}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: input.language,
          code: input.code,
          required_tags: input.requiredTags ?? [],
          required_keywords: input.requiredKeywords ?? [],
          test_cases: (input.testCases ?? []).map((t) => ({
            name: t.name,
            stdin: t.stdin,
            expected_stdout: t.expectedStdout,
          })),
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as ServerValidation;
      const testResults: TestCaseResult[] = (data.test_results ?? []).map((t) => ({
        name: t.name,
        passed: t.passed,
        stdin: t.stdin,
        expected: t.expected,
        actual: t.actual,
        stderr: t.stderr,
      }));
      return {
        valid: data.valid,
        errors: data.errors ?? [],
        hints: data.hints ?? [],
        checked: data.checked,
        suggestions: data.suggestions ?? [],
        testResults,
        testsPassed: data.tests_passed,
        testsTotal: data.tests_total,
        compileOutput: data.compile_output,
        runtimeError: data.runtime_error,
      };
    } catch {
      return null;
    }
  },
};
