"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/feedback";
import { sendMessageAction } from "@/lib/messaging/actions";
import { MAX_MESSAGE_LENGTH } from "@/lib/messaging/constants";

/**
 * Message composer — text input + send button.
 *
 * Per spec Section 11:
 *   * Enter-to-send on desktop (Shift+Enter for newline)
 *   * Character limit (5000)
 *   * Sending + failed states
 *   * Retry on failure
 *   * Accessible labels
 *   * Mobile: keyboard-friendly, send button stays accessible
 */
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);

    const result = await sendMessageAction({ conversationId, body: trimmed });

    setPending(false);

    if (!result.ok) {
      setError(result.message ?? "Failed to send message.");
      return;
    }

    setBody("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send (desktop), Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const remaining = MAX_MESSAGE_LENGTH - body.length;
  const overLimit = remaining < 0;

  return (
    <div className="border-t bg-background p-3 space-y-2">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}{" "}
          <button onClick={handleSend} className="text-primary hover:underline">
            Retry
          </button>
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={pending}
          aria-label="Message input"
          className="flex-1 resize-none min-h-[40px] max-h-32"
        />
        <Button
          onClick={handleSend}
          disabled={pending || !body.trim() || overLimit}
          aria-label="Send message"
          size="icon"
          className="shrink-0"
        >
          {pending ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Press Enter to send · Shift+Enter for newline
        </span>
        <span className={overLimit ? "text-destructive" : "text-muted-foreground"}>
          {body.length} / {MAX_MESSAGE_LENGTH}
        </span>
      </div>
    </div>
  );
}
