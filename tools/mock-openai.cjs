// Minimal OpenAI-compatible mock for end-to-end testing.
const http = require("http");

const PORT = 8899;
const REPLY = [
  "沈砚没有动。",
  "雨顺着屋檐连成一条线，落在他脚边，溅起很轻的白。他听见那脚步声在三级台阶下停住，停得很有分寸——不远，也不近。",
  "“你等了多久？”顾青梧问。",
  "“从灯灭的时候起。”",
  "她沉默了一会儿，把手里的伞往前递了半寸。伞骨上还挂着水，一滴一滴，砸在青石上。",
  "“那盏灯不是自己灭的。”她说，“有人上去过。”",
  "沈砚终于回过头。雾气里，她的脸白得像一张刚裁好的纸。",
];
const REASONING = [
  "先确认视角是第三人称限知，不能写顾青梧的内心。",
  "上一段停在“不该有活人等你”，需要接住这句的余韵，让两人继续试探。",
  "用雨和伞做动作支点，保持冷峻的短句节奏。",
];
const SUMMARY =
  "沈砚在青石渡等到顾青梧，两人围绕熄灭的渡灯互相试探。顾青梧暗示有人上过渡灯，沈砚回身看她，气氛转紧。";

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url.includes("/models")) {
      return json(res, 200, {
        data: [{ id: "mock-writer" }, { id: "mock-reasoner" }, { id: "mock-fast" }],
      });
    }
    if (!req.url.includes("/chat/completions")) {
      return json(res, 404, { error: { message: "not found" } });
    }
    let payload = {};
    try {
      payload = JSON.parse(body || "{}");
    } catch (_) {}

    const system = payload.messages?.[0]?.content || "";
    const wantsJudge = system.includes("你是小说编辑");
    const wantsTitle = !wantsJudge && (system.includes("标题候选") || system.includes("拟一个标题") || system.includes("章节标题"));
    const wantsVolume = system.includes("卷名候选") || system.includes("卷名");
    const wantsExtract = !wantsTitle && !wantsVolume && system.includes("设定整理");
    const wantsOutline = !wantsTitle && !wantsVolume && !wantsExtract && system.includes("结构编辑");
    const wantsSummary = !wantsTitle && !wantsExtract && !wantsOutline && system.includes("概括");

    if (!payload.stream) {
      if (wantsJudge) {
        return json(res, 200, {
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  best: 2,
                  scores: [68, 88, 74],
                  reason: "第二版有具体动作和关系移动，结尾钩子落在事实上",
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1800, completion_tokens: 40 },
        });
      }
      if (wantsVolume) {
        return json(res, 200, {
          choices: [
            { message: { role: "assistant", content: "第一卷 河灯\n第一卷 换座之后\n第一卷 汽水与笔记" } },
          ],
          usage: { prompt_tokens: 500, completion_tokens: 18 },
        });
      }
      if (wantsTitle) {
        return json(res, 200, {
          choices: [
            { message: { role: "assistant", content: "第一章 换座\n第一章 最后一瓶汽水\n第一章 笔记末页的赌约" } },
          ],
          usage: { prompt_tokens: 600, completion_tokens: 12 },
        });
      }
      if (wantsExtract) {
        return json(res, 200, {
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify([
                  {
                    kind: "character",
                    name: "沈砚",
                    aliases: "沈先生",
                    role: "主角",
                    description: "前巡捕房探长，右肩有旧伤，雨天发作；说话极省，习惯用问句代替判断。",
                    speechStyle: "话少，常用反问；紧张时重复对方最后两个字。",
                    speechLength: "short",
                    speechWords: "嗯、走吧、随你",
                    speechTaboo: "亲爱的、太好了",
                    source: "沈砚，二十八岁，前巡捕房探长，右肩有旧伤",
                  },
                  {
                    kind: "character",
                    name: "更夫",
                    aliases: "老更",
                    role: "线索人物",
                    description: "十年前失踪，字迹出现在无落款的信上。",
                    speechStyle: "说话绕，爱用旧称。",
                    speechLength: "medium",
                    speechWords: "后生、那年间",
                    speechTaboo: "",
                    source: "信上的字迹指向十年前失踪的更夫。",
                  },
                  {
                    kind: "item",
                    name: "缺角铜扣",
                    aliases: "",
                    role: "关键物件",
                    description: "卡在渡口石缝里，边缘有新磨痕。",
                    speechStyle: "",
                    speechLength: "medium",
                    speechWords: "",
                    speechTaboo: "",
                    source: "石缝里卡着一枚缺角铜扣，边缘还是新的。",
                  },
                  {
                    kind: "concept",
                    name: "渡灯",
                    aliases: "",
                    role: "意象",
                    description: "常年不灭，十年前那件事后无人再点。",
                    speechStyle: "",
                    speechLength: "medium",
                    speechWords: "",
                    speechTaboo: "",
                    source: "石阶尽头，那盏常年不灭的渡灯今晚是暗的。",
                  },
                ]),
              },
            },
          ],
          usage: { prompt_tokens: 1200, completion_tokens: 260 },
        });
      }
      if (wantsOutline) {
        return json(res, 200, {
          choices: [
            {
              message: {
                role: "assistant",
                content:
                  "· 沈砚在渡口复盘渡灯熄灭的时间，确认有人在他之前上过灯台。\n· 顾青梧带来那封没有落款的信，两人第一次交换情报。\n· 信上的字迹指向十年前失踪的更夫。\n· 结尾：岸上传来第三个人的脚步声，灯忽然自己亮了。",
              },
            },
          ],
          usage: { prompt_tokens: 800, completion_tokens: 120 },
        });
      }
      if (wantsSummary) {
        return json(res, 200, {
          choices: [{ message: { role: "assistant", content: SUMMARY } }],
          usage: { prompt_tokens: 900, completion_tokens: 60 },
        });
      }
      return json(res, 200, {
        choices: [{ message: { role: "assistant", content: "连接成功" } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      });
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const withReasoning = String(payload.model || "").includes("reason");
    let i = 0;
    let r = 0;
    const timer = setInterval(() => {
      if (withReasoning && r < REASONING.length) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: REASONING[r] } }] })}\n\n`
        );
        r += 1;
        return;
      }
      if (i >= REPLY.length) {
        clearInterval(timer);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      const text = (i === 0 ? "" : "\n\n") + REPLY[i];
      i += 1;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    }, 240);

    res.on("close", () => clearInterval(timer));
  });
});

server.listen(PORT, "127.0.0.1", () => console.log("mock openai on " + PORT));
