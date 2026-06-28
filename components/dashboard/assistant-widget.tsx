'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AssistantResponse = {
  success: boolean;
  answer: string;
  provider: 'ollama' | 'local-data' | 'fallback';
  model: string | null;
  warning?: string;
  pendingAction?: PendingAction | null;
};

type AssistantStatus = {
  success: boolean;
  running: boolean;
  started: boolean;
  hasModel: boolean;
  model: string;
  reason?: string | null;
};

type PendingAction =
  | {
      type: 'create_tardiness_acknowledgements';
      label: string;
      summary: string;
      employeeIds: number[];
    }
  | {
      type: 'approve_request' | 'reject_request';
      label: string;
      summary: string;
      requestType: 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';
      requestId: number;
      remarks?: string;
    };

const ASSISTANT_ROLES = ['Manager', 'Admin', 'CEO', 'DEV'];
const suggestions = [
  'Who has tardiness points?',
  'Notify employees with 0.4+ late points',
  'What approvals are pending?',
  'Find employees missing schedules',
  'What is the payroll status?',
];

export function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [provider, setProvider] = useState<'ollama' | 'local-data' | 'fallback' | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'assistant',
      content: 'Hi, I am your local HRIS assistant. Ask me about attendance, late points, approvals, payroll, or where to do something in the dashboard.',
    },
  ]);

  useEffect(() => {
    if (!user || !ASSISTANT_ROLES.includes(user.role)) return;

    let cancelled = false;
    setIsCheckingStatus(true);

    fetch('/api/assistant/status', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json() as AssistantStatus | { error?: string };
        if (!response.ok || !('running' in data)) {
          throw new Error('error' in data ? data.error : 'Assistant status check failed');
        }
        if (!cancelled) {
          setAssistantStatus(data);
          if (data.running && data.hasModel) {
            setProvider('ollama');
            setWarning(null);
          } else if (data.running && !data.hasModel) {
            setProvider('fallback');
            setWarning(`Ollama is running, but ${data.model} is not installed yet. Pull it once with: ollama pull ${data.model}`);
          } else {
            setProvider('fallback');
            setWarning(data.reason || 'Local AI is not ready yet.');
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProvider('fallback');
          setWarning(error instanceof Error ? error.message : 'Assistant status check failed');
        }
      })
      .finally(() => {
        if (!cancelled) setIsCheckingStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || !ASSISTANT_ROLES.includes(user.role)) return null;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const nextMessages: AssistantMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);
    setWarning(null);
    setPendingAction(null);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await response.json() as AssistantResponse | { error?: string };
      if (!response.ok || !('answer' in data)) {
        const errorMessage = 'error' in data ? data.error : null;
        throw new Error(errorMessage || 'Assistant failed to respond');
      }

      setProvider(data.provider);
      setWarning(data.warning || null);
      setPendingAction(data.pendingAction || null);
      setMessages((current) => [...current, { role: 'assistant', content: data.answer }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: error instanceof Error
            ? error.message
            : 'I could not reach the assistant service right now.',
        },
      ]);
    } finally {
      setIsSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction || isConfirmingAction) return;

    setIsConfirmingAction(true);
    try {
      const response = await fetch('/api/assistant/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: pendingAction }),
      });

      const data = await response.json() as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Action failed');
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.message || 'Action completed.',
        },
      ]);
      setPendingAction(null);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: error instanceof Error ? error.message : 'I could not complete that action.',
        },
      ]);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-5 right-5 z-30 h-12 w-12 rounded-full shadow-lg"
          size="icon"
          aria-label="Open HRIS assistant"
        >
          <Bot className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(42rem,calc(100vh-2rem))] max-w-[min(calc(100vw-2rem),44rem)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                HRIS Assistant
              </DialogTitle>
              <DialogDescription>
                Local-first help for managers and admins.
              </DialogDescription>
            </div>
            <Badge variant={provider === 'ollama' ? 'default' : 'outline'} className="mt-0.5 shrink-0">
              {isCheckingStatus
                ? 'Starting'
                : provider === 'ollama'
                  ? 'Local AI'
                  : provider === 'local-data'
                    ? 'Local data'
                    : provider === 'fallback'
                      ? 'Setup needed'
                    : 'Ready'}
            </Badge>
          </div>
          {assistantStatus?.running && !assistantStatus.hasModel && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Ollama started automatically. Install the lightweight model once with: ollama pull {assistantStatus.model}
            </p>
          )}
          {warning && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {warning}
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 bg-muted/20">
          <div className="space-y-3 p-5">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border bg-background'
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Thinking locally...
                </div>
              </div>
            )}
            {pendingAction && (
              <div className="ml-auto max-w-[85%] rounded-md border border-primary/30 bg-background p-3 text-sm">
                <p className="font-medium">{pendingAction.label}</p>
                <p className="mt-1 leading-5 text-muted-foreground">{pendingAction.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={isConfirmingAction}
                    onClick={confirmPendingAction}
                  >
                    {isConfirmingAction ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isConfirmingAction}
                    onClick={() => setPendingAction(null)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isSending}
                onClick={() => sendMessage(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about attendance, approvals, payroll..."
              className="max-h-32 min-h-11 resize-none"
              disabled={isSending}
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isSending} aria-label="Send message">
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
