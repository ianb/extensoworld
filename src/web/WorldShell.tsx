import { useState, useRef, useEffect } from "react";
import { trpc } from "./trpc.js";

interface LogEntry {
  type: "input" | "output";
  text: string;
}

export function WorldShell() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trpc.look.query().then((result) => {
      setLog([{ type: "output", text: result.output }]);
    });
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [log]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const command = input;
    setInput("");
    setLoading(true);

    setLog((prev) => [...prev, { type: "input", text: `> ${command}` }]);

    const result = await trpc.command.mutate({ text: command });
    setLog((prev) => [...prev, { type: "output", text: result.output }]);
    setLoading(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  return (
    <>
      <div className="min-h-[300px] max-h-[500px] overflow-y-auto rounded-lg bg-gray-900 p-4 font-mono text-sm whitespace-pre-wrap">
        {log.map((entry, i) => (
          <div key={i} className={entry.type === "input" ? "text-sky-400" : "text-gray-200"}>
            {entry.text}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command..."
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-sm text-gray-100 placeholder-gray-500 focus:border-sky-500 focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-sky-700 px-4 py-2 font-mono text-sm text-gray-100 hover:bg-sky-600 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );
}
