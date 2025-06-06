// @ts-check
/**
 * @fileoverview Unit test helper functions for analyzing JavaScript code and running tests.
 * This module provides utilities for parsing JavaScript files, analyzing AST nodes,
 * and creating test validators for common patterns.
 */

import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';
import fs from 'fs';
import path from 'path';

const ASSIGNMENT_FOLDER_NAME = 'assignment';
// const ASSIGNMENT_FOLDER_NAME = 'solutions';

/**
 * Default configuration options for helper functions.
 * @type {Object}
 * @property {boolean} noParse - Skip parsing the source code into an AST
 * @property {boolean} noImport - Skip importing the module dynamically
 */
const defaultOptions = {
  noParse: false,
  noImport: false,
};

/**
 * Prepares exercise information for unit testing by loading source code,
 * importing the module, and parsing the AST.
 *
 * This function extracts the exercise name from the test file path,
 * locates the corresponding exercise file, and returns comprehensive
 * information about it for use in tests.
 *
 * @param {string} testFilePath - The absolute path to the test file (must end with .test.js)
 * @param {Object} [options={}] - Configuration options for parsing and importing
 * @param {boolean} [options.noParse=false] - Skip parsing the source code into an AST
 * @param {boolean} [options.noImport=false] - Skip importing the module dynamically
 * @returns {Promise<Object>} Promise resolving to exercise information
 * @throws {Error} If the test file path doesn't match expected pattern
 *
 * @example
 * const info = await beforeAllHelper('/path/to/ex1-johnWho.test.js');
 * console.log(info.source); // Raw JavaScript code
 * console.log(info.module.default); // Exported function
 * console.log(info.rootNode.type); // 'Program'
 */
export async function beforeAllHelper(testFilePath, options = {}) {
  const helperOptions = Object.assign(defaultOptions, options);

  const matches = testFilePath
    .replace(/\\/g, '/')
    .match(/^(.*)\/unit-tests\/(.+)\.test\.js$/i);

  if (!matches) {
    throw new Error(`Unexpected test path: ${testFilePath}`);
  }

  const [, basePath, exercise] = matches;
  let exercisePath = path.join(
    basePath,
    `../../${ASSIGNMENT_FOLDER_NAME}/${exercise}`
  );

  exercisePath = fs.existsSync(exercisePath)
    ? path.join(exercisePath, 'index.js')
    : exercisePath + '.js';

  const result = { source: '' };

  if (!helperOptions.noImport) {
    try {
      // suppress all console.log output
      jest.spyOn(console, 'log').mockImplementation();
      result.module = await import(exercisePath);
    } catch (err) {
      console.error("Error attempting to 'import':", err);
    }
  }

  result.source = fs.readFileSync(exercisePath, 'utf8');

  if (!helperOptions.noParse) {
    try {
      result.rootNode = parse(result.source, {
        ecmaVersion: 2022,
        sourceType: 'module',
      });
    } catch (_) {
      // Leave rootNode prop undefined
    }
  }
  return result;
}

/**
 * Searches for an ancestor node of a specific type in the AST ancestry chain.
 *
 * This utility function traverses up the ancestor chain from the current node
 * to find the first ancestor that matches the specified type.
 *
 * @param {string} type - The AST node type to search for (e.g., 'FunctionDeclaration', 'CallExpression')
 * @param {Array} ancestors - Array of ancestor nodes from acorn-walk traversal
 * @returns {Object|null} The matching ancestor node, or null if not found
 *
 * @example
 * const funcDecl = findAncestor('FunctionDeclaration', ancestors);
 * if (funcDecl?.id?.name === 'myFunction') {
 *   // Found the function declaration
 * }
 */
export function findAncestor(type, ancestors) {
  if (!type || !Array.isArray(ancestors)) {
    return null;
  }

  let index = ancestors.length - 1;
  while (index >= 0) {
    if (ancestors[index] && ancestors[index].type === type) {
      return ancestors[index];
    }
    index--;
  }
  return null;
}

/**
 * Creates a validator function for checking proper window.onload event usage.
 *
 * This function returns a visitor function that can be used with acorn-walk
 * to detect whether code properly uses window.addEventListener('load') or
 * window.onload, and whether there are any implementation errors.
 *
 * The validator checks for:
 * - window.addEventListener('load', callback)
 * - window.addEventListener('DOMContentLoaded', callback)
 * - window.onload = callback
 * - Incorrect usage patterns (like calling functions instead of passing them)
 *
 * @param {Object} state - State object to track validation results
 * @param {boolean} state.onload - Whether proper onload event handling is detected
 * @param {boolean} state.callError - Whether there's an error in the onload handler implementation
 * @returns {Function} Visitor function for use with acorn-walk
 *
 * @example
 * const state = { onload: false, callError: false };
 * const validator = onloadValidator(state);
 * ancestor(rootNode, { MemberExpression: validator });
 * console.log(state.onload); // true if proper onload usage found
 */
export function onloadValidator(state) {
  return (node, ancestors) => {
    const { object, property } = node;
    if (
      object.type === 'Identifier' &&
      object.name === 'window' &&
      property.type === 'Identifier'
    ) {
      if (property.name === 'addEventListener') {
        const callExpression = findAncestor('CallExpression', ancestors);
        if (callExpression) {
          if (callExpression.arguments.length === 2) {
            const firstArg = callExpression.arguments[0];
            if (
              firstArg &&
              firstArg.value &&
              ['load', 'DOMContentLoaded'].includes(firstArg.value)
            ) {
              state.onload = true;
            }
            if (callExpression.arguments[1].type === 'CallExpression') {
              state.callError = true;
            }
          }
        }
      } else if (property.name === 'onload') {
        const assignmentExpression = findAncestor(
          'AssignmentExpression',
          ancestors
        );
        if (assignmentExpression) {
          state.onload = true;
          if (assignmentExpression.right.type === 'CallExpression') {
            state.callError = true;
          }
        }
      }
    }
  };
}

/**
 * Creates a Jest test to verify that all TODO comments have been removed from source code.
 *
 * This test helper ensures that students have completed their assignments by
 * removing all TODO comments that are typically used as placeholders.
 *
 * @param {Function} getSource - Function that returns the source code to check
 *
 * @example
 * testTodosRemoved(() => exerciseInfo.source);
 */
export function testTodosRemoved(getSource) {
  test('should have all TODO comments removed', () => {
    expect(/\bTODO\b/.test(getSource())).toBeFalsy();
  });
}

/**
 * Creates a Jest test to verify that a specific function doesn't contain console.log statements.
 *
 * This test helper checks if a function contains any console.log calls, which are often
 * used for debugging but should be removed in production code. It analyzes the AST
 * to find console.log calls within function declarations or variable declarations.
 *
 * @param {string} functionName - The name of the function to check for console.log calls
 * @param {Function} getRootNode - Function that returns the AST root node to analyze
 *
 * @example
 * testNoConsoleLog('myFunction', () => exerciseInfo.rootNode);
 */
export function testNoConsoleLog(functionName, getRootNode) {
  test(`\`${functionName}\` should not contain unneeded console.log calls`, () => {
    const rootNode = getRootNode();
    let callsConsoleLog = false;
    rootNode &&
      ancestor(rootNode, {
        CallExpression({ callee }, ancestors) {
          if (
            callee.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'console' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'log'
          ) {
            const functionDeclaration = findAncestor(
              'FunctionDeclaration',
              ancestors
            );
            if (
              functionDeclaration !== null &&
              functionDeclaration.type === 'FunctionDeclaration' &&
              functionDeclaration.id.type === 'Identifier'
            ) {
              if (functionDeclaration.id.name === functionName) {
                callsConsoleLog = true;
                return;
              }
            }
            const variableDeclarator = findAncestor(
              'VariableDeclarator',
              ancestors
            );
            if (
              variableDeclarator !== null &&
              variableDeclarator.type === 'VariableDeclarator' &&
              variableDeclarator.id.type === 'Identifier'
            ) {
              if (variableDeclarator.id.name === functionName) {
                callsConsoleLog = true;
              }
            }
          }
        },
      });
    expect(callsConsoleLog).toBe(false);
  });
}

/**
 * Checks if a code string contains commented out code (as opposed to documentation comments).
 * This function was generated with Claude AI.
 *
 * This function analyzes each line of the provided code string to identify lines that
 * start with '//' and contain what appears to be actual code rather than documentation
 * or standard comments. It uses pattern matching to distinguish between likely
 * commented-out code and legitimate comments.
 *
 * @param {string} codeString - The code string to analyze for commented out code
 * @returns {boolean} True if commented out code is found, false otherwise
 *
 * @example
 * // Returns true - contains commented out code
 * hasCommentedOutCode(`
 *   console.log('hello');
 *   // const x = 5;
 * `);
 *
 * @example
 * // Returns false - contains only documentation comments
 * hasCommentedOutCode(`
 *   console.log('hello');
 *   // This is a documentation comment
 * `);
 */
export function hasCommentedOutCode(codeString) {
  const lines = codeString.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) continue;

    // Check if line starts with //
    if (trimmedLine.startsWith('//')) {
      const commentContent = trimmedLine.slice(2).trim();

      // Skip likely documentation comments
      if (
        !commentContent ||
        /^[A-Z][a-z]/.test(commentContent) ||
        /^(TODO|FIXME|NOTE|HACK):/i.test(commentContent)
      ) {
        continue;
      }

      // Check for code patterns
      const codePatterns = [
        /^(var|let|const|function|class|if|else|for|while|do|switch|case|try|catch|return|import|export)\s/,
        /\w+\s*[=({]/, // Assignments or function calls
        /[}\]);]$/, // Closing brackets/semicolons
        /\w+\.\w+/, // Object property access
        /console\./, // Console statements
        /\w+\s*\([^)]*\)/, // Function calls
      ];

      if (codePatterns.some((pattern) => pattern.test(commentContent))) {
        return true;
      }
    }
  }

  return false;
}
