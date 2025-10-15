#!/usr/bin/env tsx

/**
 * Script to validate that all ErrorCode enum values exist in ably-common/protocol/errors.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ErrorCode } from '../src/core/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ERRORS_JSON_PATH = path.join(__dirname, '../ably-common/protocol/errors.json');

interface ErrorsJson {
  [code: string]: string;
}

function main(): void {
  // Load the errors.json file
  const errorsJsonContent = fs.readFileSync(ERRORS_JSON_PATH, 'utf-8');
  let errorsJson: ErrorsJson;
  try {
    const errorsJsonContent = fs.readFileSync(ERRORS_JSON_PATH, 'utf-8');
    errorsJson = JSON.parse(errorsJsonContent) as ErrorsJson;
  } catch (error) {
    console.error(`❌ Failed to load errors.json from ${ERRORS_JSON_PATH}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Get all error codes from the enum
  const errorCodes = Object.values(ErrorCode).filter((value) => typeof value === 'number') as number[];

  console.log(`Validating ${errorCodes.length} error codes from ErrorCode enum...\n`);

  let hasErrors = false;
  const missingCodes: number[] = [];
  const foundCodes: Array<{ code: number; message: string }> = [];

  // Check each error code
  for (const code of errorCodes) {
    const codeStr = code.toString();
    if (errorsJson[codeStr]) {
      foundCodes.push({ code, message: errorsJson[codeStr] });
    } else {
      missingCodes.push(code);
      hasErrors = true;
    }
  }

  // Print results
  if (foundCodes.length > 0) {
    console.log('✓ Found codes:');
    for (const { code, message } of foundCodes) {
      console.log(`  ${code}: ${message}`);
    }
    console.log();
  }

  if (missingCodes.length > 0) {
    console.error('✗ Missing codes in errors.json:');
    for (const code of missingCodes) {
      // Find the enum key for this code
      const enumKey = Object.keys(ErrorCode).find(
        (key) => ErrorCode[key as keyof typeof ErrorCode] === code,
      ) as keyof typeof ErrorCode;
      console.error(`  ${code} (ErrorCode.${enumKey})`);
    }
    console.log();
  }

  // Summary
  console.log('Summary:');
  console.log(`  Total error codes: ${errorCodes.length}`);
  console.log(`  Found: ${foundCodes.length}`);
  console.log(`  Missing: ${missingCodes.length}`);

  if (hasErrors) {
    console.error('\n❌ Validation failed: Some error codes are missing from errors.json');
    process.exit(1);
  } else {
    console.log('\n✅ All error codes are present in errors.json');
    process.exit(0);
  }
}

main();
