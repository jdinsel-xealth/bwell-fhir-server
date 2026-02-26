'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { commonBeforeEach, commonAfterEach } = require('../../common');
const { describe, beforeEach, afterEach, test, expect } = require('@jest/globals');
const { readSecret } = require('../../../utils/secretReader');

describe('secretReader Tests', () => {
    /**
     * Env vars to restore after each test so we don't pollute between cases.
     * @type {string[]}
     */
    const TEST_VAR = 'TEST_SECRET_READER_VAR';
    const TEST_VAR_FILE = `${TEST_VAR}_FILE`;

    /** @type {string|undefined} */
    let originalVar;
    /** @type {string|undefined} */
    let originalVarFile;
    /** @type {string|undefined} */
    let tempFilePath;

    beforeEach(async () => {
        await commonBeforeEach();
        originalVar = process.env[TEST_VAR];
        originalVarFile = process.env[TEST_VAR_FILE];
        // Start each test with both vars absent.
        delete process.env[TEST_VAR];
        delete process.env[TEST_VAR_FILE];
        tempFilePath = undefined;
    });

    afterEach(async () => {
        await commonAfterEach();
        // Restore env to pre-test state.
        if (originalVar !== undefined) {
            process.env[TEST_VAR] = originalVar;
        } else {
            delete process.env[TEST_VAR];
        }
        if (originalVarFile !== undefined) {
            process.env[TEST_VAR_FILE] = originalVarFile;
        } else {
            delete process.env[TEST_VAR_FILE];
        }
        // Clean up any temp file.
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    });

    describe('readSecret', () => {
        test('returns env var value when only the direct env var is set', () => {
            process.env[TEST_VAR] = 'direct-value';

            const result = readSecret(TEST_VAR);

            expect(result).toBe('direct-value');
        });

        test('returns undefined when neither the direct env var nor the _FILE variant is set', () => {
            const result = readSecret(TEST_VAR);

            expect(result).toBeUndefined();
        });

        test('reads secret from file when _FILE env var is set and file exists', () => {
            // Write a temp file with leading/trailing whitespace to verify trimming.
            tempFilePath = path.join(os.tmpdir(), `secretReader-test-${process.pid}.txt`);
            fs.writeFileSync(tempFilePath, '  file-secret-value\n', 'utf8');
            process.env[TEST_VAR_FILE] = tempFilePath;

            const result = readSecret(TEST_VAR);

            expect(result).toBe('file-secret-value');
        });

        test('_FILE takes precedence over the direct env var when both are set', () => {
            tempFilePath = path.join(os.tmpdir(), `secretReader-test-priority-${process.pid}.txt`);
            fs.writeFileSync(tempFilePath, 'file-wins', 'utf8');
            process.env[TEST_VAR] = 'env-value';
            process.env[TEST_VAR_FILE] = tempFilePath;

            const result = readSecret(TEST_VAR);

            expect(result).toBe('file-wins');
        });

        test('throws RethrownError when _FILE env var is set but the file does not exist', () => {
            process.env[TEST_VAR_FILE] = '/nonexistent/path/to/secret';

            expect(() => readSecret(TEST_VAR)).toThrow();
            expect(() => readSecret(TEST_VAR)).toThrow(/failed to read secret from file/i);
        });
    });
});
