import fs from 'node:fs';
import readline from 'node:readline';

const fullPath = 'C:\\Users\\jdomi\\.gemini\\antigravity\\brain\\5ae9d954-960b-47c4-9a7b-ba8e0c2aff90\\.system_generated\\logs\\transcript_full.jsonl';

async function main() {
  const fileStream = fs.createReadStream(fullPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.step_index === 1040) {
        console.log('=== FULL STEP 1040 ===');
        console.log('SOURCE:', entry.source);
        console.log('TYPE:', entry.type);
        console.log('CONTENT:\n', entry.content);
        break;
      }
    } catch {}
  }
}

main();
