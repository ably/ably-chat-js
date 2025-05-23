import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const rulesDir = join('../.cursor/rules');
const outputFile = join('./copilot-instructions.md');

const files = readdirSync(rulesDir).filter((file) => file.endsWith('.mdc'));

let combinedContent = '';

// Add autogenerated notice
combinedContent += '---\n';
combinedContent += 'notice: This file is autogenerated from the script `copilot-from-cursor.ts`. Run `npm run copilot:from-cursor` to generate it.\n';
combinedContent += '---\n\n';

files.forEach((file) => {
  const filePath = join(rulesDir, file);
  const content = readFileSync(filePath, 'utf-8');
  combinedContent += `#### START OF FILE ${file} ####\n`;
  combinedContent += content;
  combinedContent += '\n';
});

writeFileSync(outputFile, combinedContent);

console.log(`Combined ${files.length} files into ${outputFile}`);
