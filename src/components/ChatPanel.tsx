import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, MessageCircle, Square, Trash2, UserRound } from "lucide-react";
import { CHAT_OPENERS } from "@/lib/ai";
import { cx } from "@/lib/format";
import { KIND_LABEL, useStore } from "@/lib/store";
import type { ChatAction, ChatTurn, EntityKind } from "@/lib/types";
import { Button, IconButton } from "./ui";

const ACTION_LABEL: Record<ChatAction["kind"], string> = {
  continue: "续写",
  finish: "写完",
  rewriteChapter: "重写整章",
  outline: "推演章纲",
};

const ACTION_KIND: Record<ChatAction["kind"], Parameters<ReturnType<typeof useStore.getState>["runAI"]>[0]> = {
  continue: "continue",
  finish: "finish",
  rewriteChapter: "rewriteChapter",
  outline: "outline",
};

function Bubble({ turn }: { turn: ChatTurn }) {
  const runAI = useStore((s) => s.runAI);
  const applyChatText = useStore((s) => s.applyChatText);
  const applyChatEntities = useStore((s) => s.applyChatEntities);
  const entities = useStore((s) => s.entities);
  const panelStreaming = useStore((s) => s.gen?.status === "streaming");
  const isUser = turn.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gold/15 px-3 py-2 text-[12px] leading-[1.7] text-ink/95">
          {turn.content}
        </div>
      </div>
    );
  }

  const markApplied = () =>
    useStore.setState((s) => ({
      chat: s.chat.map((t) => (t.id === turn.id ? { ...t, applied: true } : t)),
    }));

  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gold/12">
        <MessageCircle size={10} className="text-gold/80" />
      </div>
      <div className="min-w-0 flex-1">
        {turn.title ? (
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-gold/80">
            <span className="rounded-full border border-gold/30 px-1.5 py-px">章节标题</span>
            {turn.title}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap text-[12px] leading-[1.8] text-dim">
          {turn.content}
          {turn.status === "streaming" ? (
            <span className="ml-0.5 inline-block h-[11px] w-[2px] animate-pulse bg-gold/80 align-middle" />
          ) : null}
        </div>
        {turn.status === "error" ? (
          <div className="mt-1 text-[10.5px] text-cinnabar">{turn.error ?? "出错了"}</div>
        ) : null}
        {turn.status === "done" && turn.content.trim().length >= 20 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              disabled={turn.applied}
              onClick={async () => {
                await applyChatText(turn.content, { title: turn.title });
                markApplied();
              }}
              className={cx(
                "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                turn.applied
                  ? "border-line/60 text-mute"
                  : "border-gold/40 text-gold hover:bg-gold/10"
              )}
            >
              {turn.applied ? "已写入正文" : "写入正文"}
            </button>
          </div>
        ) : null}
        {turn.actions?.length ? (          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.actions.map((a) => (
              <button
                key={a.id}
                disabled={a.done || panelStreaming}
                onClick={async () => {
                  await runAI(ACTION_KIND[a.kind], a.instruction);
                  useStore.setState((s) => ({
                    chat: s.chat.map((t) =>
                      t.id === turn.id
                        ? {
                            ...t,
                            actions: t.actions?.map((x) =>
                              x.id === a.id ? { ...x, done: true } : x
                            ),
                          }
                        : t
                    ),
                  }));
                }}
                className={cx(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  a.done
                    ? "border-line/60 text-mute"
                    : "border-gold/40 text-gold hover:bg-gold/10"
                )}
              >
                {a.done ? "已执行 · " : ""}
                {a.label || ACTION_LABEL[a.kind]}
              </button>
            ))}
          </div>
        ) : null}
        {turn.entityPatches?.length ? (
          <div className="mt-2 rounded-xl border border-gold/25 bg-gold/[0.04] p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-gold/80">
              <UserRound size={9} />
              设定卡改动 · {turn.entityPatches.length} 条
            </div>
            <div className="space-y-1">
              {turn.entityPatches.map((p) => (
                <div key={p.name} className="text-[10.5px] leading-relaxed text-dim">
                  <span className="text-ink/90">{p.name}</span>
                  <span className="ml-1 rounded bg-surface2/70 px-1 text-[9px] text-mute">
                    {p.existing ? "改" : "新增"} · {KIND_LABEL[p.kind as EntityKind] ?? p.kind}
                  </span>
                  {p.description ? (
                    <div className="line-clamp-2 text-mute/90">{p.description}</div>
                  ) : null}
                  {p.speechStyle ? (
                    <div className="text-mute/80">语气：{p.speechStyle}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              disabled={turn.entitiesApplied}
              onClick={async () => {
                await applyChatEntities(turn.entityPatches ?? []);
                useStore.setState((s) => ({
                  chat: s.chat.map((t) =>
                    t.id === turn.id ? { ...t, entitiesApplied: true } : t
                  ),
                }));
              }}
              className={cx(
                "mt-2 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                turn.entitiesApplied
                  ? "border-line/60 text-mute"
                  : "border-gold/40 text-gold hover:bg-gold/10"
              )}
            >
              {turn.entitiesApplied ? "已写入设定库" : "写入设定库"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const chatBusy = useStore((s) => s.chatBusy);
  const sendChat = useStore((s) => s.sendChat);
  const cancelChat = useStore((s) => s.cancelChat);
  const clearChat = useStore((s) => s.clearChat);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const send = () => {
    const text = input.trim();
    if (!text || chatBusy) return;
    setInput("");
    void sendChat(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line/50 px-3.5 py-1.5">
        <span className="text-[10.5px] text-mute">和 AI 写手对话，聊写法、给意见、定方向</span>
        <span className="flex-1" />
        {chat.length ? (
          <IconButton onClick={clearChat} title="清空对话">
            <Trash2 size={11} />
          </IconButton>
        ) : null}
      </div>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {chat.length === 0 ? (
          <div className="pt-6">
            <div className="mb-3 text-center text-[11px] leading-relaxed text-mute">
              它读过你的设定、章纲和本章正文。
              <br />
              可以直接问它，也可以让它给方案。
            </div>
            <div className="space-y-1.5">
              {CHAT_OPENERS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput("");
                    void sendChat(q);
                  }}
                  className="w-full rounded-xl border border-line/70 px-3 py-2 text-left text-[11px] text-dim transition-colors hover:border-gold/40 hover:text-gold"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.map((t) => <Bubble key={t.id} turn={t} />)
        )}
      </div>

      <div className="shrink-0 border-t border-line/50 p-2.5">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="问它怎么改、接下来怎么写……（Enter 发送，Shift+Enter 换行）"
            className="scroll-thin w-full resize-none rounded-xl border border-line/70 bg-surface2/40 px-3 py-2 pr-10 text-[12px] leading-[1.7] text-ink outline-none placeholder:text-mute/60 focus:border-gold/40"
          />
          {chatBusy ? (
            <button
              onClick={() => void cancelChat()}
              className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg border border-line/70 text-mute transition-colors hover:text-cinnabar"
              title="停止"
            >
              <Square size={10} />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg bg-gold text-[#1a1408] transition-opacity disabled:opacity-30"
              title="发送 (Enter)"
            >
              <ArrowUp size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
