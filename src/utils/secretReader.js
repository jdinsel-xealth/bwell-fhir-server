'use strict';

const fs = require('fs');
const { RethrownError } = require('./rethrownError');

/**
 * Reads a secret value for the given environment variable name.
 *
 * Supports the `_FILE` convention used by Kubernetes SecretProviderClass (CSI secrets-store driver):
 * if `<varName>_FILE` is set in the environment, its value is treated as a filesystem path and the
 * secret is read from that file at runtime.  This avoids storing sensitive values in k8s etcd by
 * letting the CSI driver mount the secret as a file from an external store (e.g. AWS Secrets Manager
 * or HashiCorp Vault) and only passing the non-sensitive *path* as an env var.
 *
 * Resolution order:
 *  1. If `process.env[varName + '_FILE']` is set → read and return the trimmed file contents.
 *  2. Otherwise → return `process.env[varName]` (may be `undefined` if unset).
 *
 * @param {string} varName - The base environment variable name (e.g. 'MONGO_USERNAME').
 * @returns {string|undefined} The secret value, or `undefined` if neither the direct env var
 *   nor the `_FILE` variant is set.
 * @throws {RethrownError} If the `_FILE` path is set but the file cannot be read (e.g. missing
 *   mount, wrong path, permissions error).  This surfaces misconfiguration at startup rather than
 *   silently returning `undefined`.
 *
 * @example
 * // Pod env: MONGO_USERNAME_FILE=/mnt/secrets/mongo-username
 * // File contents: "myuser"
 * readSecret('MONGO_USERNAME'); // => 'myuser'
 *
 * @example
 * // Pod env: MONGO_USERNAME=myuser
 * readSecret('MONGO_USERNAME'); // => 'myuser'
 *
 * @example
 * // Neither MONGO_USERNAME nor MONGO_USERNAME_FILE is set
 * readSecret('MONGO_USERNAME'); // => undefined
 */
function readSecret (varName) {
    const filePath = process.env[`${varName}_FILE`];

    if (filePath !== undefined) {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (error) {
            // Delay-import logging to avoid circular dependency at module load time.
            // config.js is evaluated before the Winston logger is fully wired, but logError
            // itself only requires Winston to be importable — which it always is.
            const { logError } = require('../operations/common/logging');
            logError(`secretReader: failed to read secret from file for '${varName}' at path '${filePath}'`, {
                error
            });
            throw new RethrownError({
                message: `secretReader: failed to read secret from file for '${varName}' at path '${filePath}': ${error.message}`,
                source: 'secretReader.readSecret',
                error
            });
        }
    }

    return process.env[varName];
}

module.exports = { readSecret };
