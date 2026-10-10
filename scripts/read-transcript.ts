import fs from 'node:fs';
import readline from 'node:readline';

const transcriptPath = 'C:\\Users\\jdomi\\.gemini\\antigravity\\brain\\5ae9d954-960b-47c4-9a7b-ba8e0c2aff90\\.system_generated\\logs\\transcript.jsonl';

async function main() {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.step_index >= 1030 && entry.step_index <= 1045) {
        console.log(`\n=== STEP ${entry.step_index} (${entry.source} / ${entry.type} / ${entry.status}) ===`);
        if (entry.content) {
          console.log('CONTENT:\n', entry.content.substring(0, 500));
        }
        if (entry.thinking) {
          console.log('THINKING:\n', entry.thinking.substring(0, 300));
        }
        if (entry.tool_calls) {
          console.log('TOOL CALLS:', JSON.stringify(entry.tool_calls));
        }
      }
    } catch {}
  }
}

main();
